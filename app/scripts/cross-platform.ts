/**
 * Phase 8 acceptance check: a notebook created on one computer opens on another, from a copy,
 * with no differences.
 *
 *   npx tsx scripts/cross-platform.ts make  <folder>    build a notebook in <folder>, record every file
 *   npx tsx scripts/cross-platform.ts check <folder>    check a copy of that folder on this computer
 *
 * `make` writes <folder>/Cross-platform notebook and <folder>/manifest.json (the path, size, and
 * SHA-256 of every file). Copy the whole folder to the other computer (a NAS, a USB drive, or a
 * CI artifact) and run `check` there. It confirms that:
 *   1. every file arrived with the same name and the same bytes, and nothing was added;
 *   2. every page loads with a valid checksum, and rendering it here gives byte-for-byte the
 *      page.html written on the other computer;
 *   3. a full Verify Notebook finds nothing wrong;
 *   4. the real app opens the notebook and shows every section, page, picture, and attachment;
 *   5. after the app has opened every page, the files are still identical to the manifest.
 * Step 4 drives the out-e2e/ build page by page. With PAGEBINDER_EXE=<path to an installed
 * PageBinder>, it first starts that installed copy on the notebook and waits for it to open it.
 */
import { _electron as electron } from 'playwright'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, relative, sep } from 'node:path'
import { tmpdir, hostname } from 'node:os'
import { spawn } from 'node:child_process'
import { createNotebook, openNotebook } from '../src/main/storage/notebook'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage, savePage, loadPage } from '../src/main/storage/page'
import { addImageBytes } from '../src/main/storage/images'
import { writeBytesIntoPage, ATTACHMENTS_DIR } from '../src/main/storage/attachments'
import { verifyNotebook } from '../src/main/storage/verify'
import { verifyChecksum } from '../src/main/storage/checksum'
import { renderPageHtml } from '../src/shared/render/renderPage'
import { tealPng } from './png'
import type { PageDoc, TextContainer, TreeChild, EditorJSON } from '../src/shared/types'

const NOTEBOOK = 'Cross-platform notebook'
/** Not part of a notebook's content: the search index is a cache and the lock marks an open window. */
const SKIP = /(^|\/)(\.index|\.lock)(\/|$)/

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}
function step(s: string): void {
  process.stdout.write(`  ✓ ${s}\n`)
}

type Manifest = Record<string, { size: number; sha256: string }>

async function manifestOf(root: string): Promise<Manifest> {
  const out: Manifest = {}
  async function walk(dir: string): Promise<void> {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name)
      const rel = relative(root, abs).split(sep).join('/')
      if (SKIP.test(rel)) continue
      if (e.isDirectory()) await walk(abs)
      else {
        const data = await fs.readFile(abs)
        out[rel] = { size: data.length, sha256: createHash('sha256').update(data).digest('hex') }
      }
    }
  }
  await walk(root)
  return out
}

function compare(expected: Manifest, actual: Manifest): string[] {
  const problems: string[] = []
  for (const [rel, e] of Object.entries(expected)) {
    const a = actual[rel]
    if (!a) problems.push(`missing: ${rel}`)
    else if (a.sha256 !== e.sha256) problems.push(`changed: ${rel} (${e.size} bytes, now ${a.size})`)
  }
  for (const rel of Object.keys(actual)) if (!expected[rel]) problems.push(`added: ${rel}`)
  return problems
}

function paragraphs(...lines: string[]): EditorJSON {
  return { type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }
}

async function withText(root: string, rel: string, doc: PageDoc, content: EditorJSON, extra: PageDoc['objects'] = [], manifest: PageDoc['manifest'] = doc.manifest): Promise<string> {
  const box = { ...(doc.objects[0] as TextContainer), content }
  return (await savePage(root, rel, { ...doc, objects: [box, ...extra], manifest })).relPath
}

