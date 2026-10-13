/**
 * Page templates. Templates are the pages of the Templates notebook: an ordinary notebook kept in
 * the app's settings folder, with sections, groups, search, the recycle folder, and undo like any
 * other. A page made from a template is a copy with its placeholders filled in and no link back to
 * the template. A section may name a default template by the template page's id ("template:<id>").
 * See PROGRAM_DESCRIPTION.md section 12.
 *
 * Templates kept by earlier versions (".template" folders in the settings folder or in a notebook's
 * own "templates" folder), and section defaults naming them, are not shown or used: the user chose
 * not to carry them over (2026-10-13). Their files are left where they are.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { FORMAT_VERSION, NEW_NOTEBOOK_PAPER, type PageDoc, type EditorJSON, type SectionMeta, type CanvasObject, type PaperSettings, type NotebookMeta, type TreeChild } from '../../shared/types'
import { readJson, writeJson, openNotebook, notebookExists, NOTEBOOK_README } from './notebook'
import { newId, now } from './ids'
import { createPage, savePage, readValidPage } from './page'
import { createSection } from './section'
import { copyDir } from './copy'
import { copyPage } from './copymove'
import { NOTEBOOK_META, PAGE_DOC, SECTION_META, resolveInside } from './paths'
export { TEMPLATES_NOTEBOOK } from './paths'
import type { HistoryPolicy } from './history'

/** The section a new Templates notebook starts with. */
export const FIRST_TEMPLATES_SECTION = 'General'
const REF_PREFIX = 'template:'

export interface TemplateInfo {
  /** The template page's id. */
  id: string
  /** `template:<id>`, stored as a section's default template. */
  ref: string
  name: string
  /** Where the template is in the Templates notebook: its groups and section, as "Group › Section". */
  section: string
  /** The template page's folder, relative to the Templates notebook. */
  rel: string
}

export function templateRef(id: string): string {
  return `${REF_PREFIX}${id}`
}

/** The template page id a section default names, or null (no default, or one from an earlier version). */
export function templateIdOf(ref: string | null | undefined): string | null {
  return ref && ref.startsWith(REF_PREFIX) && ref.length > REF_PREFIX.length ? ref.slice(REF_PREFIX.length) : null
}

const making = new Map<string, Promise<unknown>>()

/**
 * Make the Templates notebook on first use: a notebook called Templates with one section. With
 * `section`, a Templates notebook left with no sections gets that first section back. Calls for one
 * folder run one at a time, so two at once (a dialog opening twice) never make two sections.
 */
export function ensureTemplatesNotebook(dir: string, opts: { section?: boolean } = {}): Promise<void> {
  const run = (making.get(dir) ?? Promise.resolve()).then(() => makeTemplatesNotebook(dir, opts.section ?? false))
  const settled = run.catch(() => undefined)
  making.set(dir, settled)
  void settled.then(() => {
    if (making.get(dir) === settled) making.delete(dir)
  })
  return run
}

async function makeTemplatesNotebook(dir: string, needSection: boolean): Promise<void> {
  const fresh = !(await notebookExists(dir))
  if (fresh) {
    await fs.mkdir(dir, { recursive: true })
    const meta: NotebookMeta = { format: FORMAT_VERSION, id: newId(), name: 'Templates', created: now(), modified: now(), order: [], settings: { paper: NEW_NOTEBOOK_PAPER } }
    await writeJson(join(dir, NOTEBOOK_META), meta)
    await fs.writeFile(join(dir, 'README.txt'), NOTEBOOK_README, 'utf8')
  }
  if ((fresh || needSection) && !(await templateSections(dir)).length) await createSection(dir, '', FIRST_TEMPLATES_SECTION)
}

/** Every template, in the order the Templates notebook shows them. */
export async function listTemplates(templatesRoot: string): Promise<TemplateInfo[]> {
  if (!(await notebookExists(templatesRoot))) return []
  const tree = await openNotebook(templatesRoot)
  const out: TemplateInfo[] = []
  const walk = (children: TreeChild[], path: string[]): void => {
    for (const c of children) {
      if (c.kind === 'group') walk(c.children, [...path, c.name])
      else for (const p of c.pages) out.push({ id: p.id, ref: templateRef(p.id), name: p.title || 'Untitled template', section: [...path, c.name].join(' › '), rel: p.relPath })
    }
  }
  walk(tree.children, [])
  return out
}

/** The Templates notebook's sections, for choosing where Save as template puts a page. */
export async function templateSections(templatesRoot: string): Promise<{ rel: string; name: string }[]> {
  const tree = await openNotebook(templatesRoot)
  const out: { rel: string; name: string }[] = []
  const walk = (children: TreeChild[], path: string[]): void => {
    for (const c of children) {
      if (c.kind === 'group') walk(c.children, [...path, c.name])
      else out.push({ rel: c.relPath, name: [...path, c.name].join(' › ') })
    }
  }
  walk(tree.children, [])
  return out
}

export async function findTemplate(templatesRoot: string, id: string): Promise<TemplateInfo | undefined> {
  return (await listTemplates(templatesRoot)).find((t) => t.id === id)
}

/**
 * Save a page as a template: a copy of it, attachments included, goes into a section of the
 * Templates notebook under the given name. Returns the new template page's path there.
 */
export async function saveAsTemplate(root: string, pageRel: string, templatesRoot: string, sectionRel: string, name: string): Promise<string> {
  return copyPage(root, pageRel, sectionRel, { root: templatesRoot, title: name.trim() || 'Untitled template' })
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

/**
 * Create a page in `sectionRel` from a template page's folder. Its pictures and attached files are
 * copied so the page owns them, and its placeholders are filled in.
 */
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
  for (const sub of ['images', 'attachments']) {
    try {
      await fs.rm(join(dest, sub), { recursive: true, force: true })
      await copyDir(join(templateDir, sub), join(dest, sub))
    } catch {
      await fs.mkdir(join(dest, sub), { recursive: true })
    }
  }
  const full: PlaceholderContext = { ...ctx, date: new Date(), title }
  const saved = await savePage(
    root,
    created.relPath,
    { ...created.doc, title, paper: paper ?? tdoc.paper, ...(tdoc.print ? { print: tdoc.print } : {}), ...(tdoc.pageBorder !== undefined ? { pageBorder: tdoc.pageBorder } : {}), ...(tdoc.pageGrid !== undefined ? { pageGrid: tdoc.pageGrid } : {}), objects: fillObjects(tdoc.objects, full), manifest: { images: tdoc.manifest.images, attachments: tdoc.manifest.attachments } },
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
