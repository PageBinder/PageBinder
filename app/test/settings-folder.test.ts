import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  chooseSettingsFolder,
  decideFirstRun,
  earlierSettings,
  firstRunQuestion,
  readInstallRecord,
  setAsideEarlierSettings,
  writeInstallRecord,
  DEV_FOLDER_NAME,
  INSTALL_RECORD
} from '../src/main/settingsFolder'
import { tempDir, removeDir } from './helpers'

let appData: string
let shared: string
let dev: string
beforeEach(async () => {
  appData = await tempDir()
  shared = join(appData, 'PageBinder')
  dev = join(appData, DEV_FOLDER_NAME)
})
afterEach(async () => {
  await removeDir(appData)
})

/** Settings as a user (or development) leaves them: recent notebooks and a global template. */
async function leaveSettings(dir: string, recent = 2): Promise<void> {
  await fs.mkdir(join(dir, 'templates', 'Meeting notes.template'), { recursive: true })
  const list = Array.from({ length: recent }, (_, i) => ({ root: `/notes/Notebook ${i}`, name: `Notebook ${i}`, opened: '2026-09-24' }))
  await fs.writeFile(join(dir, 'recent-notebooks.json'), JSON.stringify(list))
  // Chromium's own files, which Start fresh leaves alone.
  await fs.mkdir(join(dir, 'Cache'), { recursive: true })
}

const some = { recentCount: 2, templateCount: 1 }
const record = (version: string, installId: string) => ({ version, installId, confirmed: '2026-09-24T00:00:00Z' })

describe('keep or start fresh: when to ask', () => {
  it('a new computer with no settings starts clean without a question', () => {
    expect(decideFirstRun(null, null, 'A')).toBe('record')
  })
  it('the same installation starting again does nothing', () => {
    expect(decideFirstRun(record('1.1.0', 'A'), some, 'A')).toBe('nothing')
  })
  it('any new installation with earlier settings asks, a reinstall or an update alike', () => {
    expect(decideFirstRun(record('1.1.0', 'A'), some, 'B')).toBe('ask')
  })
  it('settings never confirmed by an installed copy (left by development) ask', () => {
    expect(decideFirstRun(null, some, 'A')).toBe('ask')
  })
  it('a new installation after the settings were cleared starts clean without a question', () => {
    expect(decideFirstRun(record('1.1.0', 'A'), null, 'B')).toBe('record')
  })
})

describe('keep or start fresh: what happens', () => {
  it('finds what a user would recognise, and nothing when the list and library are empty', async () => {
    expect(earlierSettings(shared)).toBeNull()
    await leaveSettings(shared, 3)
    expect(earlierSettings(shared)).toEqual({ recentCount: 3, templateCount: 1 })
    await fs.writeFile(join(shared, 'recent-notebooks.json'), '[]')
    await fs.rm(join(shared, 'templates'), { recursive: true })
    expect(earlierSettings(shared)).toBeNull()
  })

  it('start fresh moves the app’s files into a dated backup and deletes nothing', async () => {
    await leaveSettings(shared)
    const backup = setAsideEarlierSettings(shared)
    expect(backup.startsWith(join(shared, 'Earlier settings '))).toBe(true)
    expect(existsSync(join(backup, 'recent-notebooks.json'))).toBe(true)
    expect(existsSync(join(backup, 'templates', 'Meeting notes.template'))).toBe(true)
    expect(earlierSettings(shared)).toBeNull()
    expect(existsSync(join(shared, 'Cache'))).toBe(true)
  })

  it('records the installation, replacing the marker from the unreleased draft', async () => {
    await fs.mkdir(shared, { recursive: true })
    await fs.writeFile(join(shared, '.installed-app'), 'x')
    writeInstallRecord(shared, '1.1.0', 'A')
    expect(readInstallRecord(shared)).toMatchObject({ version: '1.1.0', installId: 'A' })
    expect(existsSync(join(shared, '.installed-app'))).toBe(false)
  })

  it('the question names what was found and says nothing is lost', () => {
    const q = firstRunQuestion({ recentCount: 1, templateCount: 3 }, '/Users/me/Library/Application Support/PageBinder')
    expect(q.detail).toContain('1 recent notebook and 3 global templates')
    expect(q.detail).toContain('nothing is lost')
    expect(q.buttons).toEqual(['Keep my settings', 'Start fresh'])
  })
})

describe('settings folder', () => {
  it('an installed copy uses the shared folder and moves nothing before asking', async () => {
    await leaveSettings(shared)
    expect(chooseSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })).toBe(shared)
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(true)
  })

  it('the development build uses its own folder and takes over unconfirmed leftovers', async () => {
    await leaveSettings(shared)
    expect(chooseSettingsFolder({ packaged: false, explicitDir: false, appData, sharedDir: shared })).toBe(dev)
    expect(existsSync(join(dev, 'recent-notebooks.json'))).toBe(true)
    expect(existsSync(shared)).toBe(false)
  })

  it('the development build never touches settings an installed copy has confirmed', async () => {
    await leaveSettings(shared)
    writeInstallRecord(shared, '1.1.0', 'A')
    expect(chooseSettingsFolder({ packaged: false, explicitDir: false, appData, sharedDir: shared })).toBe(dev)
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(true)
    expect(existsSync(join(shared, INSTALL_RECORD))).toBe(true)
  })

  it('DigiNote-era settings are carried into the development folder only', async () => {
    await leaveSettings(join(appData, 'diginote'))
    chooseSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(false)
    chooseSettingsFolder({ packaged: false, explicitDir: false, appData, sharedDir: shared })
    expect(existsSync(join(dev, 'recent-notebooks.json'))).toBe(true)
  })

  it('an explicit --user-data-dir (the test suites) is left alone', async () => {
    await leaveSettings(shared)
    expect(chooseSettingsFolder({ packaged: true, explicitDir: true, appData, sharedDir: shared })).toBeUndefined()
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(true)
  })
})