async function make(folder: string): Promise<void> {
  await fs.rm(join(folder, NOTEBOOK), { recursive: true, force: true })
  await fs.mkdir(folder, { recursive: true })
  const root = await createNotebook(folder, NOTEBOOK)
  // Names that differ between the two systems' rules: accents (stored in composed form),
  // characters Windows forbids, and names that differ only in case.
  const home = await createSection(root, '', 'Café & résumé', '#1D9E75')
  const group = await createGroup(root, '', 'Projects: 2026?')
  const inner = await createSection(root, group, 'North field', '#D85A30')
  await createSection(root, group, 'north FIELD', '#378ADD')

  const a = await createPage(root, home, 'Crème brûlée recipe')
  let rel = await withText(root, a.relPath, a.doc, paragraphs('First version.'))
  // A second save leaves a history snapshot behind.
  rel = await withText(root, rel, (await loadPage(root, rel)).doc, paragraphs('Ingredients: cream, sugar, eggs, vanilla.', 'Ünïcödé text and emoji 📓 survive the trip.'))

  const b = await createPage(root, inner, 'Survey <draft> "v2"')
  const image = await addImageBytes(root, b.relPath, 'field photo.png', tealPng())
  const pdf = await writeBytesIntoPage(root, b.relPath, 'Soil report: March/April.pdf', Buffer.from('%PDF-1.4\n% cross-platform check\n'), ATTACHMENTS_DIR)
  await withText(
    root,
    b.relPath,
    b.doc,
    paragraphs('Photo and report attached below.'),
    [
      { kind: 'image', id: 'img1', x: 96, y: 200, width: 64, height: 64, name: image.name, originalName: 'field photo.png' },
      { kind: 'file', id: 'file1', x: 96, y: 300, width: 320, name: pdf.name, originalName: 'Soil report: March/April.pdf' }
    ],
    { images: [image], attachments: [pdf] }
  )
  await createPage(root, inner, 'CON')

  const manifest = await manifestOf(root)
  await fs.writeFile(join(folder, 'manifest.json'), JSON.stringify({ platform: process.platform, created: new Date().toISOString(), files: manifest }, null, 2))
  step(`made ${Object.keys(manifest).length} files on ${process.platform} in ${root}`)
}

function allPages(children: TreeChild[], out: { rel: string; title: string; section: string }[]): void {
  for (const c of children) {
    if (c.kind === 'group') allPages(c.children, out)
    else for (const p of c.pages) out.push({ rel: p.relPath, title: p.title, section: c.name })
  }
}

