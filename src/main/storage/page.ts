/**
 * Page documents: create, load with recovery, save with history, drafts.
 * See PROGRAM_DESCRIPTION.md sections 8, 11, and 15.
 */
import { promises as fs } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import {
  FORMAT_VERSION,
  DEFAULT_PAPER,
  type PageDoc,
  type PaperSettings,
  type LoadPageResult,
  type SavePageResult,
  type RecoveryNotice,
  type HistoryEntry,
  type SectionMeta,
  type CanvasObject
} from '../../shared/types'
import { atomicWriteFile, durableCopy, exists, cleanTempFiles } from './atomic'
import { newId, now, timestampForFileName } from './ids'
import { sanitizeName, uniqueName } from './names'
import { readJson, writeJson } from './notebook'
import {
  HISTORY_DIR,
  PAGE_DOC,
  PAGE_HTML,
  PAGE_DRAFT,
  PAGE_SUFFIX,
  SECTION_META,
  resolveInside,
  toRel
} from './paths'
import { withChecksum, verifyChecksum } from './checksum'
import { renderPageHtml } from '../../shared/render/renderPage'
import { findMissingFiles, ATTACHMENTS_DIR, IMAGES_DIR } from './attachments'
import { pruneHistory, type HistoryPolicy, DEFAULT_HISTORY_POLICY } from './history'
import { recyclePage } from './recycle'

/* ---------- construction ---------- */

export function emptyTextContainer(x = 96, y = 96, width = 480): CanvasObject {
  return { kind: 'text', id: newId(), x, y, width, content: { type: 'doc', content: [{ type: 'paragraph' }] } }
}

export function newPageDoc(title: string, paper: PaperSettings = DEFAULT_PAPER): PageDoc {
  const stamp = now()
  return withChecksum({
    format: FORMAT_VERSION,
    id: newId(),
    title,
    created: stamp,
    modified: stamp,
    tags: [],
    paper,
    objects: [emptyTextContainer()],
    manifest: { images: [], attachments: [] }
  })
}

/** Structural validation. A document that passes this and its checksum is trusted. */
export function isValidPageDoc(value: unknown): value is PageDoc {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return (
    typeof d.format === 'number' &&
    typeof d.id === 'string' &&
    typeof d.title === 'string' &&
    typeof d.created === 'string' &&
    typeof d.modified === 'string' &&
    Array.isArray(d.tags) &&
    Array.isArray(d.objects) &&
    !!d.paper &&
    typeof d.paper === 'object' &&
    !!d.manifest &&
    typeof d.manifest === 'object' &&
    typeof d.checksum === 'string'
  )
}

export async function readValidPage(path: string): Promise<PageDoc | undefined> {
  const doc = await readJson<unknown>(path)
  if (!isValidPageDoc(doc)) return undefined
  if (!verifyChecksum(doc)) return undefined
  return doc
}

/* ---------- create ---------- */

export async function createPage(
  root: string,
  sectionRel: string,
  title = 'Untitled page',
  paper?: PaperSettings
): Promise<{ relPath: string; doc: PageDoc }> {
  const sectionAbs = resolveInside(root, sectionRel)
  const folder = await uniqueName(sectionAbs, sanitizeName(title), PAGE_SUFFIX)
  const dir = join(sectionAbs, folder)
  await fs.mkdir(dir)
  await fs.mkdir(join(dir, 'images'))
  await fs.mkdir(join(dir, 'attachments'))
  await fs.mkdir(join(dir, HISTORY_DIR))
  const doc = newPageDoc(title, paper)
  await atomicWriteFile(join(dir, PAGE_DOC), serialize(doc))
  await writeRendered(dir, doc)
  await appendPageOrder(sectionAbs, folder)
  return { relPath: toRel(root, dir), doc }
}

function serialize(doc: PageDoc): string {
  return JSON.stringify(doc, null, 2) + '\n'
}

