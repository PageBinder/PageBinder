/**
 * Move and copy pages, sections, and section groups within a notebook.
 * Move is a folder rename. Copy duplicates the whole folder with fresh IDs
 * and empty history. See PROGRAM_DESCRIPTION.md section 13.
 */
import { promises as fs } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { renameDurable } from './atomic'
import { FORMAT_VERSION, type PageDoc, type SectionMeta, type GroupMeta, type NotebookMeta } from '../../shared/types'
import { readJson, writeJson } from './notebook'
import { newId, now } from './ids'
import { uniqueName } from './names'
import { copyDir } from './copy'
import { withChecksum } from './checksum'
import { writeRendered } from './page'
import { GROUP_META, NOTEBOOK_META, PAGE_DOC, PAGE_SUFFIX, SECTION_META, RECYCLE_DIR, resolveInside, toRel } from './paths'
import { timestampForFileName } from './ids'

async function containerMetaPath(root: string, containerRel: string): Promise<string> {
  return containerRel ? join(resolveInside(root, containerRel), GROUP_META) : join(root, NOTEBOOK_META)
}

async function editOrder(root: string, containerRel: string, fn: (order: string[]) => string[]): Promise<void> {
  const path = await containerMetaPath(root, containerRel)
  const meta = await readJson<NotebookMeta | GroupMeta>(path)
  if (!meta) return
  await writeJson(path, { ...meta, order: fn(Array.isArray(meta.order) ? meta.order : []) })
}

async function editPageOrder(root: string, sectionRel: string, fn: (order: string[]) => string[]): Promise<void> {
  const path = join(resolveInside(root, sectionRel), SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta) return
  await writeJson(path, { ...meta, pageOrder: fn(Array.isArray(meta.pageOrder) ? meta.pageOrder : []) })
}

async function isSection(root: string, rel: string): Promise<boolean> {
  return !!(await readJson<SectionMeta>(join(resolveInside(root, rel), SECTION_META)))
}

/* ---------- pages ---------- */

export async function movePage(root: string, pageRel: string, targetSectionRel: string): Promise<string> {
  if (!(await isSection(root, targetSectionRel))) throw new Error('The target is not a section.')
  const src = resolveInside(root, pageRel)
  const fromSection = toRel(root, dirname(src))
  if (fromSection === targetSectionRel) return pageRel
  const targetAbs = resolveInside(root, targetSectionRel)
  const folder = await uniqueName(targetAbs, basename(src).slice(0, -PAGE_SUFFIX.length), PAGE_SUFFIX)
  await renameDurable(src, join(targetAbs, folder))
  await editPageOrder(root, fromSection, (o) => o.filter((n) => n !== basename(src)))
  await editPageOrder(root, targetSectionRel, (o) => [...o, folder])
  return `${targetSectionRel}/${folder}`
}

/** Duplicate a page folder, attachments included, with a new ID and no history. */
export async function copyPage(root: string, pageRel: string, targetSectionRel: string): Promise<string> {
  if (!(await isSection(root, targetSectionRel))) throw new Error('The target is not a section.')
  const src = resolveInside(root, pageRel)
  const targetAbs = resolveInside(root, targetSectionRel)
  const folder = await uniqueName(targetAbs, basename(src).slice(0, -PAGE_SUFFIX.length), PAGE_SUFFIX)
  const dest = join(targetAbs, folder)
  await copyDir(src, dest, (n) => n === '.history' || n === 'page.json.autosave' || n.startsWith('.tmp-') || n.startsWith('page.json.corrupt-'))
  await fs.mkdir(join(dest, '.history'), { recursive: true })
  const doc = await readJson<PageDoc>(join(dest, PAGE_DOC))
  if (doc) {
    const fresh = withChecksum({ ...doc, id: newId(), created: now(), modified: now() })
    await writeJson(join(dest, PAGE_DOC), fresh)
    await writeRendered(dest, fresh)
  }
  await editPageOrder(root, targetSectionRel, (o) => [...o, folder])
  return `${targetSectionRel}/${folder}`
}

/* ---------- sections and groups ---------- */

function inside(child: string, parent: string): boolean {
  return parent === '' ? true : child === parent || child.startsWith(`${parent}/`)
}

