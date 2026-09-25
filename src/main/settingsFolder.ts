/**
 * Where the app keeps its own settings: the recent-notebooks list, the global template library,
 * and browser storage. Notebooks never live here.
 *
 * An installed copy and the development build used to share one folder (named after the program),
 * so everything opened while developing and testing showed up in an installed copy's recent list.
 * They are now kept apart:
 *
 * - The installed app uses "<appData>/PageBinder". The first time an installed copy starts, it
 *   checks for its marker file; a folder without one was left by development, so it is moved aside
 *   to the development folder (nothing is deleted) and the installed app starts clean. Later starts,
 *   and updates, find the marker and leave a real user's settings alone.
 * - The development build (npm run dev, the e2e builds) uses "<appData>/PageBinder Dev". On its
 *   first start it takes over the shared folder's contents if an installed copy has not already
 *   moved them, and it carries across the pre-1.0.1 "diginote" folder once, as before.
 *
 * All of this runs before the app is ready, while nothing in the folder is open.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const INSTALLED_MARKER = '.installed-app'
export const DEV_FOLDER_NAME = 'PageBinder Dev'
const PREVIOUS_NAME = 'diginote'
const MIGRATED_MARKER = '.migrated-from-diginote'

function hasContent(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Move a settings folder aside into the development folder without losing anything. */
function moveToDev(from: string, devDir: string): string {
  if (!existsSync(devDir)) {
    renameSync(from, devDir)
    return devDir
  }
  const dest = join(devDir, `earlier settings ${stamp()}`)
  renameSync(from, dest)
  return dest
}

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

export interface SettingsChoice {
  /** The folder to use; undefined leaves Electron's choice (an explicit --user-data-dir) alone. */
  userData?: string
  /** Where development leftovers were moved, when that happened on this start. */
  movedTo?: string
}

/**
 * Decide and prepare the settings folder. `sharedDir` is Electron's default, named after the
 * program. Failures never stop the app: it works without any of these files.
 */
export function prepareSettingsFolder(opts: { packaged: boolean; explicitDir: boolean; appData: string; sharedDir: string }): SettingsChoice {
  if (opts.explicitDir) return {}
  const devDir = join(opts.appData, DEV_FOLDER_NAME)
  try {
    if (opts.packaged) {
      const marker = join(opts.sharedDir, INSTALLED_MARKER)
      let movedTo: string | undefined
      if (!existsSync(marker)) {
        if (hasContent(opts.sharedDir)) movedTo = moveToDev(opts.sharedDir, devDir)
        mkdirSync(opts.sharedDir, { recursive: true })
        writeFileSync(marker, new Date().toISOString())
      }
      return { userData: opts.sharedDir, ...(movedTo ? { movedTo } : {}) }
    }
    let movedTo: string | undefined
    if (!existsSync(devDir) && hasContent(opts.sharedDir) && !existsSync(join(opts.sharedDir, INSTALLED_MARKER))) {
      movedTo = moveToDev(opts.sharedDir, devDir)
    }
    migrateFromDigiNote(opts.appData, devDir)
    return { userData: devDir, ...(movedTo ? { movedTo } : {}) }
  } catch {
    return { userData: opts.packaged ? opts.sharedDir : devDir }
  }
}
