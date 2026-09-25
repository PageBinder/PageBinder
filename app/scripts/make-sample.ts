/** Creates a small sample notebook for manual testing. */
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import type { TextContainer } from '../src/shared/types'

async function main(): Promise<void> {
  const base = resolve(process.argv[2] ?? 'test-notebooks')
  await fs.rm(base, { recursive: true, force: true })
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Farm records 2026')
  const home = await createSection(root, '', 'Home', '#888780')
  const surveys = await createGroup(root, '', 'Site surveys')
  const ridge = await createSection(root, surveys, 'Ridge Road', '#1D9E75')
  const north = await createSection(root, surveys, 'North Field', '#D85A30')
  await createSection(root, surveys, 'Barn 3', '#D4537E')
  await createPage(root, home, 'Welcome')
  await createPage(root, ridge, 'Access notes')
  const plan = await createPage(root, north, 'Survey plan')
  const lidar = await createPage(root, north, 'Lidar pass')
  await savePage(root, lidar.relPath, {
    ...lidar.doc,
    objects: [
      {
        ...(lidar.doc.objects[0] as TextContainer),
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Flew the north field at 60 m with 40% overlap. Ground was dry, no standing water in the low corner.' }] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pass 1: 60 m, clean' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pass 2: 60 m, wind gust at 4 min' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pass 3: 40 m, detail over culvert' }] }] }
            ] }
          ]
        }
      },
      { kind: 'text', id: 'b1c2d3e4f5a6b7c8d9e0f1a2', x: 560, y: 300, width: 220, content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'To do' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Check drainage on the east side.' }] }] } }
    ]
  })
  void plan
  process.stdout.write(`${root}\n`)
}
void main()
