/**
 * Page templates: a notebook library in <notebook>/templates and a global
 * library in the app's data folder, both in the same format.
 * See PROGRAM_DESCRIPTION.md section 12.
 */
import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'
import { FORMAT_VERSION, type PageDoc, type EditorJSON, type SectionMeta, type CanvasObject, type PaperSettings } from '../../shared/types'
import { readJson, writeJson } from './notebook'
import { newId, now } from './ids'
import { sanitizeName, uniqueName } from './names'
import { loadPage, createPage, savePage, readValidPage, newPageDoc } from './page'
import { copyDir } from './copy'
import { PAGE_DOC, SECTION_META, TEMPLATES_DIR, resolveInside } from './paths'
import { withChecksum } from './checksum'
import type { HistoryPolicy } from './history'

export const TEMPLATE_SUFFIX = '.template'
export const TEMPLATE_META = 'template.json'

export type TemplateScope = 'notebook' | 'global'

export interface TemplateMeta {
  format: number
  id: string
  name: string
  description: string
  created: string
}

export interface TemplateInfo extends TemplateMeta {
  scope: TemplateScope
  /** Folder name inside the library. */
  folder: string
  /** `${scope}:${folder}`, stored as a section's default template. */
  ref: string
}

export function libraryDir(root: string, scope: TemplateScope, globalDir: string): string {
  return scope === 'notebook' ? join(root, TEMPLATES_DIR) : globalDir
}

export function parseRef(ref: string): { scope: TemplateScope; folder: string } | null {
  const i = ref.indexOf(':')
  if (i < 0) return null
  const scope = ref.slice(0, i)
  const folder = ref.slice(i + 1)
  if ((scope !== 'notebook' && scope !== 'global') || !folder || folder.includes('/') || folder.includes('..')) return null
  return { scope, folder }
}

export async function listTemplates(dir: string, scope: TemplateScope): Promise<TemplateInfo[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: TemplateInfo[] = []
  for (const folder of names) {
    if (!folder.endsWith(TEMPLATE_SUFFIX)) continue
    const meta = await readJson<TemplateMeta>(join(dir, folder, TEMPLATE_META))
    if (!meta) continue
    out.push({ ...meta, scope, folder, ref: `${scope}:${folder}` })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Save a page as a template. Refuses when the page has attachments: a template
 * may hold only text, tables, and pictures that print with the document.
 */
export async function saveAsTemplate(root: string, pageRel: string, dir: string, scope: TemplateScope, name: string, description: string): Promise<TemplateInfo> {
  const { doc } = await loadPage(root, pageRel)
  const files = doc.objects.filter((o) => o.kind === 'file').map((o) => (o as { originalName: string }).originalName)
  if (files.length || doc.manifest.attachments.length) {
    const names = [...new Set([...files, ...doc.manifest.attachments.map((a) => a.originalName)])]
    throw new Error(`A template can hold only text, tables, and pictures. Remove ${names.length === 1 ? 'the attachment' : 'these attachments'} first: ${names.join(', ')}`)
  }
  await fs.mkdir(dir, { recursive: true })
  const folder = await uniqueName(dir, sanitizeName(name), TEMPLATE_SUFFIX)
  const dest = join(dir, folder)
  const pageDir = resolveInside(root, pageRel)
  // Copy only the page document and its pictures.
  await copyDir(pageDir, dest, (n, rel) => n === '.history' || n === 'attachments' || n === 'page.html' || n === 'page.json.autosave' || rel.startsWith('.tmp-'))
  const meta: TemplateMeta = { format: FORMAT_VERSION, id: newId(), name: name.trim() || folder, description: description.trim(), created: now() }
  await writeJson(join(dest, TEMPLATE_META), meta)
  const tdoc: PageDoc = withChecksum({ ...doc, id: meta.id, title: meta.name, manifest: { images: doc.manifest.images, attachments: [] } })
  await writeJson(join(dest, PAGE_DOC), tdoc)
  return { ...meta, scope, folder, ref: `${scope}:${folder}` }
}

export async function deleteTemplate(dir: string, folder: string): Promise<void> {
  if (!folder.endsWith(TEMPLATE_SUFFIX) || folder.includes('/') || folder.includes('..')) throw new Error('Not a template')
  await fs.rm(join(dir, folder), { recursive: true, force: true })
}

const PLACEHOLDERS: Record<string, (ctx: PlaceholderContext) => string> = {
  date: (c) => c.date.toLocaleDateString(),
  time: (c) => c.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  datetime: (c) => c.date.toLocaleString(),
  section: (c) => c.section,
  notebook: (c) => c.notebook,
  title: (c) => c.title
}

export interface PlaceholderContext {
  date: Date
  section: string
  notebook: string
  title: string
}

export function fillPlaceholders(text: string, ctx: PlaceholderContext): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => (PLACEHOLDERS[key.toLowerCase()] ? PLACEHOLDERS[key.toLowerCase()]!(ctx) : m))
}

