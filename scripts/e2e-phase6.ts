/// <reference lib="dom" />
/**
 * Phase 6 (templates, move and copy) through the real Electron window.
 *   npx tsx scripts/e2e-phase6.ts
 */
import { _electron as electron, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
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
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
async function save(page: Page): Promise<void> {
  await page.keyboard.press(`${mod}+s`)
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
}

/** The window, kept so a failure can be photographed (E2E_SHOTS) with its size on record. */
let shownPage: Page | undefined

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e6-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const userData = join(base, 'userData')
  const root = await createNotebook(base, 'Phase 6 notebook')
  const surveys = await createSection(root, '', 'Surveys', '#1D9E75')
  const archive = await createGroup(root, '', 'Archive')
  const old = await createSection(root, archive, 'Old', '#888780')
  const { relPath: formRel, doc } = await createPage(root, surveys, 'Survey form')
  const obj = doc.objects[0] as TextContainer
  await savePage(root, formRel, { ...doc, objects: [{ ...obj, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Survey of {{section}} in {{notebook}}, made on {{date}}' }] }] } }] })
  await createPage(root, old, 'Old notes')
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  const pages = async (sec: string): Promise<string[]> => (await fs.readdir(join(root, sec))).filter((n) => n.endsWith('.page')).sort()

  const app = await electron.launch({
    args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`],
    cwd: resolve('.'),
    env: { ...process.env, PAGEBINDER_OPEN: root }
  })
  const page = await app.firstWindow()
  shownPage = page
  await page.waitForSelector('.section-tabs')

  // 1. Save the page as a notebook template, then make a page from it: placeholders filled.
  await page.locator('.page-row', { hasText: 'Survey form' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Save as template' }).click()
  await page.locator('.dialog input').first().fill('Survey page')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.dialog', { state: 'detached' })
  assert(await fs.stat(join(root, 'templates', 'Survey page.template', 'page.json')).then(() => true, () => false), 'template folder written in the notebook')
  await page.locator('.page-list-head .icon').click()
  await page.locator('.context-item', { hasText: 'From template: Survey page' }).click()
  await page.waitForSelector('.page-row.renaming input')
  assert((await page.locator('.page-row.renaming input').inputValue()) === 'Survey page', 'a page made from a template is named after the template')
  await page.locator('.page-row.renaming input').fill('Ridge Road')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Ridge Road")')
  await page.waitForTimeout(300)
  const made = JSON.parse(await fs.readFile(join(root, surveys, 'Ridge Road.page', 'page.json'), 'utf8')) as PageDoc
  const text = JSON.stringify(made.objects)
  assert(text.includes('Survey of Surveys in Phase 6 notebook, made on ') && !text.includes('{{'), `placeholders filled (${text.slice(0, 120)})`)
  step('a page becomes a template and new pages from it have placeholders filled')

  // 2. Default template for the section: the plain + button uses it.
  await page.locator('.tab', { hasText: 'Surveys' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Use “Survey page”' }).click()
  await page.waitForTimeout(300)
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('North Field')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("North Field")')
  await page.waitForTimeout(300)
  const def = JSON.parse(await fs.readFile(join(root, surveys, 'North Field.page', 'page.json'), 'utf8')) as PageDoc
  assert(JSON.stringify(def.objects).includes('Survey of Surveys'), 'the section default template was used for Add page')
  step('a section default template applies to Add page')

  // 3. Copy a page, then paste it into another section from the Add page menu.
  await page.locator('.page-row', { hasText: 'Ridge Road' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Copy page' }).click()
  await page.locator('.tab.group', { hasText: 'Archive' }).click()
  await page.locator('.tab', { hasText: 'Old' }).click()
  await page.waitForSelector('.page-list-head .icon')
  await page.locator('.page-list-head .icon').click()
  await page.locator('.context-item', { hasText: 'Paste page here' }).click()
  await page.waitForSelector('.page-row.on:has-text("Ridge Road")')
  await page.waitForTimeout(300)
  assert((await pages(old)).includes('Ridge Road.page') && (await pages(surveys)).includes('Ridge Road.page'), 'the pasted copy exists in both sections')
  const copyDoc = JSON.parse(await fs.readFile(join(root, old, 'Ridge Road.page', 'page.json'), 'utf8')) as PageDoc
  assert(copyDoc.id !== made.id, 'copy has its own id')
  assert((await page.locator('.context-item', { hasText: 'Move or copy' }).count()) === 0, 'pages no longer offer Move')
  step('a page is copied with Copy page and pasted from the Add page menu')

  // 4. Undo removes the pasted page; redo brings it back.
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForFunction((sec) => !Array.from(document.querySelectorAll('.page-row')).some((r) => r.textContent?.includes('Ridge Road')), old)
  assert(!(await pages(old)).includes('Ridge Road.page'), 'undo removed the pasted page')
  await page.keyboard.press(`Shift+${mod}+z`)
  await page.waitForSelector('.page-row.on:has-text("Ridge Road")')
  step('pasting a page is undoable')
  await page.locator('.crumb', { hasText: 'Phase 6 notebook' }).first().click()
  await page.locator('.tab.add').click()
  await page.locator('.context-item', { hasText: /^New section…$/ }).click()
  await page.locator('.dialog input').fill('Done')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.tab.on:has-text("Done")')

  // 5. Move a section into a group, copy it back to the root, delete it, restore it.
  await page.locator('.tab', { hasText: 'Done' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Move or copy' }).click()
  await page.locator('.target-row', { hasText: 'Archive' }).click()
  await page.locator('.dialog button', { hasText: 'Move' }).click()
  await page.waitForSelector('.dialog', { state: 'detached' })
  await page.waitForSelector('.crumb.current:has-text("Archive")')
  assert(await fs.stat(join(root, 'Archive', 'Done', 'section.json')).then(() => true, () => false), 'section moved into the group')
  await page.locator('.tab', { hasText: 'Done' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Delete section' }).click()
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.dialog', { state: 'detached' })
  await page.waitForTimeout(300)
  assert(!(await fs.stat(join(root, 'Archive', 'Done')).then(() => true, () => false)), 'section moved to the recycle folder')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:recycle'))
  await page.waitForSelector('.recycle-row:has-text("Section")')
  await page.locator('.recycle-row', { hasText: 'Done' }).locator('button', { hasText: 'Restore' }).click()
  await page.waitForTimeout(500)
  assert(await fs.stat(join(root, 'Archive', 'Done', 'section.json')).then(() => true, () => false), 'section restored into its group')
  await page.locator('.dialog button', { hasText: 'Close' }).click()
  await page.waitForSelector('.dialog', { state: 'detached' })
  step('sections move between groups, and a deleted section can be restored')

  // 6. Rubber-band selection: drag over two boxes, move them together, delete them together, undo both.
  await page.locator('.crumb', { hasText: 'Phase 6 notebook' }).first().click()
  await page.locator('.tab', { hasText: 'Surveys' }).click()
  await page.locator('.page-row', { hasText: 'North Field' }).click()
  await page.waitForSelector('.text-container')
  await page.locator('.canvas-scroll').evaluate((el) => el.scrollTo(0, 0))
  await newBox(page, 300, 400)
  await page.waitForTimeout(150)
  await page.keyboard.type('Box A')
  await newBox(page, 700, 400)
  await page.waitForTimeout(150)
  await page.keyboard.type('Box B')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await page.locator('.canvas-scroll').evaluate((el) => el.scrollTo(0, 0))
  const canvasBox = (await page.locator('.canvas').boundingBox())!
  // Drag a box from an empty spot across both new boxes.
  await page.mouse.move(canvasBox.x + 250, canvasBox.y + 360)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + 900, canvasBox.y + 470, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const selectedCount = await page.locator('.text-container.selected').count()
  if (selectedCount < 2) {
    const boxes = await page.evaluate(() => Array.from(document.querySelectorAll('.text-container')).map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` }).join('; '))
    throw new Error(`ASSERT: rubber band selected the boxes (${selectedCount}); canvas at ${Math.round(canvasBox.x)},${Math.round(canvasBox.y)}; boxes ${boxes}`)
  }
  const before = (await page.evaluate(() => Array.from(document.querySelectorAll('.text-container.selected')).map((el) => (el as HTMLElement).style.left)))
  const handle = page.locator('.text-container.selected .container-handle').first()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 3)
  const underMouse = await page.evaluate(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.className ?? 'nothing', [hb.x + hb.width / 2, hb.y + 3])
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + 3 + 90, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const after = (await page.evaluate(() => Array.from(document.querySelectorAll('.text-container.selected')).map((el) => (el as HTMLElement).style.left)))
  assert(after.length === before.length && after.every((l, i) => parseInt(l, 10) > parseInt(before[i]!, 10) + 60), `all selected boxes moved together (${before.join(',')} -> ${after.join(',')}; handle at ${Math.round(hb.x)},${Math.round(hb.y)} ${Math.round(hb.width)}x${Math.round(hb.height)}, under the mouse: ${underMouse})`)
  const total = await page.locator('.text-container').count()
  await page.keyboard.press('Delete')
  await page.waitForTimeout(150)
  assert((await page.locator('.text-container').count()) === total - selectedCount, 'Delete removed every selected box')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  assert((await page.locator('.text-container').count()) === total, 'one undo brought the group back')
  step('rubber-band selection moves and deletes objects as a group, with undo')

  // 7. Notebook-level undo: page creation, deletion, and moves.
  const pagesBefore = await page.locator('.page-row:not(.add)').count()
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Temporary')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Temporary")')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForFunction((n) => document.querySelectorAll('.page-row:not(.add)').length === n, pagesBefore)
  assert(!(await pages(surveys)).includes('Temporary.page'), 'undo removed the created page')
  await page.keyboard.press(`Shift+${mod}+z`)
  await page.waitForSelector('.page-row.on:has-text("Temporary")')
  assert((await pages(surveys)).includes('Temporary.page'), 'redo brought the page back')
  await page.locator('.page-row', { hasText: 'Temporary' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Delete page' }).click()
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction((n) => document.querySelectorAll('.page-row:not(.add)').length === n, pagesBefore)
  await page.keyboard.press(`${mod}+z`)
  await page.waitForSelector('.page-row.on:has-text("Temporary")')
  assert((await pages(surveys)).includes('Temporary.page'), 'undo restored the deleted page')
  step('undo and redo cover page creation and deletion')

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch(async (err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  if (shownPage) {
    try {
      const size = await shownPage.evaluate(() => `window ${window.innerWidth}x${window.innerHeight}, screen ${screen.width}x${screen.height}`)
      process.stderr.write(`  ${size}\n`)
      const dir = process.env['E2E_SHOTS']
      if (dir) {
        await fs.mkdir(dir, { recursive: true })
        await shownPage.screenshot({ path: join(dir, 'phase6-failure.png') })
      }
    } catch {
      /* the window may already be gone */
    }
  }
  process.exit(1)
})
