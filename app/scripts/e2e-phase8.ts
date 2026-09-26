/// <reference lib="dom" />
/**
 * Version 1.0 additions: copy and paste objects, table content paste, signature, Tab, exports, printouts.
 *   npx tsx scripts/e2e-phase8.ts
 */
import { _electron as electron, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
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
async function newBox(page: Page, x: number, y: number): Promise<void> {
  await page.locator('.canvas').click({ button: 'right', position: { x, y } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  // The new box takes focus a moment after it appears.
  await page.waitForTimeout(250)
}
async function newTable(page: Page, x: number, y: number): Promise<void> {
  await page.locator('.canvas').click({ button: 'right', position: { x, y } })
  await page.locator('.context-item', { hasText: 'Table (3' }).click()
  await page.waitForSelector('.tiptap table td')
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e8-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const userData = join(base, 'userData')
  const root = await createNotebook(base, 'V1 notebook')
  const sec = await createSection(root, '', 'Work', '#1D9E75')
  const a = (await createPage(root, sec, 'Alpha')).relPath
  const b = (await createPage(root, sec, 'Beta')).relPath
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  const doc = async (r: string): Promise<PageDoc> => JSON.parse(await fs.readFile(join(root, r, 'page.json'), 'utf8')) as PageDoc
  const exportOut = join(base, 'section.pdf')

  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root, PAGEBINDER_TEST_SAVE_PATH: exportOut } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')

  // 1. Tab inserts a tab stop; to-do items keep their text style when checked.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.type('Name:')
  await page.keyboard.press('Tab')
  await page.keyboard.type('value')
  await save(page)
  assert(JSON.stringify((await doc(a)).objects).includes('Name:\\tvalue'), 'Tab inserted a tab character in text')
  await page.keyboard.press('Enter')
  await page.locator('.tb', { hasText: 'To do' }).click()
  await page.keyboard.type('Done item')
  await page.locator('.tiptap ul[data-type="taskList"] input[type="checkbox"]').first().check()
  await save(page)
  const deco = await page.locator('.tiptap ul[data-type="taskList"] li[data-checked="true"] > div').evaluate((el) => getComputedStyle(el).textDecorationLine)
  assert(deco === 'none', `checked to-do text is not struck out (${deco})`)
  // Tab with several list items highlighted indents them all and erases nothing.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.locator('.tb', { hasText: '• List' }).click()
  await page.keyboard.type('first')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await page.keyboard.press('Enter')
  await page.keyboard.type('third')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  // The browser reports the new selection to the editor a moment after the key; a person is slower than this.
  await page.waitForTimeout(150)
  await page.keyboard.press('Tab')
  await save(page)
  const listJson = JSON.stringify((await doc(a)).objects)
  assert(listJson.includes('"text":"second"') && listJson.includes('"text":"third"') && listJson.includes('"text":"first"'), 'Tab kept every highlighted list item')
  const lists = (listJson.match(/"type":"bulletList"/g) ?? []).length
  const shifted = (listJson.match(/"indent":1/g) ?? []).length
  assert(lists === 1 && shifted === 3, `highlighted items shifted right together and kept their bullets (${lists} list, ${shifted} shifted items)`)
  await page.keyboard.press('Shift+Tab')
  await save(page)
  const back = (JSON.stringify((await doc(a)).objects).match(/"indent":1/g) ?? []).length
  assert(back === 0, 'Shift+Tab moved them back')
  step('Tab inserts a tab stop, shifts highlighted list items right together, and checked to-do items keep their look')

  // 2. Signature from the text right-click menu.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  const expectedName = await page.evaluate(() => window.pagebinder.about.userName())
  const editorBox = (await page.locator('.text-container .tiptap').first().boundingBox())!
  await page.mouse.click(editorBox.x + 40, editorBox.y + editorBox.height - 10, { button: 'right' })
  await page.locator('.context-item', { hasText: 'Insert signature' }).click()
  await save(page)
  const withSig = JSON.stringify((await doc(a)).objects)
  assert(withSig.includes(expectedName), `signature carries the user name (${expectedName})`)
  assert(/\d{4}|\d{1,2}:\d{2}/.test(withSig), 'signature carries the date and time')
  step('Insert signature adds the account name with the date and time')

  // 3. Copy and paste objects within a page and to another page.
  await newBox(page, 700, 150)
  await page.keyboard.type('Copy me')
  await page.keyboard.press('Escape')
  await page.locator('.text-container.selected').click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Copy$/ }).click()
  await page.locator('.canvas').click({ button: 'right', position: { x: 560, y: 600 } })
  await page.locator('.context-item', { hasText: /^Paste$/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('.text-container').length === 3)
  await save(page)
  let d = await doc(a)
  assert(d.objects.filter((o) => JSON.stringify(o).includes('Copy me')).length === 2, 'object pasted on the same page')
  await page.locator('.page-row', { hasText: 'Beta' }).click()
  await page.waitForSelector('.page-row.on:has-text("Beta")')
  await page.waitForTimeout(300)
  await page.locator('.canvas').click({ position: { x: 700, y: 900 } })
  await page.keyboard.press(`${mod}+v`)
  await page.waitForFunction(() => document.querySelectorAll('.text-container').length === 2)
  await save(page)
  d = await doc(b)
  assert(d.objects.some((o) => JSON.stringify(o).includes('Copy me')), 'object pasted on another page with Cmd+V')
  step('objects copy and paste within a page and between pages')

  // 4. Table content paste: text and formatting come across, the target table keeps its fill.
  await newTable(page, 120, 300)
  await page.locator('.tiptap table td').first().click()
  await page.keyboard.type('One')
  await page.keyboard.press('Shift+Home')
  await page.locator('.tb.bold').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Two')
  const firstCell = page.locator('.tiptap table td').first()
  const secondCell = page.locator('.tiptap table td').nth(1)
  await firstCell.click()
  await secondCell.click({ modifiers: ['Shift'] })
  await page.keyboard.press(`${mod}+c`)
  await newTable(page, 120, 520)
  const tables = page.locator('.tiptap table')
  const target = tables.nth(1)
  await target.locator('td').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Cell fill colour' }).click()
  await page.locator('.context-menu .context-swatches.grid button[aria-label="Colour #c0dd97"]').click()
  await target.locator('td').first().click()
  await page.keyboard.press(`${mod}+v`)
  await page.waitForTimeout(300)
  await save(page)
  d = await doc(b)
  const tableObjs = d.objects.filter((o) => o.kind === 'text' && JSON.stringify(o).includes('"type":"table"'))
  const targetJson = JSON.stringify(tableObjs[1])
  assert(targetJson.includes('"text":"One"') && targetJson.includes('"text":"Two"'), 'cell text pasted into the second table')
  assert(targetJson.includes('"type":"bold"'), 'text formatting came across')
  assert(targetJson.includes('"backgroundColor":"#c0dd97"'), 'target cell kept its own fill')
  step('cells copied from one table paste their content into another without changing its formatting')

  // 5. Exporting a section produces one PDF sheet per page, no blanks.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:export'))
  await page.waitForSelector('.dialog select')
  await page.locator('.dialog select').first().selectOption(sec)
  await page.locator('.dialog select').nth(1).selectOption('pdf')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction(() => /Written to/.test(document.querySelector('.dialog')?.textContent ?? ''), undefined, { timeout: 60000 })
  const pdf = await fs.readFile(exportOut)
  const sheets = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length
  assert(sheets === 2, `section PDF has exactly one sheet per single-sheet page (${sheets})`)
  await page.locator('.dialog button', { hasText: 'Close' }).click()
  step('exporting a section adds no blank pages')

  // 6. A PDF attachment can be inserted as a printout of pictures, sized to the printable width.
  const pdfPath = join(base, 'section.pdf')
  await page.evaluate(async ({ rel, pdfPath }) => {
    await window.pagebinder.page.addFiles(rel, [pdfPath])
  }, { rel: b, pdfPath })
  await page.locator('.page-row', { hasText: 'Alpha' }).click()
  await page.locator('.page-row', { hasText: 'Beta' }).click()
  await page.waitForTimeout(300)
  d = await doc(b)
  const entry = (await fs.readdir(join(root, b, 'attachments'))).find((n) => n.endsWith('.pdf'))!
  await page.evaluate(async ({ rel, doc, entry }) => {
    await window.pagebinder.page.save(rel, { ...doc, objects: [...doc.objects, { kind: 'file', id: 'pdfpdfpdfpdfpdfpdfpdfpdf', x: 96, y: 900, width: 300, name: entry, originalName: entry }], manifest: { ...doc.manifest, attachments: [{ name: entry, originalName: entry, size: 1, sha256: '', added: '' }] } })
  }, { rel: b, doc: d, entry })
  await page.locator('.page-row', { hasText: 'Alpha' }).click()
  await page.locator('.page-row', { hasText: 'Beta' }).click()
  await page.waitForSelector('.file-card')
  // Before any printout, the attached PDF's text is not searchable: only its name is.
  const searchFor = async (q: string): Promise<{ printouts: string[]; pages: string[] }> =>
    page.evaluate(async (q) => {
      const r = await window.pagebinder.search.query(q, '')
      return { printouts: r.printouts.map((h) => h.rel), pages: r.pages.map((h) => h.rel) }
    }, q)
  assert((await searchFor('value')).printouts.length === 0, 'a plain PDF attachment contributes no text to search')
  await page.locator('.file-card').click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Insert printout' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.image-object').length >= 2, undefined, { timeout: 60000 })
  await save(page)
  d = await doc(b)
  const printouts = d.objects.filter((o) => o.kind === 'image')
  assert(printouts.length === 2 && printouts.every((o) => o.kind === 'image' && o.width === 624), `printout pages are pictures at the printable width (${printouts.length})`)
  // The PDF is the exported section, so its first page carries Alpha's text, including "value".
  const texts = printouts.map((o) => (o.kind === 'image' ? o.printout : undefined))
  assert(texts.every((t, i) => t && t.page === i + 1 && t.source.endsWith('.pdf')), `each printout page records its source and page number (${JSON.stringify(texts.map((t) => t && { s: t.source, p: t.page }))})`)
  assert(texts[0]?.text.includes('value'), `the first printout page keeps the PDF's text (${texts[0]?.text.slice(0, 80)})`)
  const html = await fs.readFile(join(root, b, 'page.html'), 'utf8')
  assert(html.includes('class="printout-text"') && /printout-text">[^<]*value/.test(html), 'page.html carries the printout text for find-on-page')
  await page.waitForFunction(async (rel) => (await window.pagebinder.search.query('value', '')).printouts.some((h) => h.rel === rel), b, { timeout: 15000 })
  // Search from the box: the page is listed under In printouts, and opening it outlines the matching picture.
  await page.locator('.page-row', { hasText: 'Alpha' }).click()
  await page.locator('.search-box input').fill('value')
  await page.locator('.search-group', { hasText: 'In printouts' }).locator('.search-hit').first().click()
  await page.waitForSelector('.image-object.search-match', { timeout: 10000 })
  const bar = (await page.locator('.search-bar').textContent()) ?? ''
  assert(/of \d+ match/.test(bar), `the page's match count includes the printout (${bar})`)
  await page.locator('.search-bar button', { hasText: 'Done' }).click()
  step('a PDF attachment becomes a printout of its pages, and the printout text is searchable while the plain attachment is not')

  // 7. One full-screen item, the native role (on macOS AppKit itself titles it Enter or Exit Full
  //    Screen, so the label can no longer lag the window), and the window still toggles.
  const fs7 = await app.evaluate(async ({ BrowserWindow, Menu }) => {
    const win = BrowserWindow.getAllWindows()[0]!
    const items = Menu.getApplicationMenu()!.items.flatMap((i) => i.submenu?.items ?? []).filter((i) => /Full Screen/i.test(i.label) || i.role === 'togglefullscreen')
    await new Promise<void>((r) => {
      const t = setTimeout(r, 4000)
      win.once('enter-full-screen', () => { clearTimeout(t); r() })
      win.setFullScreen(true)
    })
    await new Promise((r) => setTimeout(r, 300))
    const inFull = win.isFullScreen()
    await new Promise<void>((r) => {
      const t = setTimeout(r, 4000)
      win.once('leave-full-screen', () => { clearTimeout(t); r() })
      win.setFullScreen(false)
    })
    await new Promise((r) => setTimeout(r, 300))
    return { count: items.length, role: items[0]?.role ?? '', inFull, after: win.isFullScreen() }
  })
  // The app's own Toggle Full Screen item is the only one (the one macOS would add is switched off).
  assert(fs7.count === 1 && fs7.inFull && !fs7.after, `one full-screen item and the window toggles (${JSON.stringify(fs7)})`)
  step('the View menu has a single Toggle Full Screen item')

  // 8. A text box that runs across a page break looks in the editor exactly as it prints.
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Gamma')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Gamma")')
  await page.waitForTimeout(300)
  const g = `${sec}/Gamma.page`
  const gd = await doc(g)
  const paras = Array.from({ length: 24 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Break line ${i + 1}` }] }))
  await page.evaluate(async ({ rel, d, paras }) => {
    await window.pagebinder.page.save(rel, { ...d, objects: [
      { kind: 'text', id: 'breakboxbreakboxbreakbox', x: 96, y: 800, width: 400, content: { type: 'doc', content: paras } },
      { kind: 'shape', id: 'shapeaaaaaaaaaaaaaaaaaaa', shape: 'rect', x: 520, y: 100, width: 120, height: 80, a: { x: 0, y: 0 }, b: { x: 120, y: 80 }, stroke: '#000000', strokeWidth: 2, fill: '#ff0000' },
      { kind: 'shape', id: 'shapebbbbbbbbbbbbbbbbbbb', shape: 'rect', x: 560, y: 130, width: 120, height: 80, a: { x: 0, y: 0 }, b: { x: 120, y: 80 }, stroke: '#000000', strokeWidth: 2, fill: '#0000ff' }
    ] })
  }, { rel: g, d: gd, paras })
  await page.locator('.page-row', { hasText: 'Alpha' }).click()
  await page.locator('.page-row', { hasText: 'Gamma' }).click()
  await page.waitForSelector('.canvas .tiptap [data-sheet-break]', { timeout: 10000 })
  await page.waitForTimeout(400)
  // Editor: every pushed block, with its extra spacing, and where the first one after the break now starts.
  const editorBreaks = await page.evaluate(() => {
    const canvas = document.querySelector('.canvas') as HTMLElement
    const zoom = Number(canvas.dataset.zoom) || 1
    const top = canvas.getBoundingClientRect().top
    return Array.from(document.querySelectorAll<HTMLElement>('.canvas .tiptap [data-sheet-break]')).map((el) => ({
      text: (el.textContent ?? '').trim(),
      margin: Math.round(parseFloat(el.style.marginTop)),
      y: Math.round((el.getBoundingClientRect().top - top) / zoom)
    }))
  })
  // Letter paper at 96 px per inch with one-inch margins: sheet 2's printable area starts at 1056 + 96.
  assert(editorBreaks.length >= 1 && editorBreaks[0]!.y === 1152, `the first line past the break starts at the top of sheet 2's printable area (${JSON.stringify(editorBreaks)})`)
  // Print: the same blocks are pushed by the same amounts when page.html paginates.
  await save(page)
  const htmlPath = join(root, g, 'page.html')
  const printBreaks = await app.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({ show: false })
    await w.loadFile(file)
    for (let i = 0; i < 50 && !(await w.webContents.executeJavaScript("document.body.classList.contains('paginated')")); i++) await new Promise((r) => setTimeout(r, 100))
    const list = await w.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('#canvas .tiptap *')).filter((el) => el.style.marginTop).map((el) => ({ text: el.textContent.trim(), margin: Math.round(parseFloat(el.style.marginTop)) }))"
    )
    w.destroy()
    return list as { text: string; margin: number }[]
  }, htmlPath)
  const same = printBreaks.length === editorBreaks.length && printBreaks.every((p, i) => p.text === editorBreaks[i]!.text && Math.abs(p.margin - editorBreaks[i]!.margin) <= 1)
  assert(same, `editor and print push the same lines by the same amounts (editor ${JSON.stringify(editorBreaks)}, print ${JSON.stringify(printBreaks)})`)
  step('a text box that crosses a page break is laid out in the editor exactly as it prints')

  // 9. Any object can be brought to the front or sent to the back, and undo reverses it.
  const order = async (): Promise<string[]> => (await doc(g)).objects.map((o) => o.id.slice(0, 6))
  assert((await order()).join() === 'breakb,shapea,shapeb', `starting order (${(await order()).join()})`)
  await page.locator('.shape-object').nth(1).click({ button: 'right', position: { x: 100, y: 60 } })
  await page.locator('.context-item', { hasText: /^Order/ }).click()
  await page.locator('.context-item', { hasText: 'Send to back' }).click()
  await save(page)
  assert((await order()).join() === 'shapeb,breakb,shapea', `Send to back puts it first in the stacking order (${(await order()).join()})`)
  const domOrder = await page.evaluate(() => Array.from(document.querySelectorAll('.canvas [data-object-id]')).map((el) => (el as HTMLElement).dataset.objectId!.slice(0, 6)))
  assert(domOrder.join() === 'shapeb,breakb,shapea', `the editor stacks objects in the same order (${domOrder.join()})`)
  await page.locator('.shape-object').nth(0).click({ button: 'right', position: { x: 100, y: 60 } })
  await page.locator('.context-item', { hasText: /^Order/ }).click()
  await page.locator('.context-item', { hasText: 'Bring to front' }).click()
  await save(page)
  assert((await order()).join() === 'breakb,shapea,shapeb', `Bring to front puts it last in the stacking order (${(await order()).join()})`)
  await page.keyboard.press(`${mod}+z`)
  await save(page)
  assert((await order()).join() === 'shapeb,breakb,shapea', `undo restores the previous order (${(await order()).join()})`)
  const htmlOrder = await fs.readFile(htmlPath, 'utf8')
  assert(htmlOrder.indexOf('shapebbbb') < htmlOrder.indexOf('breakboxb') && htmlOrder.indexOf('breakboxb') < htmlOrder.indexOf('shapeaaaa'), 'page.html prints in the stacking order')
  step('objects can be brought to the front or sent to the back from the right-click menu, and undo reverses it')

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
