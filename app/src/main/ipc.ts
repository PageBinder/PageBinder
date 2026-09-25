/**
 * IPC surface between the renderer and the storage layer. The renderer only
 * ever refers to files by notebook-relative paths; every path is resolved and
 * containment-checked in the storage layer.
 */
import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron'
import type { PageDoc, NotebookTree, PaperSettings } from '../shared/types'
import {
  createNotebook,
  openNotebook,
  notebookExists,
  refreshReadme,
  acquireLock,
  releaseLock,
  releaseLockSync,
  setNotebookPaper
} from './storage/notebook'
import { addImageBytes, addImageFile } from './storage/images'
import { copyFileIntoPage, readMailMeta, ATTACHMENTS_DIR } from './storage/attachments'
import { resolveInside } from './storage/paths'
import { printPage, exportPdf, exportPages } from './print'
import { Indexer, type IndexProgress } from './search/indexer'
import { applyTreeToIndex } from './search/tree'
import { DEFAULT_HISTORY_POLICY, type HistoryPolicy } from './storage/history'
import { listRecycled, restoreRecycled, purgeRecycled, purgeOld, DEFAULT_RECYCLE_DAYS } from './storage/recycle'
import { verifyNotebook, repairFinding, type Finding } from './storage/verify'
import { restoreSnapshot, copySnapshotToNewPage } from './storage/page'
import { renderPageHtml } from '../shared/render/renderPage'
import { notebookUrl } from './protocol'
import { readDoc, aboutInfo, userFullName, type DocName } from './about'
import { listTemplates, saveAsTemplate, deleteTemplate, createPageFromTemplate, libraryDir, parseRef, setSectionDefaultTemplate, sectionDefaultTemplate, createBlankTemplate, moveTemplate, TEMPLATE_META, type TemplateScope, type TemplateMeta } from './storage/templates'
import { movePage, copyPage, moveContainer, copyContainer, recycleContainer } from './storage/copymove'
import { readJson, writeJson } from './storage/notebook'
import type { SectionMeta } from '../shared/types'
import { dirname, basename, join as joinPath } from 'node:path'
import { SECTION_META } from './storage/paths'
import { createSection, createGroup, renameContainer, setSectionColor } from './storage/section'
import {
  createPage,
  loadPage,
  savePage,
  saveDraft,
  discardDraft,
  listHistory,
  readSnapshot,
  renamePage,
  deletePage
} from './storage/page'
import { readRecent, rememberRecent, forgetRecent } from './recent'

let currentRoot: string | undefined
let indexer: Indexer | undefined

/** Renderer errors are appended to a log in the settings folder so crashes can be diagnosed later. */
async function appendRendererLog(text: string): Promise<void> {
  try {
    const { promises: fsp } = await import('node:fs')
    const path = joinPath(app.getPath('userData'), 'renderer-errors.log')
    await fsp.appendFile(path, `${new Date().toISOString()} ${text}\n`)
  } catch {
    /* logging must never fail the app */
  }
}
let lastTree: NotebookTree | undefined

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

/** Section name and path for a page, from the section.json beside it. */
async function sectionOf(root: string, pageRel: string): Promise<{ name: string; rel: string }> {
  const sectionRel = dirname(pageRel)
  const meta = await readJson<SectionMeta>(joinPath(resolveInside(root, sectionRel), SECTION_META))
  return { name: meta?.name ?? basename(sectionRel), rel: sectionRel }
}

/**
 * Update one page in the index. Callers await it before returning, because the renderer reloads
 * the tree from the index straight after: left running on its own, a save's new title could lose
 * that race (it did on macOS and Windows) and the page list would keep the old one.
 */
async function reindexPage(rel: string, doc: PageDoc, oldRel?: string): Promise<void> {
  if (!indexer || !currentRoot) return
  try {
    if (oldRel && oldRel !== rel) indexer.remove(oldRel)
    await indexer.indexDoc(rel, doc, await sectionOf(currentRoot, rel))
  } catch {
    /* the index is a cache; a failed update is repaired by the next reconcile */
  }
}

/** Full background reconcile from a fresh folder scan; used after wide changes. */
function reconcileSoon(): void {
  if (!currentRoot || !indexer) return
  const root = currentRoot
  void openNotebook(root).then((scanned) => {
    lastTree = scanned
    return indexer?.reconcile(scanned)
  })
}

export function currentNotebookRoot(): string | undefined {
  return currentRoot
}

