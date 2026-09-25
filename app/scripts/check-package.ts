/**
 * Release safeguard: the packaged app must contain the program, its help documents, and its
 * libraries, and nothing from development or testing (notebooks, settings, recent lists, indexes).
 * Settings and recent notebooks live in the user's own settings folder, never in the package; this
 * check makes sure that stays true. Run after electron-builder:
 *   npx tsx scripts/check-package.ts          (checks every app.asar under dist/)
 */
import { listPackage } from '@electron/asar'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Top-level entries allowed inside app.asar. */
const ALLOWED_TOP = new Set(['out', 'resources', 'node_modules', 'package.json'])
/** Documents the Help menu reads, copied beside the app as resources/docs-bundle (electron-builder.yml). */
const BUNDLED_DOCS = ['README.md', 'LICENSE', 'docs/PROGRAM_OVERVIEW.md', 'docs/RECOVERY.md', 'docs/GETTING_STARTED.md', 'docs/SHORTCUTS.md', 'docs/HISTORY_AND_VERIFY.md', 'docs/UNINSTALL.md']
/** Never shipped: developer notes and the README screenshot. */
const NOT_BUNDLED = ['docs/dev', 'docs/images']
/** Anything that looks like user data, a notebook, or a test fixture, outside node_modules. */
const FORBIDDEN = /(^|\/)(recent-notebooks\.json|notebook\.json|section\.json|group\.json|page\.json|[^/]+\.page|\.index|\.history|\.recycle|Local Storage|IndexedDB|test-notebooks|Medical Records|out-e2e|\.lock|\.installed-app|\.migrated-from-diginote)(\/|$)/

function findAsars(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    // An .app bundle or unpacked folder is a directory; app.asar is a file.
    if (name === 'app.asar') out.push(path)
    else if (statSync(path).isDirectory() && !name.endsWith('.asar.unpacked')) findAsars(path, out)
  }
  return out
}

function main(): void {
  const asars = findAsars(process.argv[2] ?? 'dist')
  if (!asars.length) throw new Error('No app.asar found under dist/; build the installers first')
  const problems: string[] = []
  for (const asar of asars) {
    for (const entry of listPackage(asar, { isPack: false })) {
      const rel = entry.replace(/\\/g, '/').replace(/^\/+/, '')
      const top = rel.split('/')[0]!
      if (!ALLOWED_TOP.has(top)) problems.push(`${asar}: unexpected ${rel}`)
      else if (top !== 'node_modules' && FORBIDDEN.test(rel)) problems.push(`${asar}: development or user data ${rel}`)
    }
    const bundle = join(dirname(asar), 'docs-bundle')
    for (const f of BUNDLED_DOCS) if (!existsSync(join(bundle, f))) problems.push(`${asar}: help document missing beside the app: docs-bundle/${f}`)
    for (const f of NOT_BUNDLED) if (existsSync(join(bundle, f))) problems.push(`${asar}: development files shipped: docs-bundle/${f}`)
    process.stdout.write(`  checked ${asar} and its docs-bundle\n`)
  }
  if (problems.length) {
    process.stderr.write(`The package contains files that must not ship:\n  ${problems.join('\n  ')}\n`)
    process.exit(1)
  }
  process.stdout.write(`  ✓ ${asars.length} package(s) hold only the program, its documents, and its libraries\n`)
}

main()
