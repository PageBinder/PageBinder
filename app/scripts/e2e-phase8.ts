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
import { createPage, savePage } from '../src/main/storage/page'
import type { PageDoc } from '../src/shared/types'
import { tealPng } from './png'

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

  // The picture the Insert picture… step chooses (the file dialog is answered by a test seam).
  const picturePath = join(base, 'teal square.png')
  await fs.writeFile(picturePath, tealPng())
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root, PAGEBINDER_TEST_SAVE_PATH: exportOut, PAGEBINDER_TEST_PICK_IMAGES: picturePath } })
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
  // Bold only formats text once the selection has registered; otherwise it just arms bold at the cursor.
  await page.waitForFunction(() => window.getSelection()?.toString() === 'One')
  await page.locator('.tb.bold').click()
  await page.waitForSelector('.tiptap table td strong')
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
    return { count: items.length, role: items[0]?.role ?? '', inFull, after: win.isFullScreen(), focused: win.isFocused() }
  })
  // The app's own Toggle Full Screen item is the only one (the one macOS would add is switched off).
  assert(fs7.count === 1, `one full-screen item in the menus (${JSON.stringify(fs7)})`)
  // macOS ignores a full-screen request from a window that is not the active one, which happens when
  // someone is using the computer while the tests run. The window is never pulled to the front for this.
  if (fs7.inFull || fs7.focused) assert(fs7.inFull && !fs7.after, `the window enters and leaves full screen (${JSON.stringify(fs7)})`)
  else process.stdout.write('    (full-screen toggle not checked: the test window is not the active window)\n')
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
  // One paragraph long enough to cross two sheet boundaries, then a list that crosses a third.
  const longText = Array.from({ length: 330 }, (_, i) => `word${i + 1}`).join(' ')
  const items = Array.from({ length: 40 }, (_, i) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Item ${i + 1}` }] }] }))
  await page.evaluate(async ({ rel, d, paras, longText, items }) => {
    await window.pagebinder.page.save(rel, { ...d, objects: [
      { kind: 'text', id: 'breakboxbreakboxbreakbox', x: 96, y: 800, width: 400, content: { type: 'doc', content: paras } },
      { kind: 'shape', id: 'shapeaaaaaaaaaaaaaaaaaaa', shape: 'rect', x: 520, y: 100, width: 120, height: 80, a: { x: 0, y: 0 }, b: { x: 120, y: 80 }, stroke: '#000000', strokeWidth: 2, fill: '#ff0000' },
      { kind: 'shape', id: 'shapebbbbbbbbbbbbbbbbbbb', shape: 'rect', x: 560, y: 130, width: 120, height: 80, a: { x: 0, y: 0 }, b: { x: 120, y: 80 }, stroke: '#000000', strokeWidth: 2, fill: '#0000ff' },
      { kind: 'text', id: 'longparalongparalongpara', x: 520, y: 700, width: 260, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }, { type: 'bulletList', content: items }] } }
    ] })
  }, { rel: g, d: gd, paras, longText, items })
  await page.locator('.page-row', { hasText: 'Alpha' }).click()
  await page.locator('.page-row', { hasText: 'Gamma' }).click()
  // Editor and print must push the same lines by the same amounts at every sheet boundary.
  const htmlPath = join(root, g, 'page.html')
  const compareBreaks = async (label: string): Promise<{ kind: string; text: string; margin: number; y: number; tag: string }[]> => {
    await page.waitForSelector('.canvas .tiptap [data-sheet-break]', { timeout: 10000 })
    await page.waitForTimeout(400)
    const editorBreaks = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement
      const zoom = Number(canvas.dataset.zoom) || 1
      const top = canvas.getBoundingClientRect().top
      return Array.from(document.querySelectorAll<HTMLElement>('.canvas .tiptap [data-sheet-break], .canvas .tiptap [data-sheet-spacer]')).map((el) => {
        const spacer = el.hasAttribute('data-sheet-spacer')
        const r = document.createRange()
        if (spacer) {
          r.setStartAfter(el)
          r.setEndAfter(el.closest('p, h1, h2, h3, h4, h5, h6, pre')!.lastChild!)
        } else r.selectNodeContents(el)
        const rect = el.getBoundingClientRect()
        return {
          kind: spacer ? 'spacer' : 'margin',
          text: r.toString().trim().slice(0, 30),
          margin: Math.round(spacer ? rect.height / zoom : parseFloat(el.style.marginTop)),
          y: Math.round(((spacer ? rect.bottom : rect.top) - top) / zoom),
          tag: el.tagName
        }
      })
    })
    await save(page)
    const printBreaks = await app.evaluate(async ({ BrowserWindow }, file) => {
      const w = new BrowserWindow({ show: false })
      await w.loadFile(file)
      for (let i = 0; i < 50 && !(await w.webContents.executeJavaScript("document.body.classList.contains('paginated')")); i++) await new Promise((r) => setTimeout(r, 100))
      const list = await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#canvas .tiptap [data-sheet-break], #canvas .tiptap [data-sheet-spacer]')).map((el) => {
        const spacer = el.hasAttribute('data-sheet-spacer')
        const r = document.createRange()
        if (spacer) { r.setStartAfter(el); r.setEndAfter(el.closest('p, h1, h2, h3, h4, h5, h6, pre').lastChild) } else r.selectNodeContents(el)
        return { kind: spacer ? 'spacer' : 'margin', text: r.toString().trim().slice(0, 30), margin: Math.round(parseFloat(spacer ? el.style.height : el.style.marginTop)) }
      })`)
      w.destroy()
      return list as { kind: string; text: string; margin: number }[]
    }, htmlPath)
    const same = printBreaks.length === editorBreaks.length && printBreaks.every((p, i) => p.kind === editorBreaks[i]!.kind && p.text === editorBreaks[i]!.text && Math.abs(p.margin - editorBreaks[i]!.margin) <= 1)
    assert(same, `${label}: editor and print push the same lines by the same amounts (editor ${JSON.stringify(editorBreaks)}, print ${JSON.stringify(printBreaks)})`)
    return editorBreaks
  }
  const firstBreaks = await compareBreaks('standard spacing')
  // Letter paper at 96 px per inch with one-inch margins: sheet 2's printable area starts at 1056 + 96.
  assert(firstBreaks[0]?.y === 1152, `the first line past the break starts at the top of sheet 2's printable area (${JSON.stringify(firstBreaks)})`)
  // The long paragraph splits line by line: it stays one paragraph, fills each sheet, and continues
  // at the top of the next sheet's printable area, at two boundaries.
  const splits = firstBreaks.filter((b) => b.kind === 'spacer')
  assert(splits.length === 2 && splits[0]!.y === 1152 && splits[1]!.y === 2208, `a long paragraph splits at each sheet boundary and continues at the top of the next printable area (${JSON.stringify(splits)})`)
  const beforeSplit = await page.evaluate(() => {
    const canvas = document.querySelector('.canvas') as HTMLElement
    const zoom = Number(canvas.dataset.zoom) || 1
    return Array.from(document.querySelectorAll<HTMLElement>('.canvas .tiptap [data-sheet-spacer]')).map((el) => Math.round((el.getBoundingClientRect().top - canvas.getBoundingClientRect().top) / zoom))
  })
  assert(beforeSplit[0]! > 960 - 30 && beforeSplit[1]! > 2016 - 30, `each sheet is filled to its last line before the split (${beforeSplit.join()})`)
  const stored = (await doc(g)).objects.find((o) => o.id === 'longparalongparalongpara') as unknown as { content: { content: { type: string; content?: { text?: string }[] }[] } }
  const firstNode = stored.content.content[0]!
  const storedText = (firstNode.content ?? []).map((t) => t.text ?? '').join('')
  assert(firstNode.type === 'paragraph' && storedText === longText && stored.content.content.filter((n) => n.type === 'paragraph' && (n.content ?? []).length).length === 1, 'the page file keeps the paragraph whole: splitting is layout only')
  // A list crossing a boundary moves whole items, bullet and all.
  assert(firstBreaks.some((b) => b.kind === 'margin' && b.tag === 'LI'), `a list item crossing a boundary moves as a whole (${JSON.stringify(firstBreaks.filter((b) => b.kind === 'margin'))})`)
  step('text that crosses a page break moves line by line, and the editor lays it out exactly as it prints')

  // 9. Any object can be brought to the front or sent to the back, and undo reverses it.
  const order = async (): Promise<string[]> => (await doc(g)).objects.map((o) => o.id.slice(0, 6))
  assert((await order()).join() === 'breakb,shapea,shapeb,longpa', `starting order (${(await order()).join()})`)
  await page.locator('.shape-object').nth(1).click({ button: 'right', position: { x: 100, y: 60 } })
  await page.locator('.context-item', { hasText: /^Order/ }).click()
  await page.locator('.context-item', { hasText: 'Send to back' }).click()
  await save(page)
  assert((await order()).join() === 'shapeb,breakb,shapea,longpa', `Send to back puts it first in the stacking order (${(await order()).join()})`)
  const domOrder = await page.evaluate(() => Array.from(document.querySelectorAll('.canvas [data-object-id]')).map((el) => (el as HTMLElement).dataset.objectId!.slice(0, 6)))
  assert(domOrder.join() === 'shapeb,breakb,shapea,longpa', `the editor stacks objects in the same order (${domOrder.join()})`)
  await page.locator('.shape-object').nth(0).click({ button: 'right', position: { x: 100, y: 60 } })
  await page.locator('.context-item', { hasText: /^Order/ }).click()
  await page.locator('.context-item', { hasText: 'Bring to front' }).click()
  await save(page)
  assert((await order()).join() === 'breakb,shapea,longpa,shapeb', `Bring to front puts it last in the stacking order (${(await order()).join()})`)
  await page.keyboard.press(`${mod}+z`)
  await save(page)
  assert((await order()).join() === 'shapeb,breakb,shapea,longpa', `undo restores the previous order (${(await order()).join()})`)
  const htmlOrder = await fs.readFile(htmlPath, 'utf8')
  assert(htmlOrder.indexOf('shapebbbb') < htmlOrder.indexOf('breakboxb') && htmlOrder.indexOf('breakboxb') < htmlOrder.indexOf('shapeaaaa'), 'page.html prints in the stacking order')
  step('objects can be brought to the front or sent to the back from the right-click menu, and undo reverses it')

  // 10. Line spacing: from the right-click menu for highlighted text, from the ribbon, and as the default for new boxes.
  const spacingOf = async (): Promise<(string | null)[]> =>
    ((await doc(g)).objects.find((o) => o.id === "breakboxbreakboxbreakbox") as unknown as { content: { content: { attrs?: { lineHeight?: string | null } }[] } }).content.content.map((p) => p.attrs?.lineHeight ?? null)
  // Click into the box, wait until the editor has registered the click, then select everything.
  // A key pressed within milliseconds of a click can race the browser's report of the new cursor
  // (see docs/dev/PLATFORM_NOTES.md); no person is that fast, so the test waits as a person would.
  const selectAllInBreakBox = async (): Promise<void> => {
    await page.locator('.canvas .tiptap p', { hasText: 'Break line 3' }).click()
    await page.waitForFunction(() => {
      const el = Array.from(document.querySelectorAll('.canvas .tiptap')).find((e) => (e.textContent ?? '').includes('Break line 3')) as (Element & { editor?: { state: { selection: { empty: boolean } } } }) | undefined
      return !!el?.editor?.state.selection.empty
    })
    await page.keyboard.press(`${mod}+a`)
    await page.waitForFunction(
      () => {
        const el = Array.from(document.querySelectorAll('.canvas .tiptap')).find((e) => (e.textContent ?? '').includes('Break line 3')) as (Element & { editor?: { state: { selection: { from: number; to: number }; doc: { content: { size: number } } } } }) | undefined
        const st = el?.editor?.state
        return !!st && st.selection.from <= 1 && st.selection.to >= st.doc.content.size - 1
      },
      undefined,
      { timeout: 5000 }
    )
  }
  await selectAllInBreakBox()
  await page.locator('.canvas .tiptap p', { hasText: 'Break line 3' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Line spacing/ }).click()
  await page.locator('.context-item', { hasText: /^2\.0$/ }).click()
  await save(page)
  let spacing = await spacingOf()
  assert(spacing.length === 24 && spacing.every((v) => v === '2'), `the highlighted paragraphs take double spacing (${spacing.join()})`)
  const lh = await page.locator('.canvas .tiptap p', { hasText: 'Break line 3' }).evaluate((el) => getComputedStyle(el).lineHeight)
  assert(lh === '28px', `double spacing on 14 px text is 28 px (${lh})`)
  const html2 = await fs.readFile(htmlPath, 'utf8')
  assert(html2.includes('line-height: 2; min-height: 2em'), 'page.html carries the spacing')
  // Taller lines move the page break; the editor still matches the printout.
  const doubled = await compareBreaks('double spacing')
  assert(doubled[0]!.text !== firstBreaks[0]!.text, `double spacing moves the page break to an earlier line (${doubled[0]!.text} vs ${firstBreaks[0]!.text})`)
  // The ribbon control applies to the same selection.
  const boxSelection = async (): Promise<{ from: number; to: number; size: number }> =>
    page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.canvas .tiptap')).find((e) => (e.textContent ?? '').includes('Break line 3')) as (Element & { editor?: { state: { selection: { from: number; to: number }; doc: { content: { size: number } } } } }) | undefined
      const st = el?.editor?.state
      return { from: st?.selection.from ?? -1, to: st?.selection.to ?? -1, size: st?.doc.content.size ?? -1 }
    })
  await selectAllInBreakBox()
  const beforeChoice = await boxSelection()
  await page.locator('.tb-select.spacing').selectOption('1.15')
  const afterChoice = await boxSelection()
  await save(page)
  spacing = await spacingOf()
  assert(spacing.every((v) => v === '1.15'), `the ribbon sets 1.15 spacing (${spacing.join()}; selection before choosing ${JSON.stringify(beforeChoice)}, after ${JSON.stringify(afterChoice)})`)
  assert((await page.locator('.tb-select.spacing').inputValue()) === '1.15', 'the ribbon shows the current spacing')
  await compareBreaks('1.15 spacing')
  // Default for new text boxes: set it from the menu, then a new box and its next paragraph use it.
  await page.locator('.canvas .tiptap p', { hasText: 'Break line 3' }).click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Line spacing/ }).click()
  await page.locator('.context-item', { hasText: /^Default for new text boxes/ }).click()
  await page.locator('.context-item', { hasText: /^2\.5$/ }).click()
  await page.locator('.canvas').click({ button: 'right', position: { x: 560, y: 400 } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  await page.waitForTimeout(300)
  await page.keyboard.type('Fresh box')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second line')
  await save(page)
  const fresh = (await doc(g)).objects.find((o) => o.kind === 'text' && JSON.stringify(o.content).includes('Fresh box')) as { content: { content: { attrs?: { lineHeight?: string } }[] } } | undefined
  const freshSpacing = fresh?.content.content.map((p) => p.attrs?.lineHeight ?? null) ?? []
  assert(freshSpacing.length === 2 && freshSpacing.every((v) => v === '2.5'), `a new text box and its next paragraph use the default spacing (${freshSpacing.join()})`)
  step('line spacing is set from the right-click menu or the ribbon, has a default for new text boxes, and page breaks still match the printout')

  // 11. Pictures anchored in a text box: placed where the box was right-clicked, text flowing down
  //     beside them, a fixed size that resizing the box leaves alone, dragged anywhere, carried
  //     along when the box moves, printed as shown, copied with the box, and deleted.
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Delta')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Delta")')
  const dRel = `${sec}/Delta.page`
  await page.locator('.canvas').click({ button: 'right', position: { x: 140, y: 400 } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  await page.waitForTimeout(300)
  await page.keyboard.type(Array.from({ length: 12 }, () => 'Words that flow beside the picture and then below it.').join(' '))
  const para = page.locator('.canvas .tiptap p', { hasText: 'Words that flow' })
  await para.click({ button: 'right', position: { x: 20, y: 30 } })
  await page.locator('.context-item', { hasText: /^Insert picture/ }).click()
  const frame = page.locator('.anchored-picture-frame')
  await frame.waitFor()
  await save(page)
  type Pic = { id: string; name: string; originalName: string; x: number; y: number; width: number; height: number }
  const boxOf = async (rel: string): Promise<{ id: string; x: number; y: number; width: number; pictures: Pic[] } | undefined> =>
    (await doc(rel)).objects.find((o) => o.kind === 'text' && JSON.stringify(o.content).includes('Words that flow')) as unknown as { id: string; x: number; y: number; width: number; pictures: Pic[] } | undefined
  let box = (await boxOf(dRel))!
  const manifest = (await doc(dRel)).manifest.images.map((e) => e.name)
  assert(box.pictures?.length === 1 && Math.abs(box.pictures[0]!.x - 20) <= 2 && manifest.includes(box.pictures[0]!.name), `the picture is anchored where the box was right-clicked and its file is listed with the page (${JSON.stringify(box.pictures)})`)
  // Drag the picture's own bottom-right corner, without selecting it first: resize to 96 px (the
  // test picture starts at its 16 px minimum).
  const hb = (await frame.boundingBox())!
  await page.mouse.move(hb.x + hb.width - 2, hb.y + hb.height - 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width - 2 + 80, hb.y + hb.height - 2 + 80, { steps: 6 })
  await page.mouse.up()
  await save(page)
  box = (await boxOf(dRel))!
  assert(box.pictures[0]!.width === 96 && box.pictures[0]!.height === 96, `dragging a corner of the picture resizes it, keeping its shape (${JSON.stringify(box.pictures[0])})`)
  // Several lines of text sit beside the picture before the text runs underneath it.
  const beside = await page.evaluate(() => {
    const f = document.querySelector('.anchored-picture-frame') as HTMLElement
    const fr = f.getBoundingClientRect()
    const p = f.closest('p')!
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    const r = document.createRange()
    const lines = new Map<number, number>()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text
      for (let k = 0; k < t.data.length; k++) {
        r.setStart(t, k)
        r.setEnd(t, k + 1)
        const b = r.getBoundingClientRect()
        if (!b.width) continue
        const top = Math.round(b.top)
        lines.set(top, Math.min(lines.get(top) ?? Infinity, b.left))
      }
    }
    const besideLines = [...lines.entries()].filter(([top]) => top >= fr.top - 2 && top < fr.bottom).filter(([, left]) => left >= fr.right - 1)
    return besideLines.length
  })
  assert(beside >= 3, `several lines of text flow beside the picture (${beside})`)
  // Resizing the text box leaves the picture's size alone.
  const resizer = page.locator('.text-container', { has: frame }).locator('.container-resize')
  const rb = (await resizer.boundingBox())!
  await page.mouse.move(rb.x + rb.width / 2, rb.y + 40)
  await page.mouse.down()
  await page.mouse.move(rb.x + rb.width / 2 - 90, rb.y + 40, { steps: 6 })
  await page.mouse.up()
  await save(page)
  box = (await boxOf(dRel))!
  const shown = (await frame.boundingBox())!
  assert(box.pictures[0]!.width === 96 && Math.round(shown.width) === 96, `resizing the text box keeps the picture's size (${box.width} px box, ${JSON.stringify(box.pictures[0])}, shown ${shown.width})`)
  // Drag the picture: it stays exactly where it is dropped.
  const before = { ...box.pictures[0]! }
  const fb = (await frame.boundingBox())!
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
  await page.mouse.down()
  await page.mouse.move(fb.x + fb.width / 2 + 60, fb.y + fb.height / 2 + 40, { steps: 8 })
  await page.mouse.up()
  await save(page)
  box = (await boxOf(dRel))!
  const moved = box.pictures[0]!
  const fb2 = (await frame.boundingBox())!
  assert(Math.abs(moved.x - before.x - 60) <= 1 && Math.abs(moved.y - before.y - 40) <= 1 && Math.abs(fb2.x - fb.x - 60) <= 2 && Math.abs(fb2.y - fb.y - 40) <= 2, `the picture stays where it is dropped (${JSON.stringify(before)} to ${JSON.stringify(moved)}; on screen ${fb.x},${fb.y} to ${fb2.x},${fb2.y})`)
  // Move the whole text box: the picture goes with it and keeps its place in the box.
  const moveBar = page.locator('.text-container', { has: frame }).locator('.container-handle')
  // Bring the bar into view and make sure the press reaches it (on a small screen it can sit
  // under the toolbar, where a press at its coordinates would miss it).
  await moveBar.hover({ position: { x: 30, y: 4 } })
  const bb = (await moveBar.boundingBox())!
  const picBefore = (await frame.boundingBox())!
  const onBar = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.classList.contains('container-handle'), { x: bb.x + 30, y: bb.y + bb.height / 2 })
  assert(onBar, 'the text box\'s move bar is uncovered for the drag')
  await page.mouse.move(bb.x + 30, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.mouse.move(bb.x + 30 + 50, bb.y + bb.height / 2 + 30, { steps: 8 })
  await page.mouse.up()
  await save(page)
  const boxMoved = (await boxOf(dRel))!
  const fb3 = (await frame.boundingBox())!
  const bb3 = (await moveBar.boundingBox())!
  assert(Math.abs(boxMoved.x - box.x - 50) <= 1 && Math.abs(boxMoved.y - box.y - 30) <= 1, `the text box moved (${box.x},${box.y} to ${boxMoved.x},${boxMoved.y})`)
  assert(boxMoved.pictures[0]!.x === moved.x && boxMoved.pictures[0]!.y === moved.y && Math.abs(fb3.x - bb3.x - (picBefore.x - bb.x)) <= 2 && Math.abs(fb3.y - bb3.y - (picBefore.y - bb.y)) <= 2, `the picture moves with its text box (offset from the box ${picBefore.x - bb.x},${picBefore.y - bb.y} to ${fb3.x - bb3.x},${fb3.y - bb3.y})`)
  // Printed exactly as on screen: the picture sits at the same spot in the text box's text area.
  const editorSpot = await page.evaluate(() => {
    const f = document.querySelector('.anchored-picture-frame') as HTMLElement
    const area = f.closest('.tiptap') as HTMLElement
    const z = Number((document.querySelector('.canvas') as HTMLElement).dataset.zoom) || 1
    const a = area.getBoundingClientRect(), r = f.getBoundingClientRect()
    return { x: Math.round((r.left - a.left) / z), y: Math.round((r.top - a.top) / z), w: Math.round(r.width / z) }
  })
  const printSpot = await app.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({ show: false })
    await w.loadFile(file)
    for (let i = 0; i < 50 && !(await w.webContents.executeJavaScript("document.body.classList.contains('paginated')")); i++) await new Promise((r) => setTimeout(r, 100))
    // The source canvas is hidden after pagination; show it briefly to measure.
    const spot = await w.webContents.executeJavaScript(`(() => {
      const src = document.getElementById('canvas'); src.parentNode.style.display = ''
      const img = src.querySelector('img.anchored-picture'); const area = img.closest('.tiptap')
      const a = area.getBoundingClientRect(), r = img.getBoundingClientRect()
      return { x: Math.round(r.left - a.left), y: Math.round(r.top - a.top), w: Math.round(r.width) }
    })()`)
    w.destroy()
    return spot as { x: number; y: number; w: number }
  }, join(root, dRel, 'page.html'))
  assert(Math.abs(editorSpot.x - printSpot.x) <= 1 && Math.abs(editorSpot.y - printSpot.y) <= 1 && editorSpot.w === printSpot.w, `the printout places the picture exactly as the editor does (editor ${JSON.stringify(editorSpot)}, print ${JSON.stringify(printSpot)})`)
  // Copied with its text box to another page, the picture's file is copied too.
  await para.click({ button: "right", position: { x: 10, y: 5 } })
  await page.locator('.context-item', { hasText: /^Copy$/ }).click()
  await page.locator('.page-row', { hasText: 'Gamma' }).click()
  await page.locator('.canvas').click({ button: 'right', position: { x: 120, y: 60 } })
  await page.locator('.context-item', { hasText: /^Paste$/ }).click()
  await page.waitForTimeout(400)
  await save(page)
  const gDoc = await doc(g)
  const gBox = gDoc.objects.find((o) => o.kind === 'text' && JSON.stringify(o.content).includes('Words that flow')) as unknown as { pictures?: Pic[] } | undefined
  const copiedName = gBox?.pictures?.[0]?.name
  const copiedFile = copiedName ? await fs.stat(join(root, g, 'images', copiedName)).then(() => true, () => false) : false
  assert(!!copiedName && gDoc.manifest.images.some((e) => e.name === copiedName) && copiedFile, `the pasted text box brings its picture into the other page (${JSON.stringify(gBox?.pictures)})`)
  // Delete: select the picture and press Delete.
  await page.locator('.page-row', { hasText: 'Delta' }).click()
  await page.locator('.anchored-picture-frame').click()
  await page.keyboard.press('Delete')
  await page.waitForTimeout(300)
  await save(page)
  const afterDelete = (await boxOf(dRel))!
  assert((afterDelete.pictures ?? []).length === 0 && JSON.stringify(afterDelete).includes('Words that flow'), 'Delete removes the selected picture and leaves the text')
  step('pictures anchored in a text box: text flows beside them, fixed size, dragged anywhere, moved with the box, printed as shown, copied, deleted')

  // 12. Other ways in: Insert > Picture with the cursor in a text box, and a picture file dropped
  //     on a text box, both anchor the picture in the box instead of placing it on the page.
  const imagesOnPage = async (): Promise<number> => (await doc(dRel)).objects.filter((o) => o.kind === 'image').length
  const pageImagesBefore = await imagesOnPage()
  await para.click({ position: { x: 40, y: 8 } })
  await page.waitForFunction(() => document.activeElement?.closest('.text-container .tiptap') !== null)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:insertImage'))
  await page.waitForFunction(() => document.querySelectorAll('.anchored-picture-frame').length === 1)
  await save(page)
  const viaMenu = (await boxOf(dRel))!
  assert((viaMenu.pictures ?? []).length === 1 && (await imagesOnPage()) === pageImagesBefore, `Insert > Picture with the cursor in a text box anchors the picture in it (${JSON.stringify(viaMenu.pictures)})`)
  const pngBytes = Array.from(tealPng())
  await para.evaluate((el, bytes) => {
    const r = el.getBoundingClientRect()
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }))
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 200, clientY: r.top + 40 }
    el.dispatchEvent(new DragEvent('dragover', opts))
    el.dispatchEvent(new DragEvent('drop', opts))
  }, pngBytes)
  await page.waitForFunction(() => document.querySelectorAll('.anchored-picture-frame').length === 2)
  await save(page)
  const viaDrop = (await boxOf(dRel))!
  const dropped = (viaDrop.pictures ?? []).find((q) => q.originalName === 'dropped.png')
  assert(!!dropped && Math.abs(dropped.x - 200) <= 2 && (await imagesOnPage()) === pageImagesBefore && !JSON.stringify(viaDrop).includes('textImage'), `a picture dropped on a text box is anchored where it was dropped (${JSON.stringify(viaDrop.pictures)})`)
  step('Insert > Picture in a text box and pictures dropped on a text box go into the box')

  // 13. A new page starts with a title block: its name in bold at 20 px and the creation date and
  //     time below, and nothing else. The first name given goes into the
  //     title; a later rename leaves it alone.
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Pasture log')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Pasture log")')
  const pRel = `${sec}/Pasture log.page`
  type Para = { content?: { text?: string; marks?: { type: string; attrs?: { fontSize?: string } }[] }[] }
  const titleOf = async (): Promise<{ first: Para; second: Para; objects: number; below: boolean }> => {
    const d = await doc(pRel)
    const t = d.objects[0] as unknown as { kind: string; y: number; content: { content: Para[] } }
    const next = d.objects[1] as unknown as { kind: string; y: number } | undefined
    return { first: t.content.content[0]!, second: t.content.content[1]!, objects: d.objects.length, below: !next }
  }
  const made = await titleOf()
  const nameRun = made.first.content?.[0]
  const year = String(new Date().getFullYear())
  assert(nameRun?.text === 'Pasture log' && nameRun.marks?.some((m) => m.type === 'bold') && nameRun.marks?.some((m) => m.type === 'textStyle' && m.attrs?.fontSize === '20px'), `the title block holds the page name in bold at 20 px (${JSON.stringify(made.first)})`)
  assert(!!made.second.content?.[0]?.text?.includes(year) && !made.second.content[0]!.marks?.length, `the line below is the creation date and time in plain text (${JSON.stringify(made.second)})`)
  assert(made.objects === 1 && made.below, `the title block is the only object on the new page (${made.objects})`)
  await page.waitForFunction(() => document.querySelector('.canvas .text-container .tiptap p')?.textContent === 'Pasture log')
  assert(!(await page.locator('.canvas .tiptap', { hasText: 'Untitled page' }).count()), 'the title on screen shows the name just given, not the placeholder')
  assert(!(await page.locator('.canvas .tiptap h1, .canvas .tiptap h2, .canvas .tiptap h3').count()), 'the title is not a heading')
  await page.locator('.page-row.on', { hasText: 'Pasture log' }).dblclick()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Pasture log 2026')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Pasture log 2026")')
  const renamed = JSON.parse(await fs.readFile(join(root, sec, 'Pasture log 2026.page', 'page.json'), 'utf8')) as PageDoc
  assert(JSON.stringify(renamed.objects[0]).includes('"text":"Pasture log"') && !JSON.stringify(renamed.objects[0]).includes('Pasture log 2026'), 'a later rename leaves the title block alone')
  step('a new page starts with its name and creation date at the top, not linked to later renames')

  // 14. Format painter: copy the look of some text and paint it onto other text.
  const fpRel = `${sec}/Pasture log 2026.page`
  await page.locator('.canvas').click({ button: 'right', position: { x: 140, y: 320 } })
  await page.locator('.context-item', { hasText: /^Text box$/ }).click()
  await page.waitForTimeout(300)
  const fpBox = page.locator('.text-container').nth(1).locator('.tiptap')
  await fpBox.click()
  await page.keyboard.type('Source words here')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Target one and target two')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Plain line')
  // Give "Source" a look: bold, red, 18 px, centred.
  await fpBox.evaluate((el) => {
    const ed = (el as HTMLElement & { editor: { chain: () => { setTextSelection: (r: { from: number; to: number }) => { toggleBold: () => { setColor: (c: string) => { setFontSize: (s: string) => { setTextAlign: (a: string) => { run: () => boolean } } } } } } } }).editor
    ed.chain().setTextSelection({ from: 1, to: 7 }).toggleBold().setColor('#a32d2d').setFontSize('18px').setTextAlign('center').run()
  })
  const wordPoint = async (word: string, nth = 0): Promise<{ x: number; y: number }> =>
    fpBox.evaluate(
      (el, { word, nth }) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let seen = 0
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n as Text
          let i = t.data.indexOf(word)
          while (i >= 0) {
            if (seen++ === nth) {
              const r = document.createRange()
              r.setStart(t, i)
              r.setEnd(t, i + word.length)
              const b = r.getBoundingClientRect()
              return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
            }
            i = t.data.indexOf(word, i + 1)
          }
        }
        throw new Error(`no ${word}`)
      },
      { word, nth }
    )
  const textRuns = async (): Promise<string> => JSON.stringify((await doc(fpRel)).objects[1])
  // Single use: click in "Source", click the brush, then highlight "Target" by dragging.
  let sp = await wordPoint('Source')
  await page.mouse.click(sp.x, sp.y)
  await page.locator('.tb.painter').click()
  assert(await page.locator('.tb.painter.active').count(), 'the brush shows as armed')
  let wp = await wordPoint('Target')
  // From the start of "Target" to its end ("Target" is about 44 px wide at 14 px).
  const tRange = await fpBox.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text
      const i = t.data.indexOf('Target')
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(t, i)
      r.setEnd(t, i + 6)
      const b = r.getBoundingClientRect()
      return { x0: b.left + 1, x1: b.right - 0.5, y: b.top + b.height / 2 }
    }
    throw new Error('no Target')
  })
  await page.mouse.move(tRange.x0, tRange.y)
  await page.mouse.down()
  await page.mouse.move(tRange.x1, tRange.y, { steps: 4 })
  await page.mouse.up()
  await page.waitForFunction(() => !document.querySelector('.tb.painter.active'))
  await save(page)
  let j = await textRuns()
  const targetRun = (JSON.parse(j) as { content: { content: { content?: { text: string; marks?: { type: string; attrs?: Record<string, string> }[] }[] }[] } }).content.content[1]!.content!.find((r) => r.text === 'Target')
  assert(!!targetRun && targetRun.marks?.some((m) => m.type === 'bold') && targetRun.marks?.some((m) => m.type === 'textStyle' && m.attrs?.['color'] === '#a32d2d' && m.attrs?.['fontSize'] === '18px'), `"Target" took the look of "Source" (${JSON.stringify(targetRun)})`)
  assert(!j.includes('"textAlign":"center"},"content":[{"text":"Target') && (JSON.parse(j) as { content: { content: { attrs?: { textAlign?: string } }[] } }).content.content[1]!.attrs?.textAlign !== 'center', 'painting part of a paragraph leaves its alignment alone')
  // Undo reverses the paint in one step.
  await page.keyboard.press(`${mod}+z`)
  await save(page)
  j = await textRuns()
  assert(!/"text":"Target"[^}]*#a32d2d|#a32d2d[^}]*\}\],"text":"Target"/.test(j) && !j.includes('"text":"Target","marks"') , `Undo reverses the paint (${j.slice(0, 300)})`)
  // Double-click the brush: it keeps painting (plain clicks on words) until Escape.
  sp = await wordPoint('Source')
  await page.mouse.click(sp.x, sp.y)
  await page.locator('.tb.painter').dblclick()
  wp = await wordPoint('one')
  await page.mouse.click(wp.x, wp.y)
  await page.waitForTimeout(100)
  wp = await wordPoint('two')
  await page.mouse.click(wp.x, wp.y)
  await page.waitForTimeout(100)
  assert(await page.locator('.tb.painter.active').count(), 'a double-clicked brush stays armed')
  // Painting a whole paragraph also brings the alignment.
  const lineRange = await fpBox.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text
      if (t.data !== 'Plain line') continue
      const r = document.createRange()
      r.selectNodeContents(t)
      const b = r.getBoundingClientRect()
      return { x0: b.left + 1, x1: b.right - 0.5, y: b.top + b.height / 2 }
    }
    throw new Error('no Plain line')
  })
  await page.mouse.move(lineRange.x0, lineRange.y)
  await page.mouse.down()
  await page.mouse.move(lineRange.x1, lineRange.y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.tb.painter.active'))
  await save(page)
  const fpParas = (JSON.parse(await textRuns()) as { content: { content: { attrs?: { textAlign?: string }; content?: { text: string; marks?: { type: string }[] }[] }[] } }).content.content
  const boldWords = fpParas.flatMap((q) => q.content ?? []).filter((r) => r.marks?.some((m) => m.type === 'bold')).map((r) => r.text)
  assert(boldWords.includes('one') && boldWords.includes('two') && boldWords.includes('Plain line') && !boldWords.includes('Target'), `the sticky brush painted each clicked word and the whole line (${JSON.stringify(boldWords)})`)
  assert(fpParas[2]!.attrs?.textAlign === 'center', 'a whole painted paragraph takes the alignment too')
  step('the format painter copies a look once, or keeps painting after a double click, and Undo reverses a paint')

  // 15. Starting PageBinder again with no notebook named opens the last notebook at the last page.
  await save(page)
  await app.close()
  const env2: Record<string, string> = { ...(process.env as Record<string, string>), PAGEBINDER_TEST_DISPLAY: '2', PAGEBINDER_TEST_PICK_IMAGES: picturePath }
  delete env2['PAGEBINDER_OPEN']
  const app2 = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: env2 })
  const page2 = await app2.firstWindow()
  await page2.waitForSelector('.page-row.on', { timeout: 20000 })
  const reopened = await page2.locator('.page-row.on').innerText()
  assert(reopened.includes('Pasture log 2026'), `the last page is open again after a restart (${reopened})`)
  assert(await page2.locator('.canvas .tiptap', { hasText: 'Target one' }).count(), 'the last page shows its content')
  // The Welcome screen's remove button is a small button beside the notebook, not a wide band.
  await page2.locator('.notebook-button').click()
  await page2.locator('.context-item', { hasText: /^Switch notebook/ }).click()
  await page2.waitForSelector('.recent-forget')
  const forget = (await page2.locator('.recent-forget').first().boundingBox())!
  const row = (await page2.locator('.recent-row').first().boundingBox())!
  assert(forget.width <= 32 && forget.height <= 32 && forget.width < row.width / 8, `the remove button is small (${Math.round(forget.width)}x${Math.round(forget.height)} in a ${Math.round(row.width)} px row)`)
  step('a restart reopens the last notebook at the last page, and the recent list has a small remove button')

  // 16. The page.html backup copy shows the whole canvas, including what lies beside the paper;
  //     printing it still gives the sheets; Print Preview inside PageBinder shows the sheets.
  const wide = await createPage(root, sec, 'Beside the paper')
  const textBox = (id: string, x: number, y: number, text: string) => ({ kind: 'text' as const, id, x, y, width: 240, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })
  await savePage(root, wide.relPath, { ...wide.doc, objects: [textBox('in1', 100, 100, 'Inside the page'), textBox('out1', 900, 200, 'Out beside the paper')] })
  const backup = await app2.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({ show: false, width: 1400, height: 1100 })
    await w.loadFile(file)
    for (let i = 0; i < 50 && !(await w.webContents.executeJavaScript("document.body.classList.contains('paginated')")); i++) await new Promise((r) => setTimeout(r, 100))
    const probe = `(() => {
      // Seen: laid out, and not cut away by the sheet's printable-area clip.
      const seen = (p) => {
        const r = p.getBoundingClientRect()
        if (!p.getClientRects().length || r.width <= 0 || getComputedStyle(p).visibility !== 'visible') return false
        const clip = p.closest('.clip')
        if (!clip) return true
        const c = clip.getBoundingClientRect()
        return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom
      }
      const find = (t) => Array.from(document.querySelectorAll('p')).filter((p) => p.textContent === t && seen(p)).length
      return { view: document.body.dataset.view, sheetsShown: getComputedStyle(document.getElementById('sheets')).display !== 'none', boardShown: !!document.querySelector('.board') && getComputedStyle(document.querySelector('.board')).display !== 'none' && getComputedStyle(document.querySelector('.board')).visibility === 'visible', papers: document.querySelectorAll('.board .paper-bg').length, inside: find('Inside the page'), outside: find('Out beside the paper') }
    })()`
    const screen = await w.webContents.executeJavaScript(probe)
    w.webContents.debugger.attach()
    await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
    const print = await w.webContents.executeJavaScript(probe)
    w.destroy()
    return { screen, print }
  }, join(root, wide.relPath, 'page.html'))
  assert(backup.screen.view === 'canvas' && backup.screen.boardShown && !backup.screen.sheetsShown && backup.screen.papers >= 1 && backup.screen.inside === 1 && backup.screen.outside === 1, `the backup copy shows the whole canvas, including text beside the paper (${JSON.stringify(backup.screen)})`)
  assert(backup.print.sheetsShown && !backup.print.boardShown && backup.print.outside === 0 && backup.print.inside >= 1, `printed, the backup copy gives only the sheets (${JSON.stringify(backup.print)})`)
  // Back into the notebook from the Welcome screen's Recent list.
  await page2.locator('.recent-row button').first().click()
  await page2.waitForSelector('.section-tabs')
  const previewUrl = await page2.evaluate((rel) => window.pagebinder.fileUrl(`${rel}/page.html`), wide.relPath)
  const previewView = await app2.evaluate(async ({ BrowserWindow }, url) => {
    const w = new BrowserWindow({ show: false })
    await w.loadURL(url)
    const v = (await w.webContents.executeJavaScript('document.body.dataset.view')) as string
    w.destroy()
    return v
  }, previewUrl)
  assert(previewView === 'sheets', `Print Preview inside PageBinder still shows the printed sheets (${previewView})`)
  step('the HTML backup copy shows the whole canvas on screen and prints the sheets; Print Preview is unchanged')

  // 17. Cut and paste moves a picture from the page into a text box, and back out onto the page.
  const menu2 = async (channel: string): Promise<void> => {
    await app2.evaluate(({ BrowserWindow }, ch) => BrowserWindow.getAllWindows()[0]!.webContents.send(ch), channel)
  }
  await page2.locator('.page-row.add').click()
  await page2.waitForSelector('.page-row.renaming input')
  await page2.locator('.page-row.renaming input').fill('Moving pictures')
  await page2.keyboard.press('Enter')
  await page2.waitForSelector('.page-row.on:has-text("Moving pictures")')
  const mRel = `${sec}/Moving pictures.page`
  await page2.locator('.canvas').click({ button: 'right', position: { x: 140, y: 300 } })
  await page2.locator('.context-item', { hasText: /^Text box$/ }).click()
  await page2.waitForTimeout(300)
  await page2.keyboard.type('Words for the picture to sit beside.')
  await page2.keyboard.press('Escape')
  await page2.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await menu2('menu:insertImage')
  await page2.waitForSelector('.image-object img')
  const mDoc = async (): Promise<PageDoc> => JSON.parse(await fs.readFile(join(root, mRel, 'page.json'), 'utf8')) as PageDoc
  const counts = async (): Promise<{ onPage: number; inBox: number; name: string }> => {
    const d = await mDoc()
    const box = d.objects.find((o) => o.kind === 'text' && JSON.stringify(o.content).includes('Words for the')) as unknown as { pictures?: { name: string; width: number }[] } | undefined
    const img = d.objects.find((o) => o.kind === 'image') as unknown as { name: string } | undefined
    return { onPage: d.objects.filter((o) => o.kind === 'image').length, inBox: box?.pictures?.length ?? 0, name: img?.name ?? box?.pictures?.[0]?.name ?? '' }
  }
  await save(page2)
  const start = await counts()
  assert(start.onPage === 1 && start.inBox === 0, `a picture sits on the page (${JSON.stringify(start)})`)
  // Cut it from the page, click in the text box, paste: it goes into the box.
  await page2.locator('.image-object').click()
  await page2.keyboard.press(`${mod}+x`)
  await page2.waitForFunction(() => !document.querySelector('.image-object'))
  // What the menu's Paste does: a paste event carrying the system clipboard (which a test's key
  // press does not trigger).
  const pasteClipboard = async (text?: string): Promise<void> => {
    await page2.evaluate(async (t) => {
      const data = t ?? (await navigator.clipboard.readText())
      const dt = new DataTransfer()
      dt.setData('text/plain', data)
      ;(document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, text)
  }
  const marker = await page2.evaluate(() => navigator.clipboard.readText())
  assert(marker.startsWith('teal square.png'), `copying a picture puts a marker on the system clipboard (${JSON.stringify(marker)})`)
  await page2.locator('.canvas .tiptap p', { hasText: 'Words for the picture' }).click({ position: { x: 4, y: 6 } })
  await pasteClipboard()
  await page2.waitForSelector('.anchored-picture-frame')
  await save(page2)
  const inside = await counts()
  assert(inside.onPage === 0 && inside.inBox === 1 && inside.name === start.name, `cut from the page and pasted in the text box, the picture is in the box (${JSON.stringify(inside)})`)
  // Cut it from the box, click on the page, paste: it is back on the page.
  await page2.locator('.anchored-picture-frame').click()
  await page2.keyboard.press(`${mod}+x`)
  await page2.waitForFunction(() => !document.querySelector('.anchored-picture-frame'))
  await page2.locator('.canvas').click({ position: { x: 600, y: 700 } })
  await page2.keyboard.press(`${mod}+v`)
  await page2.waitForSelector('.image-object img')
  await save(page2)
  const outside = await counts()
  assert(outside.onPage === 1 && outside.inBox === 0 && outside.name === start.name, `cut from the box and pasted on the page, the picture is on the page again (${JSON.stringify(outside)})`)
  // Right-click > Paste picture in a text box puts a copied picture where the box was right-clicked.
  await page2.locator('.image-object').click()
  await page2.keyboard.press(`${mod}+c`)
  await page2.locator('.canvas .tiptap p', { hasText: 'Words for the picture' }).click({ button: 'right', position: { x: 30, y: 6 } })
  await page2.locator('.context-item', { hasText: /^Paste picture$/ }).click()
  await page2.waitForSelector('.anchored-picture-frame')
  await save(page2)
  const viaRightClick = await counts()
  assert(viaRightClick.onPage === 1 && viaRightClick.inBox === 1, `right-click > Paste picture puts the copied picture in the text box (${JSON.stringify(viaRightClick)})`)
  // Text copied afterwards (so the clipboard no longer holds the marker) pastes as text.
  await page2.locator('.canvas .tiptap p', { hasText: 'Words for the picture' }).click()
  await page2.keyboard.press('End')
  await page2.evaluate(() => navigator.clipboard.writeText('Words'))
  await pasteClipboard()
  await page2.waitForTimeout(300)
  await save(page2)
  const afterText = await counts()
  const boxText = JSON.stringify((await mDoc()).objects.find((o) => o.kind === 'text' && JSON.stringify(o.content).includes('Words for')))
  const boxWords = [...boxText.matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]).join("")
  assert(afterText.inBox === viaRightClick.inBox && (boxWords.match(/Words/g) ?? []).length === 2, `text copied later pastes as text (${boxWords}; pictures ${JSON.stringify(afterText)})`)
  step('cut and paste moves a picture from the page into a text box and back, right-click > Paste picture works in a text box, and later text copies still paste as text')

  // 18. File > Notebook Properties: last edit with the account name, size and files, history, large attachments.
  await menu2('menu:properties')
  await page2.waitForSelector('.properties .total-size')
  const propsNone = await page2.locator('.properties').innerText()
  assert(propsNone.includes('None over 50 MB'), 'no large attachments yet')
  await page2.keyboard.press('Escape')
  // Six attachments over 50 MB (sparse files, so quick to make): the total of all six, then the five largest.
  for (let i = 0; i < 6; i++) {
    const h = await fs.open(join(root, mRel, 'attachments', `video ${i}.mov`), 'w')
    await h.truncate(50 * 1024 * 1024 + (i + 1) * 1024 * 1024)
    await h.close()
  }
  await menu2('menu:properties')
  await page2.waitForSelector('.properties .total-size')
  const propsText = await page2.locator('.properties').innerText()
  const account = (await import('node:os')).userInfo().username
  assert(propsText.includes(`by ${account}`) && /Size on disk[\s\S]*files/.test(propsText) && /Page history[\s\S]*saved version/.test(propsText) && (await page2.locator('.properties .large-total').innerText()).includes('in 6 attachments of 50 MB or more') && (await page2.locator('.properties .large-attachments li').count()) === 5 && !(await page2.locator('.properties .large-attachments li', { hasText: 'video 0.mov' }).count()), `the properties window shows the last edit, sizes, and history (${propsText.replace(/\n/g, ' | ').slice(0, 400)})`)
  await page2.keyboard.press('Escape')
  step('File > Notebook Properties shows the last edit with its author, the size and file count, history, and large attachments')

  // 19. Page History shows a version as the whole canvas.
  await menu2('menu:history')
  await page2.waitForSelector('.preview.history')
  await page2.waitForFunction(() => document.querySelectorAll('.history-row').length >= 1)
  await page2.locator('.history-row').nth(0).click()
  let histView: string | undefined
  for (let i = 0; i < 50 && !histView; i++) {
    const f = page2.frames().find((fr) => fr !== page2.mainFrame() && fr.url().includes('/.history/'))
    if (f) histView = await f.evaluate(() => (document.body.classList.contains('paginated') ? document.body.dataset.view : undefined)).catch(() => undefined)
    if (!histView) await page2.waitForTimeout(100)
  }
  assert(histView === 'canvas', `Page History previews a version as the whole canvas (${histView})`)
  step('Page History previews versions as the whole canvas')

  // 20. Page border and grid belong to each page. With the border off, text runs on across sheet
  //     boundaries with no gaps (on screen only).
  await page2.keyboard.press('Escape')
  await page2.waitForSelector('.preview.history', { state: 'detached' }).catch(() => undefined)
  await page2.locator('.page-row.add').click()
  await page2.waitForSelector('.page-row.renaming input')
  await page2.locator('.page-row.renaming input').fill('Endless')
  await page2.keyboard.press('Enter')
  await page2.waitForSelector('.page-row.on:has-text("Endless")')
  const eRel = `${sec}/Endless.page`
  await page2.locator('.canvas').click({ button: 'right', position: { x: 140, y: 820 } })
  await page2.locator('.context-item', { hasText: /^Text box$/ }).click()
  await page2.waitForTimeout(300)
  await page2.keyboard.type(Array.from({ length: 14 }, () => 'A long line of field notes that runs on past the bottom of the first sheet.').join(' '))
  const gaps = async (): Promise<number> => page2.locator('.canvas [data-sheet-spacer], .canvas [data-sheet-break]').count()
  await page2.waitForFunction(() => document.querySelectorAll('.canvas [data-sheet-spacer], .canvas [data-sheet-break]').length > 0)
  assert((await page2.locator('.canvas .paper').count()) > 0, 'a new page starts with the page border')
  assert(!(await page2.locator('.canvas.grid').count()), 'a new page starts without the grid')
  await menu2('menu:togglePageBorder')
  await page2.waitForFunction(() => !document.querySelector('.canvas .paper'))
  await page2.waitForTimeout(300)
  assert((await gaps()) === 0, 'with the border off, text runs on across the sheet boundary with no gap')
  await menu2('menu:toggleGrid')
  await page2.waitForSelector('.canvas.grid')
  await save(page2)
  const eDoc = JSON.parse(await fs.readFile(join(root, eRel, 'page.json'), 'utf8')) as PageDoc
  assert(eDoc.pageBorder === false && eDoc.pageGrid === true, `the border and grid settings are saved with the page (${eDoc.pageBorder}, ${eDoc.pageGrid})`)
  // Another page keeps its own settings; coming back restores this page's.
  await page2.locator('.page-row', { hasText: 'Moving pictures' }).click()
  await page2.waitForSelector('.page-row.on:has-text("Moving pictures")')
  await page2.waitForSelector('.canvas .paper')
  assert(!(await page2.locator('.canvas.grid').count()), 'another page keeps its border and has no grid')
  await page2.locator('.page-row', { hasText: 'Endless' }).click()
  await page2.waitForSelector('.page-row.on:has-text("Endless")')
  await page2.waitForSelector('.canvas.grid')
  assert(!(await page2.locator('.canvas .paper').count()) && (await gaps()) === 0, 'coming back, the page is still borderless and endless')
  // Turning the border back on brings the sheet breaks back.
  await menu2('menu:togglePageBorder')
  await page2.waitForSelector('.canvas .paper')
  await page2.waitForFunction(() => document.querySelectorAll('.canvas [data-sheet-spacer], .canvas [data-sheet-break]').length > 0)
  step('the page border and grid are saved with each page, and with the border off text runs on with no gaps between sheets')
  await app2.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
