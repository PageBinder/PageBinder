import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook, openNotebook, acquireLock, releaseLock } from '../src/main/storage/notebook'
import { createSection, createGroup, renameContainer, setSectionColor } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import { tempDir, removeDir } from './helpers'

let dir: string
beforeEach(async () => { dir = await tempDir() })
afterEach(async () => { await removeDir(dir) })

describe('notebook structure', () => {
  it('creates a notebook with metadata, templates folder, and readme', async () => {
    const root = await createNotebook(dir, 'Farm records 2026')
    const names = await fs.readdir(root)
    expect(names.sort()).toEqual(['README.txt', 'notebook.json', 'templates'])
    const tree = await openNotebook(root)
    expect(tree.meta.name).toBe('Farm records 2026')
    expect(tree.children).toEqual([])
  })

  it('builds the tree from groups, sections, and pages in order', async () => {
    const root = await createNotebook(dir, 'nb')
    const group = await createGroup(root, '', 'Site surveys')
    const s1 = await createSection(root, group, 'Ridge Road')
    const s2 = await createSection(root, group, 'North Field', '#D85A30')
    await createSection(root, '', 'Home')
    await createPage(root, s2, 'Survey plan')
    await createPage(root, s2, 'Lidar pass')
    const tree = await openNotebook(root)
    expect(tree.children.map((c) => c.name)).toEqual(['Site surveys', 'Home'])
    const g = tree.children[0]!
    expect(g.kind).toBe('group')
    if (g.kind !== 'group') throw new Error()
    expect(g.children.map((c) => c.name)).toEqual(['Ridge Road', 'North Field'])
    const north = g.children[1]!
    if (north.kind !== 'section') throw new Error()
    expect(north.color).toBe('#D85A30')
    expect(north.pages.map((p) => p.title)).toEqual(['Survey plan', 'Lidar pass'])
    expect(north.pages[1]!.relPath).toBe('Site surveys/North Field/Lidar pass.page')
    expect(s1).toBe('Site surveys/Ridge Road')
  })

  it('regenerates missing metadata from the folder layout', async () => {
    const root = await createNotebook(dir, 'nb')
    const sec = await createSection(root, '', 'Barn 3')
    await createPage(root, sec, 'Roof')
    await fs.rm(join(root, sec, 'section.json'))
    await fs.rm(join(root, 'notebook.json'))
    const tree = await openNotebook(root)
    expect(tree.regenerated.sort()).toEqual(['Barn 3/section.json', 'notebook.json'])
    expect(tree.meta.name).toBe('nb')
    const s = tree.children[0]!
    if (s.kind !== 'section') throw new Error()
    expect(s.name).toBe('Barn 3')
    expect(s.pages.map((p) => p.title)).toEqual(['Roof'])
  })

  it('renames sections and their folders and keeps order', async () => {
    const root = await createNotebook(dir, 'nb')
    await createSection(root, '', 'A')
    const b = await createSection(root, '', 'B')
    await createSection(root, '', 'C')
    const renamed = await renameContainer(root, b, 'Boundary: north?')
    expect(renamed).toBe('Boundary north')
    await setSectionColor(root, renamed, '#123456')
    const tree = await openNotebook(root)
    expect(tree.children.map((c) => c.name)).toEqual(['A', 'Boundary: north?', 'C'])
    const s = tree.children[1]!
    if (s.kind !== 'section') throw new Error()
    expect(s.color).toBe('#123456')
  })

  it('takes and releases a lock', async () => {
    const root = await createNotebook(dir, 'nb')
    expect((await acquireLock(root)).ok).toBe(true)
    expect((await acquireLock(root)).ok).toBe(true)
    await releaseLock(root)
    const names = await fs.readdir(root)
    expect(names).not.toContain('.lock')
  })
})
