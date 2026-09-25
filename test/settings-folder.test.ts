import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs, existsSync } from 'node:fs'
import { join } from 'node:path'
import { prepareSettingsFolder, INSTALLED_MARKER, DEV_FOLDER_NAME } from '../src/main/settingsFolder'
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

/** Settings as development and testing leave them: a recent list naming test notebooks. */
async function leaveDevSettings(dir: string): Promise<void> {
  await fs.mkdir(join(dir, 'templates'), { recursive: true })
  await fs.writeFile(join(dir, 'recent-notebooks.json'), JSON.stringify([{ root: '/tmp/Medical Records', name: 'Medical Records', opened: '2026-09-24' }]))
}

describe('settings folder', () => {
  it('an installed copy on a new computer starts with an empty folder of its own', () => {
    const r = prepareSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })
    expect(r.userData).toBe(shared)
    expect(r.movedTo).toBeUndefined()
    expect(existsSync(join(shared, INSTALLED_MARKER))).toBe(true)
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(false)
  })

  it('the first installed start moves development leftovers aside instead of showing them', async () => {
    await leaveDevSettings(shared)
    const r = prepareSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })
    expect(r.userData).toBe(shared)
    expect(r.movedTo).toBe(dev)
    expect(await fs.readdir(shared)).toEqual([INSTALLED_MARKER])
    // Nothing is deleted: the test history is kept for the development build.
    expect(existsSync(join(dev, 'recent-notebooks.json'))).toBe(true)
  })

  it('an update keeps a real user’s recent list', async () => {
    await leaveDevSettings(shared)
    await fs.writeFile(join(shared, INSTALLED_MARKER), 'x')
    const r = prepareSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })
    expect(r.movedTo).toBeUndefined()
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(true)
  })

  it('leftovers go into a dated subfolder when the development folder already exists', async () => {
    await leaveDevSettings(shared)
    await leaveDevSettings(dev)
    const r = prepareSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })
    expect(r.movedTo?.startsWith(join(dev, 'earlier settings '))).toBe(true)
    expect(existsSync(join(r.movedTo!, 'recent-notebooks.json'))).toBe(true)
    expect(await fs.readdir(shared)).toEqual([INSTALLED_MARKER])
  })

  it('the development build uses its own folder and takes over leftovers from the shared one', async () => {
    await leaveDevSettings(shared)
    const r = prepareSettingsFolder({ packaged: false, explicitDir: false, appData, sharedDir: shared })
    expect(r.userData).toBe(dev)
    expect(existsSync(join(dev, 'recent-notebooks.json'))).toBe(true)
    expect(existsSync(shared)).toBe(false)
  })

  it('the development build never touches an installed copy’s settings', async () => {
    await leaveDevSettings(shared)
    await fs.writeFile(join(shared, INSTALLED_MARKER), 'x')
    const r = prepareSettingsFolder({ packaged: false, explicitDir: false, appData, sharedDir: shared })
    expect(r.userData).toBe(dev)
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(true)
  })

  it('DigiNote-era settings are carried into the development folder only', async () => {
    await leaveDevSettings(join(appData, 'diginote'))
    prepareSettingsFolder({ packaged: true, explicitDir: false, appData, sharedDir: shared })
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(false)
    prepareSettingsFolder({ packaged: false, explicitDir: false, appData, sharedDir: shared })
    expect(existsSync(join(dev, 'recent-notebooks.json'))).toBe(true)
  })

  it('an explicit --user-data-dir (the test suites) is left alone', async () => {
    await leaveDevSettings(shared)
    expect(prepareSettingsFolder({ packaged: true, explicitDir: true, appData, sharedDir: shared })).toEqual({})
    expect(existsSync(join(shared, 'recent-notebooks.json'))).toBe(true)
  })
})
