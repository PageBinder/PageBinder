/**
 * Command-line export. Works without the app's window and without the search index.
 *
 *   npx tsx scripts/pagebinder-export.ts <folder>                       regenerate page.html for every page under <folder>
 *   npx tsx scripts/pagebinder-export.ts <folder> --combine out.html   also write one HTML file holding every page in order
 *   npx tsx scripts/pagebinder-export.ts <folder> --pdf out.pdf        write one PDF (renders under Electron)
 *
 * <folder> may be a notebook, a section group, a section, or a single page folder.
 * The same code runs behind File > Export in the app.
 */
import { resolve, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectPages, exportHtml, stageForPdf } from '../src/main/export'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const target = args[0] ? resolve(args[0]) : ''
  if (!target) {
    process.stderr.write('usage: pagebinder-export <folder> [--combine out.html] [--pdf out.pdf]\n')
    process.exit(2)
  }
  const combine = args.includes('--combine') ? resolve(args[args.indexOf('--combine') + 1] ?? 'export.html') : null
  const pdf = args.includes('--pdf') ? resolve(args[args.indexOf('--pdf') + 1] ?? 'export.pdf') : null
  const log = (s: string): void => {
    process.stdout.write(`${s}\n`)
  }
  if (combine) {
    const n = await exportHtml(target, combine, log)
    log(`regenerated page.html for ${n} ${n === 1 ? 'page' : 'pages'} under ${basename(target)}; combined HTML written to ${combine}`)
  } else if (!pdf) {
    const pages = await collectPages(target, log)
    log(`regenerated page.html for ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} under ${basename(target)}`)
  }
  if (pdf) {
    const staged = await stageForPdf(target)
    try {
      const electron = require('electron') as unknown as string
      const r = spawnSync(electron, [resolve(__dirname, 'export-pdf.cjs'), staged.htmlPath, pdf], { stdio: 'inherit' })
      if (r.status !== 0) process.exit(r.status ?? 1)
      log(`PDF of ${staged.count} ${staged.count === 1 ? 'page' : 'pages'} written to ${pdf}`)
    } finally {
      await staged.cleanup()
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
