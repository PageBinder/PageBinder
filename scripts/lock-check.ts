import { _electron as electron } from 'playwright'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir, hostname } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'

async function main(): Promise<void> {
  // Its own notebook, so the check runs in a fresh clone (test-notebooks/ is not in git).
  const base = join(tmpdir(), `pagebinder-lock-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Lock notebook')
  await createPage(root, await createSection(root, '', 'Notes'), 'First page')
  const lock = join(root, '.lock')
  const exists = (): Promise<boolean> => fs.stat(lock).then(() => true, () => false)

  // 1. Normal close releases the lock.
  let app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  let page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')
  if (!(await exists())) throw new Error('lock not taken while open')
  await app.close()
  await new Promise((r) => setTimeout(r, 500))
  if (await exists()) throw new Error('lock still present after normal close')
  process.stdout.write('  ✓ normal close releases the lock\n')

  // 2. SIGTERM (what Ctrl+C on the dev server sends) releases the lock.
  app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')
  const pid = app.process().pid!
  process.kill(pid, 'SIGTERM')
  await new Promise((r) => setTimeout(r, 1500))
  if (await exists()) throw new Error('lock still present after SIGTERM')
  process.stdout.write('  ✓ SIGTERM releases the lock\n')

  // 3. A stale lock from a dead process is taken over.
  await fs.writeFile(lock, JSON.stringify({ pid: 999999, host: hostname(), since: new Date().toISOString() }))
  app = await electron.launch({ args: [resolve(process.env['E2E_OUT'] ?? 'out-e2e', 'main/index.js'), `--user-data-dir=${join(tmpdir(), 'pagebinder-e2e-userdata')}`], cwd: resolve('.'), env: { ...process.env, PAGEBINDER_OPEN: root } })
  page = await app.firstWindow()
  await page.waitForSelector('.section-tabs')
  const errors = await page.locator('.error-bar').count()
  await app.close()
  if (errors) throw new Error('stale lock was not taken over')
  process.stdout.write('  ✓ stale lock from a dead process is taken over\n')
  process.stdout.write('PASS\n')
}
main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).message}\n`)
  process.exit(1)
})
