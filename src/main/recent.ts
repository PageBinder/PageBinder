import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './storage/atomic'

export interface RecentNotebook {
  root: string
  name: string
  opened: string
}

function recentPath(): string {
  return join(app.getPath('userData'), 'recent-notebooks.json')
}

export async function readRecent(): Promise<RecentNotebook[]> {
  try {
    const list = JSON.parse(await fs.readFile(recentPath(), 'utf8')) as RecentNotebook[]
    if (!Array.isArray(list)) return []
    // Notebooks whose folder no longer exists are dropped from the list.
    const alive: RecentNotebook[] = []
    for (const r of list) {
      try {
        await fs.access(join(r.root, 'notebook.json'))
        alive.push(r)
      } catch {
        /* gone */
      }
    }
    return alive
  } catch {
    return []
  }
}

export async function rememberRecent(root: string, name: string): Promise<void> {
  const list = (await readRecent()).filter((r) => r.root !== root)
  list.unshift({ root, name, opened: new Date().toISOString() })
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await atomicWriteFile(recentPath(), JSON.stringify(list.slice(0, 10), null, 2))
}

export async function forgetRecent(root: string): Promise<void> {
  const list = (await readRecent()).filter((r) => r.root !== root)
  await atomicWriteFile(recentPath(), JSON.stringify(list, null, 2))
}
