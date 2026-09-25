/**
 * Phase 1 acceptance test: kill the app mid-save, repeatedly, and prove that
 * the page always loads and never loses more than the save in flight.
 *
 *   npm run crash-test            (30 rounds)
 *   npm run crash-test -- 100     (100 rounds)
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createNotebook } from '../src/main/storage/notebook'
import { createSection } from '../src/main/storage/section'
import { createPage, loadPage } from '../src/main/storage/page'
import { TMP_PREFIX } from '../src/main/storage/atomic'

const rounds = Number(process.argv[2] ?? '30')

function counterOf(text: string): number {
  const m = /counter=(\d+)/.exec(text)
  return m ? Number(m[1]) : -1
}

async function main(): Promise<void> {
  const base = join(tmpdir(), `pagebinder-crash-${Date.now()}`)
  await fs.mkdir(base, { recursive: true })
  const root = await createNotebook(base, 'Crash notebook')
  const section = await createSection(root, '', 'Stress')
  let { relPath } = await createPage(root, section, 'Crash test 0')

  let confirmed = 0
  let recoveries = 0
  let killsDuringSave = 0

  for (let round = 1; round <= rounds; round++) {
    // Run tsx in-process (--import) so SIGKILL hits the worker itself, not a launcher.
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('scripts/crash-worker.ts'), root, relPath, String(confirmed)], {
      stdio: ['ignore', 'pipe', 'inherit'],
      cwd: resolve('.')
    })
    let lastSeen = confirmed
    let lastRel = relPath
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const m = /^saved (\d+) (.+)$/.exec(line.trim())
        if (m) {
          lastSeen = Number(m[1])
          lastRel = m[2]!
        }
      }
    })
    // Let it warm up (tsx startup), then kill at a random moment inside the save loop.
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 400))
    child.kill('SIGKILL')
    await new Promise<void>((r) => child.on('exit', () => r()))

    // Find the page folder: the title changes each save so the folder may have been renamed.
    const sectionAbs = join(root, section)
    const folders = (await fs.readdir(sectionAbs)).filter((n) => n.endsWith('.page'))
    if (folders.length !== 1) throw new Error(`Expected one page folder, found ${folders.join(', ')}`)
    relPath = `${section}/${folders[0]}`
    const pageDir = join(root, relPath)
    const beforeClean = (await fs.readdir(pageDir)).filter((n) => n.startsWith(TMP_PREFIX))
    if (beforeClean.length) killsDuringSave++

    const loaded = await loadPage(root, relPath)
    const n = counterOf(JSON.stringify(loaded.doc.objects))
    const recovered = loaded.notices.some((x) => x.kind === 'recovered-from-history')
    if (recovered) recoveries++
    if (loaded.notices.some((x) => x.kind === 'no-valid-version')) {
      throw new Error(`Round ${round}: page reset, all versions lost`)
    }
    if (n < lastSeen) {
      throw new Error(`Round ${round}: loaded counter ${n} is older than confirmed save ${lastSeen}`)
    }
    if (n > lastSeen + 1) {
      throw new Error(`Round ${round}: loaded counter ${n} skipped ahead of ${lastSeen}`)
    }
    const afterClean = (await fs.readdir(pageDir)).filter((x) => x.startsWith(TMP_PREFIX))
    if (afterClean.length) throw new Error(`Round ${round}: temp files left after load`)
    confirmed = n
    process.stdout.write(
      `round ${round}: killed at save ${lastSeen}, loaded ${n}${recovered ? ' (recovered from history)' : ''}${beforeClean.length ? ' (temp file cleaned)' : ''}\n`
    )
    void lastRel
  }

  const history = await fs.readdir(join(root, relPath, '.history'))
  process.stdout.write(
    `\nPASS: ${rounds} kills, final counter ${confirmed}, ${history.length} history snapshots, ${recoveries} recoveries from history, ${killsDuringSave} kills landed inside a write.\nNotebook kept at ${root}\n`
  )
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).message}\n`)
  process.exit(1)
})
