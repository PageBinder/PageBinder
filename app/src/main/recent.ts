import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './storage/atomic'

export interface RecentNotebook {
  root: string
  name: string
  opened: string
  /** The page last opened in this notebook, relative to its folder, for reopening there. */
  lastPage?: string
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
  const all = await readRecent()
  const previous = all.find((r) => r.root === root)
  const list = all.filter((r) => r.root !== root)
  list.unshift({ root, name, opened: new Date().toISOString(), ...(previous?.lastPage ? { lastPage: previous.lastPage } : {}) })
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await atomicWriteFile(recentPath(), JSON.stringify(list.slice(0, 10), null, 2))
}

// Writes to the list run one at a time, so a quick run of page changes never loses one.
let queue: Promise<void> = Promise.resolve()
let pending = 0

/** Writes of the last page still under way; quitting waits for them (see index.ts). */
export function recentWritesPending(): boolean {
  return pending > 0
}

export function whenRecentWritten(): Promise<void> {
  return queue
}

/**
 * Remember the page last opened in a notebook (kept in the app's settings, never in the notebook).
 * Runs in the background: opening a page never waits for it.
 */
export function rememberLastPage(root: string, rel: string): void {
  pending += 1
  queue = queue
    .then(async () => {
      const list = await readRecent()
      const entry = list.find((r) => r.root === root)
      if (!entry || entry.lastPage === rel) return
      entry.lastPage = rel
      await atomicWriteFile(recentPath(), JSON.stringify(list, null, 2))
    })
    .catch(() => undefined)
    .finally(() => {
      pending -= 1
    })
}

/** The page last opened in a notebook, if remembered. */
export async function lastPageOf(root: string): Promise<string | null> {
  return (await readRecent()).find((r) => r.root === root)?.lastPage ?? null
}

export async function forgetRecent(root: string): Promise<void> {
  const list = (await readRecent()).filter((r) => r.root !== root)
  await atomicWriteFile(recentPath(), JSON.stringify(list, null, 2))
}
