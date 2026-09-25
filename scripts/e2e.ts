/**
 * End-to-end check of phase 1 through the real Electron window.
 *   npm run e2e
 */
import { _electron as electron, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import { verifyChecksum } from '../src/main/storage/checksum'
import type { PageDoc, TextContainer } from '../src/shared/types'

async function newBox(page: Page, x: number, y: number): Promise<void> {
  await page.locator('.canvas').click({ button: 'right', position: { x, y } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  // The new box takes focus a moment after it appears.
  await page.waitForTimeout(250)
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}

async function readDoc(path: string): Promise<PageDoc> {
  return JSON.parse(await fs.readFile(path, 'utf8')) as PageDoc
}

async function launch(root: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')
  return { page, close: () => app.close() }
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'E2E notebook')
  const notes = await createSection(root, '', 'Notes', '#D85A30')
  const first = await createPage(root, notes, 'First page')
  const shots = process.env['E2E_SHOTS'] ?? base
  await fs.mkdir(shots, { recursive: true })
  const steps: string[] = []
  const step = (s: string): void => {
    steps.push(s)
    process.stdout.write(`  ✓ ${s}\n`)
  }

  let { page, close } = await launch(root)

  // 1. Notebook opened, section and page visible.
  assert(await page.locator('.tab.on', { hasText: 'Notes' }).count(), 'Notes section tab is active')
  assert(await page.locator('.page-row.on', { hasText: 'First page' }).count(), 'first page opened')
  step('opens the notebook on its first section and page')

  // 2. Type into the default container, wait for the draft.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.type('Hello from the e2e test.')
  await page.waitForTimeout(2500)
  const draftPath = join(root, first.relPath, 'page.json.autosave')
  assert(await fs.stat(draftPath).then(() => true, () => false), 'autosave draft written after typing')
  step('writes an autosave draft after typing')

  // 3. Cmd+S saves, snapshot appears, draft removed, checksum valid.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
  const saved = await readDoc(join(root, first.relPath, 'page.json'))
  assert(verifyChecksum(saved), 'saved page has a valid checksum')
  assert(JSON.stringify(saved.objects).includes('Hello from the e2e test.'), 'typed text is in page.json')
  const history = await fs.readdir(join(root, first.relPath, '.history'))
  assert(history.length === 1, `one history snapshot after first save (got ${history.length})`)
  assert(!(await fs.stat(draftPath).then(() => true, () => false)), 'draft removed after clean save')
  step('Cmd+S saves with a history snapshot and clears the draft')

  // 4. Formatting: bold via toolbar.
  await page.keyboard.press('Shift+Home')
  await page.locator('.tb.bold').click()
  await page.waitForTimeout(100)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
  const bolded = await readDoc(join(root, first.relPath, 'page.json'))
  assert(JSON.stringify(bolded.objects).includes('"type":"bold"'), 'bold mark saved')
  step('toolbar formatting is applied and saved')

  // 5. Click empty canvas to create a second container and type into it.
  await newBox(page, 560, 520)
  await page.waitForTimeout(200)
  await page.keyboard.type('Second container')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
  const two = await readDoc(join(root, first.relPath, 'page.json'))
  assert(two.objects.length === 2, `two containers on the page (got ${two.objects.length})`)
  assert(two.objects[1]!.x > 400, 'second container placed where clicked')
  step('clicking the canvas creates a movable text container')

  // 5b. A container placed below the first sheet makes a second sheet appear.
  await newBox(page, 200, 1150)
  await page.waitForTimeout(200)
  await page.keyboard.type('On the second sheet')
  await page.waitForTimeout(200)
  assert((await page.locator('.paper').count()) === 2, `two sheets drawn (got ${await page.locator('.paper').count()})`)
  assert(await page.locator('.page-number', { hasText: 'Page 2 of 2' }).count(), 'page number shown on the second sheet')
  step('content below the first sheet adds a second sheet outline')

  // 6. Rename the page from the page list; folder renames.
  await page.locator('.page-row.on').dblclick()
  await page.locator('.page-row.renaming input').fill('Renamed page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Renamed page")')
  await page.waitForTimeout(500)
  const folders = await fs.readdir(join(root, notes))
  assert(folders.includes('Renamed page.page'), `folder renamed (got ${folders.join(', ')})`)
  assert(await page.locator('.page-row.on', { hasText: 'Renamed page' }).count(), 'page list shows new title')
  step('changing the title renames the page folder')

  // 7. Add a page from the list, add a section from the + menu.
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Fresh page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Fresh page")')
  assert(await fs.stat(join(root, notes, 'Fresh page.page', 'page.json')).then(() => true, () => false), 'new page folder named from inline rename')
  step('Add page creates a page and names it inline')
  await page.locator('.tab.add').click()
  await page.locator('.context-item', { hasText: /^New section…$/ }).click()
  await page.locator('.dialog input').fill('Second section')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.tab.on:has-text("Second section")')
  assert(await fs.stat(join(root, 'Second section', 'section.json')).then(() => true, () => false), 'section folder created')
  step('New section is created from the + menu')

  // 8. Simulate an unsaved draft and a crash: corrupt page.json, leave a newer draft.
  await close()
  const renamedRel = `${notes}/Renamed page.page`
  const docPath = join(root, renamedRel, 'page.json')
  const good = await readDoc(docPath)
  const draft: PageDoc = { ...good, modified: new Date(Date.now() + 1000).toISOString() }
  draft.objects = [{ ...(draft.objects[0] as TextContainer), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DRAFT TEXT' }] }] } }]
  const { withChecksum } = await import('../src/main/storage/checksum')
  await fs.writeFile(join(root, renamedRel, 'page.json.autosave'), JSON.stringify(withChecksum(draft)))
  const text = await fs.readFile(docPath, 'utf8')
  await fs.writeFile(docPath, text.slice(0, text.length / 2))
  ;({ page, close } = await launch(root))
  // The damaged page is the first in its section, so it opens automatically.
  await page.waitForSelector('.notice.recovered-from-history')
  await page.waitForSelector('.notice.draft-available')
  // The newest snapshot predates the rename, so the recovered title is the older one.
  assert(await page.locator('.page-row.on', { hasText: 'First page' }).count(), 'recovered page shows the snapshot title')
  await page.screenshot({ path: join(shots, 'recovery.png') })
  step('a damaged page is recovered from history and the draft is offered')
  await page.locator('.notice.draft-available button.primary').click()
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(400)
  const restored = await readDoc(docPath)
  assert(verifyChecksum(restored), 'restored page has a valid checksum')
  assert(JSON.stringify(restored.objects).includes('DRAFT TEXT'), 'draft content restored and saved')
  const leftovers = await fs.readdir(join(root, renamedRel))
  assert(leftovers.some((n) => n.startsWith('page.json.corrupt-')), 'damaged file kept for inspection')
  step('Restore writes the draft as the current page')

  // The page list follows the restored title once the tree refresh arrives, which takes longer on a busy machine.
  const titled = await page.locator('.page-row.on', { hasText: 'Renamed page' }).waitFor({ timeout: 5000 }).then(() => true, () => false)
  assert(titled, 'draft title restored')
  await page.screenshot({ path: join(shots, 'final.png') })
  await close()
  process.stdout.write(`\nPASS: ${steps.length} steps. Notebook kept at ${root}\n`)
}

main().catch(async (err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