export async function moveContainer(root: string, rel: string, targetContainerRel: string): Promise<string> {
  if (inside(targetContainerRel, rel)) throw new Error('A group cannot be moved into itself.')
  if (targetContainerRel && !(await readJson<GroupMeta>(join(resolveInside(root, targetContainerRel), GROUP_META)))) throw new Error('The target is not a section group.')
  const src = resolveInside(root, rel)
  const fromContainer = toRel(root, dirname(src)) === '.' ? '' : toRel(root, dirname(src))
  if (fromContainer === targetContainerRel) return rel
  const targetAbs = targetContainerRel ? resolveInside(root, targetContainerRel) : root
  const folder = await uniqueName(targetAbs, basename(src))
  await renameDurable(src, join(targetAbs, folder))
  await editOrder(root, fromContainer, (o) => o.filter((n) => n !== basename(src)))
  await editOrder(root, targetContainerRel, (o) => [...o, folder])
  return targetContainerRel ? `${targetContainerRel}/${folder}` : folder
}

async function freshenIds(dir: string): Promise<void> {
  const section = await readJson<SectionMeta>(join(dir, SECTION_META))
  if (section) await writeJson(join(dir, SECTION_META), { ...section, id: newId(), created: now() })
  const group = await readJson<GroupMeta>(join(dir, GROUP_META))
  if (group) await writeJson(join(dir, GROUP_META), { ...group, id: newId(), created: now() })
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const child = join(dir, entry.name)
    if (entry.name.endsWith(PAGE_SUFFIX)) {
      await fs.rm(join(child, '.history'), { recursive: true, force: true })
      await fs.mkdir(join(child, '.history'))
      const doc = await readJson<PageDoc>(join(child, PAGE_DOC))
      if (doc) {
        const fresh = withChecksum({ ...doc, id: newId(), created: now(), modified: now() })
        await writeJson(join(child, PAGE_DOC), fresh)
        await writeRendered(child, fresh)
      }
    } else await freshenIds(child)
  }
}

export async function copyContainer(root: string, rel: string, targetContainerRel: string): Promise<string> {
  if (inside(targetContainerRel, rel) && targetContainerRel !== (toRel(root, dirname(resolveInside(root, rel))) === '.' ? '' : toRel(root, dirname(resolveInside(root, rel))))) {
    if (targetContainerRel !== '' && inside(targetContainerRel, rel)) throw new Error('A group cannot be copied into itself.')
  }
  if (targetContainerRel && !(await readJson<GroupMeta>(join(resolveInside(root, targetContainerRel), GROUP_META)))) throw new Error('The target is not a section group.')
  const src = resolveInside(root, rel)
  const targetAbs = targetContainerRel ? resolveInside(root, targetContainerRel) : root
  const folder = await uniqueName(targetAbs, basename(src))
  const dest = join(targetAbs, folder)
  await copyDir(src, dest, (n) => n === '.index' || n === '.recycle' || n.startsWith('.tmp-') || n === 'page.json.autosave')
  await freshenIds(dest)
  await editOrder(root, targetContainerRel, (o) => [...o, folder])
  return targetContainerRel ? `${targetContainerRel}/${folder}` : folder
}

/** Move a section or group, with everything in it, to the recycle folder. */
export async function recycleContainer(root: string, rel: string): Promise<string> {
  const src = resolveInside(root, rel)
  const kind = (await isSection(root, rel)) ? 'section' : 'group'
  const meta = kind === 'section' ? await readJson<SectionMeta>(join(src, SECTION_META)) : await readJson<GroupMeta>(join(src, GROUP_META))
  const recycle = join(root, RECYCLE_DIR)
  await fs.mkdir(recycle, { recursive: true })
  const name = `${timestampForFileName()} ${basename(src)}`
  await renameDurable(src, join(recycle, name))
  const fromContainer = toRel(root, dirname(src)) === '.' ? '' : toRel(root, dirname(src))
  await editOrder(root, fromContainer, (o) => o.filter((n) => n !== basename(src)))
  await writeJson(join(recycle, name, 'recycle.json'), { kind, originalContainer: fromContainer, originalFolder: basename(src), title: meta?.name ?? basename(src), deleted: now(), format: FORMAT_VERSION })
  return name
}