/** The rendered companion file. Derived from page.json; never a source of truth. */
export async function writeRendered(pageDir: string, doc: PageDoc): Promise<void> {
  try {
    await atomicWriteFile(join(pageDir, PAGE_HTML), renderPageHtml(doc))
  } catch (err) {
    // A rendering problem must never block a save of the source document,
    // but it must not be silent either: the companion file says what failed.
    const why = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    const safe = why.replace(/</g, '&lt;')
    try {
      await atomicWriteFile(
        join(pageDir, PAGE_HTML),
        `<!doctype html><html><head><meta charset="utf-8"><title>${doc.title.replace(/</g, '&lt;')}</title></head><body><p>PageBinder could not render this page. The note itself is intact in page.json.</p><pre>${safe}</pre></body></html>\n`
      )
    } catch {
      /* give up quietly */
    }
  }
}

async function appendPageOrder(sectionAbs: string, folder: string): Promise<void> {
  const path = join(sectionAbs, SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta) return
  const pageOrder = Array.isArray(meta.pageOrder) ? meta.pageOrder : []
  if (!pageOrder.includes(folder)) pageOrder.push(folder)
  await writeJson(path, { ...meta, pageOrder })
}

async function replacePageOrder(sectionAbs: string, from: string, to: string): Promise<void> {
  const path = join(sectionAbs, SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta || !Array.isArray(meta.pageOrder)) return
  await writeJson(path, { ...meta, pageOrder: meta.pageOrder.map((n) => (n === from ? to : n)) })
}

async function removePageOrder(sectionAbs: string, folder: string): Promise<void> {
  const path = join(sectionAbs, SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta || !Array.isArray(meta.pageOrder)) return
  await writeJson(path, { ...meta, pageOrder: meta.pageOrder.filter((n) => n !== folder) })
}

/* ---------- history ---------- */

export async function listHistory(root: string, pageRel: string): Promise<HistoryEntry[]> {
  const dir = join(resolveInside(root, pageRel), HISTORY_DIR)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const entries: HistoryEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const stat = await fs.stat(join(dir, name))
    entries.push({ name, modified: stat.mtime.toISOString(), size: stat.size })
  }
  // Names are ISO timestamps, so lexical order is chronological. Newest first.
  return entries.sort((a, b) => b.name.localeCompare(a.name))
}

async function snapshotCurrent(pageDir: string): Promise<string | undefined> {
  const current = join(pageDir, PAGE_DOC)
  if (!(await exists(current))) return undefined
  const historyDir = join(pageDir, HISTORY_DIR)
  await fs.mkdir(historyDir, { recursive: true })
  let name = `${timestampForFileName()}.json`
  if (await exists(join(historyDir, name))) {
    name = `${timestampForFileName()}-${newId().slice(0, 4)}.json`
  }
  await durableCopy(current, join(historyDir, name))
  return name
}

/* ---------- load with recovery ---------- */

