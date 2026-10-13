/// <reference lib="dom" />
/**
 * The Templates notebook through the real Electron window: an ordinary notebook in the settings
 * folder, whose pages are the templates offered in every notebook.
 *   npx tsx scripts/e2e-phase6b.ts
 */
import { _electron as electron } from 'playwright'
import { useApp, saveViaMenu } from './e2e-save'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import { ensureTemplatesNotebook, saveAsTemplate } from '../src/main/storage/templates'
import type { PageDoc, TextContainer } from '../src/shared/types'
import { tealPng } from './png'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

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
  const tdir = join(userData, 'Templates notebook')
  await ensureTemplatesNotebook(tdir)
  await saveAsTemplate(root, relPath, tdir, 'General', 'Visit form')
  // Left by an earlier version: a template in the old library, named as a section's default. Neither is used now.
  const oldLib = join(userData, 'templates', 'Old form.template')
  await fs.cp(join(root, relPath), oldLib, { recursive: true })
  await fs.writeFile(join(oldLib, 'template.json'), JSON.stringify({ format: 1, id: 'old1', name: 'Old form', description: '', created: '2026-10-01T00:00:00.000Z' }))
  const oldSec = await createSection(root, '', 'Old default', '#D85A30')
  const secMetaPath = join(root, oldSec, 'section.json')
  await fs.writeFile(secMetaPath, JSON.stringify({ ...JSON.parse(await fs.readFile(secMetaPath, 'utf8')), defaultTemplate: 'global:Old form.template' }))
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  const pagesIn = async (dir: string): Promise<string[]> => (await fs.readdir(dir)).filter((n) => n.endsWith('.page')).sort()
  const readDoc = async (dir: string): Promise<PageDoc> => JSON.parse(await fs.readFile(join(dir, 'page.json'), 'utf8')) as PageDoc

  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root, PAGEBINDER_TEST_PICK_IMAGES: picturePath } })
  const page = await app.firstWindow()
  useApp(app)
  await page.waitForSelector('.section-tabs')
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
  const switchScreen = async (): Promise<void> => {
    await page.locator('.notebook-button').click()
    await page.locator('.context-item', { hasText: 'Switch notebook' }).click()
    await page.waitForSelector('.welcome')
  }

  // 1. The Templates notebook opens from the start screen like any notebook. A picture copied on a
  //    notebook page pastes into a template, its file copied across.
  await page.waitForSelector('.page-row.on:has-text("Visit form")')
  await page.locator('.canvas .image-object').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Copy$/ }).click()
  await switchScreen()
  await page.locator('.recent-list button', { hasText: 'Templates' }).first().click()
  await page.waitForSelector('.notebook-button.templates')
  const tabs = await page.locator('.section-tabs .tab:not(.add)').allTextContents()
  assert(tabs.length === 1 && tabs[0] === 'General', `the Templates notebook starts with its General section (${tabs.join(', ')})`)
  assert(await page.locator('.section-tabs .tab.add').count(), 'sections can be added to the Templates notebook')
  assert(!(await page.locator('.page-row', { hasText: 'Old form' }).count()), 'a template from an earlier version is not shown')
  await page.waitForSelector('.page-row.on:has-text("Visit form")')
  assert(await page.locator('.text-container', { hasText: 'Original template text' }).count(), 'a template opens as a page')
  assert(await loaded('.canvas .image-object img'), 'a picture on a template page shows')
  assert(await loaded('.canvas .anchored-picture-frame img'), 'a picture in a text box on a template page shows')
  await page.locator('.canvas').click({ position: { x: 700, y: 900 } })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:insertImage'))
  await page.waitForFunction(() => document.querySelectorAll('.canvas .image-object img').length === 2)
  await page.locator('.canvas').click({ button: 'right', position: { x: 650, y: 950 } })
  await page.locator('.context-item', { hasText: /^Paste$/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('.canvas .image-object img').length === 3)
  assert(await loaded('.canvas .image-object img'), 'a picture inserted into a template, and one pasted from another notebook, show')
  await saveViaMenu(page)
  const general = join(tdir, 'General')
  const tpage = join(general, 'Visit form.page')
  const tpics = await fs.readdir(join(tpage, 'images'))
  assert(tpics.length === 3, `the inserted and pasted pictures were copied into the template's folder (${tpics.join(', ')})`)
  step('the Templates notebook opens like any notebook, with its pictures, and takes a picture pasted from another notebook')

  // 2. Editing a template changes the template itself; its placeholders stay as they are.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' plus an edit made {{date}}')
  await saveViaMenu(page)
  assert(JSON.stringify((await readDoc(tpage)).objects).includes('plus an edit made {{date}}'), 'the template page changed in place, its placeholder kept')
  step('editing a template changes the template, placeholders and all')

  // 3. Renaming a template renames its page, folder and all, as in any notebook.
  await page.locator('.page-row.on').dblclick()
  await page.locator('.page-row.renaming input').fill('Visit form v2')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  await page.waitForTimeout(300)
  assert(JSON.stringify(await pagesIn(general)) === JSON.stringify(['Visit form v2.page']), `the template's page took the new name (${await pagesIn(general)})`)
  const tpage2 = join(general, 'Visit form v2.page')
  const templateId = (await readDoc(tpage2)).id
  step('renaming a template renames its page')

  // 4. New sections; a template cut in one section moves on paste into another, and undo moves it back.
  await page.locator('.tab.add').click()
  await page.locator('.context-item', { hasText: /^New section…$/ }).click()
  await page.locator('.dialog input').fill('Farm')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.tab.on:has-text("Farm")')
  const farm = join(tdir, 'Farm')
  await page.locator('.tab', { hasText: 'General' }).click()
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  await page.locator('.page-row', { hasText: 'Visit form v2' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Cut template$/ }).click()
  await page.locator('.tab', { hasText: 'Farm' }).click()
  await page.locator('.page-list-head .icon').click()
  await page.locator('.context-item', { hasText: 'Paste template here: Visit form v2' }).click()
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  assert(JSON.stringify(await pagesIn(farm)) === JSON.stringify(['Visit form v2.page']) && !(await pagesIn(general)).length, 'cut and paste moved the template to the other section')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForFunction(() => !!document.querySelector('.tab.on')?.textContent?.includes('General') && !!document.querySelector('.page-row.on'))
  assert(JSON.stringify(await pagesIn(general)) === JSON.stringify(['Visit form v2.page']) && !(await pagesIn(farm)).length, 'one undo moved it back')
  step('the Templates notebook takes new sections, and templates cut and paste between them, with undo')

  // 5. Copy and paste make a second template; search looks inside templates.
  await page.locator('.page-row', { hasText: 'Visit form v2' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Copy template$/ }).click()
  await page.locator('.tab', { hasText: 'Farm' }).click()
  await page.locator('.page-list-head .icon').click()
  await page.locator('.context-item', { hasText: 'Paste template here: Visit form v2' }).click()
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  const copyDoc = await readDoc(join(farm, 'Visit form v2.page'))
  assert(copyDoc.id !== templateId && JSON.stringify(copyDoc.objects).includes('plus an edit'), 'the pasted copy is a template of its own with the same content')
  await page.waitForFunction(() => !(document.querySelector('.search-field input') as HTMLInputElement).placeholder.startsWith('Indexing'), undefined, { timeout: 30000 })
  await page.locator('.search-field input').fill('plus an edit')
  await page.waitForSelector('.search-dropdown .search-hit')
  // Both the template moved (by cut, paste, and undo) and its pasted copy are found by their text.
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.search-group')).some((g) => g.textContent?.includes('In pages') && g.querySelectorAll('.search-hit').length >= 2), undefined, { timeout: 5000 }).catch(() => undefined)
  const where = (await page.locator('.search-group', { hasText: 'In pages' }).locator('.search-hit-where').allTextContents()).map((w) => w.replace(/^\W+/, '')).sort()
  assert(JSON.stringify(where) === JSON.stringify(['Farm', 'General']), `search finds the text of moved and pasted templates (${where.join(', ')})`)
  await page.locator('.search-field input').fill('')
  await page.keyboard.press('Escape')
  step('templates copy and paste like pages, and search looks inside them')

  // 6. Deleting a template sends it to the recycle folder, and undo brings it back.
  await page.locator('.page-row', { hasText: 'Visit form v2' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Delete template$/ }).click()
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction(() => !document.querySelector('.page-row:not(.add)'))
  assert(!(await pagesIn(farm)).length, 'the deleted template left its section')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForSelector('.page-row.on:has-text("Visit form v2")')
  assert(JSON.stringify(await pagesIn(farm)) === JSON.stringify(['Visit form v2.page']), 'undo brought the template back')
  step('deleting a template is undoable')

  // 7. In a notebook, Add page offers the templates under their sections; a page made from one
  //    carries its content and pictures, with its placeholders filled. Templates stays out of Recent.
  await switchScreen()
  const recent = await page.locator('.recent-row .recent-name').allTextContents()
  assert(!recent.includes('Templates'), `the Templates notebook stays out of the Recent list (${recent.join(', ')})`)
  await page.locator('.recent-list button', { hasText: 'Templates test' }).first().click()
  await page.waitForSelector('.notebook-button:not(.templates)')
  await page.locator('.tab', { hasText: 'Work' }).click()
  await page.locator('.page-list-head .icon').click()
  const headings = await page.locator('.context-menu .context-heading').allTextContents()
  const offered = await page.locator('.context-item').allTextContents()
  assert(JSON.stringify(headings) === JSON.stringify(['General', 'Farm']), `templates are listed under their sections (${headings.join(', ')})`)
  assert(offered.filter((t) => t === 'From template: Visit form v2').length === 2 && !offered.some((t) => t.includes('Old form')), `both templates are offered and the old one is not (${offered.join(' | ')})`)
  await page.locator('.context-item', { hasText: /^From template: Visit form v2$/ }).nth(1).click()
  await page.waitForSelector('.page-row.renaming input')
  assert((await page.locator('.page-row.renaming input').inputValue()) === 'Visit form v2', 'the new page is named after the template')
  await page.locator('.page-row.renaming input').fill('Site visit')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Site visit")')
  await page.waitForTimeout(300)
  const madeDir = join(root, sec, 'Site visit.page')
  const madeText = JSON.stringify((await readDoc(madeDir)).objects)
  assert(madeText.includes('plus an edit made ') && !madeText.includes('{{date}}'), `the page carries the template's edit, its placeholder filled (${madeText.slice(0, 160)})`)
  assert((await loaded('.canvas .image-object img')) && (await loaded('.canvas .anchored-picture-frame img')), "the page shows the template's pictures")
  assert((await fs.readdir(join(madeDir, 'images'))).length === 3, 'the pictures were copied into the new page')
  step('notebooks offer the templates by section, and pages made from them carry their content and pictures')

  // 8. A section's default template is named by the template's id; same-named templates show their section.
  await page.locator('.tab', { hasText: 'Work' }).click({ button: 'right' })
  assert((await page.locator('.context-menu').innerText()).includes('Default template: blank page'), 'the section has no default yet')
  await page.locator('.context-item', { hasText: 'Use “Visit form v2 (General)”' }).click()
  let defRef: string | undefined
  for (let i = 0; i < 100 && !defRef; i++) {
    defRef = (JSON.parse(await fs.readFile(join(root, sec, 'section.json'), 'utf8')) as { defaultTemplate?: string }).defaultTemplate
    if (!defRef) await page.waitForTimeout(100)
  }
  assert(defRef === `template:${templateId}`, `the section default names the template by its id (${defRef})`)
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('North visit')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("North visit")')
  await page.waitForTimeout(300)
  assert(JSON.stringify((await readDoc(join(root, sec, 'North visit.page'))).objects).includes('plus an edit made '), 'Add page used the section default template')
  step('a section default template applies to Add page')

  // 9. Templates and section defaults from earlier versions are not used: that section makes blank pages.
  await page.locator('.tab', { hasText: 'Old default' }).click()
  await page.locator('.tab', { hasText: 'Old default' }).click({ button: 'right' })
  assert((await page.locator('.context-menu').innerText()).includes('Default template: blank page'), 'a default from an earlier version is not shown')
  await page.keyboard.press('Escape')
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Fresh page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Fresh page")')
  await page.waitForTimeout(300)
  assert(!JSON.stringify((await readDoc(join(root, oldSec, 'Fresh page.page'))).objects).includes('Original template text'), 'a default from an earlier version is not used: the new page is blank')
  step('templates and section defaults from earlier versions are not used')

  // 10. With several sections in the Templates notebook, Save as template asks which one.
  await page.locator('.tab', { hasText: 'Work' }).click()
  await page.locator('.page-row', { hasText: 'Site visit' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Save as template' }).click()
  await page.waitForSelector('.dialog select')
  await page.locator('.dialog input').first().fill('Site visit form')
  await page.locator('.dialog select').selectOption({ label: 'Farm' })
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForSelector('.dialog', { state: 'detached' })
  assert((await pagesIn(farm)).includes('Site visit form.page'), `Save as template put the copy in the chosen section (${await pagesIn(farm)})`)
  step('Save as template asks which section of the Templates notebook, when it has several')

  // 11. A page copied in a notebook pastes into the Templates notebook as a template; undo removes it.
  await page.locator('.page-row', { hasText: 'North visit' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Copy page$/ }).click()
  await switchScreen()
  await page.locator('.recent-list button', { hasText: 'Templates' }).first().click()
  await page.waitForSelector('.notebook-button.templates')
  await page.locator('.tab', { hasText: 'General' }).click()
  await page.locator('.page-list-head .icon').click()
  await page.locator('.context-item', { hasText: 'Paste template here: North visit' }).click()
  await page.waitForSelector('.page-row.on:has-text("North visit")')
  assert(JSON.stringify((await readDoc(join(general, 'North visit.page'))).objects).includes('plus an edit made '), 'the page pasted from the notebook became a template with its content')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('.page-row')).some((r) => r.textContent?.includes('North visit')))
  assert(!(await pagesIn(general)).includes('North visit.page'), 'undo removed the pasted template')
  step('a page copied in a notebook pastes into the Templates notebook, with undo')

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
