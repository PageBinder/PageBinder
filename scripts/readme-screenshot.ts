/**
 * Retake the screenshot shown in README.md: the sample notebook open on its Lidar pass page.
 *   npx tsx scripts/make-sample.ts <folder> && npm run build:e2e
 *   npx tsx scripts/readme-screenshot.ts "<folder>/Farm records 2026" docs/images/pagebinder.png
 */
import { _electron as electron } from 'playwright'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

async function main(): Promise<void> {
  const [root, out] = process.argv.slice(2)
  if (!root || !out) throw new Error('usage: readme-screenshot.ts <notebook> <out.png>')
  const app = await electron.launch({
    args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), `pagebinder-shot-${Date.now()}`)}`],
    cwd: resolve('.'),
    env: { ...process.env, PAGEBINDER_OPEN: resolve(root) }
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.section-tabs')
    await page.locator('.tab.group', { hasText: 'Site surveys' }).click()
    await page.locator('.tab', { hasText: 'North Field' }).click()
    await page.locator('.page-row', { hasText: 'Lidar pass' }).click()
    await page.waitForTimeout(800)
    // Nothing selected or focused, so the page looks as it does when read.
    await page.mouse.click(5, 5)
    await page.waitForTimeout(300)
    await page.screenshot({ path: out })
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