export async function loadPage(root: string, pageRel: string): Promise<LoadPageResult> {
  const dir = resolveInside(root, pageRel)
  await cleanTempFiles(dir)
  const docPath = join(dir, PAGE_DOC)
  const notices: RecoveryNotice[] = []

  let doc = await readValidPage(docPath)
  if (!doc) {
    // Keep the damaged file for inspection, then look for the newest valid snapshot.
    if (await exists(docPath)) {
      await fs.rename(docPath, join(dir, `${PAGE_DOC}.corrupt-${timestampForFileName()}`))
    }
    const history = await listHistory(root, pageRel)
    for (const entry of history) {
      const candidate = await readValidPage(join(dir, HISTORY_DIR, entry.name))
      if (candidate) {
        await durableCopy(join(dir, HISTORY_DIR, entry.name), docPath)
        doc = candidate
        notices.push({
          kind: 'recovered-from-history',
          snapshot: entry.name,
          message: `The saved page was damaged. Recovered the version from ${describeSnapshot(entry.name)}. The damaged file was kept beside it.`
        })
        break
      }
    }
    if (!doc) {
      const folderTitle = basename(dir).slice(0, -PAGE_SUFFIX.length)
      doc = newPageDoc(folderTitle)
      await atomicWriteFile(docPath, serialize(doc))
      notices.push({
        kind: 'no-valid-version',
        message: 'The saved page was damaged and no earlier version could be found. The page was reset. The damaged file was kept for inspection.'
      })
    }
  }

  // Regenerate the rendered copy when it is missing or older than the document.
  try {
    const [docStat, htmlStat] = await Promise.all([fs.stat(docPath), fs.stat(join(dir, PAGE_HTML)).catch(() => undefined)])
    if (!htmlStat || htmlStat.mtimeMs < docStat.mtimeMs) await writeRendered(dir, doc)
  } catch {
    /* ignore */
  }

  // Integrity: every file the page references must exist with its recorded size.
  const missing = await findMissingFiles(root, pageRel, [
    { sub: IMAGES_DIR, files: doc.manifest.images ?? [] },
    { sub: ATTACHMENTS_DIR, files: doc.manifest.attachments ?? [] }
  ])
  if (missing.length) {
    notices.push({
      kind: 'missing-files',
      message: `${missing.length === 1 ? 'One file this page uses is' : `${missing.length} files this page uses are`} missing or damaged: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. Restore ${missing.length === 1 ? 'it' : 'them'} from your backup into the page folder.`
    })
  }

  const draft = await readValidPage(join(dir, PAGE_DRAFT))
  if (draft && draft.modified > doc.modified) {
    notices.push({
      kind: 'draft-available',
      message: `Unsaved changes from ${new Date(draft.modified).toLocaleString()} were found. Restore them or discard them.`
    })
    return { relPath: pageRel, doc, notices, missing, draft }
  }
  if (draft) {
    await fs.rm(join(dir, PAGE_DRAFT), { force: true })
  }
  return { relPath: pageRel, doc, notices, missing }
}

function describeSnapshot(name: string): string {
  const iso = name.replace(/\.json$/, '').replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4')
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? name : date.toLocaleString()
}

/* ---------- save ---------- */

export async function savePage(root: string, pageRel: string, input: PageDoc, policy: HistoryPolicy = DEFAULT_HISTORY_POLICY): Promise<SavePageResult> {
  let dir = resolveInside(root, pageRel)
  const previous = await readValidPage(join(dir, PAGE_DOC))
  const doc = withChecksum({
    ...input,
    format: FORMAT_VERSION,
    id: previous?.id ?? input.id ?? newId(),
    created: previous?.created ?? input.created ?? now(),
    modified: now()
  })
  const snapshot = await snapshotCurrent(dir)
  await atomicWriteFile(join(dir, PAGE_DOC), serialize(doc))
  await writeRendered(dir, doc)
  await fs.rm(join(dir, PAGE_DRAFT), { force: true })
  try {
    await pruneHistory(dir, policy)
  } catch {
    /* pruning is housekeeping; a failure never affects the save */
  }

  // Rename the folder when the title changed enough to change the folder name.
  const wanted = sanitizeName(doc.title || 'Untitled page')
  const currentFolder = basename(dir)
  const currentStem = currentFolder.slice(0, -PAGE_SUFFIX.length)
  // Only page folders are renamed to follow the title; template folders keep their names.
  if (currentFolder.endsWith(PAGE_SUFFIX) && wanted.toLowerCase() !== currentStem.toLowerCase() && !currentStem.toLowerCase().startsWith(`${wanted.toLowerCase()} (`)) {
    const sectionAbs = dirname(dir)
    const folder = await uniqueName(sectionAbs, wanted, PAGE_SUFFIX)
    const dest = join(sectionAbs, folder)
    try {
      await fs.rename(dir, dest)
      await replacePageOrder(sectionAbs, currentFolder, folder)
      dir = dest
    } catch {
      /* keep the old folder name; the page is saved regardless */
    }
  }
  return { relPath: toRel(root, dir), doc, ...(snapshot ? { snapshot } : {}) }
}

export async function saveDraft(root: string, pageRel: string, input: PageDoc): Promise<void> {
  const dir = resolveInside(root, pageRel)
  const doc = withChecksum({ ...input, modified: now() })
  await atomicWriteFile(join(dir, PAGE_DRAFT), serialize(doc))
}

