/**
 * Full-text search index. SQLite with FTS5, using the SQLite that ships in
 * Electron's Node runtime, so no native module has to be built.
 *
 * The index is a cache in <notebook>/.index/search.sqlite. It can be deleted
 * at any time and is rebuilt from the page files. See spec sections 10 and 15.7.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { PageDoc } from '../../shared/types'
import { INDEX_DIR } from '../storage/paths'
import { extractPageText } from './text'

/** 4: printout text column. A version change makes every notebook rebuild its index on open. */
export const INDEX_VERSION = 4
export const INDEX_FILE = 'search.sqlite'

export type ResultKind = 'page' | 'section' | 'group'

export interface SearchHit {
  kind: ResultKind
  rel: string
  title: string
  /** Section name for pages. */
  section: string
  sectionRel: string
  /** Highlighted snippet for body or file matches, with <b> around matches. */
  snippet?: string
  matchedIn: 'title' | 'body' | 'files' | 'printouts'
}

export interface SearchResults {
  query: string
  titles: SearchHit[]
  pages: SearchHit[]
  files: SearchHit[]
  /** Pages whose printouts of attached PDFs contain the words. */
  printouts: SearchHit[]
  truncated: boolean
}

export interface PageIndexRow {
  rel: string
  id: string
  title: string
  section: string
  sectionRel: string
  mtime: number
  modified: string
  sort: number
  parentPageId: string | null
}

export interface ContainerRow {
  rel: string
  kind: 'section' | 'group'
  name: string
  color: string | null
  parentRel: string
  sort: number
  defaultTemplate: string | null
}

const SCHEMA = `
create table if not exists meta (key text primary key, value text);
create table if not exists pages (
  rel text primary key, id text, title text, section text, section_rel text, mtime real, modified text,
  sort integer default 0, parent_page_id text
);
create table if not exists containers (
  rel text primary key, kind text, name text, color text, parent_rel text, sort integer default 0, default_template text
);
create index if not exists pages_section on pages(section_rel);
create index if not exists containers_parent on containers(parent_rel);
create virtual table if not exists fts using fts5(
  kind unindexed, rel unindexed, section unindexed, section_rel unindexed,
  title, body, files, printouts,
  prefix='2 3', tokenize='unicode61 remove_diacritics 2'
);
`

/** FTS5 query for prefix matching of every typed word, safe against operators. */
export function buildMatch(column: string, query: string): string | null {
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter((t) => t.length > 0)
  if (!terms.length) return null
  return `${column}:(${terms.map((t) => `"${t}"*`).join(' ')})`
}

export class SearchIndex {
  private db: DatabaseSync | null = null
  private path: string
  private stmts: Record<string, StatementSync> = {}
  private inTx = false

  /** Run many writes as one transaction. Nested calls join the outer one. */
  transaction<T>(fn: () => T): T {
    if (this.inTx) return fn()
    const db = this.db!
    db.exec('begin')
    this.inTx = true
    try {
      const out = fn()
      db.exec('commit')
      return out
    } catch (err) {
      db.exec('rollback')
      throw err
    } finally {
      this.inTx = false
    }
  }

  constructor(private root: string) {
    this.path = join(root, INDEX_DIR, INDEX_FILE)
  }

  get file(): string {
    return this.path
  }

  /** Open the index, verifying it. A damaged or outdated index is deleted and recreated. */
  async open(): Promise<{ rebuilt: boolean }> {
    await fs.mkdir(join(this.root, INDEX_DIR), { recursive: true })
    let rebuilt = false
    try {
      this.db = new DatabaseSync(this.path)
      this.db.exec('pragma journal_mode = wal; pragma synchronous = off;')
      const check = this.db.prepare('pragma integrity_check').get() as { integrity_check: string } | undefined
      if (!check || check.integrity_check !== 'ok') throw new Error('integrity check failed')
      this.db.exec(SCHEMA)
      const v = this.db.prepare("select value from meta where key = 'version'").get() as { value: string } | undefined
      if (!v || Number(v.value) !== INDEX_VERSION) throw new Error('index version mismatch')
    } catch {
      this.close()
      await fs.rm(this.path, { force: true })
      await fs.rm(`${this.path}-wal`, { force: true })
      await fs.rm(`${this.path}-shm`, { force: true })
      this.db = new DatabaseSync(this.path)
      this.db.exec('pragma journal_mode = wal; pragma synchronous = off;')
      this.db.exec(SCHEMA)
      this.db.prepare("insert or replace into meta (key, value) values ('version', ?)").run(String(INDEX_VERSION))
      rebuilt = true
    }
    this.prepare()
    return { rebuilt }
  }

