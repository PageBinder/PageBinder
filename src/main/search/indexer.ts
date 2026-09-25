/**
 * Keeps the search index in step with the notebook folder.
 *
 * - On open, every page's modification time is compared with the index and
 *   only changed pages are read. New notebooks index in the background in
 *   small batches so the window stays responsive.
 * - Every save in the app indexes that page immediately.
 * See spec section 10.2.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { NotebookTree, TreeChild, PageDoc } from '../../shared/types'
import { SearchIndex, type SearchResults } from './index'
import { readValidPage } from '../storage/page'
import { PAGE_DOC, ATTACHMENTS_DIR_NAME, resolveInside } from '../storage/paths'
import { readMailBody } from './mail'
import { applyTreeToIndex, treeFromIndex, refreshSection, refreshContainer } from './tree'
import type { NotebookTree as Tree, NotebookMeta } from '../../shared/types'

export interface IndexProgress {
  phase: 'idle' | 'indexing' | 'done' | 'error'
  done: number
  total: number
  rebuilt: boolean
  message?: string
}

interface PageRefWithSection {
  rel: string
  section: { name: string; rel: string }
}

function collect(children: TreeChild[], containers: { rel: string; kind: 'section' | 'group'; name: string }[], pages: PageRefWithSection[]): void {
  for (const child of children) {
    containers.push({ rel: child.relPath, kind: child.kind, name: child.name })
    if (child.kind === 'group') collect(child.children, containers, pages)
    else for (const p of child.pages) pages.push({ rel: p.relPath, section: { name: child.name, rel: child.relPath } })
  }
}

export class Indexer {
  readonly index: SearchIndex
  private progress: IndexProgress = { phase: 'idle', done: 0, total: 0, rebuilt: false }
  private run = 0
  private opened = false

  /** Called when a background reconcile finished and the tree may have changed. */
  onTreeChanged: (() => void) | undefined

  constructor(private root: string, private notify: (p: IndexProgress) => void) {
    this.index = new SearchIndex(root)
  }

  /** The tree as the index knows it, or null before the first reconcile. */
  async tree(meta: NotebookMeta): Promise<Tree | null> {
    await this.open()
    return treeFromIndex(this.index, this.root, meta)
  }

  async refreshSection(sectionRel: string): Promise<void> {
    await this.open()
    await refreshSection(this.index, this.root, sectionRel)
  }

  async refreshContainer(containerRel: string): Promise<void> {
    await this.open()
    await refreshContainer(this.index, this.root, containerRel)
  }

  status(): IndexProgress {
    return this.progress
  }

  private set(p: Partial<IndexProgress>): void {
    this.progress = { ...this.progress, ...p }
    this.notify(this.progress)
  }

  async open(): Promise<void> {
    if (this.opened) return
    const { rebuilt } = await this.index.open()
    this.opened = true
    this.set({ rebuilt })
  }

  close(): void {
    this.run += 1
    this.index.close()
    this.opened = false
  }

  /** Bring the index up to date with the tree. Safe to call again; a newer call cancels an older one. */
  async reconcile(tree: NotebookTree, full = false): Promise<void> {
    await this.open()
    const myRun = ++this.run
    const containers: { rel: string; kind: 'section' | 'group'; name: string }[] = []
    const pages: PageRefWithSection[] = []
    collect(tree.children, containers, pages)
    this.set({ phase: 'indexing', done: 0, total: pages.length })
    try {
      if (full) this.index.clear()
      // The scanned tree is the ground truth for structure: names, colours, order, membership.
      const existing = new Map(this.index.allPages().map((p) => [p.rel, p]))
      applyTreeToIndex(this.index, tree)
      void containers

      let done = 0
      const BATCH = 100
      for (let start = 0; start < pages.length; start += BATCH) {
        if (myRun !== this.run) return
        const batch = pages.slice(start, start + BATCH)
        // Read the files for this batch in parallel, then write the index in one transaction.
        const work = await Promise.all(
          batch.map(async (p) => {
            try {
              const stat = await fs.stat(join(resolveInside(this.root, p.rel), PAGE_DOC))
              const prev = existing.get(p.rel)
              if (prev && prev.mtime === stat.mtimeMs) return null
              const doc = await readValidPage(join(resolveInside(this.root, p.rel), PAGE_DOC))
              if (!doc) return null
              const bodies: string[] = []
              for (const obj of doc.objects) {
                if (obj.kind === 'file' && /\.(eml|msg)$/i.test(obj.name)) bodies.push(await readMailBody(resolveInside(this.root, `${p.rel}/${ATTACHMENTS_DIR_NAME}/${obj.name}`)))
              }
              return { p, doc, mtime: stat.mtimeMs, extra: bodies.filter(Boolean).join('\n') }
            } catch {
              return null
            }
          })
        )
        if (myRun !== this.run) return
        this.index.transaction(() => {
          for (const w of work) if (w) this.index.indexPage(w.p.rel, w.doc, w.p.section, w.mtime, w.extra)
        })
        done += batch.length
        this.set({ done })
        await new Promise((r) => setImmediate(r))
      }
      this.set({ phase: 'done', done })
      this.onTreeChanged?.()
    } catch (err) {
      this.set({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Index one page now, for example right after a save. */
  async indexDoc(rel: string, doc: PageDoc, section: { name: string; rel: string }, mtime?: number): Promise<void> {
    await this.open()
    let stamp = mtime
    if (stamp === undefined) {
      try {
        stamp = (await fs.stat(join(resolveInside(this.root, rel), PAGE_DOC))).mtimeMs
      } catch {
        stamp = Date.now()
      }
    }
    const bodies: string[] = []
    for (const obj of doc.objects) {
      if (obj.kind === 'file' && /\.(eml|msg)$/i.test(obj.name)) {
        bodies.push(await readMailBody(resolveInside(this.root, `${rel}/${ATTACHMENTS_DIR_NAME}/${obj.name}`)))
      }
    }
    this.index.indexPage(rel, doc, section, stamp, bodies.filter(Boolean).join('\n'))
  }

  remove(rel: string): void {
    if (this.opened) this.index.removePage(rel)
  }

  search(query: string, scopeRel = ''): SearchResults {
    if (!this.opened) return { query, titles: [], pages: [], files: [], truncated: false }
    return this.index.search(query, scopeRel)
  }
}
