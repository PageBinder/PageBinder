import type {
  PageDoc,
  PaperSettings,
  FileEntry,
  MailMeta,
  NotebookTree,
  LoadPageResult,
  SavePageResult,
  HistoryEntry
} from '../shared/types'

export interface SearchHit {
  kind: 'page' | 'section' | 'group'
  rel: string
  title: string
  section: string
  sectionRel: string
  snippet?: string
  matchedIn: 'title' | 'body' | 'files'
}

export interface SearchResults {
  query: string
  titles: SearchHit[]
  pages: SearchHit[]
  files: SearchHit[]
  truncated: boolean
}

export interface IndexProgress {
  phase: 'idle' | 'indexing' | 'done' | 'error'
  done: number
  total: number
  rebuilt: boolean
  message?: string
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  created: string
  scope: 'notebook' | 'global'
  folder: string
  ref: string
}

export interface RecycledPage {
  name: string
  kind: 'page' | 'section' | 'group'
  originalSection: string
  originalFolder: string
  title: string
  deleted: string
}

export interface Finding {
  kind: 'corrupt-page' | 'missing-file' | 'orphan-file' | 'stale-html' | 'history-over-policy' | 'temp-file' | 'regenerated-meta'
  rel: string
  file?: string
  detail: string
  repair?: 'restore-from-history' | 'regenerate-html' | 'recycle-orphan' | 'prune-history' | 'remove-temp'
}

export interface VerifyReport {
  mode: 'quick' | 'full'
  pagesChecked: number
  filesChecked: number
  findings: Finding[]
  startedAt: string
  finishedAt: string
}

export interface HistoryPolicy {
  enabled: boolean
  keepAllHours: number
  dailyDays: number
  weeklyWeeks: number | null
}

export type DocName = 'description' | 'recovery' | 'history-verify' | 'uninstall' | 'shortcuts' | 'getting-started' | 'readme'

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
  dependencies: { name: string; version: string; license: string; description: string }[]
}

export interface RecentNotebook {
  root: string
  name: string
  opened: string
}

export interface PageBinderApi {
  notebook: {
    recent(): Promise<RecentNotebook[]>
    startupRoot(): Promise<string | null>
    forget(root: string): Promise<void>
    pickFolder(): Promise<string | null>
    pickParent(): Promise<string | null>
    create(parentDir: string, name: string): Promise<NotebookTree>
    open(root: string): Promise<NotebookTree>
    reload(): Promise<NotebookTree>
    openTemplates(): Promise<NotebookTree>
    rescan(): Promise<void>
    onTreeChanged(handler: () => void): () => void
    close(): Promise<void>
    setPaper(paper: PaperSettings): Promise<NotebookTree>
  }
  print: {
    print(rel: string, paper: PaperSettings): Promise<void>
    pdf(rel: string, paper: PaperSettings, title: string, outPath?: string): Promise<string | null>
    exportPages(scopeRel: string, format: 'html' | 'pdf', suggestedName: string): Promise<string | null>
  }
  recycle: {
    list(): Promise<RecycledPage[]>
    restore(name: string, fallbackSection: string): Promise<{ rel: string; tree: NotebookTree }>
    purge(name: string): Promise<void>
  }
  verify: {
    run(mode: 'quick' | 'full'): Promise<VerifyReport>
    repair(finding: Finding): Promise<string>
    setPolicy(policy: HistoryPolicy, recycleDays: number): Promise<NotebookTree>
    onProgress(handler: (p: { done: number; total: number }) => void): () => void
  }
  template: {
    list(): Promise<{ notebook: TemplateInfo[]; global: TemplateInfo[]; globalDir: string }>
    save(pageRel: string, scope: 'notebook' | 'global', name: string, description: string): Promise<TemplateInfo>
    delete(ref: string): Promise<void>
    createPage(sectionRel: string, ref: string, title?: string): Promise<{ relPath: string; tree: NotebookTree }>
    setSectionDefault(rel: string, ref: string | null): Promise<NotebookTree>
  }
  move: {
    page(rel: string, targetSectionRel: string): Promise<{ rel: string; tree: NotebookTree }>
    copyPage(rel: string, targetSectionRel: string): Promise<{ rel: string; tree: NotebookTree }>
    container(rel: string, targetContainerRel: string): Promise<{ rel: string; tree: NotebookTree }>
    copyContainer(rel: string, targetContainerRel: string): Promise<{ rel: string; tree: NotebookTree }>
    deleteContainer(rel: string): Promise<NotebookTree>
  }
  about: {
    doc(name: DocName): Promise<string>
    info(): Promise<AboutInfo>
    userName(): Promise<string>
  }
  log(text: string): Promise<void>
  search: {
    query(query: string, scopeRel: string): Promise<SearchResults>
    status(): Promise<IndexProgress>
    rebuild(): Promise<void>
    onProgress(handler: (p: IndexProgress) => void): () => void
  }
  file: {
    open(rel: string): Promise<void>
    reveal(rel: string): Promise<void>
    pathFor(file: File): string
  }
  fileUrl(rel: string): string
  section: {
    create(containerRel: string, name: string, color?: string): Promise<{ rel: string; tree: NotebookTree }>
    createGroup(containerRel: string, name: string): Promise<{ rel: string; tree: NotebookTree }>
    rename(rel: string, name: string): Promise<{ rel: string; tree: NotebookTree }>
    setColor(rel: string, color: string): Promise<NotebookTree>
  }
  page: {
    create(sectionRel: string, title?: string): Promise<{ relPath: string; tree: NotebookTree }>
    load(rel: string): Promise<LoadPageResult>
    save(rel: string, doc: PageDoc): Promise<SavePageResult>
    saveDraft(rel: string, doc: PageDoc): Promise<void>
    discardDraft(rel: string): Promise<void>
    listHistory(rel: string): Promise<HistoryEntry[]>
    readSnapshot(rel: string, name: string): Promise<PageDoc | undefined>
    snapshotHtml(rel: string, name: string): Promise<string>
    restoreSnapshot(rel: string, name: string): Promise<SavePageResult & { tree: NotebookTree }>
    copySnapshot(rel: string, name: string): Promise<{ relPath: string; tree: NotebookTree }>
    rename(rel: string, title: string): Promise<SavePageResult & { tree: NotebookTree }>
    addImage(rel: string, originalName: string, bytes: ArrayBuffer): Promise<FileEntry>
    pickImages(rel: string): Promise<FileEntry[]>
    addImagePaths(rel: string, paths: string[]): Promise<FileEntry[]>
    addFiles(rel: string, paths: string[]): Promise<{ entry: FileEntry; mail?: MailMeta }[]>
    pickFiles(rel: string): Promise<{ entry: FileEntry; mail?: MailMeta }[]>
    copyFilesBetween(fromRel: string, toRel: string, items: { sub: 'images' | 'attachments'; name: string; originalName?: string }[]): Promise<{ sub: 'images' | 'attachments'; from: string; entry: FileEntry }[]>
    readAttachment(rel: string, sub: 'images' | 'attachments', name: string): Promise<ArrayBuffer>
    delete(rel: string): Promise<{ name: string; tree: NotebookTree }>
  }
  onMenu(channel: string, handler: () => void): () => void
}

declare global {
  interface Window {
    pagebinder: PageBinderApi
  }
}
