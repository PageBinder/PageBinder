import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Busy cursor: while any request to the main process has been running for more
// than a moment, the page shows a progress cursor and ignores nothing else.
let inFlight = 0
let busyTimer: ReturnType<typeof setTimeout> | undefined
const rawInvoke = ipcRenderer.invoke.bind(ipcRenderer)
function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  inFlight += 1
  if (!busyTimer) busyTimer = setTimeout(() => document.documentElement.setAttribute('data-busy', '1'), 150)
  const done = (): void => {
    inFlight -= 1
    if (inFlight === 0) {
      clearTimeout(busyTimer)
      busyTimer = undefined
      document.documentElement.removeAttribute('data-busy')
    }
  }
  return rawInvoke(channel, ...args).then(
    (v: unknown) => {
      done()
      return v
    },
    (e: unknown) => {
      done()
      throw e
    }
  )
}
import type { PageDoc, PaperSettings } from '../shared/types'

const api = {
  notebook: {
    recent: () => invoke('notebook:recent'),
    startupRoot: () => invoke('notebook:startupRoot'),
    forget: (root: string) => invoke('notebook:forget', root),
    pickFolder: () => invoke('notebook:pickFolder'),
    pickParent: () => invoke('notebook:pickParent'),
    create: (parentDir: string, name: string) => invoke('notebook:create', parentDir, name),
    open: (root: string) => invoke('notebook:open', root),
    reload: () => invoke('notebook:reload'),
    openTemplates: () => invoke('notebook:openTemplates'),
    rescan: () => invoke('notebook:rescan'),
    onTreeChanged: (handler: () => void) => {
      const listener = (): void => handler()
      ipcRenderer.on('tree:changed', listener)
      return () => ipcRenderer.removeListener('tree:changed', listener)
    },
    close: () => invoke('notebook:close'),
    setPaper: (paper: PaperSettings) => invoke('notebook:setPaper', paper)
  },
  print: {
    print: (rel: string, paper: PaperSettings) => invoke('print:print', rel, paper),
    pdf: (rel: string, paper: PaperSettings, title: string, outPath?: string) => invoke('print:pdf', rel, paper, title, outPath),
    exportPages: (scopeRel: string, format: 'html' | 'pdf', suggestedName: string) => invoke('print:exportPages', scopeRel, format, suggestedName)
  },
  recycle: {
    list: () => invoke('recycle:list'),
    restore: (name: string, fallbackSection: string) => invoke('recycle:restore', name, fallbackSection),
    purge: (name: string) => invoke('recycle:purge', name)
  },
  verify: {
    run: (mode: 'quick' | 'full') => invoke('notebook:verify', mode),
    repair: (finding: unknown) => invoke('notebook:repair', finding),
    setPolicy: (policy: unknown, recycleDays: number) => invoke('notebook:setHistoryPolicy', policy, recycleDays),
    onProgress: (handler: (p: unknown) => void) => {
      const listener = (_e: unknown, p: unknown): void => handler(p)
      ipcRenderer.on('verify:progress', listener)
      return () => ipcRenderer.removeListener('verify:progress', listener)
    }
  },
  template: {
    list: () => invoke('template:list'),
    save: (pageRel: string, scope: 'notebook' | 'global', name: string, description: string) => invoke('template:save', pageRel, scope, name, description),
    delete: (ref: string) => invoke('template:delete', ref),
    createPage: (sectionRel: string, ref: string, title?: string) => invoke('template:createPage', sectionRel, ref, title),
    setSectionDefault: (rel: string, ref: string | null) => invoke('section:setDefaultTemplate', rel, ref)
  },
  move: {
    page: (rel: string, targetSectionRel: string) => invoke('page:move', rel, targetSectionRel),
    copyPage: (rel: string, targetSectionRel: string) => invoke('page:copy', rel, targetSectionRel),
    container: (rel: string, targetContainerRel: string) => invoke('section:move', rel, targetContainerRel),
    copyContainer: (rel: string, targetContainerRel: string) => invoke('section:copy', rel, targetContainerRel),
    deleteContainer: (rel: string) => invoke('section:delete', rel)
  },
  about: {
    doc: (name: string) => invoke('about:doc', name),
    info: () => invoke('about:info'),
    userName: () => invoke('about:userName')
  },
  log: (text: string) => invoke('log:renderer', text),
  search: {
    query: (query: string, scopeRel: string) => invoke('search:query', query, scopeRel),
    status: () => invoke('search:status'),
    rebuild: () => invoke('search:rebuild'),
    onProgress: (handler: (p: unknown) => void) => {
      const listener = (_e: unknown, p: unknown): void => handler(p)
      ipcRenderer.on('index:progress', listener)
      return () => ipcRenderer.removeListener('index:progress', listener)
    }
  },
  file: {
    open: (rel: string) => invoke('file:open', rel),
    reveal: (rel: string) => invoke('file:reveal', rel),
    /** Absolute path of a File dropped or pasted from the file system, or '' for in-memory files. */
    pathFor: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  fileUrl: (rel: string) => `pagebinder://notebook/${rel.split('/').map(encodeURIComponent).join('/')}`,
  section: {
    create: (containerRel: string, name: string, color?: string) =>
      invoke('section:create', containerRel, name, color),
    createGroup: (containerRel: string, name: string) => invoke('section:createGroup', containerRel, name),
    rename: (rel: string, name: string) => invoke('section:rename', rel, name),
    setColor: (rel: string, color: string) => invoke('section:setColor', rel, color)
  },
  page: {
    create: (sectionRel: string, title?: string) => invoke('page:create', sectionRel, title),
    load: (rel: string) => invoke('page:load', rel),
    save: (rel: string, doc: PageDoc) => invoke('page:save', rel, doc),
    saveDraft: (rel: string, doc: PageDoc) => invoke('page:saveDraft', rel, doc),
    discardDraft: (rel: string) => invoke('page:discardDraft', rel),
    listHistory: (rel: string) => invoke('page:listHistory', rel),
    readSnapshot: (rel: string, name: string) => invoke('page:readSnapshot', rel, name),
    snapshotHtml: (rel: string, name: string) => invoke('page:snapshotHtml', rel, name),
    restoreSnapshot: (rel: string, name: string) => invoke('page:restoreSnapshot', rel, name),
    copySnapshot: (rel: string, name: string) => invoke('page:copySnapshot', rel, name),
    rename: (rel: string, title: string) => invoke('page:rename', rel, title),
    addImage: (rel: string, originalName: string, bytes: ArrayBuffer) => invoke('page:addImage', rel, originalName, new Uint8Array(bytes)),
    pickImages: (rel: string) => invoke('page:pickImages', rel),
    addImagePaths: (rel: string, paths: string[]) => invoke('page:addImagePaths', rel, paths),
    addFiles: (rel: string, paths: string[]) => invoke('page:addFiles', rel, paths),
    pickFiles: (rel: string) => invoke('page:pickFiles', rel),
    copyFilesBetween: (fromRel: string, toRel: string, items: { sub: 'images' | 'attachments'; name: string; originalName?: string }[]) => invoke('page:copyFilesBetween', fromRel, toRel, items),
    readAttachment: (rel: string, sub: 'images' | 'attachments', name: string) => invoke('page:readAttachment', rel, sub, name),
    delete: (rel: string) => invoke('page:delete', rel)
  },
  onMenu: (channel: string, handler: () => void) => {
    const listener = (): void => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('pagebinder', api)
