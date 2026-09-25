/**
 * The notebook tree, served from the index instead of a folder scan.
 * See PROGRAM_DESCRIPTION.md sections 10.1 and 15.7.
 */
import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'
import type { NotebookTree, TreeChild, SectionNode, GroupNode, NotebookMeta, SectionMeta, GroupMeta } from '../../shared/types'
import type { SearchIndex, ContainerRow } from './index'
import { readJson, readPageRef, mapLimit, SCAN_CONCURRENCY } from '../storage/notebook'
import { NOTEBOOK_META, SECTION_META, GROUP_META, PAGE_SUFFIX, PAGE_DOC, resolveInside } from '../storage/paths'

function byOrder<T extends { sort: number; name?: string; title?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort - b.sort || (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '', undefined, { numeric: true, sensitivity: 'base' }))
}

/** Build the tree from index rows. Returns null when the index holds no structure yet. */
export function treeFromIndex(index: SearchIndex, root: string, meta: NotebookMeta): NotebookTree | null {
  const containers = index.allContainers()
  if (!containers.length && index.pageCount() === 0) return null
  const pages = index.allPages()
  const pagesBySection = new Map<string, typeof pages>()
  for (const p of pages) {
    const list = pagesBySection.get(p.sectionRel) ?? []
    list.push(p)
    pagesBySection.set(p.sectionRel, list)
  }
  const byParent = new Map<string, ContainerRow[]>()
  for (const c of containers) {
    const list = byParent.get(c.parentRel) ?? []
    list.push(c)
    byParent.set(c.parentRel, list)
  }
  const build = (parentRel: string): TreeChild[] =>
    byOrder(byParent.get(parentRel) ?? []).map((c): TreeChild => {
      if (c.kind === 'group') {
        const g: GroupNode = { kind: 'group', id: c.rel, name: c.name, relPath: c.rel, children: build(c.rel) }
        return g
      }
      const s: SectionNode = {
        kind: 'section',
        id: c.rel,
        name: c.name,
        color: c.color ?? '#888780',
        relPath: c.rel,
        pages: byOrder(pagesBySection.get(c.rel) ?? []).map((p) => ({ id: p.id, title: p.title, relPath: p.rel, modified: p.modified, ...(p.parentPageId ? { parentPageId: p.parentPageId } : {}) })),
        ...(c.defaultTemplate ? { defaultTemplate: c.defaultTemplate } : {})
      }
      return s
    })
  return { root, meta, children: build(''), regenerated: [] }
}

/** Write a scanned tree's structure into the index: every container and every page's place. */
export function applyTreeToIndex(index: SearchIndex, tree: NotebookTree): void {
  index.transaction(() => applyTreeToIndexInner(index, tree))
}

function applyTreeToIndexInner(index: SearchIndex, tree: NotebookTree): void {
  const fresh = index.pageCount() === 0 && index.containerCount() === 0
  const seenContainers = new Set<string>()
  const seenPages = new Set<string>()
  const walk = (children: TreeChild[], parentRel: string): void => {
    children.forEach((c, i) => {
      seenContainers.add(c.relPath)
      if (c.kind === 'group') {
        index.indexContainer(c.relPath, 'group', c.name, { parentRel, sort: i, color: null })
        walk(c.children, c.relPath)
      } else {
        index.indexContainer(c.relPath, 'section', c.name, { parentRel, sort: i, color: c.color, defaultTemplate: c.defaultTemplate ?? null })
        c.pages.forEach((p, j) => {
          seenPages.add(p.relPath)
          index.upsertPageRef(p.relPath, p, { name: c.name, rel: c.relPath }, 0, j, fresh)
        })
      }
    })
  }
  walk(tree.children, '')
  for (const c of index.allContainers()) if (!seenContainers.has(c.rel)) index.removeContainer(c.rel)
  for (const p of index.allPages()) if (!seenPages.has(p.rel)) index.removePage(p.rel)
}

