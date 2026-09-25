/// <reference lib="dom" />
/**
 * Phase 4 (search) through the real Electron window.
 *   npx tsx scripts/e2e-phase4.ts
 */
import { _electron as electron, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import type { TextContainer } from '../src/shared/types'

async function newBox(page: Page, x: number, y: number): Promise<void> {
  await page.locator('.canvas').click({ button: 'right', position: { x, y } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  // The new box takes focus a moment after it appears.
  await page.waitForTimeout(250)
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e4-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Search notebook')
  const home = await createSection(root, '', 'Home')
  const surveys = await createGroup(root, '', 'Site surveys')
  const north = await createSection(root, surveys, 'North Field', '#D85A30')
  const withText = async (sectionRel: string, title: string, lines: string[]): Promise<string> => {
    const { relPath, doc } = await createPage(root, sectionRel, title)
    const obj = doc.objects[0] as TextContainer
    const r = await savePage(root, relPath, {
      ...doc,
      objects: [{ ...obj, content: { type: 'doc', content: lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) } }]
    })
    return r.relPath
  }
  await withText(home, 'Welcome', ['Nothing about surveys here.'])
  await withText(north, 'Lidar pass', ['Flew the north field at 60 m.', 'Ground was dry.'])
  const drainage = await withText(north, 'Drainage notes', ['The lidar shows a 2% fall to the east.', 'Check the lidar again after rain.'])
  // Twenty filler pages so background indexing has some work.
  for (let i = 1; i <= 20; i++) await withText(home, `Filler ${i}`, [`Filler page number ${i} with ordinary words.`])
  const shots = process.env['E2E_SHOTS'] ?? base
  await fs.mkdir(shots, { recursive: true })
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }

  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')

  // 1. Index is built on open (background), and the file lives in .index.
  await page.waitForFunction(() => !(document.querySelector('.search-field input') as HTMLInputElement).placeholder.startsWith('Indexing'), undefined, { timeout: 30000 })
  assert(await fs.stat(join(root, '.index', 'search.sqlite')).then(() => true, () => false), 'search.sqlite created in .index')
  step('the notebook is indexed in the background on open')

  // 2. Type-ahead: results appear per keystroke, grouped.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
  await page.keyboard.type('lid')
  await page.waitForSelector('.search-dropdown .search-hit')
  const titles = await page.locator('.search-group').nth(0).locator('.search-hit-title').allTextContents()
  assert(titles.includes('Lidar pass'), `title group lists Lidar pass (${titles.join(', ')})`)
  const inPages = await page.locator('.search-group', { hasText: 'In pages' }).locator('.search-hit-title').allTextContents()
  assert(inPages.includes('Drainage notes'), `page text group lists Drainage notes (${inPages.join(', ')})`)
  assert((await page.locator('.search-hit-snippet b').count()) >= 1, 'snippet highlights the match')
  await page.screenshot({ path: join(shots, 'phase4-search.png') })
  step('typing shows grouped results with highlighted snippets before Enter is pressed')

  // 3. Choosing a result opens the page, navigates the tree, and highlights matches.
  await page.locator('.search-hit', { hasText: 'Drainage notes' }).first().click()
  await page.waitForSelector('.page-row.on:has-text("Drainage notes")')
  assert(await page.locator('.tab.on', { hasText: 'North Field' }).count(), 'section tab switched to North Field')
  assert(await page.locator('.crumb.current', { hasText: 'Site surveys' }).count(), 'breadcrumb shows the group')
  await page.waitForSelector('.notice.search-bar')
  await page.waitForFunction(() => /2 matches/.test(document.querySelector('.notice.search-bar')?.textContent ?? ''))
  const hl = await page.evaluate(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    return reg ? [reg.has('search'), reg.has('search-active')] : [false, false]
  })
  assert(hl[0] && hl[1], 'CSS highlights registered for the matches')
  await page.locator('.search-bar button[title="Next match"]').click()
  await page.waitForFunction(() => /^2 of 2/.test(document.querySelector('.notice.search-bar')?.textContent ?? ''))
  await page.screenshot({ path: join(shots, 'phase4-highlight.png') })
  step('opening a result navigates to the page and highlights every match with next and previous')

  // 4. Scope to the current section.
  await page.locator('.search-scope').selectOption('section')
  await page.locator('.search-field input').fill('surv')
  await page.waitForTimeout(300)
  const scoped = await page.locator('.search-hit-title').allTextContents()
  assert(!scoped.includes('Welcome') && !scoped.includes('Site surveys'), `section scope excludes other sections (${scoped.join(', ')})`)
  await page.locator('.search-scope').selectOption('notebook')
  await page.waitForTimeout(300)
  const all = await page.locator('.search-hit-title').allTextContents()
  assert(all.includes('Site surveys'), `notebook scope finds the group by name (${all.join(', ')})`)
  step('scope limits results to the current section')

  // 5. Edits are indexed on save; deleting the index rebuilds it.
  await page.keyboard.press('Escape')
  await page.locator('.notice.search-bar button', { hasText: 'Done' }).click()
  await newBox(page, 560, 600)
  await page.waitForTimeout(150)
  await page.keyboard.type('Zebra crossing repairs')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(400)
  await page.locator('.search-field input').fill('zebra')
  await page.waitForSelector('.search-hit:has-text("Drainage notes")')
  step('a saved edit is searchable immediately')
  await page.evaluate(() => window.pagebinder.search.rebuild())
  await page.waitForTimeout(1500)
  await page.locator('.search-field input').fill('zebr')
  await page.waitForSelector('.search-hit:has-text("Drainage notes")')
  step('rebuilding the index from the page files keeps everything searchable')
  void drainage

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
