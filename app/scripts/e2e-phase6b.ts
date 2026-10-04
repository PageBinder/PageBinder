/// <reference lib="dom" />
/**
 * Templates notebook through the real Electron window.
 *   npx tsx scripts/e2e-phase6b.ts
 */
import { _electron as electron, type Page } from 'playwright'
import { useApp, saveViaMenu } from './e2e-save'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import { saveAsTemplate, libraryDir } from '../src/main/storage/templates'
import type { PageDoc, TextContainer } from '../src/shared/types'
import { tealPng } from './png'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
async function save(page: Page): Promise<void> {
  await saveViaMenu(page)
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e6b-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const userData = join(base, 'userData')
  const root = await createNotebook(base, 'Templates test')
  const sec = await createSection(root, '', 'Work', '#1D9E75')
  const { relPath, doc } = await createPage(root, sec, 'Visit form')
  const obj = doc.objects[0] as TextContainer
  // The template carries a picture on the page and one inside its text box.
  await fs.writeFile(join(root, relPath, 'images', 'logo.png'), tealPng())
  await savePage(root, relPath, {
    ...doc,
    objects: [
      { ...obj, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original template text' }] }] }, pictures: [{ id: 'p1', name: 'logo.png', originalName: 'logo.png', x: 0, y: 0, width: 40, height: 40 }] },
      { kind: 'image', id: 'i1', x: 400, y: 300, width: 64, height: 64, name: 'logo.png', originalName: 'logo.png' }
    ]
  })
  const picturePath = join(base, 'stamp.png')
  await fs.writeFile(picturePath, tealPng())
  const globalDir = join(userData, 'templates')
  await saveAsTemplate(root, relPath, globalDir, 'global', 'Visit form', '')
  // A notebook-only template from an earlier version, used as a section's default: neither is shown or used now.
  await saveAsTemplate(root, relPath, libraryDir(root, 'notebook', ''), 'notebook', 'Old notebook form', '')
  const oldSec = await createSection(root, '', 'Old default', '#D85A30')
  const secMetaPath = join(root, oldSec, 'section.json')
  await fs.writeFile(secMetaPath, JSON.stringify({ ...JSON.parse(await fs.readFile(secMetaPath, 'utf8')), defaultTemplate: 'notebook:Old notebook form.template' }))
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }

  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root, PAGEBINDER_TEST_PICK_IMAGES: picturePath } })
  const page = await app.firstWindow()
  useApp(app)
  await page.waitForSelector('.section-tabs')

  // 1. The Templates notebook is a system notebook on the switch screen: one section per library.
  await page.locator('.notebook-button').click()
  const items = await page.locator('.context-item').allTextContents()
  assert(items.length === 1 && items[0]!.startsWith('Switch notebook'), `notebook menu offers only Switch notebook (${items.join(', ')})`)
  await page.locator('.context-item', { hasText: 'Switch notebook' }).click()
  await page.waitForSelector('.welcome')
  await page.locator('.recent-list button', { hasText: 'Templates' }).first().click()
  await page.waitForSelector('.notebook-button.templates')
  const tabs = await page.locator('.section-tabs .tab').allTextContents()
  assert(tabs.length === 1 && tabs[0]!.includes('Global templates'), `only the Global templates section is shown (${tabs.join(', ')})`)
  assert(!(await page.locator('.page-row', { hasText: 'Old notebook form' }).count()), 'a notebook-only template from an earlier version is not shown')
  await page.waitForSelector('.page-row.on:has-text("Visit form")')
  assert(await page.locator('.text-container', { hasText: 'Original template text' }).count(), 'template opens as a page')
  // Its pictures show (they load from the template library, with no notebook open).
  const loaded = async (sel: string): Promise<boolean> => {
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate((q) => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(q))
        return imgs.length > 0 && imgs.every((im) => im.complete && im.naturalWidth > 0)
      }, sel)
      if (ok) return true
      await page.waitForTimeout(100)
    }
    return false
  }
  assert(await loaded('.canvas .image-object img'), 'a picture on a template page shows')
  assert(await loaded('.canvas .anchored-picture-frame img'), 'a picture in a text box on a template page shows')
  // A picture inserted while editing a template shows too.
  await page.locator('.canvas').click({ position: { x: 700, y: 900 } })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:insertImage'))
  await page.waitForFunction(() => document.querySelectorAll('.canvas .image-object img').length === 2)
  assert(await loaded('.canvas .image-object img'), 'a picture inserted into a template page shows')
  await saveViaMenu(page)
  step('the Templates notebook shows only global templates as pages, pictures included')

  // 2. Edit the template in place: the template file changes; pages made later carry the edit.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' plus an edit')
  await save(page)
  const tdoc = JSON.parse(await fs.readFile(join(globalDir, 'Visit form.template', 'page.json'), 'utf8')) as PageDoc
  assert(JSON.stringify(tdoc.objects).includes('plus an edit'), 'template page.json updated in place')
  assert(!(await fs.readdir(globalDir)).some((n) => n.endsWith('.page')), 'template folder kept its .template name')
  step('editing a template page changes the template itself')

  // 3. Rename the template from the list; template.json follows.
  await page.locator('.page-row.on').dblclick()
  await page.locator('.page-row.renaming input').fill('Visit form v2')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  await page.waitForTimeout(300)
  const tmeta = JSON.parse(await fs.readFile(join(globalDir, 'Visit form.template', 'template.json'), 'utf8')) as { name: string }
  assert(tmeta.name === 'Visit form v2', 'template name follows the page title')
  step('renaming a template page renames the template')

  // 5. Back in the notebook, the global template is offered and carries the edit.
  await page.locator('.notebook-button').click()
  await page.locator('.context-item', { hasText: 'Switch notebook' }).click()
  await page.waitForSelector('.welcome')
  await page.locator('.recent-list button', { hasText: 'Templates test' }).first().click()
  await page.waitForSelector('.notebook-button:not(.templates)')
  await page.locator('.tab', { hasText: 'Work' }).click()
  await page.locator('.page-list-head .icon').click()
  const offered = await page.locator('.context-item').allTextContents()
  assert(!offered.some((t) => t.includes('Old notebook form')), `the Add page menu offers no notebook-only template (${offered.join(' | ')})`)
  await page.locator('.context-item', { hasText: 'From template: Visit form v2' }).click()
  await page.waitForSelector('.page-row.renaming input')
  assert((await page.locator('.page-row.renaming input').inputValue()) === 'Visit form v2', 'new page named after the template')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const made = JSON.parse(await fs.readFile(join(root, sec, 'Visit form v2.page', 'page.json'), 'utf8')) as PageDoc
  assert(JSON.stringify(made.objects).includes('plus an edit'), 'pages made after the edit carry it')
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  assert(await loaded('.canvas .image-object img'), "a page made from the template shows the template's pictures")
  step('global templates are offered in the notebook with their latest content and pictures')

  // A section whose default is an old notebook-only template makes blank pages; the menu shows no default.
  await page.locator('.tab', { hasText: 'Old default' }).click()
  await page.locator('.tab', { hasText: 'Old default' }).click({ button: 'right' })
  const secMenu = await page.locator('.context-item').allTextContents()
  assert(secMenu.some((t) => t.startsWith('Default template: blank page')) && !secMenu.some((t) => t.includes('Old notebook form')), `the section menu shows no notebook-only template (${secMenu.join(' | ')})`)
  await page.keyboard.press('Escape')
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Fresh page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Fresh page")')
  await page.waitForTimeout(300)
  const fresh = JSON.parse(await fs.readFile(join(root, oldSec, 'Fresh page.page', 'page.json'), 'utf8')) as PageDoc
  assert(!JSON.stringify(fresh.objects).includes('Original template text'), 'a notebook-only default template is no longer used: the new page is blank')
  step('notebook-only templates from earlier versions are no longer shown or used')

  // 6. Deleting a template page removes it from the library.
  await page.locator('.notebook-button').click()
  await page.locator('.context-item', { hasText: 'Switch notebook' }).click()
  await page.waitForSelector('.welcome')
  await page.locator('.recent-list button', { hasText: 'Templates' }).first().click()
  await page.waitForSelector('.notebook-button.templates')
  await page.locator('.tab', { hasText: 'Global templates' }).click()
  await page.waitForSelector('.page-row:has-text("Visit form v2")')
  await page.locator('.page-row', { hasText: 'Visit form v2' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Delete template' }).click()
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction(() => !document.querySelector('.page-row:not(.add)'))
  assert(!(await fs.readdir(globalDir)).includes('Visit form.template'), 'template removed from the library')
  step('deleting a template page removes it from the available templates')

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
