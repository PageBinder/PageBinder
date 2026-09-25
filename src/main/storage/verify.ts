/**
 * Verify Notebook: walk every page and report what is damaged, missing,
 * orphaned, or stale, with a repair for each. See spec section 15.5.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { NotebookTree, TreeChild, PageDoc } from '../../shared/types'
import { readValidPage, listHistory, writeRendered, readSnapshot } from './page'
import { HISTORY_DIR, PAGE_DOC, PAGE_HTML, RECYCLE_DIR, resolveInside } from './paths'
import { TMP_PREFIX, durableCopy } from './atomic'
import { selectSnapshotsToDelete, pruneHistory, type HistoryPolicy, DEFAULT_HISTORY_POLICY } from './history'
import { timestampForFileName } from './ids'

export type FindingKind = 'corrupt-page' | 'missing-file' | 'orphan-file' | 'stale-html' | 'history-over-policy' | 'temp-file' | 'regenerated-meta'
export type Repair = 'restore-from-history' | 'regenerate-html' | 'recycle-orphan' | 'prune-history' | 'remove-temp'

export interface Finding {
  kind: FindingKind
  /** Page folder (or file) relative to the notebook root. */
  rel: string
  /** File name inside the page folder when relevant. */
  file?: string
  detail: string
  repair?: Repair
}

export interface VerifyReport {
  mode: 'quick' | 'full'
  pagesChecked: number
  filesChecked: number
  findings: Finding[]
  startedAt: string
  finishedAt: string
}

function allPages(children: TreeChild[], out: string[]): void {
  for (const c of children) {
    if (c.kind === 'group') allPages(c.children, out)
    else for (const p of c.pages) out.push(p.relPath)
  }
}

async function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

export async function verifyNotebook(
  root: string,
  tree: NotebookTree,
  mode: 'quick' | 'full',
  policy: HistoryPolicy = DEFAULT_HISTORY_POLICY,
  progress?: (done: number, total: number) => void
): Promise<VerifyReport> {
  const startedAt = new Date().toISOString()
  const pages: string[] = []
  allPages(tree.children, pages)
  const findings: Finding[] = []
  for (const meta of tree.regenerated) findings.push({ kind: 'regenerated-meta', rel: meta, detail: 'This metadata file was missing and has been rebuilt with defaults. Order and colours may need to be set again.' })
  let filesChecked = 0
  let done = 0
  for (const rel of pages) {
    const dir = resolveInside(root, rel)
    let names: string[] = []
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const n of names) if (n.startsWith(TMP_PREFIX)) findings.push({ kind: 'temp-file', rel, file: n, detail: 'Leftover from an interrupted write.', repair: 'remove-temp' })

    const doc = await readValidPage(join(dir, PAGE_DOC))
    if (!doc) {
      const history = await listHistory(root, rel)
      let restorable = false
      for (const h of history) {
        if (await readSnapshot(root, rel, h.name)) {
          restorable = true
          break
        }
      }
      findings.push({
        kind: 'corrupt-page',
        rel,
        detail: restorable ? 'The page document is damaged. An earlier version is available in its history.' : 'The page document is damaged and no earlier version could be found.',
        ...(restorable ? { repair: 'restore-from-history' as const } : {})
      })
      done += 1
      progress?.(done, pages.length)
      continue
    }

    // Referenced files: present, right size, and in full mode the right hash.
    const referenced = new Set<string>()
    for (const group of [{ sub: 'images', files: doc.manifest.images ?? [] }, { sub: 'attachments', files: doc.manifest.attachments ?? [] }]) {
      for (const f of group.files) {
        referenced.add(`${group.sub}/${f.name}`)
        filesChecked += 1
        const path = join(dir, group.sub, f.name)
        try {
          const stat = await fs.stat(path)
          if (stat.size !== f.size) {
            findings.push({ kind: 'missing-file', rel, file: `${group.sub}/${f.name}`, detail: `Expected ${f.size} bytes, found ${stat.size}. Restore it from your backup.` })
          } else if (mode === 'full' && f.sha256 && (await hashFile(path)) !== f.sha256) {
            findings.push({ kind: 'missing-file', rel, file: `${group.sub}/${f.name}`, detail: 'The file content does not match its recorded hash. Restore it from your backup.' })
          }
        } catch {
          findings.push({ kind: 'missing-file', rel, file: `${group.sub}/${f.name}`, detail: `Missing (${f.size} bytes). Restore it from your backup into the page folder.` })
        }
      }
    }
    // Orphans: files in the page folder that nothing references.
    for (const sub of ['images', 'attachments']) {
      let files: string[] = []
      try {
        files = await fs.readdir(join(dir, sub))
      } catch {
        continue
      }
      for (const n of files) {
        if (n.startsWith('.')) continue
        if (!referenced.has(`${sub}/${n}`)) findings.push({ kind: 'orphan-file', rel, file: `${sub}/${n}`, detail: 'No object on the page uses this file. It can be moved to the recycle folder.', repair: 'recycle-orphan' })
      }
    }
    // Rendered copy present and current.
    try {
      const [d, h] = await Promise.all([fs.stat(join(dir, PAGE_DOC)), fs.stat(join(dir, PAGE_HTML)).catch(() => undefined)])
      if (!h || h.mtimeMs < d.mtimeMs) findings.push({ kind: 'stale-html', rel, detail: h ? 'page.html is older than the page.' : 'page.html is missing.', repair: 'regenerate-html' })
    } catch {
      /* ignore */
    }
    // History beyond the pruning policy.
    try {
      const snaps = (await fs.readdir(join(dir, HISTORY_DIR))).filter((n) => n.endsWith('.json'))
      const doomed = selectSnapshotsToDelete(snaps, new Date(), policy)
      if (doomed.length) findings.push({ kind: 'history-over-policy', rel, detail: `${doomed.length} of ${snaps.length} snapshots are older than the policy keeps.`, repair: 'prune-history' })
    } catch {
      /* no history folder */
    }
    done += 1
    if (done % 10 === 0) progress?.(done, pages.length)
  }
  progress?.(pages.length, pages.length)
  return { mode, pagesChecked: pages.length, filesChecked, findings, startedAt, finishedAt: new Date().toISOString() }
}

