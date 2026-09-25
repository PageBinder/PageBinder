/**
 * Where the app keeps its own settings (the recent-notebooks list, the global template library,
 * and browser storage), and what happens to settings left by an earlier installation. Notebooks
 * never live here and are never affected.
 *
 * - The installed app uses "<appData>/PageBinder"; the development build (npm run dev, e2e builds)
 *   uses "<appData>/PageBinder Dev", so development never shows in an installed copy.
 * - Each installation has an ID (see installationId in index.ts). The settings folder records which
 *   installation last confirmed it, and at which version, in install.json.
 * - On start, an installed copy decides (decideFirstRun):
 *     same installation                  -> nothing to do
 *     no earlier settings                -> start clean, no question
 *     any new installation (a reinstall or an update) with earlier settings -> ask Keep or Start fresh
 *     settings never confirmed by an installed copy (left by development or a pre-1.1 build) -> ask
 * - Start fresh moves the app's own files into a dated backup folder beside them; nothing is deleted.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const INSTALL_RECORD = 'install.json'
export const DEV_FOLDER_NAME = 'PageBinder Dev'
/** The app's own files in the settings folder: what Keep keeps and Start fresh sets aside. */
export const OWN_FILES = ['recent-notebooks.json', 'templates', 'renderer-errors.log']
const PREVIOUS_NAME = 'diginote'
const MIGRATED_MARKER = '.migrated-from-diginote'
/** Written by an unreleased 1.1.0 draft; treated as unconfirmed and removed. */
const OLD_MARKER = '.installed-app'

export interface InstallRecord {
  version: string
  installId: string
  confirmed: string
}

function hasContent(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')
}

/* ---------- before the app is ready: which folder ---------- */

/** Carry the pre-1.0.1 DigiNote settings into the development folder, once. */
function migrateFromDigiNote(appData: string, devDir: string): void {
  const previous = join(appData, PREVIOUS_NAME)
  const marker = join(devDir, MIGRATED_MARKER)
  if (!existsSync(previous) || existsSync(marker)) return
  mkdirSync(devDir, { recursive: true })
  for (const name of ['recent-notebooks.json', 'templates']) {
    const from = join(previous, name)
    if (existsSync(from)) cpSync(from, join(devDir, name), { recursive: true, force: false })
  }
  // Browser storage is a database: take the old one whole, or not at all.
  const storage = join(previous, 'Local Storage')
  if (existsSync(storage) && !existsSync(join(devDir, 'Local Storage'))) cpSync(storage, join(devDir, 'Local Storage'), { recursive: true })
  writeFileSync(marker, new Date().toISOString())
}

/**
 * The settings folder for this run. `sharedDir` is Electron's default, named after the program.
 * Returns undefined for an explicit --user-data-dir (the test suites), which is left alone.
 * The development build takes over settings left in the shared folder by earlier development,
 * but never a folder an installed copy has confirmed.
 */
export function chooseSettingsFolder(opts: { packaged: boolean; explicitDir: boolean; appData: string; sharedDir: string }): string | undefined {
  if (opts.explicitDir) return undefined
  if (opts.packaged) return opts.sharedDir
  const devDir = join(opts.appData, DEV_FOLDER_NAME)
  try {
    if (!existsSync(devDir) && hasContent(opts.sharedDir) && !existsSync(join(opts.sharedDir, INSTALL_RECORD))) renameSync(opts.sharedDir, devDir)
    migrateFromDigiNote(opts.appData, devDir)
  } catch {
    /* the app works without any of these files */
  }
  return devDir
}

/* ---------- after the app is ready: keep or start fresh ---------- */

export interface EarlierSettings {
  recentCount: number
  templateCount: number
}

/** What an earlier installation left that a user would recognise, or null when there is nothing. */
export function earlierSettings(dir: string): EarlierSettings | null {
  let recentCount = 0
  let templateCount = 0
  try {
    const list = JSON.parse(readFileSync(join(dir, 'recent-notebooks.json'), 'utf8')) as unknown
    if (Array.isArray(list)) recentCount = list.length
  } catch {
    /* no list */
  }
  try {
    templateCount = readdirSync(join(dir, 'templates')).filter((n) => !n.startsWith('.')).length
  } catch {
    /* no library */
  }
  return recentCount || templateCount ? { recentCount, templateCount } : null
}

export function readInstallRecord(dir: string): InstallRecord | null {
  try {
    const r = JSON.parse(readFileSync(join(dir, INSTALL_RECORD), 'utf8')) as InstallRecord
    return typeof r.version === 'string' && typeof r.installId === 'string' ? r : null
  } catch {
    return null
  }
}

export type FirstRunDecision = 'nothing' | 'record' | 'ask'

/**
 * Whether to ask about earlier settings. Every new installation that finds them asks, whether it
 * is a reinstall or an update; 'record' means there was nothing to ask about.
 */
export function decideFirstRun(record: InstallRecord | null, earlier: EarlierSettings | null, installId: string): FirstRunDecision {
  if (record && record.installId === installId) return 'nothing'
  return earlier ? 'ask' : 'record'
}

export function writeInstallRecord(dir: string, version: string, installId: string): void {
  mkdirSync(dir, { recursive: true })
  const r: InstallRecord = { version, installId, confirmed: new Date().toISOString() }
  writeFileSync(join(dir, INSTALL_RECORD), JSON.stringify(r, null, 2))
  rmSync(join(dir, OLD_MARKER), { force: true })
}

/** Start fresh: move the app's own files into a dated backup folder beside them. Returns its path. */
export function setAsideEarlierSettings(dir: string): string {
  const backup = join(dir, `Earlier settings ${stamp()}`)
  mkdirSync(backup, { recursive: true })
  for (const name of OWN_FILES) {
    const from = join(dir, name)
    if (existsSync(from)) renameSync(from, join(backup, name))
  }
  return backup
}

/** The words of the question, shared by the dialog and the tests. */
export function firstRunQuestion(earlier: EarlierSettings, backupParent: string): { message: string; detail: string; buttons: string[] } {
  const parts: string[] = []
  if (earlier.recentCount) parts.push(`${earlier.recentCount} recent notebook${earlier.recentCount === 1 ? '' : 's'}`)
  if (earlier.templateCount) parts.push(`${earlier.templateCount} global template${earlier.templateCount === 1 ? '' : 's'}`)
  return {
    message: 'Keep the settings from an earlier installation?',
    detail:
      `PageBinder found settings from an earlier installation: ${parts.join(' and ')}.\n\n` +
      `Keep them, or start fresh? Starting fresh moves them to a backup folder in ${backupParent}, so nothing is lost. ` +
      'Your notebooks are not affected either way.',
    buttons: ['Keep my settings', 'Start fresh']
  }
}
