/**
 * Build a large notebook quickly for scale testing: files are written directly,
 * with each section's order file written once instead of after every page.
 *
 *   npx tsx scripts/make-scale.ts <parent folder> [pages=50000] [name="Scale notebook"]
 *
 * Layout: groups of 20 sections, 25 pages per section. Every page has a short
 * text container with distinctive words so search has something to find.
 */
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { createNotebook, writeJson } from '../src/main/storage/notebook'
import { newPageDoc } from '../src/main/storage/page'
import { renderPageHtml } from '../src/shared/render/renderPage'
import { withChecksum } from '../src/main/storage/checksum'
import { newId, now } from '../src/main/storage/ids'
import { FORMAT_VERSION, type SectionMeta, type GroupMeta, type NotebookMeta, type TextContainer } from '../src/shared/types'

const WORDS = ['ridge', 'culvert', 'drainage', 'lidar', 'survey', 'fence', 'barn', 'pasture', 'well', 'tractor', 'harvest', 'silo', 'orchard', 'creek', 'gate', 'meadow', 'quarry', 'windmill', 'trough', 'hedge']

async function main(): Promise<void> {
  const parent = resolve(process.argv[2] ?? 'test-notebooks')
  const total = Number(process.argv[3] ?? '50000')
  const name = process.argv[4] ?? `Scale ${total}`
  await fs.mkdir(parent, { recursive: true })
  const root = await createNotebook(parent, name)
  const PER_SECTION = 25
  const PER_GROUP = 20
  const sections = Math.ceil(total / PER_SECTION)
  const groups = Math.ceil(sections / PER_GROUP)
  const started = Date.now()
  let written = 0
  const order: string[] = []
  for (let g = 0; g < groups; g++) {
    const gname = `Group ${String(g + 1).padStart(3, '0')}`
    const gdir = join(root, gname)
    await fs.mkdir(gdir)
    const gorder: string[] = []
    for (let s = 0; s < PER_GROUP && g * PER_GROUP + s < sections; s++) {
      const sname = `Section ${String(g * PER_GROUP + s + 1).padStart(4, '0')}`
      const sdir = join(gdir, sname)
      await fs.mkdir(sdir)
      const pageOrder: string[] = []
      const batch: Promise<void>[] = []
      for (let p = 0; p < PER_SECTION && written < total; p++) {
        const n = written + 1
        written += 1
        const title = `Page ${n}`
        const folder = `${title}.page`
        pageOrder.push(folder)
        batch.push(
          (async () => {
            const pdir = join(sdir, folder)
            await fs.mkdir(pdir)
            await Promise.all([fs.mkdir(join(pdir, 'images')), fs.mkdir(join(pdir, 'attachments')), fs.mkdir(join(pdir, '.history'))])
            const base = newPageDoc(title)
            const obj = base.objects[0] as TextContainer
            const words = [WORDS[n % WORDS.length], WORDS[(n * 7) % WORDS.length], WORDS[(n * 13) % WORDS.length]]
            const doc = withChecksum({
              ...base,
              objects: [{ ...obj, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Notes for page ${n}: ${words.join(' ')} inspection number ${n * 3}.` }] }] } }]
            })
            await fs.writeFile(join(pdir, 'page.json'), JSON.stringify(doc, null, 2))
            await fs.writeFile(join(pdir, 'page.html'), renderPageHtml(doc))
          })()
        )
      }
      await Promise.all(batch)
      const smeta: SectionMeta = { format: FORMAT_VERSION, id: newId(), name: sname, color: '#378ADD', created: now(), pageOrder }
      await writeJson(join(sdir, 'section.json'), smeta)
      gorder.push(sname)
      if (written % 2500 === 0 || written === total) process.stdout.write(`${written} pages, ${((Date.now() - started) / 1000).toFixed(0)} s\n`)
    }
    const gmeta: GroupMeta = { format: FORMAT_VERSION, id: newId(), name: gname, created: now(), order: gorder }
    await writeJson(join(gdir, 'group.json'), gmeta)
    order.push(gname)
  }
  const nb = JSON.parse(await fs.readFile(join(root, 'notebook.json'), 'utf8')) as NotebookMeta
  await writeJson(join(root, 'notebook.json'), { ...nb, order })
  process.stdout.write(`done: ${written} pages in ${groups} groups and ${sections} sections at ${root} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`)
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
