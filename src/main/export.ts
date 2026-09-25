/**
 * Export pages as one HTML file or one PDF. Used by File > Export and by the
 * command-line script, so both produce the same output.
 */
import { promises as fs } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { readValidPage, writeRendered } from './storage/page'
import { readJson } from './storage/notebook'
import { renderPageHtml } from '../shared/render/renderPage'
import { atomicWriteFile } from './storage/atomic'
import type { PageDoc, SectionMeta, GroupMeta, NotebookMeta } from '../shared/types'

export interface ExportedPage {
  dir: string
  title: string
  doc: PageDoc
}

async function orderOf(dir: string): Promise<string[]> {
  const nb = await readJson<NotebookMeta>(join(dir, 'notebook.json'))
  if (nb?.order) return nb.order
  const g = await readJson<GroupMeta>(join(dir, 'group.json'))
  if (g?.order) return g.order
  const s = await readJson<SectionMeta>(join(dir, 'section.json'))
  if (s?.pageOrder) return s.pageOrder
  return []
}

function sortByOrder(names: string[], order: string[]): string[] {
  const rank = new Map(order.map((n, i) => [n, i]))
  return [...names].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b, undefined, { numeric: true }))
}

/** Regenerate page.html for every page under `dir` (notebook, group, section, or page) and return the pages in notebook order. */
export async function collectPages(dir: string, log: (s: string) => void = () => {}): Promise<ExportedPage[]> {
  const out: ExportedPage[] = []
  const walk = async (d: string): Promise<void> => {
    if (d.endsWith('.page')) {
      const doc = await readValidPage(join(d, 'page.json'))
      if (!doc) {
        log(`skipped (damaged): ${d}`)
        return
      }
      await writeRendered(d, doc)
      out.push({ dir: d, title: doc.title, doc })
      return
    }
    const entries = (await fs.readdir(d, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'templates').map((e) => e.name)
    for (const name of sortByOrder(entries, await orderOf(d))) await walk(join(d, name))
  }
  await walk(dir)
  return out
}

/**
 * One HTML document holding every page. Image and attachment links are relative
 * to `root`, so the file is placed in (or next to) the notebook to keep them working;
 * with `absoluteLinks`, file:// links are used so the file works anywhere on this machine.
 */
export function combineHtml(pages: ExportedPage[], root: string, absoluteLinks = false): string {
  const parts = pages.map((p) => {
    const relDir = p.dir.slice(root.length + 1).split(/[\\/]/).map(encodeURIComponent).join('/')
    const base = absoluteLinks ? `file://${p.dir.split(/[\\/]/).map(encodeURIComponent).join('/')}/` : `${relDir}/`
    const html = renderPageHtml(p.doc, { imageBase: `${base}images/`, attachmentBase: `${base}attachments/` })
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? ''
    const bodyAttrs = /<body([^>]*)>/.exec(html)?.[1] ?? ''
    return `<section class="page-export" data-title="${p.title.replace(/"/g, '&quot;')}"><div${bodyAttrs.replace(/class="[^"]*"/, 'class="unpaginated page-body"')}>${body.replace(/<script>[\s\S]*?<\/script>/, '')}</div></section>`
  })
  const first = pages[0] ? renderPageHtml(pages[0].doc) : renderPageHtml({ format: 1, id: '', title: '', created: '', modified: '', tags: [], paper: { size: 'letter', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 } }, objects: [], manifest: { images: [], attachments: [] }, checksum: '' })
  const head = (/<head>([\s\S]*)<\/head>/.exec(first)?.[1] ?? '').replace(/<title>[\s\S]*?<\/title>/, `<title>${basename(root).replace(/</g, '&lt;')}</title>`)
  const script = /<script>([\s\S]*?)<\/script>/.exec(first)?.[1] ?? ''
  const perPage = script
    .replace('document.body', 'body')
    .replace("var source = document.getElementById('canvas');", "var source = body.querySelector('#canvas');")
    .replace("var host = document.getElementById('sheets');", "var host = body.querySelector('#sheets');")
    .replace(/\(function \(\) \{/, '')
    .replace(/\}\)\(\);\s*$/, '')
  return `<!doctype html><html><head>${head}<style>.page-export{margin:0 0 24px} .page-body .chrome{display:none} @media print{.page-export{margin:0} .page-body .sheet{break-after:page} .page-export:last-child .page-body .sheet:last-child{break-after:auto}}</style></head><body>
${parts.join('\n')}
<script>
document.querySelectorAll('.page-body').forEach(function (body) { ${perPage} });
</script></body></html>`
}

export async function exportHtml(targetDir: string, outPath: string, log?: (s: string) => void): Promise<number> {
  const pages = await collectPages(targetDir, log)
  const root = targetDir.endsWith('.page') ? resolve(targetDir, '..') : targetDir
  const inside = resolve(outPath).startsWith(root)
  await atomicWriteFile(outPath, combineHtml(pages, root, !inside))
  return pages.length
}

/** Write the combined HTML to a temporary file for a PDF renderer to load. */
export async function stageForPdf(targetDir: string): Promise<{ htmlPath: string; count: number; cleanup: () => Promise<void> }> {
  const pages = await collectPages(targetDir)
  const root = targetDir.endsWith('.page') ? resolve(targetDir, '..') : targetDir
  const dir = await fs.mkdtemp(join(tmpdir(), 'pagebinder-export-'))
  const htmlPath = join(dir, 'export.html')
  await fs.writeFile(htmlPath, combineHtml(pages, root, true))
  return { htmlPath, count: pages.length, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
}