/** Apply one finding's repair. Source files are never deleted; orphans go to the recycle folder. */
export async function repairFinding(root: string, finding: Finding, policy: HistoryPolicy = DEFAULT_HISTORY_POLICY): Promise<string> {
  const dir = resolveInside(root, finding.rel)
  switch (finding.repair) {
    case 'remove-temp': {
      if (!finding.file) return 'Nothing to do.'
      await fs.rm(join(dir, finding.file), { force: true })
      return `Removed ${finding.file}.`
    }
    case 'regenerate-html': {
      const doc = await readValidPage(join(dir, PAGE_DOC))
      if (!doc) return 'The page could not be read.'
      await writeRendered(dir, doc)
      return 'page.html regenerated.'
    }
    case 'prune-history': {
      const removed = await pruneHistory(dir, policy)
      return `Removed ${removed.length} old snapshots.`
    }
    case 'recycle-orphan': {
      if (!finding.file) return 'Nothing to do.'
      const recycle = join(root, RECYCLE_DIR, 'orphaned files')
      await fs.mkdir(recycle, { recursive: true })
      const target = join(recycle, `${timestampForFileName()} ${finding.file.replace('/', ' ')}`)
      await fs.rename(join(dir, finding.file), target)
      return `Moved ${finding.file} to the recycle folder.`
    }
    case 'restore-from-history': {
      const history = await listHistory(root, finding.rel)
      for (const h of history) {
        const snap = await readSnapshot(root, finding.rel, h.name)
        if (snap) {
          const docPath = join(dir, PAGE_DOC)
          try {
            await fs.rename(docPath, join(dir, `${PAGE_DOC}.corrupt-${timestampForFileName()}`))
          } catch {
            /* nothing to keep */
          }
          await durableCopy(join(dir, HISTORY_DIR, h.name), docPath)
          await writeRendered(dir, snap as PageDoc)
          return `Restored the version from ${h.name}. The damaged file was kept beside it.`
        }
      }
      return 'No valid earlier version was found.'
    }
    default:
      return 'This finding has no automatic repair.'
  }
}
