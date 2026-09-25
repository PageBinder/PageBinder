import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage, savePage, loadPage } from '../src/main/storage/page'
import { copyFileIntoPage, ATTACHMENTS_DIR } from '../src/main/storage/attachments'
import { saveAsTemplate, listTemplates, createPageFromTemplate, fillPlaceholders, libraryDir, setSectionDefaultTemplate } from '../src/main/storage/templates'
import { movePage, copyPage, moveContainer, copyContainer, recycleContainer } from '../src/main/storage/copymove'
import { listRecycled, restoreRecycled } from '../src/main/storage/recycle'
import { tempDir, removeDir } from './helpers'
import type { TextContainer } from '../src/shared/types'

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
  it('saves a page as a template, fills placeholders, and refuses pages with attachments', async () => {
    const s = await createSection(root, '', 'Surveys')
    const rel = await pageWithText(s, 'Survey form', 'Survey of {{section}} on {{date}} in {{notebook}}: {{title}}')
    const lib = libraryDir(root, 'notebook', join(dir, 'global'))
    const t = await saveAsTemplate(root, rel, lib, 'notebook', 'Survey page', 'Standard survey layout')
    expect(t.ref).toBe('notebook:Survey page.template')
    const listed = await listTemplates(lib, 'notebook')
    expect(listed.map((x) => x.name)).toEqual(['Survey page'])
    const made = await createPageFromTemplate(root, s, join(lib, t.folder), 'Ridge Road', { section: 'Surveys', notebook: 'nb' })
    const text = JSON.stringify(made.doc.objects)
    expect(text).toContain('Survey of Surveys on ')
    expect(text).toContain('in nb: Ridge Road')
    expect(text).not.toContain('{{')
    expect(made.doc.id).not.toBe(t.id)

    const src = join(dir, 'big.bin')
    await fs.writeFile(src, 'x')
    const entry = await copyFileIntoPage(root, rel, src, ATTACHMENTS_DIR)
    const loaded = await loadPage(root, rel)
    await savePage(root, rel, { ...loaded.doc, objects: [...loaded.doc.objects, { kind: 'file', id: 'ff', x: 0, y: 0, width: 300, name: entry.name, originalName: 'big.bin' }], manifest: { ...loaded.doc.manifest, attachments: [entry] } })
    await expect(saveAsTemplate(root, rel, lib, 'notebook', 'Bad', '')).rejects.toThrow(/big\.bin/)
  })

  it('remembers a default template per section', async () => {
    const s = await createSection(root, '', 'S')
    await setSectionDefaultTemplate(root, s, 'notebook:X.template')
    const tree = await openNotebook(root)
    const sec = tree.children[0]!
    if (sec.kind !== 'section') throw new Error()
    expect((await fs.readFile(join(root, s, 'section.json'), 'utf8'))).toContain('"defaultTemplate": "notebook:X.template"')
    await setSectionDefaultTemplate(root, s, null)
    expect((await fs.readFile(join(root, s, 'section.json'), 'utf8'))).not.toContain('defaultTemplate')
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
