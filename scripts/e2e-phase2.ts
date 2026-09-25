/// <reference lib="dom" />
/**
 * Phase 2 acceptance through the real Electron window.
 *   npx tsx scripts/e2e-phase2.ts
 */
import { _electron as electron, type Page, type ElectronApplication } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import type { PageDoc, PaperSettings } from '../src/shared/types'

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

/** Minimal valid PNG: solid colour, so the test needs no image fixtures. */
function makePng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function save(page: Page): Promise<void> {
  await page.keyboard.press(`${mod}+s`)
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(300)
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e2-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Phase 2 notebook')
  const notes = await createSection(root, '', 'Docs', '#378ADD')
  const created = await createPage(root, notes, 'Report')
  let rel = created.relPath
  const shots = process.env['E2E_SHOTS'] ?? base
  await fs.mkdir(shots, { recursive: true })
  const step = (s: string): void => {
    process.stdout.write(`  ✓ ${s}\n`)
  }
  const html = (): Promise<string> => fs.readFile(join(root, rel, 'page.html'), 'utf8')
  const doc = async (): Promise<PageDoc> => JSON.parse(await fs.readFile(join(root, rel, 'page.json'), 'utf8')) as PageDoc

  const app: ElectronApplication = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  const page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')

  // 1. page.html exists for a brand new page.
  assert((await html()).includes('<title>Report</title>'), 'page.html written on create')
  step('page.html is written when a page is created')

  // 2. Heading, table, to-do list, tag.
  await page.locator('.text-container .tiptap').first().click()
  await page.keyboard.type('Survey summary')
  await page.locator('.tb[title="Heading 2"]').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Flew the north field at 60 m.')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  // Tables are inserted from the canvas right-click menu, as their own box.
  await page.locator('.canvas').click({ button: 'right', position: { x: 120, y: 420 } })
  await page.locator('.context-item', { hasText: 'Table (3' }).click()
  await page.waitForSelector('.tiptap table td')
  await page.locator('.tiptap table td').first().click()
  await page.keyboard.type('Pass')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Altitude')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Notes')
  await page.keyboard.press('Tab')
  await page.keyboard.type('1')
  await page.keyboard.press('Tab')
  await page.keyboard.type('60 m')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Clean')
  await save(page)
  let d = await doc()
  const json = JSON.stringify(d.objects)
  assert(json.includes('"type":"table"'), 'table saved in page.json')
  const h1 = await html()
  assert(h1.includes('<table') && h1.includes('<td') && h1.includes('Altitude'), 'table rendered in page.html')
  assert(h1.includes('<h2'), 'heading rendered in page.html')
  step('heading and table are saved and rendered')

  // 3. To-do list in a second container.
  await newBox(page, 700, 700)
  await page.waitForTimeout(200)
  await page.locator('.tb[title="To do list"]').click()
  await page.keyboard.type('Check drainage')
  await save(page)
  assert((await html()).includes('data-type="taskList"'), 'to-do list rendered in page.html')
  step('to-do list is rendered')

  // 4. Paste an image: goes through the real paste handler.
  const png = makePng(160, 100, [216, 90, 48])
  await page.evaluate(async (b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'orange block.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
  }, png.toString('base64'))
  await page.waitForSelector('.image-object img')
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>('.image-object img')
    return !!img && img.naturalWidth === 160
  })
  await page.waitForSelector('.save-status.saved')
  await page.waitForTimeout(400)
  d = await doc()
  const imgObj = d.objects.find((o) => o.kind === 'image')
  assert(imgObj && imgObj.kind === 'image' && imgObj.width === 160 && imgObj.height === 100, 'image object sized from the file')
  assert(d.manifest.images.length === 1 && d.manifest.images[0]!.name === 'orange block.png', 'manifest records the image')
  assert(await fs.stat(join(root, rel, 'images', 'orange block.png')).then(() => true, () => false), 'image file copied into the page folder')
  assert((await html()).includes('src="images/orange%20block.png"'), 'image referenced relatively in page.html')
  step('a pasted image is stored in the page folder and rendered')

  // 5. Drag the image near the left margin and check it snaps to it.
  const imgBox = (await page.locator('.image-object').boundingBox())!
  await page.mouse.move(imgBox.x + 20, imgBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(imgBox.x + 20 - (imgObj!.x - 100), imgBox.y + 20 + 200, { steps: 8 })
  await page.mouse.up()
  await save(page)
  d = await doc()
  assert(d.objects.find((o) => o.kind === 'image')!.x === 96, `image snapped to the left margin (x=${d.objects.find((o) => o.kind === 'image')!.x})`)
  step('dragging near the margin snaps to it')
  await page.screenshot({ path: join(shots, 'phase2-canvas.png') })

  // 5c. Show the image as an attachment card, then back as a picture.
  await page.locator('.image-object').click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Show as attachment' }).click()
  await page.waitForSelector('.file-card')
  await save(page)
  assert((await html()).includes('class="file-card"'), 'attachment card rendered in page.html')
  await page.locator('.file-card').click({ button: 'right' })
  await page.locator('.context-item', { hasText: 'Show as picture' }).click()
  await page.waitForSelector('.image-object img')
  await page.waitForFunction(() => (document.querySelector('.image-object') as HTMLElement | null)?.offsetWidth === 160)
  await save(page)
  step('a picture can be shown as an attachment card and back')

  // 5d. Table with nothing focused creates a container holding a table.
  await page.locator('.page-row.add').click()
  await page.waitForSelector('.page-row.renaming input')
  await page.locator('.page-row.renaming input').fill('Table page')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.page-row.on:has-text("Table page")')
  await page.waitForTimeout(300)
  await page.locator('.canvas').click({ button: 'right', position: { x: 200, y: 300 } })
  await page.locator('.context-item', { hasText: 'Table (3' }).click()
  await page.waitForSelector('.tiptap table')
  step('a table can be inserted from the canvas right-click menu')
  await page.locator('.page-row', { hasText: 'Report' }).click()
  await page.waitForSelector('.image-object img')

  // 6. Print preview shows the rendered sheets.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:printPreview'))
  await page.waitForSelector('.preview-frame')
  let frame = page.frames().find((f) => f.url().startsWith('pagebinder://'))
  for (let i = 0; i < 50 && !frame; i++) {
    await page.waitForTimeout(200)
    frame = page.frames().find((f) => f.url().startsWith('pagebinder://'))
  }
  assert(frame, `preview frame loaded from the notebook protocol (frames: ${page.frames().map((f) => f.url()).join(' | ')})`)
  await frame!.waitForSelector('.sheet')
  assert((await frame!.locator('.sheet').count()) >= 1, 'preview built sheets')
  await page.screenshot({ path: join(shots, 'phase2-preview.png') })
  await page.locator('.preview-bar button', { hasText: 'Close' }).click()
  step('print preview renders the page from page.html')

  // 7. PDF export at each paper size and orientation; check the page box inside the PDF.
  const cases: { paper: PaperSettings; box: string }[] = [
    { paper: { size: 'letter', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 } }, box: '612 792' },
    { paper: { size: 'letter', orientation: 'landscape', margins: { top: 1, right: 1, bottom: 1, left: 1 } }, box: '792 612' },
    { paper: { size: 'tabloid', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 } }, box: '792 1224' },
    { paper: { size: 'tabloid', orientation: 'landscape', margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 } }, box: '1224 792' }
  ]
  for (const c of cases) {
    // Apply through the page setup dialog, save, then export: the PDF follows the page's own paper.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:pageSetup'))
      await page.waitForSelector('.dialog select')
    await page.locator('.dialog select').first().selectOption(c.paper.size)
    await page.locator('.dialog select').nth(1).selectOption(c.paper.orientation)
    await page.locator('.dialog button[type=submit]').click()
    await page.waitForTimeout(100)
    await save(page)
    const out = join(base, `${c.paper.size}-${c.paper.orientation}.pdf`)
    const written = await page.evaluate(
      async ({ rel, paper, out }) => window.pagebinder.print.pdf(rel, paper, 'Report', out),
      { rel, paper: c.paper, out }
    )
    assert(written === out, `pdf written for ${c.paper.size} ${c.paper.orientation}`)
    const pdf = await fs.readFile(out)
    assert(pdf.length > 2000, 'pdf has content')
    const text = pdf.toString('latin1')
    assert(text.includes(`/MediaBox [0 0 ${c.box}]`), `pdf page box is ${c.box} for ${c.paper.size} ${c.paper.orientation}`)
  }
  step('PDF export produces the right paper size for Letter and Tabloid, portrait and landscape')

  // 8. Page setup to Tabloid landscape through the dialog changes the canvas.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('menu:pageSetup'))
      await page.waitForSelector('.dialog select')
  await page.locator('.dialog select').first().selectOption('tabloid')
  await page.locator('.dialog select').nth(1).selectOption('landscape')
  await page.locator('.dialog button[type=submit]').click()
  await page.waitForFunction(() => (document.querySelector('.paper') as HTMLElement | null)?.offsetWidth === 1632)
  await save(page)
  d = await doc()
  assert(d.paper.size === 'tabloid' && d.paper.orientation === 'landscape', 'paper saved in page.json')
  assert((await html()).includes('@page { size: 17in 11in; margin: 0; }'), 'page.html carries the paper size')
  step('page setup changes the sheet on the canvas and in page.html')

  // 9. Long content paginates into several sheets in page.html.
  await newBox(page, 1000, 300)
  await page.waitForTimeout(200)
  for (let i = 0; i < 40; i++) {
    await page.keyboard.type(`Line ${i + 1} of a long note that must continue on the next sheet.`)
    await page.keyboard.press('Enter')
  }
  await save(page)

  // 10. Open page.html in a plain browser window (file://) with no app involvement.
  const htmlPath = join(root, rel, 'page.html')
  const result = await app.evaluate(async ({ BrowserWindow }, path: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadFile(path)
    await new Promise((r) => setTimeout(r, 400))
    const out = (await win.webContents.executeJavaScript(`({
      title: document.title,
      sheets: Number(document.body.dataset.sheets),
      sheetEls: document.querySelectorAll('.sheet').length,
      imgOk: Array.from(document.querySelectorAll('.sheet img')).some(i => i.naturalWidth === 160),
      table: !!document.querySelector('.sheet table'),
      footer: (document.querySelector('.sheet .band.footer') || {}).textContent || ''
    })`)) as { title: string; sheets: number; sheetEls: number; imgOk: boolean; table: boolean; footer: string }
    win.destroy()
    return out
  }, htmlPath)
  assert(result.title === 'Report', 'browser shows the page title')
  // Every table row must be the same height in the editor and in the rendered page.
  await page.locator('.page-row', { hasText: 'Report' }).click()
  await page.waitForSelector('.tiptap table')
  const editorRows = await page.evaluate(() => Array.from(document.querySelectorAll('.tiptap table tr')).map((tr) => Math.round(tr.getBoundingClientRect().height)))
  const renderedRows = await app.evaluate(async ({ BrowserWindow }, path: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadFile(path)
    await new Promise((r) => setTimeout(r, 300))
    const rows = (await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.sheet table tr')).map(tr => Math.round(tr.getBoundingClientRect().height))`)) as number[]
    win.destroy()
    return rows
  }, htmlPath)
  assert(editorRows.length > 0 && editorRows.every((h, i) => Math.abs(h - (renderedRows[i] ?? -99)) <= 1), `table rows match between editor and print (${editorRows.join(',')} vs ${renderedRows.join(',')})`)
  assert(result.sheets >= 2 && result.sheetEls === result.sheets, `browser paginated into ${result.sheets} sheets`)
  assert(result.imgOk, 'browser loaded the image from the images folder')
  assert(result.table, 'browser shows the table')
  assert(result.footer.startsWith('Page 1 of'), `footer shows page numbers (${result.footer})`)
  step(`page.html opens in a plain browser window with ${result.sheets} sheets, image, and table`)

  await app.close()
  process.stdout.write(`\nPASS. Notebook kept at ${root}\n`)
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
