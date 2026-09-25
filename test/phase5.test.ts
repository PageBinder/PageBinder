import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import { selectSnapshotsToDelete, pruneHistory } from '../src/main/storage/history'
import { recyclePage, listRecycled, restoreRecycled, purgeOld } from '../src/main/storage/recycle'
import { verifyNotebook, repairFinding } from '../src/main/storage/verify'
import { copyFileIntoPage, ATTACHMENTS_DIR } from '../src/main/storage/attachments'
import { tempDir, removeDir } from './helpers'

let dir: string
let root: string
let section: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
  section = await createSection(root, '', 'S')
})
afterEach(async () => { await removeDir(dir) })

function snap(iso: string): string {
  return `${iso.replace(/:/g, '-')}.json`
}

describe('history pruning', () => {
  it('keeps everything recent, one per day for a month, one per week beyond', () => {
    const now = new Date('2026-09-24T12:00:00.000Z')
    const names = [
      snap('2026-09-24T11:00:00.000Z'), snap('2026-09-24T10:00:00.000Z'), // last day: keep both
      snap('2026-09-20T09:00:00.000Z'), snap('2026-09-20T08:00:00.000Z'), // same day: keep newest
      snap('2026-08-04T09:00:00.000Z'), snap('2026-08-06T09:00:00.000Z'), // older than a month, same ISO week: keep newest
      snap('2026-06-01T09:00:00.000Z'), // its own week: keep
      'not-a-snapshot.json'
    ]
    const doomed = selectSnapshotsToDelete(names, now)
    expect(doomed.sort()).toEqual([snap('2026-08-04T09:00:00.000Z'), snap('2026-09-20T08:00:00.000Z')].sort())
    expect(selectSnapshotsToDelete(names, now, { enabled: false, keepAllHours: 24, dailyDays: 30, weeklyWeeks: null })).toEqual([])
  })

  it('prunes files on disk', async () => {
    const { relPath } = await createPage(root, section, 'P')
    const h = join(root, relPath, '.history')
    for (const n of [snap('2026-01-05T09:00:00.000Z'), snap('2026-01-06T09:00:00.000Z'), snap('2026-01-07T09:00:00.000Z')]) await fs.writeFile(join(h, n), '{}')
    const removed = await pruneHistory(join(root, relPath), undefined, new Date('2026-09-24T12:00:00.000Z'))
    expect(removed).toHaveLength(2)
    expect(await fs.readdir(h)).toEqual([snap('2026-01-07T09:00:00.000Z')])
  })
})

describe('recycle folder', () => {
  it('records where a page came from and restores it there', async () => {
    const { relPath } = await createPage(root, section, 'Gone')
    const name = await recyclePage(root, relPath, 'Gone')
    const list = await listRecycled(root)
    expect(list).toHaveLength(1)
    expect(list[0]!.originalSection).toBe('S')
    expect(list[0]!.title).toBe('Gone')
    const back = await restoreRecycled(root, name, section)
    expect(back).toBe('S/Gone.page')
    expect(await listRecycled(root)).toEqual([])
    const tree = await openNotebook(root)
    const s = tree.children[0]!
    if (s.kind !== 'section') throw new Error()
    expect(s.pages.map((p) => p.title)).toEqual(['Gone'])
  })

  it('purges old entries only', async () => {
    const { relPath } = await createPage(root, section, 'Old')
    const name = await recyclePage(root, relPath, 'Old')
    await fs.writeFile(join(root, '.recycle', name, 'recycle.json'), JSON.stringify({ originalSection: 'S', originalFolder: 'Old.page', title: 'Old', deleted: '2020-01-01T00:00:00.000Z' }))
    const { relPath: r2 } = await createPage(root, section, 'New')
    await recyclePage(root, r2, 'New')
    expect(await purgeOld(root, 30)).toBe(1)
    expect((await listRecycled(root)).map((e) => e.title)).toEqual(['New'])
  })
})

describe('verify and repair', () => {
  it('finds damaged pages, missing and orphan files, stale html, and temp files, and repairs them', async () => {
    const { relPath, doc } = await createPage(root, section, 'V')
    await savePage(root, relPath, doc)
    const src = join(dir, 'a.bin')
    await fs.writeFile(src, Buffer.alloc(100, 7))
    const entry = await copyFileIntoPage(root, relPath, src, ATTACHMENTS_DIR)
    const r = await savePage(root, relPath, { ...doc, manifest: { images: [], attachments: [entry] } })
    const pdir = join(root, r.relPath)
    await fs.writeFile(join(pdir, ATTACHMENTS_DIR, 'orphan.txt'), 'x')
    await fs.truncate(join(pdir, ATTACHMENTS_DIR, entry.name), 10)
    await fs.writeFile(join(pdir, '.tmp-page.json-abc'), 'partial')
    await fs.rm(join(pdir, 'page.html'))
    const tree = await openNotebook(root)
    const report = await verifyNotebook(root, tree, 'quick')
    const kinds = report.findings.map((f) => f.kind).sort()
    expect(kinds).toEqual(['missing-file', 'orphan-file', 'stale-html', 'temp-file'])
    for (const f of report.findings) if (f.repair) await repairFinding(root, f)
    const after = await verifyNotebook(root, await openNotebook(root), 'quick')
    expect(after.findings.map((f) => f.kind)).toEqual(['missing-file'])
    expect(await fs.stat(join(pdir, 'page.html')).then(() => true, () => false)).toBe(true)
    expect(await fs.readdir(join(root, '.recycle', 'orphaned files'))).toHaveLength(1)

    // Damage the page document: verify offers restore from history and applies it.
    await fs.writeFile(join(pdir, 'page.json'), '{broken')
    const broken = await verifyNotebook(root, await openNotebook(root), 'quick')
    const corrupt = broken.findings.find((f) => f.kind === 'corrupt-page')!
    expect(corrupt.repair).toBe('restore-from-history')
    const msg = await repairFinding(root, corrupt)
    expect(msg).toContain('Restored')
    const fixed = await verifyNotebook(root, await openNotebook(root), 'quick')
    expect(fixed.findings.some((f) => f.kind === 'corrupt-page')).toBe(false)
  })
})
