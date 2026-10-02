import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import { exportHtmlPackage } from '../src/main/export'
import { tempDir, removeDir } from './helpers'

let dir: string
beforeEach(async () => { dir = await tempDir() })
afterEach(async () => { await removeDir(dir) })

describe('web page package export', () => {
  it('puts the HTML and every picture and attachment in one zip, linked inside it', async () => {
    const root = await createNotebook(dir, 'Farm')
    const sec = await createSection(root, '', 'Fields')
    const { relPath, doc } = await createPage(root, sec, 'North field')
    const pageDir = join(root, relPath)
    const picture = Buffer.from('fake picture bytes')
    const report = Buffer.from('%PDF-1.4 fake report')
    await fs.writeFile(join(pageDir, 'images', 'tractor.png'), picture)
    await fs.writeFile(join(pageDir, 'attachments', 'soil report.pdf'), report)
    await savePage(root, relPath, {
      ...doc,
      objects: [
        { kind: 'image', id: 'i1', x: 100, y: 100, width: 200, height: 100, name: 'tractor.png', originalName: 'tractor.png' },
        { kind: 'file', id: 'f1', x: 100, y: 300, width: 300, name: 'soil report.pdf', originalName: 'soil report.pdf' }
      ]
    })
    const out = join(dir, 'Fields.zip')
    expect(await exportHtmlPackage(join(root, sec), out, 'Fields')).toBe(1)

    const files = unzipSync(new Uint8Array(await fs.readFile(out)))
    const names = Object.keys(files)
    const html = strFromU8(files['Fields/Fields.html']!)
    const pic = names.find((n) => n.endsWith('/images/tractor.png'))!
    const att = names.find((n) => n.endsWith('/attachments/soil report.pdf'))!
    expect(Buffer.from(files[pic]!)).toEqual(picture)
    expect(Buffer.from(files[att]!)).toEqual(report)
    // Links are relative to the HTML file and point at the files inside the package.
    const link = (n: string): string => n.slice('Fields/'.length).split('/').map(encodeURIComponent).join('/')
    expect(html).toContain(`src="${link(pic)}"`)
    expect(html).toContain(`href="${link(att)}"`)
    expect(html).not.toContain('file://')
    expect(names.some((n) => n.endsWith('page.json') || n.includes('.history'))).toBe(false)
  })
})
