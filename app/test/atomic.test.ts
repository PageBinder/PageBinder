import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile, cleanTempFiles, TMP_PREFIX } from '../src/main/storage/atomic'
import { tempDir, removeDir } from './helpers'

let dir: string
beforeEach(async () => { dir = await tempDir() })
afterEach(async () => { await removeDir(dir) })

describe('atomicWriteFile', () => {
  it('writes the content and leaves no temp files behind', async () => {
    const target = join(dir, 'a.json')
    await atomicWriteFile(target, 'hello')
    expect(await fs.readFile(target, 'utf8')).toBe('hello')
    const names = await fs.readdir(dir)
    expect(names).toEqual(['a.json'])
  })

  it('replaces an existing file completely', async () => {
    const target = join(dir, 'a.json')
    await atomicWriteFile(target, 'x'.repeat(10000))
    await atomicWriteFile(target, 'short')
    expect(await fs.readFile(target, 'utf8')).toBe('short')
  })

  it('keeps the old file when the rename step fails', async () => {
    const target = join(dir, 'a.json')
    await atomicWriteFile(target, 'original')
    // Make the rename impossible by turning the target into a non-empty directory.
    await fs.rm(target)
    await fs.mkdir(target)
    await fs.writeFile(join(target, 'child'), '')
    await expect(atomicWriteFile(target, 'new')).rejects.toBeTruthy()
    const names = await fs.readdir(dir)
    expect(names.filter((n) => n.startsWith(TMP_PREFIX))).toEqual([])
  })

  it('cleanTempFiles removes leftovers from an interrupted write', async () => {
    await fs.writeFile(join(dir, `${TMP_PREFIX}page.json-abc`), 'partial')
    await fs.writeFile(join(dir, 'page.json'), 'good')
    const removed = await cleanTempFiles(dir)
    expect(removed).toHaveLength(1)
    expect(await fs.readdir(dir)).toEqual(['page.json'])
  })
})
