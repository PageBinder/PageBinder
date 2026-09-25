/// <reference lib="dom" />
/**
 * Phase 7 measurements against a large notebook, through the real window.
 *   npx tsx scripts/measure-scale.ts "<notebook folder>"
 */
import { _electron as electron } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

async function main(): Promise<void> {
  const root = resolve(process.argv[2] ?? 'test-notebooks/Scale 50000')
  const userData = join(tmpdir(), 'pagebinder-scale-userdata')
  const label = process.argv[3] ?? ''
  const rows: [string, string][] = []
  const note = (k: string, v: string): void => {
    rows.push([k, v])
    process.stdout.write(`  ${k}: ${v}\n`)
  }
  const indexFile = join(root, '.index', 'search.sqlite')
  const hadIndex = await fs.stat(indexFile).then(() => true, () => false)
  note('Index present before open', hadIndex ? 'yes' : 'no')

  const t0 = Date.now()
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs', { timeout: 300000 })
  const tUsable = Date.now() - t0
  note('Window usable with tree (ms)', String(tUsable))

  // Background indexing / reconcile: wait until the indexer reports done.
  const tIdx0 = Date.now()
  let status = await page.evaluate(() => window.pagebinder.search.status())
  while (status.phase !== 'done' && status.phase !== 'error' && Date.now() - tIdx0 < 1800000) {
    await page.waitForTimeout(500)
    status = await page.evaluate(() => window.pagebinder.search.status())
  }
  note('Background index/reconcile (ms)', String(Date.now() - tIdx0))
  note('Pages indexed', String(status.total))

  // Type-ahead latency: median of 20 prefix queries.
  const times = await page.evaluate(async () => {
    const out: number[] = []
    const terms = ['rid', 'cul', 'dra', 'lid', 'sur', 'fen', 'bar', 'pas', 'wel', 'tra', 'har', 'sil', 'orc', 'cre', 'gat', 'mea', 'qua', 'win', 'tro', 'hed']
    for (const t of terms) {
      const s = performance.now()
      await window.pagebinder.search.query(t, '')
      out.push(performance.now() - s)
    }
    return out.sort((a, b) => a - b)
  })
  note('Type-ahead query median (ms)', times[Math.floor(times.length / 2)]!.toFixed(1))
  note('Type-ahead query max (ms)', times[times.length - 1]!.toFixed(1))

  // Enter the first group so a section is selected, then add a page.
  const tGroup0 = Date.now()
  await page.locator('.tab.group').first().click()
  await page.waitForSelector('.page-row.add')
  note('Open a group (ms)', String(Date.now() - tGroup0))
  const tAdd0 = Date.now()
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  note('Add page, click to rename box (ms)', String(Date.now() - tAdd0))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Switch sections and groups.
  const tNav0 = Date.now()
  await page.locator('.section-tabs .tab').nth(1).click()
  await page.waitForSelector('.page-row.on')
  note('Open a section (ms)', String(Date.now() - tNav0))

  // Memory.
  const mem = await app.evaluate(({ app }) => app.getAppMetrics().reduce((n, m) => n + m.memory.workingSetSize, 0))
  note('Working set, all processes (MB)', String(Math.round(mem / 1024)))

  await app.close()
  process.stdout.write(`\n${label ? label + '\n' : ''}| Measure | Value |\n|---|---|\n${rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
