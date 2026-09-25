import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup, renameContainer, setSectionColor } from '../src/main/storage/section'
import { createPage, deletePage } from '../src/main/storage/page'
import { SearchIndex } from '../src/main/search/index'
import { treeFromIndex, applyTreeToIndex, refreshSection, refreshContainer } from '../src/main/search/tree'
import { tempDir, removeDir } from './helpers'
import type { NotebookTree } from '../src/shared/types'

let dir: string
let root: string
beforeEach(async () => {
  dir = await tempDir()
  root = await createNotebook(dir, 'nb')
})
afterEach(async () => { await removeDir(dir) })

function shape(t: NotebookTree): string {
  const walk = (c: NotebookTree['children']): string => c.map((x) => (x.kind === 'group' ? `${x.name}[${walk(x.children)}]` : `${x.name}(${x.pages.map((p) => p.title).join(',')})`)).join(' ')
  return walk(t.children)
}

describe('tree from the index', () => {
  it('reproduces the scanned tree exactly, then follows section and container refreshes', async () => {
    const g = await createGroup(root, '', 'Site surveys')
    const s1 = await createSection(root, g, 'Ridge Road', '#1D9E75')
    const s2 = await createSection(root, g, 'North Field', '#D85A30')
    const home = await createSection(root, '', 'Home')
    await createPage(root, s2, 'Survey plan')
    await createPage(root, s2, 'Lidar pass')
    await createPage(root, home, 'Welcome')
    const scanned = await openNotebook(root)
    const index = new SearchIndex(root)
    await index.open()
    expect(treeFromIndex(index, root, scanned.meta)).toBeNull()
    applyTreeToIndex(index, scanned)
    const fromIndex = treeFromIndex(index, root, scanned.meta)!
    expect(shape(fromIndex)).toBe(shape(scanned))
    expect(shape(fromIndex)).toBe('Site surveys[Ridge Road() North Field(Survey plan,Lidar pass)] Home(Welcome)')
    const north = (fromIndex.children[0] as { children: NotebookTree['children'] }).children[1]!
    expect(north.kind === 'section' && north.color).toBe('#D85A30')

    // Changes on disk, then targeted refreshes instead of a full scan.
    const { relPath } = await createPage(root, s1, 'Access notes')
    await refreshSection(index, root, s1)
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toContain('Ridge Road(Access notes)')
    await deletePage(root, relPath)
    await refreshSection(index, root, s1)
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toContain('Ridge Road()')
    await setSectionColor(root, s2, '#000000')
    await refreshContainer(index, root, g)
    const t2 = treeFromIndex(index, root, scanned.meta)!
    const n2 = (t2.children[0] as { children: NotebookTree['children'] }).children[1]!
    expect(n2.kind === 'section' && n2.color).toBe('#000000')
    const renamed = await renameContainer(root, s1, 'Ridge Road East')
    index.removeUnder(s1)
    await refreshContainer(index, root, g)
    await refreshSection(index, root, renamed)
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toBe('Site surveys[Ridge Road East() North Field(Survey plan,Lidar pass)] Home(Welcome)')

    // A full reconcile from a scan corrects anything the refreshes missed.
    await fs.rm(join(root, home), { recursive: true })
    applyTreeToIndex(index, await openNotebook(root))
    expect(shape(treeFromIndex(index, root, scanned.meta)!)).toBe('Site surveys[Ridge Road East() North Field(Survey plan,Lidar pass)]')
    index.close()
  })
})