function requireRoot(): string {
  if (!currentRoot) throw new Error('No notebook is open')
  return currentRoot
}

async function openAndLock(root: string): Promise<NotebookTree> {
  if (!(await notebookExists(root))) throw new Error('That folder is not a PageBinder notebook')
  const lock = await acquireLock(root)
  if (!lock.ok) {
    throw new Error(
      `This notebook is already open in another PageBinder window on ${lock.holder.host} (since ${new Date(lock.holder.since).toLocaleTimeString()}). Close that window, then try again.`
    )
  }
  if (currentRoot && currentRoot !== root) await releaseLock(currentRoot)
  indexer?.close()
  currentRoot = root
  indexer = new Indexer(root, (p: IndexProgress) => broadcast('index:progress', p))
  indexer.onTreeChanged = () => broadcast('tree:changed', null)
  void refreshReadme(root)
  const tree = await currentTree()
  await rememberRecent(root, tree.meta.name)
  // The folder scan runs in the background: it is the ground truth that corrects the index.
  void openNotebook(root).then((scanned) => {
    lastTree = scanned
    return indexer?.reconcile(scanned)
  })
  void purgeOld(root, tree.meta.settings.recycleDays ?? DEFAULT_RECYCLE_DAYS).catch(() => undefined)
  return tree
}

/**
 * The tree to show: from the index when it holds one (milliseconds at any size),
 * otherwise from a folder scan (seconds at 50,000 pages), which then seeds the index.
 */
async function currentTree(): Promise<NotebookTree> {
  const root = requireRoot()
  const meta = await readJson<NotebookTree['meta']>(joinPath(root, 'notebook.json'))
  if (indexer && meta) {
    try {
      const fromIndex = await indexer.tree(meta)
      if (fromIndex) {
        lastTree = fromIndex
        return fromIndex
      }
    } catch {
      /* fall through to a scan */
    }
  }
  const scanned = await openNotebook(root)
  lastTree = scanned
  if (indexer) {
    try {
      await indexer.open()
      applyTreeToIndex(indexer.index, scanned)
    } catch {
      /* the index is a cache */
    }
  }
  return scanned
}

/** After a change inside one section: refresh that section's rows and return the tree. */
async function afterSectionChange(...sectionRels: string[]): Promise<NotebookTree> {
  if (indexer) for (const rel of new Set(sectionRels)) await indexer.refreshSection(rel).catch(() => undefined)
  return currentTree()
}

/** After a change to sections or groups inside a container: refresh that container and return the tree. */
async function afterContainerChange(...containerRels: string[]): Promise<NotebookTree> {
  if (indexer) for (const rel of new Set(containerRels)) await indexer.refreshContainer(rel).catch(() => undefined)
  return currentTree()
}

function parentOf(rel: string): string {
  return rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
}

function globalTemplatesDir(): string {
  return joinPath(app.getPath('userData'), 'templates')
}

export const GLOBAL_PREFIX = '@global/'
export const NB_PREFIX = '@nb/'

function encodeRoot(root: string): string {
  return Buffer.from(root, 'utf8').toString('base64url')
}
function decodeRoot(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8')
}

/**
 * Storage root and relative path for a page rel. Template rels point into a
 * library rather than the open notebook:
 *   @global/<folder>.template            the global library
 *   @nb/<encoded notebook root>/<folder>.template   a notebook's own library
 */
export function resolveRel(rel: string): { root: string; rel: string; template: 'notebook' | 'global' | null } {
  if (rel === '@global' || rel.startsWith(GLOBAL_PREFIX)) return { root: globalTemplatesDir(), rel: rel.slice(GLOBAL_PREFIX.length), template: 'global' }
  if (rel.startsWith(NB_PREFIX)) {
    const rest = rel.slice(NB_PREFIX.length)
    const slash = rest.indexOf('/')
    const token = slash < 0 ? rest : rest.slice(0, slash)
    const inner = slash < 0 ? '' : rest.slice(slash + 1)
    const nbRoot = decodeRoot(token)
    return { root: joinPath(nbRoot, 'templates'), rel: inner, template: 'notebook' }
  }
  return { root: requireRoot(), rel, template: null }
}

/** Section rel for a notebook's template library inside the Templates notebook. */
function libraryRel(nbRoot: string): string {
  return `${NB_PREFIX}${encodeRoot(nbRoot)}`
}

