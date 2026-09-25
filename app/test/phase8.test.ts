import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createNotebook, openNotebook, acquireLock } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import { renameDurable } from '../src/main/storage/atomic'
import { isSystemFile } from '../src/main/storage/paths'
import { verifyNotebook, LONG_PATH_WARN } from '../src/main/storage/verify'
import { fileResponse, needsNodeRead } from '../src/main/fileResponse'
import { combineHtml } from '../src/main/export'
import { tempDir, removeDir } from './helpers'

let dir: string
let root: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
})
afterEach(async () => {
  vi.restoreAllMocks()
  await removeDir(dir)
})

function busy(): NodeJS.ErrnoException {
  return Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
}

describe('renames on Windows', () => {
  it('retries a rename that another program briefly blocks', async () => {
    const from = join(dir, 'a.txt')
    await fs.writeFile(from, 'x')
    const real = fs.rename.bind(fs)
    let calls = 0
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      calls += 1
      if (calls <= 2) throw busy()
      return real(a, b)
    })
    await renameDurable(from, join(dir, 'b.txt'), 'win32')
    expect(calls).toBe(3)
    expect(await fs.readFile(join(dir, 'b.txt'), 'utf8')).toBe('x')
  })

  it('does not retry on macOS, or for errors that are not transient', async () => {
    let calls = 0
    vi.spyOn(fs, 'rename').mockImplementation(async () => {
      calls += 1
      throw busy()
    })
    await expect(renameDurable('a', 'b', 'darwin')).rejects.toThrow('EPERM')
    expect(calls).toBe(1)
    vi.restoreAllMocks()
    await expect(renameDurable(join(dir, 'missing'), join(dir, 'b'), 'win32')).rejects.toThrow('ENOENT')
  })
})

describe('notebook lock copied from another computer', () => {
  it('ignores a lock written on another computer, whatever its process number', async () => {
    // process.ppid is alive on this machine, so only the host name can make this lock stale.
    await fs.writeFile(join(root, '.lock'), JSON.stringify({ pid: process.ppid, host: 'Someones-MacBook', since: new Date().toISOString() }))
    expect((await acquireLock(root)).ok).toBe(true)
  })

  it('still refuses a lock held by a live process on this computer', async () => {
    await fs.writeFile(join(root, '.lock'), JSON.stringify({ pid: process.ppid, host: hostname(), since: new Date().toISOString() }))
    expect((await acquireLock(root)).ok).toBe(false)
  })
})

describe('files the operating system adds', () => {
  it('recognises Windows and macOS system files', () => {
    for (const n of ['Thumbs.db', 'desktop.ini', 'DESKTOP.INI', '.DS_Store', '._photo.jpg', 'Icon\r']) expect(isSystemFile(n)).toBe(true)
    for (const n of ['photo.jpg', 'thumbs.db.jpg', 'Desktop notes.pdf']) expect(isSystemFile(n)).toBe(false)
  })

  it('Verify Notebook does not call them orphaned page files', async () => {
    const section = await createSection(root, '', 'S')
    const { relPath } = await createPage(root, section, 'P')
    const images = join(root, relPath, 'images')
    await fs.mkdir(images, { recursive: true })
    await fs.writeFile(join(images, 'Thumbs.db'), 'cache')
    await fs.writeFile(join(images, 'desktop.ini'), '[.ShellClassInfo]')
    await fs.writeFile(join(images, 'stray.png'), 'png')
    const report = await verifyNotebook(root, await openNotebook(root), 'quick')
    expect(report.findings.filter((f) => f.kind === 'orphan-file').map((f) => f.file)).toEqual(['images/stray.png'])
  })
})

describe('long paths', () => {
  it('Verify Notebook warns when a full path passes the warning length, and not before', async () => {
    const section = await createSection(root, '', 'S')
    const { relPath } = await createPage(root, section, 'Short')
    let report = await verifyNotebook(root, await openNotebook(root), 'quick')
    expect(report.findings.some((f) => f.kind === 'long-path')).toBe(false)

    // Nest the notebook deep enough that an attachment's full path passes the limit.
    const deep = join(dir, 'a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60))
    await fs.mkdir(deep, { recursive: true })
    const deepRoot = await createNotebook(deep, 'nb')
    const s2 = await createSection(deepRoot, '', 'Section with a fairly long name')
    const p2 = await createPage(deepRoot, s2, 'A page whose title is also rather long')
    await fs.mkdir(join(deepRoot, p2.relPath, 'attachments'), { recursive: true })
    await fs.writeFile(join(deepRoot, p2.relPath, 'attachments', 'Quarterly statement for the joint account.pdf'), 'x')
    report = await verifyNotebook(deepRoot, await openNotebook(deepRoot), 'quick')
    const warning = report.findings.find((f) => f.kind === 'long-path')
    expect(warning?.rel).toBe(p2.relPath)
    expect(warning?.detail).toContain('attachments/Quarterly statement')
    expect(Number(/(\d+) characters/.exec(warning!.detail)![1])).toBeGreaterThan(LONG_PATH_WARN)
    expect(relPath).toBeTruthy()
  })

  it('serves long Windows paths through Node, with byte ranges for video', async () => {
    expect(needsNodeRead('C:\\short\\images\\a.png', 'win32')).toBe(false)
    expect(needsNodeRead(`C:\\${'x'.repeat(260)}\\a.png`, 'win32')).toBe(true)
    expect(needsNodeRead(`/${'x'.repeat(300)}/a.png`, 'darwin')).toBe(false)

    const file = join(dir, 'clip.mp4')
    await fs.writeFile(file, '0123456789')
    const whole = await fileResponse(file, null)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('Content-Type')).toBe('video/mp4')
    expect(await whole.text()).toBe('0123456789')
    const part = await fileResponse(file, 'bytes=2-5')
    expect(part.status).toBe(206)
    expect(part.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(await part.text()).toBe('2345')
    expect(await (await fileResponse(file, 'bytes=7-')).text()).toBe('789')
    expect(await (await fileResponse(file, 'bytes=-3')).text()).toBe('789')
    expect((await fileResponse(file, 'bytes=20-')).status).toBe(416)
    expect((await fileResponse(join(dir, 'missing.png'), null)).status).toBe(404)
  })
})

describe('exported HTML', () => {
  it('writes file links that a browser can follow', async () => {
    const section = await createSection(root, '', 'S')
    const { relPath, doc } = await createPage(root, section, 'P')
    const picture = { kind: 'image' as const, id: 'i1', x: 0, y: 0, width: 10, height: 10, name: 'photo.png', originalName: 'photo.png' }
    const html = combineHtml([{ dir: join(root, relPath), doc: { ...doc, objects: [picture] }, title: 'P' }], root, true)
    const link = /file:\/\/[^"')]+?images\//.exec(html)?.[0] ?? ''
    // file:///<absolute path>/images/ on macOS and Linux; file:///C:/... on Windows.
    expect(link.startsWith('file:///')).toBe(true)
    expect(decodeURIComponent(link)).toContain(join(root, relPath).split('\\').join('/'))
  })
})
