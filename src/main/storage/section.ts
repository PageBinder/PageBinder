/**
 * Sections and section groups: create, rename, recolor, reorder.
 */
import { promises as fs } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import {
  FORMAT_VERSION,
  SECTION_COLORS,
  type GroupMeta,
  type NotebookMeta,
  type SectionMeta
} from '../../shared/types'
import { newId, now } from './ids'
import { sanitizeName, uniqueName } from './names'
import { readJson, writeJson } from './notebook'
import { GROUP_META, NOTEBOOK_META, SECTION_META, resolveInside, toRel } from './paths'

async function containerMetaPath(root: string, containerRel: string): Promise<string> {
  if (containerRel === '' || containerRel === '.') return join(root, NOTEBOOK_META)
  return join(resolveInside(root, containerRel), GROUP_META)
}

async function appendToOrder(root: string, containerRel: string, folderName: string): Promise<void> {
  const metaPath = await containerMetaPath(root, containerRel)
  const meta = await readJson<NotebookMeta | GroupMeta>(metaPath)
  if (!meta) return
  const order = Array.isArray(meta.order) ? meta.order : []
  if (!order.includes(folderName)) order.push(folderName)
  await writeJson(metaPath, { ...meta, order, ...(metaPath.endsWith(NOTEBOOK_META) ? { modified: now() } : {}) })
}

async function replaceInOrder(root: string, containerRel: string, from: string, to: string): Promise<void> {
  const metaPath = await containerMetaPath(root, containerRel)
  const meta = await readJson<NotebookMeta | GroupMeta>(metaPath)
  if (!meta || !Array.isArray(meta.order)) return
  await writeJson(metaPath, { ...meta, order: meta.order.map((n) => (n === from ? to : n)) })
}

export async function createSection(root: string, containerRel: string, name: string, color?: string): Promise<string> {
  const containerAbs = containerRel ? resolveInside(root, containerRel) : root
  const folder = await uniqueName(containerAbs, sanitizeName(name))
  const dir = join(containerAbs, folder)
  await fs.mkdir(dir)
  const meta: SectionMeta = {
    format: FORMAT_VERSION,
    id: newId(),
    name: name.trim() || folder,
    color: color ?? SECTION_COLORS[0]!,
    created: now(),
    pageOrder: []
  }
  await writeJson(join(dir, SECTION_META), meta)
  await appendToOrder(root, containerRel, folder)
  return toRel(root, dir)
}

export async function createGroup(root: string, containerRel: string, name: string): Promise<string> {
  const containerAbs = containerRel ? resolveInside(root, containerRel) : root
  const folder = await uniqueName(containerAbs, sanitizeName(name))
  const dir = join(containerAbs, folder)
  await fs.mkdir(dir)
  const meta: GroupMeta = { format: FORMAT_VERSION, id: newId(), name: name.trim() || folder, created: now(), order: [] }
  await writeJson(join(dir, GROUP_META), meta)
  await appendToOrder(root, containerRel, folder)
  return toRel(root, dir)
}

/** Rename a section or group. Renames the folder too and returns the new relative path. */
export async function renameContainer(root: string, rel: string, newName: string): Promise<string> {
  const abs = resolveInside(root, rel)
  const sectionPath = join(abs, SECTION_META)
  const groupPath = join(abs, GROUP_META)
  const section = await readJson<SectionMeta>(sectionPath)
  const group = section ? undefined : await readJson<GroupMeta>(groupPath)
  if (!section && !group) throw new Error(`Not a section or group: ${rel}`)
  const trimmed = newName.trim()
  if (!trimmed) return rel
  if (section) await writeJson(sectionPath, { ...section, name: trimmed })
  if (group) await writeJson(groupPath, { ...group, name: trimmed })

  const parent = dirname(abs)
  const wanted = sanitizeName(trimmed)
  if (wanted.toLowerCase() === basename(abs).toLowerCase()) return rel
  const folder = await uniqueName(parent, wanted)
  const dest = join(parent, folder)
  await fs.rename(abs, dest)
  await replaceInOrder(root, toRel(root, parent), basename(abs), folder)
  return toRel(root, dest)
}

export async function setSectionColor(root: string, rel: string, color: string): Promise<void> {
  const path = join(resolveInside(root, rel), SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta) throw new Error(`Not a section: ${rel}`)
  await writeJson(path, { ...meta, color })
}

export async function setChildOrder(root: string, containerRel: string, order: string[]): Promise<void> {
  const metaPath = await containerMetaPath(root, containerRel)
  const meta = await readJson<NotebookMeta | GroupMeta>(metaPath)
  if (!meta) return
  await writeJson(metaPath, { ...meta, order })
}

export async function setPageOrder(root: string, sectionRel: string, pageOrder: string[]): Promise<void> {
  const path = join(resolveInside(root, sectionRel), SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta) return
  await writeJson(path, { ...meta, pageOrder })
}
