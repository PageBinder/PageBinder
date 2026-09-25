/**
 * Notebook creation, opening, and tree scanning.
 * Phase 1 walks the folders directly; the SQLite tree cache arrives in phase 4.
 */
import { hostname } from 'node:os'
import { promises as fs, readFileSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import {
  FORMAT_VERSION,
  DEFAULT_PAPER,
  SECTION_COLORS,
  type NotebookMeta,
  type GroupMeta,
  type SectionMeta,
  type NotebookTree,
  type TreeChild,
  type SectionNode,
  type GroupNode,
  type PageRef,
  type PageDoc
} from '../../shared/types'
import { atomicWriteFile, exists, cleanTempFiles } from './atomic'
import { newId, now } from './ids'
import { sanitizeName, uniqueName } from './names'
import {
  NOTEBOOK_META,
  GROUP_META,
  SECTION_META,
  PAGE_DOC,
  PAGE_SUFFIX,
  TEMPLATES_DIR,
  INDEX_DIR,
  LOCK_FILE,
  isHiddenEntry,
  toRel
} from './paths'

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const text = await fs.readFile(path, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(value, null, 2) + '\n')
}

/* ---------- create ---------- */

export async function createNotebook(parentDir: string, name: string): Promise<string> {
  const folder = await uniqueName(parentDir, sanitizeName(name))
  const root = join(parentDir, folder)
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(join(root, TEMPLATES_DIR), { recursive: true })
  const meta: NotebookMeta = {
    format: FORMAT_VERSION,
    id: newId(),
    name: name.trim() || folder,
    created: now(),
    modified: now(),
    order: [],
    settings: { paper: DEFAULT_PAPER }
  }
  await writeJson(join(root, NOTEBOOK_META), meta)
  await fs.writeFile(join(root, 'README.txt'), README, 'utf8')
  return root
}

const README = `This folder is a PageBinder notebook.

Every section is a folder, every section group is a folder containing sections,
and every page is a folder ending in ".page". Inside a page folder:

  page.json      the note itself (JSON)
  page.html      a rendered copy you can open in any browser (from phase 2)
  images/        pictures shown on the page
  attachments/   files attached to the page
  .history/      earlier versions of page.json, newest last

The .index folder is a rebuildable cache and can be deleted safely.
Nothing in this notebook depends on any online service.
`

/* ---------- lock ---------- */

export interface LockInfo {
  pid: number
  host: string
  since: string
}

export async function acquireLock(root: string): Promise<{ ok: true } | { ok: false; holder: LockInfo }> {
  const path = join(root, LOCK_FILE)
  const existing = await readJson<LockInfo>(path)
  // A lock written on another computer cannot be checked from here, and its process number means
  // nothing on this one. It arrives with a copy of the notebook (from a backup or the NAS, taken
  // while the notebook was open), so it is stale by definition and is replaced.
  const sameHost = !existing?.host || existing.host.toLowerCase() === hostName().toLowerCase()
  if (existing && sameHost && existing.pid !== process.pid && isProcessAlive(existing.pid)) {
    return { ok: false, holder: existing }
  }
  const info: LockInfo = { pid: process.pid, host: hostName(), since: now() }
  await atomicWriteFile(path, JSON.stringify(info))
  return { ok: true }
}

export async function releaseLock(root: string): Promise<void> {
  const path = join(root, LOCK_FILE)
  const existing = await readJson<LockInfo>(path)
  if (existing && existing.pid === process.pid) await fs.rm(path, { force: true })
}