/** The Templates notebook: Global templates plus one section per known notebook that has a library. */
async function templatesTree(): Promise<NotebookTree> {
  const sections: import('../shared/types').SectionNode[] = []
  const globalList = await listTemplates(globalTemplatesDir(), 'global')
  sections.push({
    kind: 'section',
    id: 'templates-global',
    name: 'Global templates',
    color: '#888780',
    relPath: '@global',
    pages: globalList.map((t) => ({ id: t.id, title: t.name, relPath: `${GLOBAL_PREFIX}${t.folder}`, modified: t.created }))
  })
  const roots: { root: string; name: string }[] = []
  if (currentRoot) {
    const meta = await readJson<NotebookTree['meta']>(joinPath(currentRoot, 'notebook.json'))
    roots.push({ root: currentRoot, name: meta?.name ?? basename(currentRoot) })
  }
  for (const r of await readRecent()) if (!roots.some((x) => x.root === r.root)) roots.push({ root: r.root, name: r.name })
  for (const nb of roots) {
    const list = await listTemplates(joinPath(nb.root, 'templates'), 'notebook')
    sections.push({
      kind: 'section',
      id: `templates-${encodeRoot(nb.root)}`,
      name: nb.name,
      color: '#7F77DD',
      relPath: libraryRel(nb.root),
      pages: list.map((t) => ({ id: t.id, title: t.name, relPath: `${libraryRel(nb.root)}/${t.folder}`, modified: t.created }))
    })
  }
  return {
    root: '',
    meta: { format: 1, id: 'templates', name: 'Templates', created: '', modified: '', order: [], settings: { paper: { size: 'letter', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 } } } },
    children: sections,
    regenerated: []
  }
}

/** Library folder for a Templates-notebook section rel. */
function libraryForSection(sectionRel: string): string {
  if (sectionRel === '@global') return globalTemplatesDir()
  if (sectionRel.startsWith(NB_PREFIX)) return joinPath(decodeRoot(sectionRel.slice(NB_PREFIX.length)), 'templates')
  throw new Error('Not a template library')
}

/** After saving a template page, keep template.json in step with the page title. */
async function syncTemplateMeta(dir: string, title: string): Promise<void> {
  const meta = await readJson<TemplateMeta>(joinPath(dir, TEMPLATE_META))
  if (meta && meta.name !== title) await writeJson(joinPath(dir, TEMPLATE_META), { ...meta, name: title })
}

function historyPolicy(): HistoryPolicy {
  return lastTree?.meta.settings.history ?? DEFAULT_HISTORY_POLICY
}

export async function closeCurrentNotebook(): Promise<void> {
  indexer?.close()
  indexer = undefined
  if (currentRoot) {
    await releaseLock(currentRoot)
    currentRoot = undefined
  }
}

export function closeCurrentNotebookSync(): void {
  indexer?.close()
  indexer = undefined
  if (currentRoot) {
    releaseLockSync(currentRoot)
    currentRoot = undefined
  }
}

