import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage, savePage, loadPage, renamePage } from '../src/main/storage/page'
import { copyFileIntoPage, ATTACHMENTS_DIR } from '../src/main/storage/attachments'
import { saveAsTemplate, listTemplates, createPageFromTemplate, fillPlaceholders, setSectionDefaultTemplate, sectionDefaultTemplate, ensureTemplatesNotebook, templateSections, findTemplate, templateRef, templateIdOf, TEMPLATES_NOTEBOOK } from '../src/main/storage/templates'
import { resolveInside } from '../src/main/storage/paths'
import { movePage, copyPage, moveContainer, copyContainer, recycleContainer } from '../src/main/storage/copymove'
import { listRecycled, restoreRecycled } from '../src/main/storage/recycle'
import { tempDir, removeDir } from './helpers'
import { NEW_NOTEBOOK_PAPER, type TextContainer, type NotebookMeta } from '../src/shared/types'

let dir: string
let root: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
})
afterEach(async () => { await removeDir(dir) })

async function pageWithText(section: string, title: string, text: string): Promise<string> {
  const { relPath, doc } = await createPage(root, section, title)
  const obj = doc.objects[0] as TextContainer
  const r = await savePage(root, relPath, { ...doc, objects: [{ ...obj, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }] })
  return r.relPath
}

describe('templates', () => {
  let tdir: string
  beforeEach(() => {
    tdir = join(dir, 'settings', TEMPLATES_NOTEBOOK)
  })

  it('the Templates notebook is made on first use with one section, and its pages are the templates', async () => {
    // Two calls at once (as when a dialog opens twice) still make one notebook with one section.
    await Promise.all([ensureTemplatesNotebook(tdir), ensureTemplatesNotebook(tdir, { section: true })])
    await ensureTemplatesNotebook(tdir)
    const meta = JSON.parse(await fs.readFile(join(tdir, 'notebook.json'), 'utf8')) as NotebookMeta
    expect(meta.name).toBe('Templates')
    expect(meta.settings.paper).toEqual(NEW_NOTEBOOK_PAPER)
    expect((await openNotebook(tdir)).children.map((c) => c.name)).toEqual(['General'])
    expect(await listTemplates(tdir)).toEqual([])
    // Groups and sections work as in any notebook; a template is listed under its section's path.
    const g = await createGroup(tdir, '', 'Farm')
    const fields = await createSection(tdir, g, 'Fields')
    const { relPath, doc } = await createPage(tdir, fields, 'Field log')
    const listed = await listTemplates(tdir)
    expect(listed).toEqual([{ id: doc.id, ref: `template:${doc.id}`, name: 'Field log', section: 'Farm › Fields', rel: relPath }])
    expect((await templateSections(tdir)).map((x) => x.name)).toEqual(['General', 'Farm › Fields'])
    // A missing Templates notebook simply has no templates.
    expect(await listTemplates(join(dir, 'nowhere'))).toEqual([])
  })

  it('a Templates notebook left with no sections gets its first section back only when one is needed', async () => {
    await ensureTemplatesNotebook(tdir)
    await recycleContainer(tdir, 'General')
    await ensureTemplatesNotebook(tdir)
    expect(await templateSections(tdir)).toEqual([])
    await ensureTemplatesNotebook(tdir, { section: true })
    expect((await templateSections(tdir)).map((x) => x.name)).toEqual(['General'])
  })

  it('a template carries its page border and grid settings to the pages made from it', async () => {
    await ensureTemplatesNotebook(tdir)
    const s = await createSection(root, '', 'Plans')
    const rel = await pageWithText(s, 'Sketch', 'Field sketch')
    const loaded = await loadPage(root, rel)
    await savePage(root, rel, { ...loaded.doc, pageBorder: false, pageGrid: true })
    const t = await saveAsTemplate(root, rel, tdir, 'General', 'Sketch page')
    const made = await createPageFromTemplate(root, s, resolveInside(tdir, t), 'New sketch', { section: 'Plans', notebook: 'nb' })
    expect(made.doc.pageBorder).toBe(false)
    expect(made.doc.pageGrid).toBe(true)
    // A template without the settings gives pages without them (border on, grid off).
    const plainRel = await pageWithText(s, 'Plain', 'Plain text')
    const t2 = await saveAsTemplate(root, plainRel, tdir, 'General', 'Plain page')
    const plain = await createPageFromTemplate(root, s, resolveInside(tdir, t2), 'From plain', { section: 'Plans', notebook: 'nb' })
    expect(plain.doc.pageBorder).toBeUndefined()
    expect(plain.doc.pageGrid).toBeUndefined()
  })

  it('saves a page as a template with its attachments, keeps its placeholders, and fills them in new pages', async () => {
    await ensureTemplatesNotebook(tdir)
    const s = await createSection(root, '', 'Surveys')
    const rel = await pageWithText(s, 'Survey form', 'Survey of {{section}} on {{date}} in {{notebook}}: {{title}}')
    const src = join(dir, 'checklist.pdf')
    await fs.writeFile(src, 'pdf bytes')
    const entry = await copyFileIntoPage(root, rel, src, ATTACHMENTS_DIR)
    const loaded = await loadPage(root, rel)
    await savePage(root, rel, { ...loaded.doc, objects: [...loaded.doc.objects, { kind: 'file', id: 'ff', x: 0, y: 0, width: 300, name: entry.name, originalName: 'checklist.pdf' }], manifest: { ...loaded.doc.manifest, attachments: [entry] } })

    const t = await saveAsTemplate(root, rel, tdir, 'General', 'Survey page')
    expect(t).toBe('General/Survey page.page')
    const tdoc = (await loadPage(tdir, t)).doc
    expect(tdoc.title).toBe('Survey page')
    expect(tdoc.id).not.toBe(loaded.doc.id)
    expect(JSON.stringify(tdoc.objects)).toContain('{{section}}')
    expect(await fs.readFile(join(tdir, t, ATTACHMENTS_DIR, entry.name), 'utf8')).toBe('pdf bytes')
    expect((await listTemplates(tdir)).map((x) => x.name)).toEqual(['Survey page'])

    const made = await createPageFromTemplate(root, s, resolveInside(tdir, t), 'Ridge Road', { section: 'Surveys', notebook: 'nb' })
    const text = JSON.stringify(made.doc.objects)
    expect(text).toContain('Survey of Surveys on ')
    expect(text).toContain('in nb: Ridge Road')
    expect(text).not.toContain('{{')
    expect(made.doc.id).not.toBe(tdoc.id)
    expect(made.doc.manifest.attachments.map((a) => a.name)).toEqual([entry.name])
    expect(await fs.readFile(join(root, made.relPath, ATTACHMENTS_DIR, entry.name), 'utf8')).toBe('pdf bytes')
  })

  it('a section default names a template by its page id, which survives renaming and moving it', async () => {
    await ensureTemplatesNotebook(tdir)
    const s = await createSection(root, '', 'S')
    const t = await saveAsTemplate(root, await pageWithText(s, 'Visit', 'Visit notes'), tdir, 'General', 'Visit form')
    const { id } = (await listTemplates(tdir))[0]!
    await setSectionDefaultTemplate(root, s, templateRef(id))
    expect(await fs.readFile(join(root, s, 'section.json'), 'utf8')).toContain(`"defaultTemplate": "template:${id}"`)
    expect(templateIdOf(await sectionDefaultTemplate(root, s))).toBe(id)
    const renamed = await renamePage(tdir, t, 'Visit form v2')
    const other = await createSection(tdir, '', 'Other')
    await movePage(tdir, renamed.relPath, other)
    expect(await findTemplate(tdir, id)).toMatchObject({ name: 'Visit form v2', section: 'Other' })
    await setSectionDefaultTemplate(root, s, null)
    expect(await fs.readFile(join(root, s, 'section.json'), 'utf8')).not.toContain('defaultTemplate')
    // Defaults set by earlier versions name their own template folders, which are no longer used.
    expect(templateIdOf('global:Visit form.template')).toBeNull()
    expect(templateIdOf('notebook:Visit form.template')).toBeNull()
    expect(templateIdOf('template:')).toBeNull()
  })

  it('placeholders are case-insensitive and unknown ones are left alone', () => {
    const out = fillPlaceholders('{{DATE}} {{unknown}} {{ section }}', { date: new Date('2026-09-24T12:00:00Z'), section: 'S', notebook: 'N', title: 'T' })
    expect(out).toContain('{{unknown}}')
    expect(out).toContain(' S')
    expect(out).not.toContain('{{DATE}}')
  })
})

