/**
 * Notebook properties: size and file count on disk, the page history's share of it, the largest
 * attachments, and the most recent edit (when, by whom, and on which page). Reads only.
 */
import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { HISTORY_DIR, PAGE_DOC } from './storage/paths'

/** Attachments at least this large are listed by name. */
export const LARGE_ATTACHMENT_BYTES = 50 * 1024 * 1024

export interface NotebookProperties {
  root: string
  totalBytes: number
  fileCount: number
  historyBytes: number
  historyFiles: number
  largeAttachments: { rel: string; bytes: number }[]
  lastEdit: { when: string; by: string | null; pageRel: string; title: string } | null
}

export async function notebookProperties(root: string): Promise<NotebookProperties> {
  const out: NotebookProperties = { root, totalBytes: 0, fileCount: 0, historyBytes: 0, historyFiles: 0, largeAttachments: [], lastEdit: null }
  let newest: { path: string; mtime: number } | null = null
  const walk = async (dir: string, inHistory: boolean, inAttachments: boolean): Promise<void> => {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        await walk(path, inHistory || e.name === HISTORY_DIR, e.name === 'attachments' && dir.endsWith('.page'))
        continue
      }
      if (!e.isFile()) continue
      let st
      try {
        st = await fs.stat(path)
      } catch {
        continue
      }
      out.totalBytes += st.size
      out.fileCount += 1
      if (inHistory) {
        out.historyBytes += st.size
        out.historyFiles += 1
      }
      if (inAttachments && st.size >= LARGE_ATTACHMENT_BYTES) out.largeAttachments.push({ rel: relative(root, path).split(sep).join('/'), bytes: st.size })
      if (!inHistory && e.name === PAGE_DOC && (!newest || st.mtimeMs > newest.mtime)) newest = { path, mtime: st.mtimeMs }
    }
  }
  await walk(root, false, false)
  out.largeAttachments.sort((a, b) => b.bytes - a.bytes)
  const last = newest as { path: string; mtime: number } | null
  if (last) {
    try {
      const doc = JSON.parse(await fs.readFile(last.path, 'utf8')) as { modified?: string; modifiedBy?: string; title?: string }
      const pageRel = relative(root, join(last.path, '..')).split(sep).join('/')
      out.lastEdit = { when: doc.modified ?? new Date(last.mtime).toISOString(), by: typeof doc.modifiedBy === 'string' ? doc.modifiedBy : null, pageRel, title: doc.title ?? '' }
    } catch {
      /* unreadable: no last edit shown */
    }
  }
  return out
}
