/**
 * Documents and facts for the Help menu: the program description, dependency
 * list, recovery guide, and version information.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

declare const __BUILD_TIME__: string

export type DocName = 'description' | 'recovery' | 'history-verify' | 'uninstall' | 'shortcuts' | 'getting-started' | 'readme'

const FILES: Record<DocName, string> = {
  description: 'docs/PROGRAM_OVERVIEW.md',
  recovery: 'docs/RECOVERY.md',
  'history-verify': 'docs/HISTORY_AND_VERIFY.md',
  uninstall: 'docs/UNINSTALL.md',
  shortcuts: 'docs/SHORTCUTS.md',
  'getting-started': 'docs/GETTING_STARTED.md',
  readme: 'README.md'
}

function docRoots(): string[] {
  // Packaged: electron-builder copies the documents into resources/docs-bundle (see
  // electron-builder.yml). Otherwise the repository root, which is a few levels above the
  // app path (app/ under `npm run dev`, app/out-e2e/main when a built file is launched) or
  // above the working folder, so each starting point is tried with its parents.
  if (app.isPackaged) return [join(process.resourcesPath ?? '', 'docs-bundle')]
  const roots: string[] = []
  for (const start of [app.getAppPath(), process.cwd()]) {
    let dir = start
    for (let i = 0; i < 4; i++) {
      roots.push(dir)
      dir = join(dir, '..')
    }
  }
  return roots
}

export async function readDoc(name: DocName): Promise<string> {
  const file = FILES[name]
  if (!file) throw new Error('Unknown document')
  for (const root of docRoots()) {
    try {
      return await fs.readFile(join(root, file), 'utf8')
    } catch {
      /* try the next root */
    }
  }
  return `# ${file}\n\nThis document was not found beside the application.`
}

export interface DependencyInfo {
  name: string
  version: string
  license: string
  description: string
}

export interface AboutInfo {
  name: string
  version: string
  buildTime: string
  electron: string
  node: string
  chrome: string
  platform: string
  appPath: string
  userData: string
  dependencies: DependencyInfo[]
}

export async function aboutInfo(): Promise<AboutInfo> {
  const appPath = app.getAppPath()
  let pkg: { version?: string; dependencies?: Record<string, string> } = {}
  try {
    pkg = JSON.parse(await fs.readFile(join(appPath, 'package.json'), 'utf8')) as typeof pkg
  } catch {
    /* no package.json */
  }
  const dependencies: DependencyInfo[] = []
  for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
    let version = pkg.dependencies?.[name] ?? ''
    let license = ''
    let description = ''
    try {
      const meta = JSON.parse(await fs.readFile(join(appPath, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string; license?: string; description?: string }
      version = meta.version ?? version
      license = meta.license ?? ''
      description = meta.description ?? ''
    } catch {
      /* not installed beside the app */
    }
    dependencies.push({ name, version, license, description })
  }
  dependencies.push({ name: 'Electron', version: process.versions.electron ?? '', license: 'MIT', description: 'Application shell: Chromium and Node.js' })
  dependencies.push({ name: 'SQLite (via node:sqlite)', version: '', license: 'Public domain', description: 'Full-text search index' })
  let buildTime = ''
  try {
    buildTime = __BUILD_TIME__
  } catch {
    buildTime = 'development'
  }
  return {
    name: 'PageBinder',
    version: pkg.version ?? '0.0.0',
    buildTime,
    electron: process.versions.electron ?? '',
    node: process.versions.node ?? '',
    chrome: process.versions.chrome ?? '',
    platform: `${process.platform} ${process.arch}`,
    appPath,
    userData: app.getPath('userData'),
    dependencies
  }
}

import { userInfo } from 'node:os'
import { execFile } from 'node:child_process'

let cachedName: string | undefined

/** The signed-in user's full name from the OS account, falling back to the login name. */
export async function userFullName(): Promise<string> {
  if (cachedName) return cachedName
  const login = userInfo().username
  const run = (cmd: string, args: string[]): Promise<string> =>
    new Promise((resolve) => execFile(cmd, args, { timeout: 3000 }, (err, stdout) => resolve(err ? '' : String(stdout))))
  let name = ''
  try {
    if (process.platform === 'darwin') {
      const out = await run('dscl', ['.', '-read', `/Users/${login}`, 'RealName'])
      name = out.replace(/^RealName:\s*/m, '').replace(/\n/g, ' ').trim()
    } else if (process.platform === 'win32') {
      const out = await run('powershell', ['-NoProfile', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; (Get-CimInstance Win32_UserAccount -Filter "Name=\'$env:USERNAME\'").FullName'])
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      name = lines[1] ?? ''
    } else {
      const out = await run('getent', ['passwd', login])
      name = (out.split(':')[4] ?? '').split(',')[0]?.trim() ?? ''
    }
  } catch {
    /* fall back below */
  }
  cachedName = name || login
  return cachedName
}
