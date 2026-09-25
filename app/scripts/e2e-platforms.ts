/// <reference lib="dom" />
/**
 * Phase 8 (Windows and packaging) through the real Electron window: the first-run Welcome screen,
 * the long-path warning in Verify Notebook, and a notebook copied with another computer's lock.
 *   npx tsx scripts/e2e-platforms.ts
 */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, savePage } from '../src/main/storage/page'
import { addImageBytes } from '../src/main/storage/images'
import { tealPng } from './png'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}
function step(s: string): void {
  process.stdout.write(`  ✓ ${s}\n`)
}

async function launch(userData: string, root?: string, extra: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), PAGEBINDER_TEST_DISPLAY: '2', ...extra }
  if (root) env['PAGEBINDER_OPEN'] = root
  else delete env['PAGEBINDER_OPEN']
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env })
  const page = await app.firstWindow()
  await page.waitForSelector(root ? '.section-tabs' : '.welcome')
  return { app, page }
}

async function menu(app: ElectronApplication, channel: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, ch: string) => BrowserWindow.getAllWindows()[0]!.webContents.send(ch), channel)
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-e2e8-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })

  // 1. First run: no recent notebooks, so the Welcome screen explains the basics.
  {
    const { app, page } = await launch(join(base, 'fresh-user'))
    assert(await page.locator('.first-run').count(), 'first-run panel shown with no recent notebooks')
    const text = await page.locator('.first-run').innerText()
    assert(/ordinary folder/.test(text) && /history/.test(text) && /back up/i.test(text), `first-run panel covers folders, history, and backup (${text})`)
    await page.locator('.first-run button', { hasText: 'Getting Started' }).click()
    await page.waitForSelector('.about-body .doc h1')
    assert((await page.locator('.about-body .doc h1').first().innerText()) === 'Getting started', 'the Getting Started guide opens')
    await app.close()
    step('first run: the Welcome screen explains folders, history, and backup, and opens the guide')
  }

  // 2. A notebook with a recent entry no longer shows the first-run panel.
  const deep = join(base, 'a'.repeat(60), 'b'.repeat(60), 'c'.repeat(40))
  await fs.mkdir(deep, { recursive: true })
  const root = await createNotebook(deep, 'Deep notebook')
  const section = await createSection(root, '', 'Section with a fairly long name')
  const created = await createPage(root, section, 'A page whose title is also rather long')
  const { relPath } = created
  // On Windows this picture's full path is well past 260 characters, so the app must serve it
  // through Node rather than Chromium's file loader (src/main/fileResponse.ts).
  const picture = await addImageBytes(root, relPath, 'photo taken on the survey walk.png', tealPng())
  await savePage(root, relPath, {
    ...created.doc,
    objects: [...created.doc.objects, { kind: 'image', id: 'pic', x: 96, y: 240, width: 64, height: 64, name: picture.name, originalName: picture.name }],
    manifest: { images: [picture], attachments: [] }
  })
  await fs.mkdir(join(root, relPath, 'attachments'), { recursive: true })
  await fs.writeFile(join(root, relPath, 'attachments', 'Quarterly statement for the joint account.pdf'), '%PDF-1.4\n')

  // 3. The notebook arrives with a lock from another computer, as a NAS copy taken while it was
  //    open would. Its process number is alive here, so only the host name shows it is stale.
  await fs.writeFile(join(root, '.lock'), JSON.stringify({ pid: process.pid, host: 'Someones-MacBook', since: new Date().toISOString() }))
  const userData = join(base, 'user')
  {
    const { app, page } = await launch(userData, root)
    assert(!(await page.locator('.error-bar').count()), 'no lock error')
    const lock = JSON.parse(await fs.readFile(join(root, '.lock'), 'utf8')) as { host: string }
    assert(lock.host !== 'Someones-MacBook', 'the stale lock was replaced by this window’s')
    step('a notebook copied with another computer’s lock opens normally')

    const imgPath = join(root, relPath, 'images', picture.name)
    await page.waitForSelector('.image-object img')
    const width = await page.locator('.image-object img').evaluate((img) => (img as HTMLImageElement).naturalWidth)
    assert(width === 8, `picture at a ${imgPath.length}-character path is displayed (width ${width})`)
    step(`a picture whose full path is ${imgPath.length} characters long is displayed`)

    // 4. Verify Notebook warns about the long path.
    await menu(app, 'menu:verify')
    await page.waitForSelector('.dialog.verify')
    await page.locator('.dialog.verify button', { hasText: 'Run check' }).click()
    await page.waitForSelector('.verify-row')
    const row = page.locator('.verify-row', { hasText: 'Long file path' })
    assert(await row.count(), `long path reported (${(await page.locator('.verify-kind').allTextContents()).join(', ')})`)
    assert(/Quarterly statement/.test(await row.innerText()), 'the warning names the file')
    await page.locator('.dialog.verify button', { hasText: 'Close' }).click()
    step('Verify Notebook warns when a file path nears the Windows limit')
    await app.close()
  }

  // 5. With a notebook in the recent list, the first-run panel is gone.
  {
    const { app, page } = await launch(userData)
    await page.locator('.recent-name', { hasText: 'Deep notebook' }).waitFor()
    assert(!(await page.locator('.first-run').count()), 'no first-run panel once a notebook has been opened')
    await app.close()
    step('the first-run panel is replaced by the recent list once a notebook has been opened')
  }

  // 6. As an installed copy, settings nobody has confirmed (as development leaves them) bring the
  //    Keep or Start fresh question. PAGEBINDER_TEST_PACKAGED runs the installed-copy check here, and
  //    PAGEBINDER_TEST_SETTINGS_CHOICE answers the question.
  const keepDir = join(base, 'user-keep')
  const freshDir = join(base, 'user-fresh')
  await fs.cp(userData, keepDir, { recursive: true })
  await fs.cp(userData, freshDir, { recursive: true })
  {
    const { app, page } = await launch(keepDir, undefined, { PAGEBINDER_TEST_PACKAGED: '1', PAGEBINDER_TEST_SETTINGS_CHOICE: 'keep' })
    await page.locator('.recent-name', { hasText: 'Deep notebook' }).waitFor()
    await app.close()
    assert(await fs.stat(join(keepDir, 'install.json')).then(() => true, () => false), 'the installation is recorded after Keep')
    // The same installation starting again must not ask: a dialog would stop the window from appearing.
    const again = await launch(keepDir, undefined, { PAGEBINDER_TEST_PACKAGED: '1' })
    await again.page.locator('.recent-name', { hasText: 'Deep notebook' }).waitFor()
    await again.app.close()
    step('Keep my settings keeps the recent list, and the next start does not ask again')
  }
  {
    const { app, page } = await launch(freshDir, undefined, { PAGEBINDER_TEST_PACKAGED: '1', PAGEBINDER_TEST_SETTINGS_CHOICE: 'fresh' })
    await page.waitForSelector('.first-run')
    assert(!(await page.locator('.recent-name', { hasText: 'Deep notebook' }).count()), 'Start fresh shows no recent notebooks')
    await app.close()
    const backups = (await fs.readdir(freshDir)).filter((n) => n.startsWith('Earlier settings '))
    assert(backups.length === 1, `one backup folder (${backups.join(', ')})`)
    assert(await fs.stat(join(freshDir, backups[0]!, 'recent-notebooks.json')).then(() => true, () => false), 'the earlier recent list is in the backup, not deleted')
    step('Start fresh opens clean and keeps the earlier settings in a backup folder')
  }

  console.log(`\nPASS: platforms. Files kept at ${base}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
