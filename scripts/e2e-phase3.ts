/// <reference lib="dom" />
/**
 * Phase 3 and formatting checks through the real Electron window.
 *   npx tsx scripts/e2e-phase3.ts
 */
import { _electron as electron, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import type { PageDoc } from '../src/shared/types'

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

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e3-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Phase 3 notebook')
  const sec = await createSection(root, '', 'Files', '#1D9E75')
  const rel = (await createPage(root, sec, 'Attachments')).relPath
  const shots = process.env['E2E_SHOTS'] ?? base
  await fs.mkdir(shots, { recursive: true })
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  const html = (): Promise<string> => fs.readFile(join(root, rel, 'page.html'), 'utf8')
  const doc = async (): Promise<PageDoc> => JSON.parse(await fs.readFile(join(root, rel, 'page.json'), 'utf8')) as PageDoc

  // Files to attach through the (test-seamed) picker.
  const eml = join(base, 'Ridge Road quote.eml')
  await fs.writeFile(eml, 'From: Sam Rivers <sam@example.com>\r\nSubject: Ridge Road quote\r\nDate: Mon, 14 Sep 2026 09:42:11 +0000\r\n\r\nPlease find the quote attached.\r\n')
  const txt = join(base, 'RE: field notes day 1?.txt')
  await fs.writeFile(txt, 'x'.repeat(4096))

  const app = await electron.launch({
    args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`],
    cwd: resolve('.'),
    env: { ...process.env, PAGEBINDER_OPEN: root, PAGEBINDER_TEST_PICK_FILES: `${eml}\n${txt}` }
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')

  // 1. Page number shows in the editor, lower right of the sheet.
  const num = page.locator('.page-number')
  assert((await num.count()) === 1 && (await num.textContent()) === 'Page 1 of 1', 'page number drawn on the sheet')
  const numBox = (await num.boundingBox())!
  const paperBox = (await page.locator('.paper').boundingBox())!
  assert(numBox.y > paperBox.y + paperBox.height * 0.9 && numBox.x + numBox.width > paperBox.x + paperBox.width * 0.7, 'page number sits in the lower right corner')
  step('page numbers appear in the editor where they will print')

  // 2. Text formatting: font, size, colour, highlight, underline, alignment.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.type('Formatted line')
  await page.waitForTimeout(150)
  await page.keyboard.press(`${mod}+a`)
  await page.waitForTimeout(150)
  await page.locator('.tb-select.font').selectOption('Georgia, serif')
  await page.waitForTimeout(150)
  await page.locator('.tb-select.size').selectOption('18')
  await page.waitForTimeout(150)
  await page.locator('.tb.color[title="Text colour"]').click()
  await page.locator('.context-swatches.grid button[aria-label="Colour #a32d2d"]').click()
  await page.locator('.tb.color[title="Highlight"]').click()
  await page.locator('.context-swatches.grid button[aria-label="Colour #fac775"]').click()
  await page.locator('.tb.underline').click()
  await page.locator('.tb[title="Align centre"]').click()
  await save(page)
  const j = JSON.stringify((await doc()).objects)
  assert(j.includes('"fontFamily":"Georgia, serif"'), `font family saved: ${j.slice(0, 700)}`)
  assert(j.includes('"fontSize":"18px"'), 'font size saved')
  assert(j.includes('"color":"#a32d2d"'), 'text colour saved')
  assert(j.includes('"backgroundColor":"#fac775"'), 'highlight saved')
  assert(j.includes('"type":"underline"'), 'underline saved')
  assert(j.includes('"textAlign":"center"'), 'alignment saved')
  const h = await html()
  assert(h.includes('font-family: Georgia, serif') && h.includes('background-color: #fac775') && h.includes('text-align: center'), 'formatting rendered in page.html')
  step('font, size, colour, highlight, underline, and alignment are saved and rendered')

  // 3. Table tools: insert, add a row, fill a cell.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.locator('.canvas').click({ button: 'right', position: { x: 120, y: 400 } })
  await page.locator('.context-item', { hasText: 'Table (3' }).click()
  await page.waitForSelector('.tiptap table td')
  await page.locator('.tiptap table td').first().click()
  await page.keyboard.type('Cell A1')
  await page.locator('.tiptap table td').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Insert row below' }).click()
  await page.locator('.tiptap table td').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Cell fill colour' }).click()
  await page.locator('.context-menu .context-swatches.grid button[aria-label="Colour #c0dd97"]').click()
  await save(page)
  const d3 = await doc()
  const t = JSON.stringify(d3.objects)
  assert((t.match(/"type":"tableRow"/g) ?? []).length === 4, 'table has four rows after Row below')
  assert(t.includes('"backgroundColor":"#c0dd97"'), 'cell fill saved')
  assert((await html()).includes('background-color: #c0dd97'), 'cell fill rendered in page.html')
  // Borders from the cell menu: all borders thin, then none, both rendered in page.html.
  await page.locator('.tiptap table td').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Borders/ }).click()
  await page.locator('.context-item', { hasText: /^All \(thin\)/ }).click()
  await save(page)
  const withBorders = JSON.stringify((await doc()).objects)
  assert(withBorders.includes('"borders":{"top":"thin","right":"thin","bottom":"thin","left":"thin"}'), 'all borders stored on the cell')
  assert((await html()).includes('border-top: 1px solid'), 'borders rendered in page.html')
  await page.locator('.tiptap table td').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: /^Borders/ }).click()
  await page.locator('.context-item', { hasText: 'Weight: thin' }).click()
  assert(await page.locator('.context-item', { hasText: 'Weight: medium' }).count(), 'changing the border weight keeps the menu open and updates it')
  await page.locator('.context-item', { hasText: /^None$/ }).click()
  await save(page)
  assert(JSON.stringify((await doc()).objects).includes('"top":"none"'), 'borders can be removed')
  step('table rows, fill, and borders are set from the cell right-click menu')

  // 4. Delete a text box: Escape selects it, Delete removes it; Backspace in an empty box removes it.
  const before = await page.locator('.text-container').count()
  await newBox(page, 560, 700)
  await page.waitForTimeout(150)
  await page.keyboard.type('temporary')
  assert((await page.locator('.text-container').count()) === before + 1, 'second text box created')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.text-container.selected')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(150)
  assert((await page.locator('.text-container').count()) === before, 'Delete removed the selected text box')
  await newBox(page, 560, 760)
  await page.waitForTimeout(150)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(150)
  assert((await page.locator('.text-container').count()) === before, 'Backspace in an empty text box removes it')
  step('text boxes can be deleted with Escape then Delete, or Backspace when empty')

  // 5. Attach files: an email and a text file with an awkward name.
  await page.locator('.canvas').click({ button: 'right', position: { x: 700, y: 900 } })
  await page.locator('.context-item', { hasText: 'File attachment' }).click()
  await page.waitForSelector('.file-card')
  await page.waitForFunction(() => document.querySelectorAll('.file-card').length === 2)
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
  const d5 = await doc()
  const files = d5.objects.filter((o) => o.kind === 'file')
  assert(files.length === 2, 'two file objects on the page')
  const mail = files.find((o) => o.kind === 'file' && o.mail)
  assert(mail && mail.kind === 'file' && mail.mail?.subject === 'Ridge Road quote' && mail.mail.from.includes('Sam Rivers'), 'email card carries subject and sender')
  assert(d5.manifest.attachments.some((e) => e.name === 'RE field notes day 1.txt' && e.originalName === 'RE: field notes day 1?.txt'), 'awkward filename sanitised, original kept')
  const names = await fs.readdir(join(root, rel, 'attachments'))
  assert(names.sort().join('|') === 'RE field notes day 1.txt|Ridge Road quote.eml', `attachments folder holds the files (${names.join(', ')})`)
  const h5 = await html()
  assert(h5.includes('class="file-card"') && h5.includes('Ridge Road quote') && h5.includes('href="attachments/Ridge%20Road%20quote.eml"'), 'cards rendered in page.html with relative links')
  assert(await page.locator('.file-card', { hasText: 'Sam Rivers' }).count(), 'email card shows the sender in the editor')
  step('files attach as cards with sanitised names; emails show subject and sender')

  // 6. Right-click a card offers Open in default application; Delete removes a selected card.
  await page.locator('.file-card').first().click({ button: 'right' })
  assert(await page.locator('.context-item', { hasText: 'Open in default application' }).count(), 'context menu offers Open in default application')
  assert(await page.locator('.context-item', { hasText: 'Show in Finder' }).count(), 'context menu offers Show in Finder')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await page.screenshot({ path: join(shots, 'phase3-cards.png') })
  await page.locator('.file-card').first().click()
  await page.keyboard.press('Delete')
  await page.waitForTimeout(200)
  assert((await page.locator('.file-card').count()) === 1, 'Delete removed the selected card')
  await save(page)
  step('cards can be opened from the context menu and deleted with the Delete key')

  // 6b. Undo restores the deleted card; redo removes it again.
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  assert((await page.locator('.file-card').count()) === 2, 'Cmd+Z restored the deleted card')
  await page.keyboard.press(`Shift+${mod}+z`)
  await page.waitForTimeout(200)
  assert((await page.locator('.file-card').count()) === 1, 'Shift+Cmd+Z removed it again')
  // A drag is one undo step, no matter how many mouse moves it took.
  // Positions are compared in the saved document, not the viewport, because the canvas may scroll.
  await save(page)
  const cardBefore = (await doc()).objects.find((o) => o.kind === 'file')!
  const cardBox = (await page.locator('.file-card').first().boundingBox())!
  await page.mouse.move(cardBox.x + 30, cardBox.y + 10)
  await page.mouse.down()
  await page.mouse.move(cardBox.x + 230, cardBox.y + 210, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await save(page)
  const cardMoved = (await doc()).objects.find((o) => o.kind === 'file')!
  assert(cardMoved.x > cardBefore.x + 100 && cardMoved.y > cardBefore.y + 100, 'card moved by dragging')
  await newBox(page, 700, 60)
  await page.waitForTimeout(150)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  await save(page)
  const cardBack = (await doc()).objects.find((o) => o.kind === 'file')!
  assert(cardBack.x === cardBefore.x && cardBack.y === cardBefore.y, `undo put the card back (${cardBack.x},${cardBack.y} vs ${cardBefore.x},${cardBefore.y})`)
  step('undo and redo cover deleting and moving objects, one step per drag')

  // 6b2. A fresh text box with the cursor inside: Cmd+Z undoes its creation; redo must not grab the cursor.
  const boxes0 = await page.locator('.text-container').count()
  await newBox(page, 700, 160)
  await page.waitForTimeout(400)
  assert((await page.locator('.text-container').count()) === boxes0 + 1, 'box created with cursor inside')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  assert((await page.locator('.text-container').count()) === boxes0, 'Cmd+Z inside an untouched box undid its creation')
  await page.keyboard.press(`Shift+${mod}+z`)
  await page.waitForTimeout(400)
  assert((await page.locator('.text-container').count()) === boxes0 + 1, 'redo recreated the box')
  const focusedInBox = await page.evaluate(() => !!document.activeElement?.closest('.tiptap'))
  assert(!focusedInBox, 'redo did not move the cursor into the recreated box')
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  assert((await page.locator('.text-container').count()) === boxes0, 'a second Cmd+Z still reaches the page history')
  step('undo works from inside an untouched text box, and redo does not steal focus')

  // 6b3. Right-click a cell: row height and column width dialogs apply to the cell or the selection.
  await page.locator('.tiptap table td').first().click({ button: 'right' })
  await page.waitForTimeout(300)
  process.stdout.write(`    menu: ${JSON.stringify(await page.locator('.context-item').allTextContents())} tds=${await page.locator('.tiptap table td').count()} containers=${await page.locator('.text-container').count()}\n`)
  await page.locator('.context-item', { hasText: 'Row height' }).click()
  await page.locator('.dialog input').fill('72')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForTimeout(200)
  await page.locator('.tiptap table td').first().click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Column width' }).click()
  await page.locator('.dialog input').fill('210')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForTimeout(200)
  await save(page)
  const sized = JSON.stringify((await doc()).objects)
  assert(sized.includes('"height":72'), 'row height applied from the cell menu')
  assert(sized.includes('"colwidth":[210]'), 'column width applied from the cell menu')
  const firstCellBox = (await page.locator('.tiptap table td').first().boundingBox())!
  assert(Math.abs(firstCellBox.width - 210) < 4 && firstCellBox.height >= 70, `cell sized on screen (${Math.round(firstCellBox.width)}×${Math.round(firstCellBox.height)})`)
  step('row height and column width can be set from the cell right-click menu')

  // 6c. Ctrl+wheel zooms the canvas; the toolbar shows the level and resets it.
  const scroll = page.locator('.canvas-scroll')
  const sb = (await scroll.boundingBox())!
  await page.mouse.move(sb.x + 200, sb.y + 200)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -300)
  await page.keyboard.up('Control')
  await page.waitForTimeout(200)
  const zoomLabel = await page.locator('.tb.zoom').textContent()
  const transform = await page.locator('.canvas').evaluate((el) => (el as HTMLElement).style.transform)
  assert(zoomLabel !== '100%' && transform.startsWith('scale(') && !transform.startsWith('scale(1)'), `zoom changed (${zoomLabel}, ${transform})`)
  await page.locator('.tb.zoom').click()
  await page.waitForTimeout(100)
  assert((await page.locator('.tb.zoom').textContent()) === '100%', 'zoom reset to 100%')
  step('Ctrl+wheel zooms the page and the toolbar resets it')

  // 6d. Dragging the bottom edge of a table row changes its height.
  const firstCell = page.locator('.tiptap table td').first()
  const cb = (await firstCell.boundingBox())!
  await page.mouse.move(cb.x + 20, cb.y + cb.height - 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + 20, cb.y + cb.height + 60, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await save(page)
  const rowJson = JSON.stringify((await doc()).objects)
  const m = /"height":(\d+)/.exec(rowJson)
  assert(m && Number(m[1]) >= cb.height + 40, `row height saved (${m?.[1] ?? 'none'})`)
  assert((await html()).includes('<tr style="height:'), 'row height rendered in page.html')
  step('table rows resize by dragging their bottom edge')

  // 6e. Draw a nearly horizontal line: it snaps to horizontal; fill a rectangle from the toolbar; both print.
  const cb2 = (await page.locator('.canvas').boundingBox())!
  await page.locator('.canvas').click({ button: 'right', position: { x: 300, y: 900 } })
  await page.locator('.context-item', { hasText: 'Draw line' }).click()
  await page.mouse.move(cb2.x + 620, cb2.y + 300)
  await page.mouse.down()
  await page.mouse.move(cb2.x + 900, cb2.y + 312, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await page.locator('.canvas').click({ button: 'right', position: { x: 300, y: 900 } })
  await page.locator('.context-item', { hasText: 'Draw rectangle' }).click()
  await page.mouse.move(cb2.x + 620, cb2.y + 360)
  await page.mouse.down()
  await page.mouse.move(cb2.x + 780, cb2.y + 460, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  // The rectangle is selected after drawing; the highlight tool now sets its fill.
  await page.locator('.tb.color[title="Fill colour of the selected shapes"]').click()
  await page.locator('.context-swatches.grid button[aria-label="Colour #9fe1cb"]').click()
  await save(page)
  const shapes = (await doc()).objects.filter((o) => o.kind === 'shape')
  assert(shapes.length === 2, `two shapes saved (${shapes.length})`)
  const line = shapes.find((o) => o.kind === 'shape' && o.shape === 'line')
  assert(line && line.kind === 'shape' && line.a && line.b && line.a.y === line.b.y, 'a nearly horizontal line snapped to horizontal')
  const rect = shapes.find((o) => o.kind === 'shape' && o.shape === 'rect')
  assert(rect && rect.kind === 'shape' && rect.fill === '#9fe1cb', 'rectangle filled from the toolbar')
  const h6 = await html()
  assert(h6.includes('<svg class="shape-svg"') && h6.includes('<rect') && h6.includes('<line'), 'shapes rendered in page.html')
  step('lines snap to horizontal, shapes take a fill from the toolbar, and both print')

  // 6f. Margin presets in Page setup.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:pageSetup'))
  await page.waitForSelector('.dialog select')
  await page.locator('.dialog select').nth(2).selectOption('narrow')
  await page.locator('.dialog button[type=submit]').click()
  await save(page)
  const mg = (await doc()).paper.margins
  assert(mg.top === 0.5 && mg.left === 0.5, 'narrow preset applied')
  step('margin presets apply from Page setup')

  // 7. A missing attachment is reported when the page is reopened.
  await fs.rm(join(root, rel, 'attachments', 'RE field notes day 1.txt'))
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.locator('.page-row', { hasText: 'Attachments' }).click()
  await page.waitForSelector('.notice.missing-files')
  const remaining = await page.locator('.file-card').count()
  const missingCards = await page.locator('.file-card.missing').count()
  assert(remaining >= 1 && (missingCards === 1 || (await page.locator('.file-card', { hasText: 'Ridge Road quote' }).count()) === 1), 'page reopens with the missing file flagged')
  step('a missing attachment is flagged on reopen without affecting the rest of the page')

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
