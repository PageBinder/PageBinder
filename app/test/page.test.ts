import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, loadPage, savePage, saveDraft, listHistory, deletePage, renamePage } from '../src/main/storage/page'
import { renderPageHtml } from '../src/shared/render/renderPage'
import { tempDir, removeDir } from './helpers'
import type { PageDoc, TextContainer } from '../src/shared/types'

let dir: string
let root: string
let section: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
  section = await createSection(root, '', 'Notes')
})
afterEach(async () => { await removeDir(dir) })

function edit(doc: PageDoc, text: string): PageDoc {
  const obj = doc.objects[0] as TextContainer
  return {
    ...doc,
    objects: [{ ...obj, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }]
  }
}

describe('page lifecycle', () => {
  it('creates a page folder with the expected layout', async () => {
    const { relPath } = await createPage(root, section, 'Lidar pass')
    expect(relPath).toBe('Notes/Lidar pass.page')
    const names = await fs.readdir(join(root, relPath))
    expect(names.sort()).toEqual(['.history', 'attachments', 'images', 'page.html', 'page.json'])
  })

  it('every save snapshots the previous version first', async () => {
    const { relPath, doc } = await createPage(root, section, 'P')
    const r1 = await savePage(root, relPath, edit(doc, 'one'))
    const r2 = await savePage(root, r1.relPath, edit(r1.doc, 'two'))
    const history = await listHistory(root, r2.relPath)
    expect(history).toHaveLength(2)
    expect(r1.snapshot).toBeDefined()
    expect(r2.snapshot).toBeDefined()
    const loaded = await loadPage(root, r2.relPath)
    expect(JSON.stringify(loaded.doc.objects)).toContain('two')
    expect(loaded.notices).toEqual([])
  })

  it('renames the folder when the title changes', async () => {
    const { relPath, doc } = await createPage(root, section, 'Untitled page')
    const r = await savePage(root, relPath, { ...doc, title: 'Drainage notes' })
    expect(r.relPath).toBe('Notes/Drainage notes.page')
    const tree = await openNotebook(root)
    const s = tree.children[0]!
    if (s.kind !== 'section') throw new Error()
    expect(s.pages.map((p) => p.title)).toEqual(['Drainage notes'])
  })

  it('recovers a corrupted page from the newest valid snapshot', async () => {
    const { relPath, doc } = await createPage(root, section, 'P')
    const r1 = await savePage(root, relPath, edit(doc, 'first'))
    const r2 = await savePage(root, r1.relPath, edit(r1.doc, 'second'))
    const docPath = join(root, r2.relPath, 'page.json')
    // Simulate a torn write: truncate the file halfway.
    const text = await fs.readFile(docPath, 'utf8')
    await fs.writeFile(docPath, text.slice(0, Math.floor(text.length / 2)))

    const loaded = await loadPage(root, r2.relPath)
    expect(loaded.notices.map((n) => n.kind)).toEqual(['recovered-from-history'])
    // The newest snapshot holds the state before the last save, so "first".
    expect(JSON.stringify(loaded.doc.objects)).toContain('first')
    const names = await fs.readdir(join(root, r2.relPath))
    expect(names.some((n) => n.startsWith('page.json.corrupt-'))).toBe(true)
    // The recovered file is now valid and loads cleanly.
    const again = await loadPage(root, r2.relPath)
    expect(again.notices).toEqual([])
  })

  it('detects a checksum mismatch even when the JSON parses', async () => {
    const { relPath, doc } = await createPage(root, section, 'P')
    const r1 = await savePage(root, relPath, edit(doc, 'good'))
    const docPath = join(root, r1.relPath, 'page.json')
    const tampered = JSON.parse(await fs.readFile(docPath, 'utf8')) as PageDoc
    tampered.title = 'bit flip'
    await fs.writeFile(docPath, JSON.stringify(tampered))
    const loaded = await loadPage(root, r1.relPath)
    expect(loaded.notices[0]?.kind).toBe('recovered-from-history')
    expect(loaded.doc.title).toBe('P')
  })

  it('resets the page when no valid version exists and keeps the damaged file', async () => {
    const { relPath } = await createPage(root, section, 'Fresh')
    await fs.writeFile(join(root, relPath, 'page.json'), '{ not json')
    const loaded = await loadPage(root, relPath)
    expect(loaded.notices[0]?.kind).toBe('no-valid-version')
    expect(loaded.doc.title).toBe('Fresh')
    const names = await fs.readdir(join(root, relPath))
    expect(names.some((n) => n.startsWith('page.json.corrupt-'))).toBe(true)
  })

  it('offers an autosave draft that is newer than the saved page', async () => {
    const { relPath, doc } = await createPage(root, section, 'P')
    const r1 = await savePage(root, relPath, edit(doc, 'saved'))
    await new Promise((r) => setTimeout(r, 5))
    await saveDraft(root, r1.relPath, edit(r1.doc, 'unsaved work'))
    const loaded = await loadPage(root, r1.relPath)
    expect(loaded.notices.map((n) => n.kind)).toEqual(['draft-available'])
    expect(JSON.stringify(loaded.draft?.objects)).toContain('unsaved work')
    expect(JSON.stringify(loaded.doc.objects)).toContain('saved')
    // A clean save removes the draft.
    await savePage(root, r1.relPath, loaded.draft!)
    const after = await loadPage(root, r1.relPath)
    expect(after.notices).toEqual([])
    expect(after.draft).toBeUndefined()
  })

  it('moves deleted pages to the recycle folder', async () => {
    const { relPath } = await createPage(root, section, 'Gone')
    await deletePage(root, relPath)
    const tree = await openNotebook(root)
    const s = tree.children[0]!
    if (s.kind !== 'section') throw new Error()
    expect(s.pages).toEqual([])
    const recycled = await fs.readdir(join(root, '.recycle'))
    expect(recycled).toHaveLength(1)
    expect(recycled[0]).toMatch(/Gone\.page$/)
  })

  it('refuses paths that escape the notebook', async () => {
    await expect(loadPage(root, '../outside.page')).rejects.toThrow(/escapes/)
  })
})