function fillNode(node: EditorJSON, ctx: PlaceholderContext): EditorJSON {
  const out: EditorJSON = { ...node }
  if (node.type === 'text' && typeof node['text'] === 'string') out['text'] = fillPlaceholders(node['text'] as string, ctx)
  const children = node['content'] as EditorJSON[] | undefined
  if (Array.isArray(children)) out['content'] = children.map((c) => fillNode(c, ctx))
  return out
}

export function fillObjects(objects: CanvasObject[], ctx: PlaceholderContext): CanvasObject[] {
  return objects.map((o) => (o.kind === 'text' ? { ...o, id: newId(), content: fillNode(o.content, ctx) } : { ...o, id: newId() }))
}

/** Create a page in `sectionRel` from a template folder. Pictures are copied so the page owns them. */
export async function createPageFromTemplate(
  root: string,
  sectionRel: string,
  templateDir: string,
  title: string,
  ctx: Omit<PlaceholderContext, 'date' | 'title'>,
  policy?: HistoryPolicy,
  paper?: PaperSettings
): Promise<{ relPath: string; doc: PageDoc }> {
  const tdoc = await readValidPage(join(templateDir, PAGE_DOC))
  if (!tdoc) throw new Error('The template could not be read.')
  const created = await createPage(root, sectionRel, title, paper ?? tdoc.paper)
  const dest = resolveInside(root, created.relPath)
  try {
    await fs.rm(join(dest, 'images'), { recursive: true, force: true })
    await copyDir(join(templateDir, 'images'), join(dest, 'images'))
  } catch {
    await fs.mkdir(join(dest, 'images'), { recursive: true })
  }
  const full: PlaceholderContext = { ...ctx, date: new Date(), title }
  const saved = await savePage(
    root,
    created.relPath,
    { ...created.doc, title, paper: paper ?? tdoc.paper, ...(tdoc.print ? { print: tdoc.print } : {}), objects: fillObjects(tdoc.objects, full), manifest: { images: tdoc.manifest.images, attachments: [] } },
    policy
  )
  return { relPath: saved.relPath, doc: saved.doc }
}

export async function setSectionDefaultTemplate(root: string, sectionRel: string, ref: string | null): Promise<void> {
  const path = join(resolveInside(root, sectionRel), SECTION_META)
  const meta = await readJson<SectionMeta>(path)
  if (!meta) throw new Error('Not a section')
  const { defaultTemplate: _old, ...rest } = meta
  await writeJson(path, ref ? { ...rest, defaultTemplate: ref } : rest)
}

export async function sectionDefaultTemplate(root: string, sectionRel: string): Promise<string | undefined> {
  const meta = await readJson<SectionMeta>(join(resolveInside(root, sectionRel), SECTION_META))
  return meta?.defaultTemplate
}

export { basename }

/** A new, empty template in a library. */
export async function createBlankTemplate(dir: string, scope: TemplateScope, name: string): Promise<TemplateInfo> {
  await fs.mkdir(dir, { recursive: true })
  const folder = await uniqueName(dir, sanitizeName(name), TEMPLATE_SUFFIX)
  const dest = join(dir, folder)
  await fs.mkdir(dest)
  await fs.mkdir(join(dest, 'images'))
  await fs.mkdir(join(dest, '.history'))
  const meta: TemplateMeta = { format: FORMAT_VERSION, id: newId(), name: name.trim() || folder, description: '', created: now() }
  await writeJson(join(dest, TEMPLATE_META), meta)
  const doc = newPageDoc(meta.name)
  await writeJson(join(dest, PAGE_DOC), { ...doc, id: meta.id })
  return { ...meta, scope, folder, ref: `${scope}:${folder}` }
}

/** Move a template folder into another library (notebook <-> global). Returns the folder name in the target. */
export async function moveTemplate(srcDir: string, targetLibrary: string): Promise<string> {
  await fs.mkdir(targetLibrary, { recursive: true })
  const folder = await uniqueName(targetLibrary, basename(srcDir).replace(new RegExp(`${TEMPLATE_SUFFIX}$`), ''), TEMPLATE_SUFFIX)
  const dest = join(targetLibrary, folder)
  try {
    await fs.rename(srcDir, dest)
  } catch {
    // Different volume: copy, then remove the source.
    await copyDir(srcDir, dest)
    await fs.rm(srcDir, { recursive: true, force: true })
  }
  return folder
}