  private prepare(): void {
    const db = this.db!
    this.stmts = {
      getPage: db.prepare('select rel, id, title, section, section_rel as sectionRel, mtime, modified, sort, parent_page_id as parentPageId from pages where rel = ?'),
      upsertPage: db.prepare(
        'insert into pages (rel, id, title, section, section_rel, mtime, modified, sort, parent_page_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(rel) do update set id = excluded.id, title = excluded.title, section = excluded.section, section_rel = excluded.section_rel, mtime = excluded.mtime, modified = excluded.modified, sort = excluded.sort, parent_page_id = excluded.parent_page_id'
      ),
      setPageSort: db.prepare('update pages set sort = ? where rel = ?'),
      deletePage: db.prepare('delete from pages where rel = ?'),
      deletePagesInSection: db.prepare('delete from pages where section_rel = ?'),
      deleteFtsInSection: db.prepare("delete from fts where kind = 'page' and section_rel = ?"),
      deleteFtsRow: db.prepare('delete from fts where rowid = ?'),
      insertFts: db.prepare('insert into fts (rowid, kind, rel, section, section_rel, title, body, files, printouts) values (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      pageRowid: db.prepare('select rowid as id from pages where rel = ?'),
      containerRowid: db.prepare('select rowid as id from containers where rel = ?'),
      pageRowidsUnder: db.prepare('select rowid as id from pages where section_rel = ? or section_rel like ?'),
      containerRowidsUnder: db.prepare('select rowid as id from containers where rel = ? or rel like ?'),
      upsertContainer: db.prepare(
        'insert into containers (rel, kind, name, color, parent_rel, sort, default_template) values (?, ?, ?, ?, ?, ?, ?) on conflict(rel) do update set kind = excluded.kind, name = excluded.name, color = excluded.color, parent_rel = excluded.parent_rel, sort = excluded.sort, default_template = excluded.default_template'
      ),
      deleteContainer: db.prepare('delete from containers where rel = ?'),
      getContainer: db.prepare('select rel, kind, name, color, parent_rel as parentRel, sort, default_template as defaultTemplate from containers where rel = ?'),
      containersUnder: db.prepare('select rel from containers where rel = ? or rel like ?'),
      pagesUnder: db.prepare('select rel from pages where section_rel = ? or section_rel like ?'),
      allPages: db.prepare('select rel, id, title, section, section_rel as sectionRel, mtime, modified, sort, parent_page_id as parentPageId from pages'),
      allContainers: db.prepare('select rel, kind, name, color, parent_rel as parentRel, sort, default_template as defaultTemplate from containers'),
      pagesInSection: db.prepare('select rel, id, title, section, section_rel as sectionRel, mtime, modified, sort, parent_page_id as parentPageId from pages where section_rel = ? order by sort, title collate nocase'),
      count: db.prepare('select count(*) as n from pages'),
      countContainers: db.prepare('select count(*) as n from containers')
    }
  }

  close(): void {
    try {
      this.db?.close()
    } catch {
      /* already closed */
    }
    this.db = null
  }

  pageCount(): number {
    return (this.stmts['count']!.get() as { n: number }).n
  }

  getPage(rel: string): PageIndexRow | undefined {
    return this.stmts['getPage']!.get(rel) as unknown as PageIndexRow | undefined
  }

  allPages(): PageIndexRow[] {
    return this.stmts['allPages']!.all() as unknown as PageIndexRow[]
  }

  /** Index one page from its document. `extraBody` carries text pulled from attachments such as email bodies. */
  indexPage(rel: string, doc: PageDoc, section: { name: string; rel: string }, mtime: number, extraBody = '', sort?: number): void {
    const { body, files, printouts } = extractPageText(doc)
    this.transaction(() => {
      const prev = this.getPage(rel)
      this.deletePageText(rel)
      this.stmts['upsertPage']!.run(rel, doc.id, doc.title, section.name, section.rel, mtime, doc.modified, sort ?? prev?.sort ?? 0, doc.parentPageId ?? null)
      const rowid = (this.stmts['pageRowid']!.get(rel) as { id: number }).id
      this.stmts['insertFts']!.run(rowid, 'page', rel, section.name, section.rel, doc.title, extraBody ? `${body}\n${extraBody}` : body, files, printouts)
    })
  }

  /** Text entries are addressed by rowid, so removing one never scans the text table. */
  private deletePageText(rel: string): void {
    const row = this.stmts['pageRowid']!.get(rel) as { id: number } | undefined
    if (row) this.stmts['deleteFtsRow']!.run(row.id)
  }
  private deleteContainerText(rel: string): void {
    const row = this.stmts['containerRowid']!.get(rel) as { id: number } | undefined
    if (row) this.stmts['deleteFtsRow']!.run(-row.id)
  }

  removePage(rel: string): void {
    this.deletePageText(rel)
    this.stmts['deletePage']!.run(rel)
  }

  /** Record a page's place in the tree without re-reading its text (title, order, parent). */
  upsertPageRef(rel: string, ref: { id: string; title: string; modified: string; parentPageId?: string }, section: { name: string; rel: string }, mtime: number, sort: number, fresh = false): void {
    const prev = fresh ? undefined : this.getPage(rel)
    this.stmts['upsertPage']!.run(rel, ref.id, ref.title, section.name, section.rel, prev?.mtime ?? mtime, ref.modified, sort, ref.parentPageId ?? null)
  }

  pagesInSection(sectionRel: string): PageIndexRow[] {
    return this.stmts['pagesInSection']!.all(sectionRel) as unknown as PageIndexRow[]
  }

  /** Remove every page row, container row, and text entry under a section or group rel. */
  removeUnder(rel: string): void {
    this.transaction(() => {
      for (const r of this.stmts['pageRowidsUnder']!.all(rel, `${rel}/%`) as unknown as { id: number }[]) this.stmts['deleteFtsRow']!.run(r.id)
      for (const r of this.stmts['containerRowidsUnder']!.all(rel, `${rel}/%`) as unknown as { id: number }[]) this.stmts['deleteFtsRow']!.run(-r.id)
      for (const p of this.stmts['pagesUnder']!.all(rel, `${rel}/%`) as unknown as { rel: string }[]) this.stmts['deletePage']!.run(p.rel)
      for (const c of this.stmts['containersUnder']!.all(rel, `${rel}/%`) as unknown as { rel: string }[]) this.stmts['deleteContainer']!.run(c.rel)
    })
  }

  containerCount(): number {
    return (this.stmts['countContainers']!.get() as { n: number }).n
  }

  /** Sections and groups are searchable by name and hold their place in the tree. */
  indexContainer(rel: string, kind: 'section' | 'group', name: string, extra: { color?: string | null; parentRel?: string; sort?: number; defaultTemplate?: string | null } = {}): void {
    this.transaction(() => {
      const prev = this.getContainer(rel)
      this.deleteContainerText(rel)
      const parentRel = extra.parentRel ?? prev?.parentRel ?? (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')
      this.stmts['upsertContainer']!.run(rel, kind, name, extra.color ?? prev?.color ?? null, parentRel, extra.sort ?? prev?.sort ?? 0, extra.defaultTemplate === undefined ? (prev?.defaultTemplate ?? null) : extra.defaultTemplate)
      const rowid = (this.stmts['containerRowid']!.get(rel) as { id: number }).id
      this.stmts['insertFts']!.run(-rowid, kind, rel, '', rel, name, '', '', '')
    })
  }

  getContainer(rel: string): ContainerRow | undefined {
    return this.stmts['getContainer']!.get(rel) as unknown as ContainerRow | undefined
  }

  removeContainer(rel: string): void {
    this.deleteContainerText(rel)
    this.stmts['deleteContainer']!.run(rel)
  }

  allContainers(): ContainerRow[] {
    return this.stmts['allContainers']!.all() as unknown as ContainerRow[]
  }

  /** Drop everything indexed. Used before a full rebuild. */
  clear(): void {
    this.db!.exec('delete from fts; delete from pages; delete from containers;')
  }

  /**
   * Type-ahead search. `scopeRel` limits pages to one section (or group prefix).
   * Results come grouped as OneNote shows them: titles, then page text, then file names.
   */
  search(query: string, scopeRel = '', limit = 50): SearchResults {
    const empty: SearchResults = { query, titles: [], pages: [], files: [], printouts: [], truncated: false }
    const db = this.db!
    const scopeWhere = scopeRel ? ' and (rel = ? or rel like ?)' : ''
    const scopeArgs = scopeRel ? [scopeRel, `${scopeRel}/%`] : []
    const run = (column: 'title' | 'body' | 'files' | 'printouts'): SearchHit[] => {
      const match = buildMatch(column, query)
      if (!match) return []
      const colIndex = { title: 4, body: 5, files: 6, printouts: 7 }[column]
      const sql = `select kind, rel, section, section_rel as sectionRel, title,
          snippet(fts, ${colIndex}, '<b>', '</b>', '…', 12) as snippet
        from fts where fts match ?${scopeWhere}
        order by rank limit ?`
      const rows = db.prepare(sql).all(match, ...scopeArgs, limit + 1) as unknown as (SearchHit & { snippet: string })[]
      return rows.map((r) => ({ kind: r.kind, rel: r.rel, title: r.title, section: r.section, sectionRel: r.sectionRel, snippet: r.snippet, matchedIn: column }))
    }
    if (!buildMatch('title', query)) return empty
    const titles = run('title')
    const pages = run('body')
    const files = run('files')
    const printouts = run('printouts')
    const truncated = titles.length > limit || pages.length > limit || files.length > limit || printouts.length > limit
    return { query, titles: titles.slice(0, limit), pages: pages.slice(0, limit), files: files.slice(0, limit), printouts: printouts.slice(0, limit), truncated }
  }
}
