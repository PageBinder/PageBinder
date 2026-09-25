/// <reference lib="dom" />
/**
 * Phase 5 (history, recycle, verify, export) through the real Electron window.
 *   npx tsx scripts/e2e-phase5.ts
 */
import { _electron as electron, type Page, type ElectronApplication } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import { copyFileIntoPage, ATTACHMENTS_DIR } from '../src/main/storage/attachments'
import type { PageDoc } from '../src/shared/types'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
async function save(page: Page): Promise<void> {
  await page.keyboard.press(`${mod}+s`)
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
}
async function menu(app: ElectronApplication, channel: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, ch: string) => BrowserWindow.getAllWindows()[0]!.webContents.send(ch), channel)
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e5-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Phase 5 notebook')
  const sec = await createSection(root, '', 'Notes', '#7F77DD')
  const created = await createPage(root, sec, 'Versions')
  let rel = created.relPath
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  const doc = async (r = rel): Promise<PageDoc> => JSON.parse(await fs.readFile(join(root, r, 'page.json'), 'utf8')) as PageDoc

  const exportOut = join(base, 'app-export.pdf')
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root, PAGEBINDER_TEST_SAVE_PATH: exportOut } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')

  // 1. Two saves make two history entries; the panel previews and restores an earlier one.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.type('First version text')
  await save(page)
  await page.keyboard.press('End')
  await page.keyboard.type(' plus second version words')
  await save(page)
  await menu(app, 'menu:history')
  await page.waitForSelector('.preview.history')
  await page.waitForFunction(() => document.querySelectorAll('.history-row').length >= 2)
  const rows = await page.locator('.history-row').count()
  assert(rows >= 2, `history lists the saved versions (${rows})`)
  // Rows are newest first; the newest snapshot holds the state before the latest save.
  await page.locator('.history-row').nth(0).click()
  const frame = await (async () => {
    for (let i = 0; i < 50; i++) {
      const f = page.frames().find((fr) => fr !== page.mainFrame() && fr.url().includes('/.history/'))
      if (f) return f
      await page.waitForTimeout(100)
    }
    return undefined
  })()
  assert(frame, 'version preview frame present')
  await frame!.waitForFunction(() => (document.body?.textContent ?? '').includes('First version text'))
  const previewText = await frame!.evaluate(() => document.body.textContent ?? '')
  assert(!previewText.includes('second version'), 'preview shows the earlier version, not the current one')
  step('page history lists versions and previews an earlier one')

  await page.locator('.preview-bar button', { hasText: 'Restore this version' }).click()
  await page.waitForSelector('.preview.history', { state: 'detached' })
  await page.waitForTimeout(500)
  let d = await doc()
  assert(!JSON.stringify(d.objects).includes('second version'), 'restored page holds the earlier text')
  const history = await fs.readdir(join(root, rel, '.history'))
  assert(history.length >= 3, `restoring kept the replaced version in history (${history.length})`)
  step('restoring a version replaces the page and keeps the replaced version')

  // 2. Copy a version to a new page.
  await menu(app, 'menu:history')
  await page.waitForSelector('.history-row')
  await page.locator('.history-row').first().click()
  await page.locator('.preview-bar button', { hasText: 'Copy to new page' }).click()
  await page.waitForSelector('.page-row.on:has-text("version from")')
  const copies = (await page.locator('.page-row').allTextContents()).filter((t) => t.includes('version from'))
  assert(copies.length === 1, 'a new page was created from the version')
  step('a version can be copied to a new page')

  // 3. Delete a page, find it in Recycled Pages, restore it.
  await page.locator('.page-row.on').click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Delete page' }).click()
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('.page-row')).some((r) => r.textContent?.includes('version from')))
  await menu(app, 'menu:recycle')
  await page.waitForSelector('.recycle-row')
  assert(await page.locator('.recycle-row', { hasText: 'version from' }).count(), 'deleted page listed in Recycled Pages')
  await page.locator('.recycle-row button', { hasText: 'Restore' }).first().click()
  await page.waitForSelector('.page-row.on:has-text("version from")')
  await page.keyboard.press('Escape')
  step('a deleted page can be restored from Recycled Pages')

  // 4. Verify finds a damaged attachment and an unused file; repairs move the unused file to recycle.
  await page.locator('.page-row', { hasText: 'Versions' }).first().click()
  await page.waitForTimeout(300)
  const src = join(base, 'scan.bin')
  await fs.writeFile(src, Buffer.alloc(2048, 3))
  const entry = await copyFileIntoPage(root, rel, src, ATTACHMENTS_DIR)
  d = await doc()
  await page.evaluate(
    async ({ rel, doc }) => {
      await window.pagebinder.page.save(rel, doc)
    },
    { rel, doc: { ...d, objects: [...d.objects, { kind: 'file', id: 'f1f1f1f1f1f1f1f1f1f1f1f1', x: 96, y: 300, width: 300, name: entry.name, originalName: entry.originalName }], manifest: { ...d.manifest, attachments: [entry] } } as PageDoc }
  )
  await fs.truncate(join(root, rel, ATTACHMENTS_DIR, entry.name), 10)
  await fs.writeFile(join(root, rel, ATTACHMENTS_DIR, 'unused.txt'), 'x')
  await menu(app, 'menu:verify')
  await page.waitForSelector('.dialog.verify')
  await page.locator('.dialog.verify button', { hasText: 'Run check' }).click()
  await page.waitForSelector('.verify-row')
  const kinds = await page.locator('.verify-kind').allTextContents()
  assert(kinds.includes('Missing or damaged file') && kinds.includes('Unused file'), `verify reported the damage (${kinds.join(', ')})`)
  const orphanRow = page.locator('.verify-row', { hasText: 'Unused file' })
  assert(await orphanRow.locator('button', { hasText: 'Show file' }).count(), 'unused file offers Show file')
  assert(await orphanRow.locator('button', { hasText: 'Open' }).count(), 'unused file offers Open')
  assert(await orphanRow.locator('button', { hasText: 'Move to recycle folder' }).count(), 'repair is named, not just "Repair"')
  await page.locator('.dialog.verify button', { hasText: 'Apply all repairs' }).click()
  await page.waitForTimeout(500)
  assert((await fs.readdir(join(root, '.recycle', 'orphaned files'))).length === 1, 'unused file moved to the recycle folder')
  await page.locator('.dialog.verify button', { hasText: 'Close' }).click()
  step('Verify Notebook finds problems, lets the user inspect files, and repairs what it safely can')

  // 4b. File > Export Pages from the app: the whole notebook as one PDF.
  await menu(app, 'menu:export')
  await page.waitForSelector('.dialog select')
  await page.locator('.dialog select').first().selectOption('')
  await page.locator('.dialog select').nth(1).selectOption('pdf')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction(() => /Written to/.test(document.querySelector('.dialog')?.textContent ?? ''), undefined, { timeout: 60000 })
  const pdfBytes = await fs.readFile(exportOut)
  assert(pdfBytes.length > 2000 && (pdfBytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length >= 2, 'the app exported a multi-page PDF of the notebook')
  await page.locator('.dialog button', { hasText: 'Close' }).click()
  step('Export Pages in the app writes the whole notebook as one PDF')

  // 4c. Help > About shows the version and build time; documents open in the app.
  await menu(app, 'menu:about')
  await page.waitForSelector('.dialog.about')
  await page.waitForFunction(() => /Version/.test(document.querySelector('.dialog.about')?.textContent ?? ''))
  const aboutText = (await page.locator('.dialog.about').textContent()) ?? ''
  assert(/built /.test(aboutText), 'About shows when the build was made')
  await page.locator('.about-link', { hasText: 'Recovery guide' }).click()
  await page.waitForFunction(() => /recovery guide/i.test(document.querySelector('.about-body')?.textContent ?? ''))
  await page.locator('.about-link', { hasText: 'Dependencies' }).click()
  await page.waitForFunction(() => /electron/i.test(document.querySelector('.about-body')?.textContent ?? ''))
  await page.locator('.about-link', { hasText: 'Uninstalling' }).click()
  await page.waitForFunction(() => /Applications folder/.test(document.querySelector('.about-body')?.textContent ?? ''))
  await page.keyboard.press('Escape')
  step('Help menu opens About, the recovery guide, dependencies, and uninstall instructions in the app')

  // 5. The command-line export regenerates page.html files and combines pages.
  await app.close()
  const out = join(base, 'combined.html')
  const r = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/pagebinder-export.ts'), root, '--combine', out], { cwd: resolve('.'), encoding: 'utf8' })
  assert(r.status === 0, `export script ran (${r.stderr})`)
  const html = await fs.readFile(out, 'utf8')
  assert(html.includes('First version text') && html.includes('version from'), 'combined HTML holds every page')
  step('the command-line export combines a notebook into one HTML file')

  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