describe('title block on new pages', () => {
  const firstRun = (doc: PageDoc): { text?: string; marks?: { type: string; attrs?: { fontSize?: string } }[] } | undefined =>
    ((doc.objects[0] as TextContainer).content as unknown as { content: { content?: { text?: string; marks?: { type: string; attrs?: { fontSize?: string } }[] }[] }[] }).content[0]!.content?.[0]

  it('starts a page with only a title block: its name in bold at 20 px and the date below', async () => {
    const { doc } = await createPage(root, section, 'Untitled page', undefined, { dateText: 'Tuesday, 29 September 2026 at 18:40' })
    expect(doc.objects).toHaveLength(1)
    const block = doc.objects[0] as TextContainer
    expect(block.x).toBe(96)
    expect(block.y).toBe(96)
    expect(firstRun(doc)?.text).toBe('Untitled page')
    expect(firstRun(doc)?.marks?.map((m) => m.type).sort()).toEqual(['bold', 'textStyle'])
    expect(JSON.stringify(block.content)).toContain('Tuesday, 29 September 2026 at 18:40')
    const html = renderPageHtml(doc)
    expect(html).toMatch(/<strong><span style="font-size: 20px;?">Untitled page<\/span><\/strong>|<span style="font-size: 20px;?"><strong>Untitled page<\/strong><\/span>/)
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it('pages made without a date, as before, have only the empty text box', async () => {
    const { doc } = await createPage(root, section, 'Plain')
    expect(doc.objects).toHaveLength(1)
  })

  it('takes the first name given to the page, and ignores later renames', async () => {
    const { relPath } = await createPage(root, section, 'Untitled page', undefined, { dateText: 'today' })
    const named = await renamePage(root, relPath, 'Hay contract', { firstName: true })
    expect(firstRun(named.doc)?.text).toBe('Hay contract')
    const renamed = await renamePage(root, named.relPath, 'Hay contract 2027')
    expect(renamed.doc.title).toBe('Hay contract 2027')
    expect(firstRun(renamed.doc)?.text).toBe('Hay contract')
  })

  it('leaves an edited title block alone on the first naming', async () => {
    const { relPath, doc } = await createPage(root, section, 'Untitled page', undefined, { dateText: 'today' })
    const block = doc.objects[0] as TextContainer
    const edited = { ...doc, objects: [{ ...block, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My own heading', marks: [{ type: 'bold' }] }] }] } }] }
    await savePage(root, relPath, edited as PageDoc)
    const named = await renamePage(root, relPath, 'Hay contract', { firstName: true })
    expect(firstRun(named.doc)?.text).toBe('My own heading')
  })
})