async function check(folder: string): Promise<void> {
  const recorded = JSON.parse(await fs.readFile(join(folder, 'manifest.json'), 'utf8')) as { platform: string; files: Manifest }
  const root = join(folder, NOTEBOOK)
  process.stdout.write(`  checking a notebook made on ${recorded.platform}, here on ${process.platform}\n`)

  // 1. Same files, same bytes.
  let problems = compare(recorded.files, await manifestOf(root))
  assert(problems.length === 0, `the copy differs from the original:\n    ${problems.join('\n    ')}`)
  step(`all ${Object.keys(recorded.files).length} files arrived with the same names and bytes`)

  // 2. Pages load, checksums hold, and this computer renders the same page.html.
  const tree = await openNotebook(root)
  const pages: { rel: string; title: string; section: string }[] = []
  allPages(tree.children, pages)
  assert(pages.length === 3, `three pages found (got ${pages.length})`)
  for (const p of pages) {
    const doc = JSON.parse(await fs.readFile(join(root, p.rel, 'page.json'), 'utf8')) as PageDoc
    assert(verifyChecksum(doc), `${p.rel}: checksum valid`)
    const html = await fs.readFile(join(root, p.rel, 'page.html'), 'utf8')
    assert(renderPageHtml(doc) === html, `${p.rel}: page.html rendered here matches the one from ${recorded.platform}`)
  }
  step('every page loads with a valid checksum and renders to the identical page.html')

  // 3. A full verify finds nothing. A copy may not keep modification times, so page.html can look
  //    older than page.json; that is reported and allowed, because step 2 proved the content current.
  const report = await verifyNotebook(root, tree, 'full')
  const real = report.findings.filter((f) => f.kind !== 'stale-html')
  assert(real.length === 0, `Verify Notebook found: ${real.map((f) => `${f.kind} ${f.rel} ${f.file ?? ''}`).join('; ')}`)
  const stale = report.findings.length - real.length
  step(`Verify Notebook (full) is clean${stale ? ` (${stale} page.html files dated older than their page by the copy; content identical)` : ''}`)

  // 4a. An installed copy (PAGEBINDER_EXE) starts and opens the notebook. Automation cannot attach to
  //     a packaged build, so the proof is the lock file the app writes on opening, from this host.
  const exe = process.env['PAGEBINDER_EXE']
  if (exe) {
    const lock = join(root, '.lock')
    const child = spawn(exe, [`--user-data-dir=${join(tmpdir(), `pagebinder-xp-installed-${Date.now()}`)}`], { env: { ...process.env, PAGEBINDER_OPEN: root }, stdio: 'ignore' })
    try {
      let opened = false
      for (let i = 0; i < 120 && !opened; i++) {
        await new Promise((r) => setTimeout(r, 500))
        try {
          const info = JSON.parse(await fs.readFile(lock, 'utf8')) as { pid: number; host: string }
          opened = info.host.toLowerCase() === hostname().toLowerCase()
        } catch {
          /* not yet */
        }
      }
      assert(opened, `the installed app (${exe}) opened the notebook within 60 s`)
      // Let it finish loading the first page before it is closed.
      await new Promise((r) => setTimeout(r, 3000))
      assert(child.exitCode === null, 'the installed app is still running')
    } finally {
      child.kill()
      await new Promise((r) => setTimeout(r, 2000))
      // A hard stop can leave the lock behind; it is not notebook content (see SKIP).
    }
    step(`the installed app starts and opens the notebook (${exe})`)
  }

  // 4b. The app, driven page by page, shows every section, page, picture, and attachment.
  const userData = join(tmpdir(), `pagebinder-xp-userdata-${Date.now()}`)
  const app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${userData}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.section-tabs')
    const exact = (text: string): RegExp => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
    for (const name of ['Café & résumé', 'North field', 'north FIELD']) {
      // Sections inside the group appear once the group is opened.
      if (!(await page.locator('.tab', { hasText: exact(name) }).count())) await page.locator('.tab.group', { hasText: 'Projects' }).click()
      await page.locator('.tab', { hasText: exact(name) }).click()
      await page.waitForTimeout(300)
      for (const p of pages.filter((x) => x.section === name)) {
        await page.locator('.page-row', { hasText: p.title }).first().click()
        await page.waitForTimeout(400)
        assert(!(await page.locator('.error-bar').count()), `no error opening ${p.title}`)
        if (p.title.startsWith('Survey')) {
          const shown = await page.locator('.image-object img').evaluate((img) => (img as HTMLImageElement).naturalWidth)
          assert(shown === 8, `the picture decodes in the app (width ${shown})`)
          assert(await page.locator('.file-card', { hasText: 'Soil report' }).count(), 'the attachment card is shown')
        }
      }
    }
    step('the app opens every section and page, and shows the picture and the attachment')
  } finally {
    await app.close()
  }

  // 5. Opening and reading did not change a single file.
  problems = compare(recorded.files, await manifestOf(root))
  assert(problems.length === 0, `the app changed the notebook:\n    ${problems.join('\n    ')}`)
  step('after the app has opened every page, every file is still identical')
}

async function main(): Promise<void> {
  const [mode, folder] = process.argv.slice(2)
  if (!folder || (mode !== 'make' && mode !== 'check')) throw new Error('usage: cross-platform.ts make|check <folder>')
  if (mode === 'make') await make(resolve(folder))
  else await check(resolve(folder))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
