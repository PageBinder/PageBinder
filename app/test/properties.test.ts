import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { userInfo } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import { notebookProperties, LARGE_ATTACHMENT_BYTES } from '../src/main/properties'
import { tempDir, removeDir } from './helpers'

let dir: string
beforeEach(async () => { dir = await tempDir() })
afterEach(async () => { await removeDir(dir) })

describe('notebook properties', () => {
  it('reports size, files, history, large attachments, and the last edit with its author', async () => {
    const root = await createNotebook(dir, 'Props')
    const sec = await createSection(root, '', 'Notes')
    const a = await createPage(root, sec, 'First')
    const b = await createPage(root, sec, 'Second')
    await savePage(root, a.relPath, { ...a.doc, title: 'First' }) // makes one history snapshot
    await new Promise((r) => setTimeout(r, 20))
    const saved = await savePage(root, b.relPath, { ...b.doc, title: 'Second edited' })
    expect(saved.doc.modifiedBy).toBe(userInfo().username)
    // One attachment just over the limit (a sparse file, so it is quick) and one small one.
    const big = join(root, saved.relPath, 'attachments', 'survey.mov')
    const h = await fs.open(big, 'w')
    await h.truncate(LARGE_ATTACHMENT_BYTES + 1)
    await h.close()
    await fs.writeFile(join(root, saved.relPath, 'attachments', 'note.txt'), 'small')

    const p = await notebookProperties(root)
    expect(p.fileCount).toBeGreaterThan(5)
    expect(p.totalBytes).toBeGreaterThan(LARGE_ATTACHMENT_BYTES)
    expect(p.historyFiles).toBeGreaterThanOrEqual(1)
    expect(p.historyBytes).toBeGreaterThan(0)
    expect(p.largeAttachments).toEqual([{ rel: `${saved.relPath}/attachments/survey.mov`, bytes: LARGE_ATTACHMENT_BYTES + 1 }])
    expect(p.lastEdit?.title).toBe('Second edited')
    expect(p.lastEdit?.by).toBe(userInfo().username)
  })

  it('shows no author for a page saved by an earlier version', async () => {
    const root = await createNotebook(dir, 'Older')
    const sec = await createSection(root, '', 'Notes')
    const { relPath } = await createPage(root, sec, 'Old page')
    const file = join(root, relPath, 'page.json')
    const doc = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>
    delete doc['modifiedBy']
    await fs.writeFile(file, JSON.stringify(doc))
    const p = await notebookProperties(root)
    expect(p.lastEdit?.by).toBeNull()
  })
})
