/**
 * Recycle folder for deleted pages. A deleted page keeps its whole folder plus
 * a small note of where it came from, so it can be put back.
 */
import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'
import { renameDurable } from './atomic'
import type { PageDoc, SectionMeta } from '../../shared/types'
import { readJson, writeJson } from './notebook'
import { now, timestampForFileName } from './ids'
import { uniqueName } from './names'
import { RECYCLE_DIR, PAGE_DOC, PAGE_SUFFIX, SECTION_META, resolveInside, toRel } from './paths'

export const RECYCLE_NOTE = 'recycle.json'
export const DEFAULT_RECYCLE_DAYS = 30

export interface RecycleNote {
  /** 'page' (default) or a section or group. */
  kind?: 'page' | 'section' | 'group'
  originalSection?: string
  /** For sections and groups: the group they were in, '' for the notebook root. */
  originalContainer?: string
  originalFolder: string
  title: string
  deleted: string
}

export interface RecycledPage extends RecycleNote {
  /** Folder name inside .recycle. */
  name: string
}

export async function recyclePage(root: string, pageRel: string, title: string): Promise<string> {
  const dir = resolveInside(root, pageRel)
  const recycle = join(root, RECYCLE_DIR)
  await fs.mkdir(recycle, { recursive: true })
  const name = `${timestampForFileName()} ${basename(dir)}`
  const dest = join(recycle, name)
  await renameDurable(dir, dest)
  const note: RecycleNote = { kind: 'page', originalSection: toRel(root, join(dir, '..')), originalFolder: basename(dir), title, deleted: now() }
  await writeJson(join(dest, RECYCLE_NOTE), note)
  return name
}

export async function listRecycled(root: string): Promise<RecycledPage[]> {
  const recycle = join(root, RECYCLE_DIR)
  let entries: string[]
  try {
    entries = await fs.readdir(recycle)
  } catch {
    return []
  }
  const out: RecycledPage[] = []
  for (const name of entries) {
    if (name === 'orphaned files') continue
    const note = await readJson<RecycleNote>(join(recycle, name, RECYCLE_NOTE))
    if (!note && !name.endsWith(PAGE_SUFFIX)) continue
    const doc = note ? undefined : await readJson<PageDoc>(join(recycle, name, PAGE_DOC))
    out.push({
      name,
      kind: note?.kind ?? 'page',
      originalSection: note?.originalSection ?? note?.originalContainer ?? '',
      originalContainer: note?.originalContainer ?? '',
      originalFolder: note?.originalFolder ?? name.replace(/^\S+ /, ''),
      title: note?.title ?? doc?.title ?? name,
      deleted: note?.deleted ?? ''
    })
  }
  return out.sort((a, b) => b.deleted.localeCompare(a.deleted))
}

/** Put a recycled page back in its original section (or `fallbackSection`); a section or group goes back to its group or the root. */
export async function restoreRecycled(root: string, name: string, fallbackSection: string): Promise<string> {
  if (name.includes('/') || name.includes('..')) throw new Error('Bad recycle entry')
  const src = join(root, RECYCLE_DIR, name)
  const note = await readJson<RecycleNote>(join(src, RECYCLE_NOTE))
  if (note && note.kind && note.kind !== 'page') {
    let container = note.originalContainer ?? ''
    if (container && !(await readJson<{ id: string }>(join(resolveInside(root, container), 'group.json')))) container = ''
    const parentAbs = container ? resolveInside(root, container) : root
    const folder = await uniqueName(parentAbs, note.originalFolder)
    await fs.rm(join(src, RECYCLE_NOTE), { force: true })
    await renameDurable(src, join(parentAbs, folder))
    const metaPath = container ? join(parentAbs, 'group.json') : join(root, 'notebook.json')
    const meta = await readJson<{ order?: string[] }>(metaPath)
    if (meta) await writeJson(metaPath, { ...meta, order: [...(meta.order ?? []), folder] })
    return container ? `${container}/${folder}` : folder
  }
  let sectionRel = note?.originalSection ?? fallbackSection
  let sectionAbs = resolveInside(root, sectionRel)
  const hasSection = await readJson<SectionMeta>(join(sectionAbs, SECTION_META))
  if (!hasSection) {
    sectionRel = fallbackSection
    sectionAbs = resolveInside(root, sectionRel)
  }
  const folder = await uniqueName(sectionAbs, (note?.originalFolder ?? name).replace(new RegExp(`${PAGE_SUFFIX}$`), ''), PAGE_SUFFIX)
  const dest = join(sectionAbs, folder)
  await fs.rm(join(src, RECYCLE_NOTE), { force: true })
  await renameDurable(src, dest)
  const meta = await readJson<SectionMeta>(join(sectionAbs, SECTION_META))
  if (meta) await writeJson(join(sectionAbs, SECTION_META), { ...meta, pageOrder: [...(meta.pageOrder ?? []), folder] })
  return toRel(root, dest)
}

export async function purgeRecycled(root: string, name: string): Promise<void> {
  if (name.includes('/') || name.includes('..')) throw new Error('Bad recycle entry')
  await fs.rm(join(root, RECYCLE_DIR, name), { recursive: true, force: true })
}

/** Remove recycled pages older than `days`. Returns how many were removed. */
export async function purgeOld(root: string, days = DEFAULT_RECYCLE_DAYS): Promise<number> {
  const cutoff = Date.now() - days * 86400000
  let n = 0
  for (const entry of await listRecycled(root)) {
    const t = entry.deleted ? new Date(entry.deleted).getTime() : NaN
    if (!Number.isNaN(t) && t < cutoff) {
      await purgeRecycled(root, entry.name)
      n += 1
    }
  }
  return n
}
