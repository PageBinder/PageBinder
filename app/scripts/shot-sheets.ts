import { _electron as electron } from 'playwright'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
const root = resolve('test-notebooks/Farm records 2026')
const out = process.argv[2] ?? 'sheets.png'

async function main(): Promise<void> {
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')
  await page.locator('.tab.group').click()
  await page.locator('.tab', { hasText: 'North Field' }).click()
  await page.locator('.page-row', { hasText: 'Lidar pass' }).click()
  await page.waitForSelector('.canvas')
  await page.locator('.canvas-scroll').evaluate((el) => el.scrollTo(0, 700))
  await page.locator('.canvas').click({ position: { x: 120, y: 1120 } })
  await page.keyboard.type('Continued on the second sheet. The dashed line above marks where the printer starts a new sheet.')
  await page.waitForTimeout(400)
  await page.locator('.canvas-scroll').evaluate((el) => el.scrollTo(0, 620))
  await page.waitForTimeout(300)
  await page.screenshot({ path: out })
  await app.close()
}
void main()