describe('move and copy', () => {
  it('moves and copies pages between sections; copies get new ids and no history', async () => {
    const a = await createSection(root, '', 'A')
    const b = await createSection(root, '', 'B')
    const rel = await pageWithText(a, 'P', 'hello')
    await savePage(root, rel, (await loadPage(root, rel)).doc)
    const moved = await movePage(root, rel, b)
    expect(moved).toBe('B/P.page')
    const copied = await copyPage(root, moved, a)
    expect(copied).toBe('A/P.page')
    const orig = await loadPage(root, moved)
    const copy = await loadPage(root, copied)
    expect(copy.doc.id).not.toBe(orig.doc.id)
    expect(JSON.stringify(copy.doc.objects)).toContain('hello')
    expect(await fs.readdir(join(root, copied, '.history'))).toEqual([])
    expect((await fs.readdir(join(root, moved, '.history'))).length).toBeGreaterThan(0)
    const tree = await openNotebook(root)
    const secA = tree.children[0]!
    const secB = tree.children[1]!
    if (secA.kind !== 'section' || secB.kind !== 'section') throw new Error()
    expect(secA.pages.map((p) => p.title)).toEqual(['P'])
    expect(secB.pages.map((p) => p.title)).toEqual(['P'])
  })

  it('moves and copies sections into groups, and recycles and restores a section', async () => {
    const g = await createGroup(root, '', 'G')
    const s = await createSection(root, '', 'S')
    await pageWithText(s, 'P1', 'one')
    const moved = await moveContainer(root, s, g)
    expect(moved).toBe('G/S')
    const copied = await copyContainer(root, moved, '')
    expect(copied).toBe('S')
    let tree = await openNotebook(root)
    expect(tree.children.map((c) => `${c.kind}:${c.name}`)).toEqual(['group:G', 'section:S'])
    const copySection = tree.children[1]!
    const group = tree.children[0]!
    if (copySection.kind !== 'section' || group.kind !== 'group' || group.children[0]?.kind !== 'section') throw new Error()
    expect(copySection.id).not.toBe(group.children[0].id)
    expect(copySection.pages[0]!.id).not.toBe(group.children[0].pages[0]!.id)
    await expect(moveContainer(root, g, g)).rejects.toThrow(/into itself/)

    const name = await recycleContainer(root, copied)
    tree = await openNotebook(root)
    expect(tree.children.map((c) => c.name)).toEqual(['G'])
    const listed = await listRecycled(root)
    expect(listed.map((e) => `${e.kind}:${e.title}`)).toEqual(['section:S'])
    const back = await restoreRecycled(root, name, '')
    expect(back).toBe('S')
    tree = await openNotebook(root)
    expect(tree.children.map((c) => c.name)).toEqual(['G', 'S'])
  })
})