async function pickPaths(title: string): Promise<string[]> {
  const result = await dialog.showOpenDialog(focusedWindow()!, { title, properties: ['openFile', 'multiSelections'] })
  return result.canceled ? [] : result.filePaths
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function registerIpc(): void {
  /* ---------- notebooks ---------- */
  ipcMain.handle('notebook:recent', () => readRecent())
  ipcMain.handle('notebook:forget', (_e, root: string) => forgetRecent(root))
  ipcMain.handle('notebook:startupRoot', () => process.env['PAGEBINDER_OPEN'] ?? process.argv.find((a) => a.endsWith('.pagebinder') || a.includes('notebook.json')) ?? null)

  ipcMain.handle('notebook:pickFolder', async () => {
    const win = focusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open notebook folder',
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('notebook:pickParent', async () => {
    const win = focusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose where to create the notebook',
      buttonLabel: 'Create here',
      // Documents is the suggested home for notebooks: on the local disk and in every OS backup.
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('notebook:create', async (_e, parentDir: string, name: string) => {
    const root = await createNotebook(parentDir, name)
    return openAndLock(root)
  })

  ipcMain.handle('notebook:open', async (_e, root: string) => {
    try {
      return await openAndLock(root)
    } catch (err) {
      if ((err as Error).message.includes('not a PageBinder notebook')) await forgetRecent(root)
      throw err
    }
  })

  ipcMain.handle('notebook:reload', async () => currentTree())
  ipcMain.handle('notebook:close', async () => closeCurrentNotebook())

  /* ---------- sections and groups ---------- */
  ipcMain.handle('section:create', async (_e, containerRel: string, name: string, color?: string) => {
    const root = requireRoot()
    const rel = await createSection(root, containerRel, name, color)
    const tree = await afterContainerChange(containerRel)
    return { rel, tree }
  })
  ipcMain.handle('section:createGroup', async (_e, containerRel: string, name: string) => {
    const root = requireRoot()
    const rel = await createGroup(root, containerRel, name)
    const tree = await afterContainerChange(containerRel)
    return { rel, tree }
  })
  ipcMain.handle('section:rename', async (_e, rel: string, name: string) => {
    const root = requireRoot()
    const newRel = await renameContainer(root, rel, name)
    // A rename changes every rel beneath it: drop the old rows, then rescan the parent and the subtree.
    if (indexer && newRel !== rel) indexer.index.removeUnder(rel)
    const tree = await afterContainerChange(parentOf(newRel))
    if (indexer && newRel !== rel) reconcileSoon()
    void tree
    return { rel: newRel, tree: await currentTree() }
  })
  ipcMain.handle('section:setColor', async (_e, rel: string, color: string) => {
    const root = requireRoot()
    await setSectionColor(root, rel, color)
    return afterContainerChange(parentOf(rel))
  })

  /* ---------- pages ---------- */
  ipcMain.handle('page:create', async (_e, sectionRel: string, title?: string) => {
    if (sectionRel.startsWith('@')) {
      const scope: TemplateScope = sectionRel === '@global' ? 'global' : 'notebook'
      const info = await createBlankTemplate(libraryForSection(sectionRel), scope, title ?? 'New template')
      return { relPath: `${sectionRel}/${info.folder}`, tree: await templatesTree() }
    }
    const root = requireRoot()
    const meta = await readJson<NotebookTree['meta']>(joinPath(root, 'notebook.json'))
    const def = await sectionDefaultTemplate(root, sectionRel)
    const parsed = def ? parseRef(def) : null
    if (parsed) {
      const dir = joinPath(libraryDir(root, parsed.scope, globalTemplatesDir()), parsed.folder)
      try {
        const tmeta = await readJson<TemplateMeta>(joinPath(dir, TEMPLATE_META))
        const made = await createPageFromTemplate(root, sectionRel, dir, title ?? tmeta?.name ?? 'Untitled page', { section: (await sectionOf(root, `${sectionRel}/x`)).name, notebook: meta?.name ?? '' }, historyPolicy())
        await reindexPage(made.relPath, made.doc)
        return { relPath: made.relPath, tree: await afterSectionChange(sectionRel) }
      } catch {
        /* template missing: fall back to a blank page */
      }
    }
    const { relPath } = await createPage(root, sectionRel, title, meta?.settings.paper)
    return { relPath, tree: await afterSectionChange(sectionRel) }
  })
  ipcMain.handle('notebook:openTemplates', async () => templatesTree())
  ipcMain.handle('page:load', async (_e, relIn: string) => {
    const { root, rel, template } = resolveRel(relIn)
    const result = await loadPage(root, rel)
    // A page restored from history on load may have a different title than the index knows.
    if (!template && result.notices.some((n) => n.kind === 'recovered-from-history' || n.kind === 'no-valid-version')) {
      await indexer?.refreshSection(parentOf(rel)).catch(() => undefined)
      await reindexPage(rel, result.doc)
    }
    return { ...result, relPath: relIn }
  })
  ipcMain.handle('page:save', async (_e, relIn: string, doc: PageDoc) => {
    const { root, rel, template } = resolveRel(relIn)
    if (template) {
      // Template folders keep their names; the template's display name follows the page title.
      const result = await savePage(root, rel, doc, historyPolicy())
      await syncTemplateMeta(resolveInside(root, rel), result.doc.title)
      return { ...result, relPath: relIn }
    }
    const result = await savePage(root, rel, doc, historyPolicy())
    await reindexPage(result.relPath, result.doc, rel)
    return result
  })
  ipcMain.handle('page:saveDraft', async (_e, relIn: string, doc: PageDoc) => {
    const { root, rel } = resolveRel(relIn)
    return saveDraft(root, rel, doc)
  })
  ipcMain.handle('page:discardDraft', async (_e, relIn: string) => {
    const { root, rel } = resolveRel(relIn)
    return discardDraft(root, rel)
  })
  ipcMain.handle('page:listHistory', async (_e, relIn: string) => {
    const { root, rel } = resolveRel(relIn)
    return listHistory(root, rel)
  })
  ipcMain.handle('page:readSnapshot', async (_e, relIn: string, name: string) => {
    const { root, rel } = resolveRel(relIn)
    return readSnapshot(root, rel, name)
  })
  ipcMain.handle('page:rename', async (_e, relIn: string, title: string) => {
    const { root, rel, template } = resolveRel(relIn)
    if (template) {
      const result = await renamePage(root, rel, title)
      await syncTemplateMeta(resolveInside(root, rel), result.doc.title)
      return { ...result, relPath: relIn, tree: await templatesTree() }
    }
    const result = await renamePage(root, rel, title)
    await reindexPage(result.relPath, result.doc, rel)
    return { ...result, tree: await afterSectionChange(parentOf(rel)) }
  })
  ipcMain.handle('page:addImage', async (_e, relIn: string, originalName: string, bytes: ArrayBuffer | Uint8Array) => {
    const { root, rel } = resolveRel(relIn)
    return addImageBytes(root, rel, originalName, Buffer.from(bytes as Uint8Array))
  })
  ipcMain.handle('page:pickImages', async (_e, rel: string) => {
    const result = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Insert pictures',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] }]
    })
    if (result.canceled) return []
    const { root, rel: r } = resolveRel(rel)
    const entries = []
    for (const file of result.filePaths) entries.push(await addImageFile(root, r, file))
    return entries
  })
  ipcMain.handle('page:addImagePaths', async (_e, relIn: string, paths: string[]) => {
    const { root, rel } = resolveRel(relIn)
    const entries = []
    for (const p of paths) entries.push(await addImageFile(root, rel, p))
    return entries
  })
  ipcMain.handle('page:addFiles', async (_e, rel: string, paths: string[]) => {
    const root = requireRoot()
    const results = []
    for (const p of paths) {
      const entry = await copyFileIntoPage(root, rel, p, ATTACHMENTS_DIR)
      const mail = await readMailMeta(resolveInside(root, `${rel}/${ATTACHMENTS_DIR}/${entry.name}`))
      results.push({ entry, mail })
    }
    return results
  })
  ipcMain.handle('page:pickFiles', async (_e, rel: string) => {
    // Test seam: automated checks cannot drive the native dialog.
    const preset = process.env['PAGEBINDER_TEST_PICK_FILES']
    const filePaths = preset ? preset.split('\n').filter(Boolean) : await pickPaths('Attach files')
    if (!filePaths.length) return []
    const root = requireRoot()
    const results = []
    for (const p of filePaths) {
      const entry = await copyFileIntoPage(root, rel, p, ATTACHMENTS_DIR)
      const mail = await readMailMeta(resolveInside(root, `${rel}/${ATTACHMENTS_DIR}/${entry.name}`))
      results.push({ entry, mail })
    }
    return results
  })
  ipcMain.handle('page:copyFilesBetween', async (_e, fromRel: string, toRel: string, items: { sub: 'images' | 'attachments'; name: string; originalName?: string }[]) => {
    const from = resolveRel(fromRel)
    const to = resolveRel(toRel)
    const out: { sub: 'images' | 'attachments'; from: string; entry: import('../shared/types').FileEntry }[] = []
    for (const it of items) {
      const src = resolveInside(from.root, `${from.rel}/${it.sub}/${it.name}`)
      const entry = await copyFileIntoPage(to.root, to.rel, src, it.sub, it.originalName ?? it.name)
      out.push({ sub: it.sub, from: it.name, entry })
    }
    return out
  })
  ipcMain.handle('page:readAttachment', async (_e, relIn: string, sub: 'images' | 'attachments', name: string) => {
    const { root, rel } = resolveRel(relIn)
    const { promises: fsp } = await import('node:fs')
    const data = await fsp.readFile(resolveInside(root, `${rel}/${sub}/${name}`))
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  })
  ipcMain.handle('file:open', async (_e, rel: string) => {
    const abs = resolveInside(requireRoot(), rel)
    const err = await shell.openPath(abs)
    if (err) throw new Error(err)
  })
  ipcMain.handle('file:reveal', async (_e, rel: string) => {
    shell.showItemInFolder(resolveInside(requireRoot(), rel))
  })
  /* ---------- history, recycle, verify ---------- */
  ipcMain.handle('page:snapshotHtml', async (_e, rel: string, name: string) => {
    const snap = await readSnapshot(requireRoot(), rel, name)
    if (!snap) throw new Error('That version could not be read.')
    return renderPageHtml(snap, { imageBase: `${notebookUrl(rel)}/images/`, attachmentBase: `${notebookUrl(rel)}/attachments/` })
  })
  ipcMain.handle('page:restoreSnapshot', async (_e, rel: string, name: string) => {
    const root = requireRoot()
    const result = await restoreSnapshot(root, rel, name, historyPolicy())
    await reindexPage(result.relPath, result.doc, rel)
    return { ...result, tree: await afterSectionChange(parentOf(rel)) }
  })
  ipcMain.handle('page:copySnapshot', async (_e, rel: string, name: string) => {
    const root = requireRoot()
    const created = await copySnapshotToNewPage(root, rel, name, historyPolicy())
    await reindexPage(created.relPath, created.doc)
    return { relPath: created.relPath, tree: await afterSectionChange(parentOf(rel)) }
  })
  ipcMain.handle('recycle:list', async () => listRecycled(requireRoot()))
  ipcMain.handle('recycle:restore', async (_e, name: string, fallbackSection: string) => {
    const root = requireRoot()
    const rel = await restoreRecycled(root, name, fallbackSection)
    const tree = rel.endsWith('.page') ? await afterSectionChange(parentOf(rel)) : await afterContainerChange(parentOf(rel))
    if (!rel.endsWith('.page')) reconcileSoon()
    return { rel, tree }
  })
  ipcMain.handle('recycle:purge', async (_e, name: string) => purgeRecycled(requireRoot(), name))
  ipcMain.handle('notebook:verify', async (_e, mode: 'quick' | 'full') => {
    const root = requireRoot()
    const tree = await openNotebook(root)
    return verifyNotebook(root, tree, mode, historyPolicy(), (done, total) => broadcast('verify:progress', { done, total }))
  })
  ipcMain.handle('notebook:repair', async (_e, finding: Finding) => repairFinding(requireRoot(), finding, historyPolicy()))
  ipcMain.handle('notebook:setHistoryPolicy', async (_e, policy: HistoryPolicy, recycleDays: number) => {
    const root = requireRoot()
    const path = joinPath(root, 'notebook.json')
    const meta = await readJson<NotebookTree['meta']>(path)
    if (meta) await writeJson(path, { ...meta, settings: { ...meta.settings, history: policy, recycleDays } })
    const tree = await openNotebook(root)
    lastTree = tree
    return tree
  })

  /* ---------- templates ---------- */
  ipcMain.handle('template:list', async () => {
    const root = requireRoot()
    return { notebook: await listTemplates(libraryDir(root, 'notebook', globalTemplatesDir()), 'notebook'), global: await listTemplates(globalTemplatesDir(), 'global'), globalDir: globalTemplatesDir() }
  })
  ipcMain.handle('template:save', async (_e, pageRel: string, scope: TemplateScope, name: string, description: string) => {
    const root = requireRoot()
    return saveAsTemplate(root, pageRel, libraryDir(root, scope, globalTemplatesDir()), scope, name, description)
  })
  ipcMain.handle('template:delete', async (_e, ref: string) => {
    const root = requireRoot()
    const parsed = parseRef(ref)
    if (!parsed) throw new Error('Not a template')
    await deleteTemplate(libraryDir(root, parsed.scope, globalTemplatesDir()), parsed.folder)
  })
  ipcMain.handle('template:createPage', async (_e, sectionRel: string, ref: string, title?: string) => {
    const root = requireRoot()
    const parsed = parseRef(ref)
    if (!parsed) throw new Error('Not a template')
    const tree = await openNotebook(root)
    const dir = joinPath(libraryDir(root, parsed.scope, globalTemplatesDir()), parsed.folder)
    const tmeta = await readJson<TemplateMeta>(joinPath(dir, TEMPLATE_META))
    const made = await createPageFromTemplate(root, sectionRel, dir, title ?? tmeta?.name ?? 'Untitled page', { section: (await sectionOf(root, `${sectionRel}/x`)).name, notebook: tree.meta.name }, historyPolicy())
    await reindexPage(made.relPath, made.doc)
    return { relPath: made.relPath, tree: await openNotebook(root) }
  })
  ipcMain.handle('section:setDefaultTemplate', async (_e, rel: string, ref: string | null) => {
    const root = requireRoot()
    await setSectionDefaultTemplate(root, rel, ref)
    return afterContainerChange(parentOf(rel))
  })

  /* ---------- move and copy ---------- */
  ipcMain.handle('page:move', async (_e, relIn: string, targetSectionRel: string) => {
    const src = resolveRel(relIn)
    if (src.template) {
      const folder = await moveTemplate(resolveInside(src.root, src.rel), libraryForSection(targetSectionRel))
      return { rel: `${targetSectionRel}/${folder}`, tree: await templatesTree() }
    }
    const root = requireRoot()
    const rel = relIn
    const newRel = await movePage(root, rel, targetSectionRel)
    indexer?.remove(rel)
    const tree = await afterSectionChange(parentOf(rel), targetSectionRel)
    return { rel: newRel, tree }
  })
  ipcMain.handle('page:copy', async (_e, rel: string, targetSectionRel: string) => {
    const root = requireRoot()
    const newRel = await copyPage(root, rel, targetSectionRel)
    const tree = await afterSectionChange(targetSectionRel)
    return { rel: newRel, tree }
  })
  ipcMain.handle('section:move', async (_e, rel: string, targetContainerRel: string) => {
    const root = requireRoot()
    const newRel = await moveContainer(root, rel, targetContainerRel)
    indexer?.index.removeUnder(rel)
    const tree = await afterContainerChange(parentOf(rel), targetContainerRel)
    reconcileSoon()
    return { rel: newRel, tree }
  })
  ipcMain.handle('section:copy', async (_e, rel: string, targetContainerRel: string) => {
    const root = requireRoot()
    const newRel = await copyContainer(root, rel, targetContainerRel)
    const tree = await afterContainerChange(targetContainerRel)
    reconcileSoon()
    return { rel: newRel, tree }
  })
  ipcMain.handle('section:delete', async (_e, rel: string) => {
    const root = requireRoot()
    await recycleContainer(root, rel)
    indexer?.index.removeUnder(rel)
    return afterContainerChange(parentOf(rel))
  })

  /* ---------- about ---------- */
  ipcMain.handle('about:doc', async (_e, name: DocName) => readDoc(name))
  ipcMain.handle('about:info', async () => aboutInfo())
  ipcMain.handle('about:userName', async () => userFullName())
  ipcMain.handle('log:renderer', async (_e, text: string) => appendRendererLog(text))

  /* ---------- search ---------- */
  ipcMain.handle('search:query', async (_e, query: string, scopeRel: string) => indexer?.search(query, scopeRel) ?? { query, titles: [], pages: [], files: [], printouts: [], truncated: false })
  ipcMain.handle('search:status', async () => indexer?.status() ?? { phase: 'idle', done: 0, total: 0, rebuilt: false })
  ipcMain.handle('search:rebuild', async () => {
    if (!indexer || !currentRoot) return
    const tree = await openNotebook(currentRoot)
    lastTree = tree
    void indexer.reconcile(tree, true)
  })
  ipcMain.handle('notebook:rescan', async () => {
    reconcileSoon()
  })
  ipcMain.handle('notebook:setPaper', async (_e, paper: PaperSettings) => {
    const root = requireRoot()
    await setNotebookPaper(root, paper)
    return openNotebook(root)
  })
  ipcMain.handle('print:print', async (_e, rel: string, paper: PaperSettings) => printPage(rel, paper, focusedWindow()))
  ipcMain.handle('print:exportPages', async (_e, scopeRel: string, format: 'html' | 'pdf', suggestedName: string) => {
    const root = requireRoot()
    const target = scopeRel ? resolveInside(root, scopeRel) : root
    return exportPages(target, format, suggestedName, focusedWindow())
  })
  ipcMain.handle('print:pdf', async (_e, rel: string, paper: PaperSettings, title: string, outPath?: string) =>
    exportPdf(rel, paper, title, outPath, focusedWindow())
  )
  ipcMain.handle('page:delete', async (_e, relIn: string) => {
    const { root, rel, template } = resolveRel(relIn)
    if (template) {
      // Deleting a template removes it from the library (kept in that library's recycle folder).
      const name = await deletePage(root, rel)
      return { name, tree: await templatesTree() }
    }
    const name = await deletePage(root, rel)
    indexer?.remove(rel)
    return { name, tree: await afterSectionChange(parentOf(rel)) }
  })
}
