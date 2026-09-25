import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { SearchIndex, buildMatch } from '../src/main/search/index'
import { extractPageText } from '../src/main/search/text'
import { newPageDoc } from '../src/main/storage/page'
import { tempDir, removeDir } from './helpers'
import type { PageDoc, TextContainer } from '../src/shared/types'

let dir: string
beforeEach(async () => { dir = await tempDir() })
afterEach(async () => { await removeDir(dir) })

function docWith(title: string, text: string): PageDoc {
  const d = newPageDoc(title)
  const obj = d.objects[0] as TextContainer
  return { ...d, objects: [{ ...obj, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }] }
}

describe('search index', () => {
  it('extracts readable text and file names only', () => {
    const d = docWith('T', 'Flew the north field')
    d.objects.push({ kind: 'file', id: 'f', x: 0, y: 0, width: 300, name: 'quote.eml', originalName: 'Ridge quote.eml', mail: { subject: 'Ridge Road quote', from: 'Sam', date: '' } })
    const t = extractPageText(d)
    expect(t.body).toBe('Flew the north field')
    expect(t.files).toContain('Ridge Road quote')
    expect(t.body).not.toContain('paragraph')
  })

  it('builds prefix queries safely', () => {
    expect(buildMatch('body', 'lid')).toBe('body:("lid"*)')
    expect(buildMatch('title', 'north "field" OR x')).toBe('title:("north"* "field"* "OR"* "x"*)')
    expect(buildMatch('title', '   ')).toBeNull()
  })

  it('indexes pages and finds them by title, body, and file name as you type', async () => {
    const index = new SearchIndex(dir)
    await index.open()
    index.indexContainer('Site surveys', 'group', 'Site surveys')
    index.indexContainer('Site surveys/North Field', 'section', 'North Field')
    index.indexPage('Site surveys/North Field/Lidar pass.page', docWith('Lidar pass', 'Flew the north field at 60 m with 40% overlap.'), { name: 'North Field', rel: 'Site surveys/North Field' }, 1)
    const d2 = docWith('Drainage notes', 'The lidar shows a 2% fall to the east.')
    d2.manifest.attachments.push({ name: 'ridge-road-lidar.e57', originalName: 'ridge-road-lidar.e57', size: 1, sha256: '', added: '' })
    index.indexPage('Site surveys/North Field/Drainage notes.page', d2, { name: 'North Field', rel: 'Site surveys/North Field' }, 1)
    index.indexPage('Home/Welcome.page', docWith('Welcome', 'Nothing about surveys here'), { name: 'Home', rel: 'Home' }, 1)

    const r = index.search('lid')
    expect(r.titles.map((h) => h.title)).toEqual(['Lidar pass'])
    expect(r.pages.map((h) => h.title)).toEqual(['Drainage notes'])
    expect(r.pages.find((h) => h.title === 'Drainage notes')?.snippet).toContain('<b>lidar</b>')
    expect(r.files.map((h) => h.title)).toEqual(['Drainage notes'])

    const scoped = index.search('surv', 'Site surveys')
    expect(scoped.titles.map((h) => h.title)).toEqual(['Site surveys'])
    expect(scoped.pages).toEqual([])

    const nf = index.search('north', 'Site surveys/North Field')
    expect(nf.titles.map((h) => h.title)).toEqual(['North Field'])
    expect(nf.pages.map((h) => h.title)).toEqual(['Lidar pass'])
    index.close()
  })

  it('rebuilds a damaged index file instead of failing', async () => {
    const index = new SearchIndex(dir)
    await index.open()
    index.indexPage('a.page', docWith('A', 'x'), { name: 'S', rel: 'S' }, 1)
    index.close()
    await fs.writeFile(join(dir, '.index', 'search.sqlite'), 'garbage')
    const again = new SearchIndex(dir)
    const { rebuilt } = await again.open()
    expect(rebuilt).toBe(true)
    expect(again.pageCount()).toBe(0)
    again.close()
  })
})