export async function discardDraft(root: string, pageRel: string): Promise<void> {
  await fs.rm(join(resolveInside(root, pageRel), PAGE_DRAFT), { force: true })
}

export async function readSnapshot(root: string, pageRel: string, name: string): Promise<PageDoc | undefined> {
  if (name.includes('/') || name.includes('\\')) throw new Error('Bad snapshot name')
  return readValidPage(join(resolveInside(root, pageRel), HISTORY_DIR, name))
}

/** Rename a page: loads it, changes the title, saves it (folder rename included). */
export async function renamePage(root: string, pageRel: string, title: string): Promise<SavePageResult> {
  const loaded = await loadPage(root, pageRel)
  return savePage(root, loaded.relPath, { ...loaded.doc, title: title.trim() || 'Untitled page' })
}

/* ---------- snapshots: restore and copy ---------- */

/** Make a history snapshot the current version. The version being replaced is snapshotted first, as with any save. */
export async function restoreSnapshot(root: string, pageRel: string, name: string, policy?: HistoryPolicy): Promise<SavePageResult> {
  const snap = await readSnapshot(root, pageRel, name)
  if (!snap) throw new Error('That version could not be read.')
  const current = await loadPage(root, pageRel)
  return savePage(root, current.relPath, { ...snap, manifest: current.doc.manifest }, policy)
}

/** Create a new page in the same section holding a snapshot's content. */
export async function copySnapshotToNewPage(root: string, pageRel: string, name: string, policy?: HistoryPolicy): Promise<{ relPath: string; doc: PageDoc }> {
  const snap = await readSnapshot(root, pageRel, name)
  if (!snap) throw new Error('That version could not be read.')
  const sectionRel = toRel(root, dirname(resolveInside(root, pageRel)))
  const when = new Date(snap.modified)
  const title = `${snap.title || 'Untitled page'} (version from ${Number.isNaN(when.getTime()) ? name : when.toLocaleString()})`
  const created = await createPage(root, sectionRel, title, snap.paper)
  // Images and attachments belong to the original page folder; copy the ones the snapshot uses.
  const srcDir = resolveInside(root, pageRel)
  const dstDir = resolveInside(root, created.relPath)
  for (const sub of [IMAGES_DIR, ATTACHMENTS_DIR]) {
    for (const obj of snap.objects) {
      const nm = (obj.kind === 'image' && sub === IMAGES_DIR) || (obj.kind === 'file' && sub === ATTACHMENTS_DIR) ? obj.name : null
      if (!nm) continue
      try {
        await fs.copyFile(join(srcDir, sub, nm), join(dstDir, sub, nm))
      } catch {
        /* missing source file: the card will show as missing */
      }
    }
  }
  const current = await loadPage(root, pageRel)
  const usedImages = new Set(snap.objects.filter((o) => o.kind === 'image').map((o) => (o as { name: string }).name))
  const usedFiles = new Set(snap.objects.filter((o) => o.kind === 'file').map((o) => (o as { name: string }).name))
  const manifest = {
    images: current.doc.manifest.images.filter((e) => usedImages.has(e.name)),
    attachments: current.doc.manifest.attachments.filter((e) => usedFiles.has(e.name))
  }
  const saved = await savePage(root, created.relPath, { ...created.doc, title, objects: snap.objects, paper: snap.paper, ...(snap.print ? { print: snap.print } : {}), manifest }, policy)
  return { relPath: saved.relPath, doc: saved.doc }
}

/* ---------- delete to recycle ---------- */

export async function deletePage(root: string, pageRel: string): Promise<string> {
  const dir = resolveInside(root, pageRel)
  const sectionAbs = dirname(dir)
  const doc = await readJson<PageDoc>(join(dir, PAGE_DOC))
  const name = await recyclePage(root, pageRel, doc?.title ?? basename(dir).replace(new RegExp(`${PAGE_SUFFIX}$`), ''))
  await removePageOrder(sectionAbs, basename(dir))
  return name
}