/** Synchronous variant for app quit, where async work may not complete. */
export function releaseLockSync(root: string): void {
  const path = join(root, LOCK_FILE)
  try {
    const existing = JSON.parse(readFileSync(path, 'utf8')) as LockInfo
    if (existing.pid === process.pid) rmSync(path, { force: true })
  } catch {
    /* no lock or not ours */
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function hostName(): string {
  try {
    // The OS name, not an environment variable: a shell exports HOSTNAME but an app started from
    // the Dock or Start menu does not, and both must agree for the lock check above.
    return hostname() || 'unknown'
  } catch {
    return 'unknown'
  }
}

/* ---------- open and scan ---------- */

export async function openNotebook(root: string): Promise<NotebookTree> {
  const regenerated: string[] = []
  await cleanTempFiles(root)
  let meta = await readJson<NotebookMeta>(join(root, NOTEBOOK_META))
  if (!meta || typeof meta.id !== 'string') {
    meta = {
      format: FORMAT_VERSION,
      id: newId(),
      name: basename(root),
      created: now(),
      modified: now(),
      order: [],
      settings: { paper: DEFAULT_PAPER }
    }
    await writeJson(join(root, NOTEBOOK_META), meta)
    regenerated.push(NOTEBOOK_META)
  }
  await fs.mkdir(join(root, INDEX_DIR), { recursive: true })
  const children = await scanContainer(root, root, meta.order, regenerated)
  return { root, meta, children, regenerated }
}

/** Scan a notebook root or a group folder for sections and groups. */
export async function scanContainer(
  root: string,
  dir: string,
  order: string[],
  regenerated: string[]
): Promise<TreeChild[]> {
  await cleanTempFiles(dir)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const candidates = entries.filter((e) => e.isDirectory() && !isHiddenEntry(e.name) && !(dir === root && e.name === TEMPLATES_DIR) && !e.name.endsWith(PAGE_SUFFIX))
  // Children are scanned in parallel batches; small-file reads are latency-bound, not bandwidth-bound.
  const found: TreeChild[] = []
  const results = await mapLimit(candidates, SCAN_CONCURRENCY, async (entry) => {
    const child = join(dir, entry.name)
    const [sectionMeta, groupMeta] = await Promise.all([readJson<SectionMeta>(join(child, SECTION_META)), readJson<GroupMeta>(join(child, GROUP_META))])
    if (sectionMeta && !groupMeta) return scanSection(root, child, sectionMeta, regenerated)
    if (groupMeta) return scanGroup(root, child, groupMeta, regenerated)
    return null
  })
  for (let i = 0; i < candidates.length; i++) {
    const ready = results[i]
    if (ready) {
      found.push(ready)
      continue
    }
    const entry = candidates[i]!
    const child = join(dir, entry.name)
    {
      // No metadata. Decide by contents: any .page folders make it a section,
      // any folders at all make it a group, an empty folder becomes a section.
      const inner = await fs.readdir(child, { withFileTypes: true })
      const hasPages = inner.some((e) => e.isDirectory() && e.name.endsWith(PAGE_SUFFIX))
      const hasDirs = inner.some((e) => e.isDirectory() && !isHiddenEntry(e.name))
      if (hasPages || !hasDirs) {
        const fresh = await regenerateSectionMeta(child)
        regenerated.push(toRel(root, join(child, SECTION_META)))
        found.push(await scanSection(root, child, fresh, regenerated))
      } else {
        const fresh: GroupMeta = { format: FORMAT_VERSION, id: newId(), name: entry.name, created: now(), order: [] }
        await writeJson(join(child, GROUP_META), fresh)
        regenerated.push(toRel(root, join(child, GROUP_META)))
        found.push(await scanGroup(root, child, fresh, regenerated))
      }
    }
  }
  return sortByOrder(found, order, (c) => basename(c.relPath))
}

export const SCAN_CONCURRENCY = 32

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

async function regenerateSectionMeta(dir: string): Promise<SectionMeta> {
  const meta: SectionMeta = {
    format: FORMAT_VERSION,
    id: newId(),
    name: basename(dir),
    color: SECTION_COLORS[Math.floor(Math.random() * SECTION_COLORS.length)]!,
    created: now(),
    pageOrder: []
  }
  await writeJson(join(dir, SECTION_META), meta)
  return meta
}

async function scanGroup(root: string, dir: string, meta: GroupMeta, regenerated: string[]): Promise<GroupNode> {
  return {
    kind: 'group',
    id: meta.id,
    name: meta.name,
    relPath: toRel(root, dir),
    children: await scanContainer(root, dir, meta.order ?? [], regenerated)
  }
}

async function scanSection(root: string, dir: string, meta: SectionMeta, _regenerated: string[]): Promise<SectionNode> {
  await cleanTempFiles(dir)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const pageDirs = entries.filter((e) => e.isDirectory() && e.name.endsWith(PAGE_SUFFIX)).map((e) => join(dir, e.name))
  const pages = await mapLimit(pageDirs, SCAN_CONCURRENCY, (pageDir) => readPageRef(root, pageDir))
  return {
    kind: 'section',
    id: meta.id,
    name: meta.name,
    color: meta.color,
    relPath: toRel(root, dir),
    pages: sortByOrder(pages, meta.pageOrder ?? [], (p) => basename(p.relPath)),
    ...(meta.defaultTemplate ? { defaultTemplate: meta.defaultTemplate } : {})
  }
}

/** Read just enough of a page to list it. Falls back to the folder name if the document is damaged. */
export async function readPageRef(root: string, pageDir: string): Promise<PageRef> {
  const doc = await readJson<PageDoc>(join(pageDir, PAGE_DOC))
  const folderTitle = basename(pageDir).slice(0, -PAGE_SUFFIX.length)
  if (doc && typeof doc.id === 'string') {
    return {
      id: doc.id,
      title: typeof doc.title === 'string' ? doc.title : folderTitle,
      relPath: toRel(root, pageDir),
      modified: typeof doc.modified === 'string' ? doc.modified : now(),
      ...(doc.parentPageId ? { parentPageId: doc.parentPageId } : {})
    }
  }
  let modified = now()
  try {
    modified = (await fs.stat(pageDir)).mtime.toISOString()
  } catch {
    /* ignore */
  }
  return { id: `folder:${toRel(root, pageDir)}`, title: folderTitle, relPath: toRel(root, pageDir), modified }
}

function sortByOrder<T>(items: T[], order: string[], key: (item: T) => string): T[] {
  const rank = new Map(order.map((name, i) => [name, i]))
  return [...items].sort((a, b) => {
    const ra = rank.get(key(a))
    const rb = rank.get(key(b))
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' })
  })
}

/**
 * Notebooks made before the rename from DigiNote carry a README.txt naming the old
 * program. On open, a README that is still the stock text is updated; a README the
 * user has edited is left alone. Failures are ignored: the README is informational.
 */
export async function refreshReadme(root: string): Promise<void> {
  try {
    const path = join(root, 'README.txt')
    const text = await fs.readFile(path, 'utf8')
    if (text.replace('This folder is a DigiNote notebook.', 'This folder is a PageBinder notebook.') === README) await atomicWriteFile(path, README)
  } catch {
    /* no README or not writable: nothing to do */
  }
}

export async function notebookExists(root: string): Promise<boolean> {
  return exists(join(root, NOTEBOOK_META))
}

export async function setNotebookPaper(root: string, paper: NotebookMeta['settings']['paper']): Promise<void> {
  const path = join(root, NOTEBOOK_META)
  const meta = await readJson<NotebookMeta>(path)
  if (!meta) return
  await writeJson(path, { ...meta, settings: { ...meta.settings, paper }, modified: now() })
}
