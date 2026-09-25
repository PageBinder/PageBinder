import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, loadPage, savePage } from '../src/main/storage/page'
import { copyFileIntoPage, readEmlMeta, findMissingFiles, ATTACHMENTS_DIR } from '../src/main/storage/attachments'
import { tempDir, removeDir } from './helpers'

let dir: string
let root: string
let rel: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
  const section = await createSection(root, '', 'S')
  rel = (await createPage(root, section, 'P')).relPath
})
afterEach(async () => { await removeDir(dir) })

describe('attachments', () => {
  it('copies a file into the page folder under a safe unique name and records size and hash', async () => {
    // Windows cannot hold a file with this name, so the source is saved plainly and the name comes
    // in as the original name, as it does from a mail drag.
    const original = 'RE: Ridge Road survey?.txt'
    const src = join(dir, 'source.txt')
    await fs.writeFile(src, 'hello attachment')
    const a = await copyFileIntoPage(root, rel, src, ATTACHMENTS_DIR, original)
    const b = await copyFileIntoPage(root, rel, src, ATTACHMENTS_DIR, original)
    expect(a.name).toBe('RE Ridge Road survey.txt')
    expect(b.name).toBe('RE Ridge Road survey (2).txt')
    expect(a.originalName).toBe('RE: Ridge Road survey?.txt')
    expect(a.size).toBe(16)
    expect(a.sha256).toHaveLength(64)
    const names = await fs.readdir(join(root, rel, ATTACHMENTS_DIR))
    expect(names.sort()).toEqual(['RE Ridge Road survey (2).txt', 'RE Ridge Road survey.txt'])
    expect(names.some((n) => n.startsWith('.tmp-'))).toBe(false)
  })

  it('reads subject, sender, and date from an .eml file', async () => {
    const src = join(dir, 'mail.eml')
    await fs.writeFile(src, 'From: Sam Rivers <sam@example.com>\r\nTo: me@example.com\r\nSubject: =?UTF-8?B?UmlkZ2UgUm9hZCBxdW90ZQ==?=\r\nDate: Mon, 14 Sep 2026 09:42:11 +0000\r\n\r\nBody text\r\n')
    const meta = await readEmlMeta(src)
    expect(meta).toEqual({ subject: 'Ridge Road quote', from: 'Sam Rivers <sam@example.com>', date: '2026-09-14T09:42:11.000Z' })
  })

  it('reports missing or truncated files on load', async () => {
    const src = join(dir, 'scan.bin')
    await fs.writeFile(src, Buffer.alloc(5000, 1))
    const entry = await copyFileIntoPage(root, rel, src, ATTACHMENTS_DIR)
    const loaded = await loadPage(root, rel)
    await savePage(root, rel, { ...loaded.doc, manifest: { images: [], attachments: [entry] } })
    expect((await loadPage(root, rel)).missing).toEqual([])
    await fs.truncate(join(root, rel, ATTACHMENTS_DIR, entry.name), 100)
    const after = await loadPage(root, rel)
    expect(after.missing).toEqual([entry.name])
    expect(after.notices.map((n) => n.kind)).toEqual(['missing-files'])
    expect(await findMissingFiles(root, rel, [{ sub: ATTACHMENTS_DIR, files: [entry] }])).toEqual([entry.name])
  })
})