/** Re-read one section folder and replace its rows: pages, order, name, colour. */
export async function refreshSection(index: SearchIndex, root: string, sectionRel: string): Promise<void> {
  const dir = resolveInside(root, sectionRel)
  const meta = await readJson<SectionMeta>(join(dir, SECTION_META))
  if (!meta) {
    index.removeUnder(sectionRel)
    return
  }
  const parentRel = sectionRel.includes('/') ? sectionRel.slice(0, sectionRel.lastIndexOf('/')) : ''
  index.indexContainer(sectionRel, 'section', meta.name, { parentRel, color: meta.color, defaultTemplate: meta.defaultTemplate ?? null })
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const pageDirs = entries.filter((e) => e.isDirectory() && e.name.endsWith(PAGE_SUFFIX)).map((e) => join(dir, e.name))
  const refs = await mapLimit(pageDirs, SCAN_CONCURRENCY, async (d) => ({ ref: await readPageRef(root, d), mtime: await fs.stat(join(d, PAGE_DOC)).then((st) => st.mtimeMs, () => 0) }))
  const order = new Map((meta.pageOrder ?? []).map((n, i) => [n, i]))
  const known = new Set(refs.map((r) => r.ref.relPath))
  index.transaction(() => {
    for (const row of index.pagesInSection(sectionRel)) if (!known.has(row.rel)) index.removePage(row.rel)
    refs
      .sort((a, b) => (order.get(basename(a.ref.relPath)) ?? 1e9) - (order.get(basename(b.ref.relPath)) ?? 1e9) || a.ref.title.localeCompare(b.ref.title, undefined, { numeric: true }))
      .forEach((r, i) => index.upsertPageRef(r.ref.relPath, r.ref, { name: meta.name, rel: sectionRel }, r.mtime, i))
  })
}

/** Re-read one container's immediate children (names, kinds, colours, order) without descending into pages. */
export async function refreshContainer(index: SearchIndex, root: string, containerRel: string): Promise<void> {
  const dir = containerRel ? resolveInside(root, containerRel) : root
  const orderMeta = containerRel ? await readJson<GroupMeta>(join(dir, GROUP_META)) : await readJson<NotebookMeta>(join(root, NOTEBOOK_META))
  const order = new Map((orderMeta?.order ?? []).map((n, i) => [n, i]))
  if (containerRel && orderMeta) index.indexContainer(containerRel, 'group', (orderMeta as GroupMeta).name, { parentRel: containerRel.includes('/') ? containerRel.slice(0, containerRel.lastIndexOf('/')) : '' })
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const found: { rel: string; kind: 'section' | 'group'; name: string; color: string | null; defaultTemplate: string | null; folder: string }[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.endsWith(PAGE_SUFFIX) || (!containerRel && e.name === 'templates')) continue
    const rel = containerRel ? `${containerRel}/${e.name}` : e.name
    const section = await readJson<SectionMeta>(join(dir, e.name, SECTION_META))
    if (section) {
      found.push({ rel, kind: 'section', name: section.name, color: section.color, defaultTemplate: section.defaultTemplate ?? null, folder: e.name })
      continue
    }
    const group = await readJson<GroupMeta>(join(dir, e.name, GROUP_META))
    if (group) found.push({ rel, kind: 'group', name: group.name, color: null, defaultTemplate: null, folder: e.name })
  }
  const known = new Set(found.map((f) => f.rel))
  for (const c of index.allContainers()) if (c.parentRel === containerRel && !known.has(c.rel)) index.removeUnder(c.rel)
  found
    .sort((a, b) => (order.get(a.folder) ?? 1e9) - (order.get(b.folder) ?? 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    .forEach((f, i) => index.indexContainer(f.rel, f.kind, f.name, { parentRel: containerRel, sort: i, color: f.color, defaultTemplate: f.defaultTemplate }))
}
