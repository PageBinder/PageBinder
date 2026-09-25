import type { JSX } from 'react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { NotebookTree, PageDoc, RecoveryNotice, PageRef, FileEntry, PaperSettings, PrintSettings, MailMeta, DrawTool, CanvasObject } from '@shared/types'
import { renderPdfPages } from './pdfPrintout'
import { paperPixels } from './paper'
import { ActiveEditorProvider, useActiveEditor } from './editorContext'
import type { Editor } from '@tiptap/react'
import { childrenOf, findSection, groupPath, firstSection, parentGroupRel } from './tree'
import { Welcome } from './components/Welcome'
import { Toolbar } from './components/Toolbar'
import { Breadcrumb } from './components/Breadcrumb'
import { SectionTabs } from './components/SectionTabs'
import { PageList } from './components/PageList'
import { Canvas } from './components/Canvas'
import { Dialog, type DialogSpec } from './components/Dialog'
import { PageSetupDialog } from './components/PageSetupDialog'
import { PrintPreview } from './components/PrintPreview'
import { SearchBox } from './components/SearchBox'
import { HistoryPanel } from './components/HistoryPanel'
import { RecyclePanel } from './components/RecyclePanel'
import { VerifyPanel } from './components/VerifyPanel'
import { ExportDialog, type ExportScope } from './components/ExportDialog'
import { AboutDialog } from './components/AboutDialog'
import { MoveCopyDialog } from './components/MoveCopyDialog'
import { TemplateDialog } from './components/TemplateDialog'
import type { TemplateInfo } from '../../preload/api'
import type { TreeChild } from '@shared/types'
import type { DocName } from '../../preload/api'
import type { SearchHit } from '../../preload/api'
import { isImageFile, clampZoom, type CanvasCommands, type ChangeOpts } from './components/Canvas'

interface PageState {
  relPath: string
  doc: PageDoc
  notices: RecoveryNotice[]
  missing: string[]
  draft?: PageDoc
  dirty: boolean
  version: number
}

type SaveStatus = 'saved' | 'unsaved' | 'saving'

const DRAFT_DELAY_MS = 1500
const IDLE_SAVE_MS = 20000

export function App(): JSX.Element {
  const [tree, setTree] = useState<NotebookTree | null>(null)
  const [groupRel, setGroupRel] = useState('')
  const [sectionRel, setSectionRel] = useState<string | null>(null)
  const [page, setPage] = useState<PageState | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [showBorder, setShowBorder] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [panel, setPanel] = useState<'history' | 'recycle' | 'verify' | 'export' | null>(null)
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null)
  const [selectionInfo, setSelectionInfo] = useState({ shapes: 0, total: 0 })
  /** App clipboard for page objects; files are copied between page folders on paste. */
  const objectClipboard = useRef<{ objects: CanvasObject[]; fromRel: string } | null>(null)
  const [canPaste, setCanPaste] = useState(false)
  const [copiedPage, setCopiedPage] = useState<PageRef | null>(null)
  const onSelectionInfo = useCallback((i: { shapes: number; total: number }) => setSelectionInfo((cur) => (cur.shapes === i.shapes && cur.total === i.total ? cur : i)), [])
  const [about, setAbout] = useState<DocName | 'about' | 'dependencies' | null>(null)
  const [templates, setTemplates] = useState<{ notebook: TemplateInfo[]; global: TemplateInfo[] }>({ notebook: [], global: [] })
  const [moveCopy, setMoveCopy] = useState<{ mode: 'page'; page: PageRef } | { mode: 'container'; node: TreeChild } | null>(null)
  const [templateFor, setTemplateFor] = useState<PageRef | null>(null)
  const [templateMode, setTemplateMode] = useState(false)
  const templateModeRef = useRef(false)
  templateModeRef.current = templateMode
  /** The tree for whichever notebook is showing: the real one or the Templates notebook. */
  const reloadTree = useCallback((): Promise<NotebookTree> => (templateModeRef.current ? window.pagebinder.notebook.openTemplates() : window.pagebinder.notebook.reload()), [])
  const [search, setSearch] = useState<{ terms: string[]; active: number } | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogSpec | null>(null)
  const [renamingRel, setRenamingRel] = useState<string | null>(null)

  const pageRef = useRef<PageState | null>(null)
  pageRef.current = page
  const draftTimer = useRef<number | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)
  const saving = useRef<Promise<void> | null>(null)
  const insertTableRef = useRef<() => boolean>(() => false)
  const canvasCommands = useRef<CanvasCommands>({ deleteSelected: () => {}, styleShapes: () => {}, insertTextBox: () => {}, insertTable: () => {}, selectIds: () => {} })
  const activeEditorRef = useRef<Editor | null>(null)
  // Undo history for everything outside a text box: object operations on a page
  // (a snapshot of that page) and notebook operations (create, delete, move, copy a page).
  type NotebookEntry = { kind: 'notebook'; label: string; pageRel: string; undo: (self: NotebookEntry) => Promise<void>; redo: (self: NotebookEntry) => Promise<void> }
  type HistoryEntry = { kind: 'objects'; pageRel: string; doc: PageDoc } | NotebookEntry
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const lastHistoryKey = useRef<string | null>(null)
  const pushHistory = (entry: HistoryEntry): void => {
    undoStack.current.push(entry)
    if (undoStack.current.length > 200) undoStack.current.shift()
    redoStack.current = []
    lastHistoryKey.current = null
  }
  /** A page's folder may be renamed on save; keep history pointing at it. */
  const remapHistory = (from: string, to: string): void => {
    if (from === to) return
    for (const stack of [undoStack.current, redoStack.current]) for (const e of stack) if (e.pageRel === from) e.pageRel = to
  }

  const fail = (err: unknown): void => setError(err instanceof Error ? err.message : String(err))

  const refreshTemplates = useCallback(async (): Promise<void> => {
    try {
      const list = await window.pagebinder.template.list()
      setTemplates({ notebook: list.notebook, global: list.global })
    } catch {
      setTemplates({ notebook: [], global: [] })
    }
  }, [])


  /* ---------- saving ---------- */

  const clearTimers = (): void => {
    window.clearTimeout(draftTimer.current)
    window.clearTimeout(saveTimer.current)
  }

  const savePage = useCallback(async (): Promise<void> => {
    if (saving.current) await saving.current
    const p = pageRef.current
    if (!p || !p.dirty) return
    clearTimers()
    setSaveStatus('saving')
    const run = (async () => {
      try {
        const result = await window.pagebinder.page.save(p.relPath, p.doc)
        remapHistory(p.relPath, result.relPath)
        setPage((cur) => {
          if (!cur || cur.relPath !== p.relPath) return cur
          const stillDirty = cur.version !== p.version
          return {
            ...cur,
            relPath: result.relPath,
            doc: stillDirty ? { ...cur.doc, id: result.doc.id, created: result.doc.created } : result.doc,
            draft: undefined,
            notices: cur.notices.filter((n) => n.kind !== 'draft-available'),
            dirty: stillDirty
          }
        })
        const stillDirty = pageRef.current?.version !== p.version
        setSaveStatus(stillDirty ? 'unsaved' : 'saved')
        setTree(await reloadTree())
      } catch (err) {
        setSaveStatus('unsaved')
        fail(err)
      }
    })()
    saving.current = run
    await run
    saving.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTree])

  const onPageChange = useCallback(
    (next: PageDoc, opts: ChangeOpts = { history: 'none' }) => {
      const cur = pageRef.current
      if (cur) {
        const key = opts.history === 'coalesce' ? (opts.key ?? null) : null
        if (opts.history === 'push' || (opts.history === 'coalesce' && key !== lastHistoryKey.current)) {
          undoStack.current.push({ kind: 'objects', pageRel: cur.relPath, doc: cur.doc })
          if (undoStack.current.length > 200) undoStack.current.shift()
          redoStack.current = []
        }
        lastHistoryKey.current = key
      }
      setPage((cur) => (cur ? { ...cur, doc: next, dirty: true, version: cur.version + 1 } : cur))
      setSaveStatus('unsaved')
      window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(() => {
        const p = pageRef.current
        if (p && p.dirty) window.pagebinder.page.saveDraft(p.relPath, p.doc).catch(fail)
      }, DRAFT_DELAY_MS)
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void savePage(), IDLE_SAVE_MS)
    },
    [savePage]
  )

  /** Apply a history snapshot, keeping the current text of containers that still exist. */
  const applySnapshot = useCallback((snapshot: PageDoc): void => {
    const cur = pageRef.current
    if (!cur) return
    const current = new Map(cur.doc.objects.map((o) => [o.id, o]))
    const objects = snapshot.objects.map((o) => {
      const now = current.get(o.id)
      return o.kind === 'text' && now && now.kind === 'text' ? { ...o, content: now.content } : o
    })
    lastHistoryKey.current = null
    setPage((p) => (p ? { ...p, doc: { ...snapshot, objects, manifest: cur.doc.manifest, id: cur.doc.id, created: cur.doc.created }, dirty: true, version: p.version + 1 } : p))
    setSaveStatus('unsaved')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void savePage(), 2000)
  }, [savePage])

  const inTextEditor = (): boolean => !!(document.activeElement as HTMLElement | null)?.closest('.tiptap')

  /** Inside a text box, the editor's own history is used while it has something to undo or redo. */
  const editorCan = (what: 'undo' | 'redo'): boolean => {
    const ed = activeEditorRef.current
    return !!ed && inTextEditor() && (what === 'undo' ? ed.can().undo() : ed.can().redo())
  }

  const historyBusy = useRef(false)
  const step = useCallback(
    async (direction: 'undo' | 'redo'): Promise<void> => {
      if (historyBusy.current) return
      const from = direction === 'undo' ? undoStack.current : redoStack.current
      const to = direction === 'undo' ? redoStack.current : undoStack.current
      const entry = from.pop()
      if (!entry) return
      historyBusy.current = true
      try {
        ;(document.activeElement as HTMLElement | null)?.blur()
        if (entry.kind === 'objects') {
          if (pageRef.current?.relPath !== entry.pageRel) {
            await savePage()
            await openPage(entry.pageRel)
          }
          const cur = pageRef.current
          if (!cur) return
          to.push({ kind: 'objects', pageRel: cur.relPath, doc: cur.doc })
          applySnapshot(entry.doc)
        } else {
          await savePage()
          if (direction === 'undo') await entry.undo(entry)
          else await entry.redo(entry)
          to.push(entry)
        }
      } catch (err) {
        fail(err)
      } finally {
        historyBusy.current = false
        lastHistoryKey.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applySnapshot, savePage]
  )

  const undo = useCallback((): void => {
    if (editorCan('undo')) {
      activeEditorRef.current!.commands.undo()
      return
    }
    void step('undo')
  }, [step])

  const redo = useCallback((): void => {
    if (editorCan('redo')) {
      activeEditorRef.current!.commands.redo()
      return
    }
    void step('redo')
  }, [step])

  useEffect(() => {
    if (!drawTool) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDrawTool(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawTool])

  // Cmd/Ctrl+Z: the editor handles it while it has history of its own; otherwise the page history does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (editorCan(e.shiftKey ? 'redo' : 'undo')) return
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [undo, redo])

  /* ---------- navigation ---------- */

  const openPage = useCallback(
    async (rel: string | null): Promise<void> => {
      await savePage()
      clearTimers()
      if (!rel) {
        setPage(null)
        setSaveStatus('saved')
        return
      }
      try {
        const loaded = await window.pagebinder.page.load(rel)
        lastHistoryKey.current = null
        setPage({ ...loaded, dirty: false, version: 0 })
        setSaveStatus('saved')
        if (loaded.notices.some((n) => n.kind === 'recovered-from-history' || n.kind === 'no-valid-version')) {
          setTree(await reloadTree())
        }
      } catch (err) {
        fail(err)
      }
    },
    [savePage, reloadTree]
  )

  const selectSection = useCallback(
    async (t: NotebookTree, rel: string | null): Promise<void> => {
      setSearch(null)
      setSectionRel(rel)
      const section = findSection(t, rel)
      await openPage(section?.pages[0]?.relPath ?? null)
    },
    [openPage]
  )

  const navigateGroup = useCallback(
    async (t: NotebookTree, rel: string): Promise<void> => {
      setGroupRel(rel)
      await selectSection(t, firstSection(childrenOf(t, rel))?.relPath ?? null)
    },
    [selectSection]
  )

  const loadNotebook = useCallback(
    async (t: NotebookTree): Promise<void> => {
      setTree(t)
      setError(null)
      undoStack.current = []
      redoStack.current = []
      if (t.regenerated.length) {
        setError(`Some notebook metadata was missing and has been rebuilt with defaults: ${t.regenerated.join(', ')}`)
      }
      await navigateGroup(t, '')
      await refreshTemplates()
    },
    [navigateGroup, refreshTemplates]
  )

  /* ---------- notebook actions ---------- */

  const createNotebook = useCallback(async (): Promise<void> => {
    const parent = await window.pagebinder.notebook.pickParent()
    if (!parent) return
    setDialog({
      kind: 'name',
      title: 'New notebook',
      label: 'Notebook name',
      submitLabel: 'Create',
      onSubmit: (name) => {
        void (async () => {
          try {
            await savePage()
            await loadNotebook(await window.pagebinder.notebook.create(parent, name))
          } catch (err) {
            fail(err)
          }
        })()
      }
    })
  }, [loadNotebook, savePage])

  const openNotebookFolder = useCallback(async (): Promise<void> => {
    const root = await window.pagebinder.notebook.pickFolder()
    if (!root) return
    try {
      await savePage()
      await loadNotebook(await window.pagebinder.notebook.open(root))
    } catch (err) {
      fail(err)
    }
  }, [loadNotebook, savePage])

  const openRecent = useCallback(
    async (root: string): Promise<void> => {
      try {
        await savePage()
        await loadNotebook(await window.pagebinder.notebook.open(root))
      } catch (err) {
        fail(err)
      }
    },
    [loadNotebook, savePage]
  )

  const openTemplatesNotebook = useCallback(async (): Promise<void> => {
    try {
      await savePage()
      clearTimers()
      setPage(null)
      setSearch(null)
      const t = await window.pagebinder.notebook.openTemplates()
      setTemplateMode(true)
      templateModeRef.current = true
      undoStack.current = []
      redoStack.current = []
      setError(null)
      setTree(t)
      setGroupRel('')
      await selectSection(t, t.children.find((c) => c.kind === 'section' && c.pages.length)?.relPath ?? t.children[0]?.relPath ?? null)
    } catch (err) {
      fail(err)
    }
  }, [savePage, selectSection])

  const switchNotebook = useCallback(async (): Promise<void> => {
    await savePage()
    setTemplateMode(false)
    templateModeRef.current = false
    await window.pagebinder.notebook.close()
    setTree(null)
    setPage(null)
    setSectionRel(null)
    setGroupRel('')
  }, [savePage])

  /* ---------- section and page actions ---------- */

  /** After a page is created, deleted, moved, or copied, show the right place. */
  const showPage = useCallback(
    async (t: NotebookTree, rel: string | null, sectionOf?: string): Promise<void> => {
      setTree(t)
      const sec = rel ? rel.slice(0, rel.lastIndexOf('/')) : (sectionOf ?? null)
      if (sec !== null) {
        setGroupRel(parentGroupRel(sec))
        setSectionRel(sec)
      }
      if (rel) await openPage(rel)
      else if (sec !== null) await selectSection(t, sec)
    },
    [openPage, selectSection]
  )

  /** Undoable creation: undo recycles the page, redo restores it. */
  const recordCreate = (relPath: string, label: string): void => {
    if (templateModeRef.current) return
    let recycled = ''
    pushHistory({
      kind: 'notebook',
      label,
      pageRel: relPath,
      undo: async (self) => {
        if (pageRef.current?.relPath === self.pageRel) {
          clearTimers()
          setPage(null)
        }
        const r = await window.pagebinder.page.delete(self.pageRel)
        recycled = r.name
        await showPage(r.tree, null, self.pageRel.slice(0, self.pageRel.lastIndexOf('/')))
      },
      redo: async (self) => {
        const r = await window.pagebinder.recycle.restore(recycled, self.pageRel.slice(0, self.pageRel.lastIndexOf('/')))
        self.pageRel = r.rel
        await showPage(r.tree, r.rel)
      }
    })
  }

  const addSection = (): void =>
    setDialog({
      kind: 'name',
      title: 'New section',
      label: 'Section name',
      submitLabel: 'Create',
      onSubmit: (name) => {
        void (async () => {
          try {
            const { rel, tree: t } = await window.pagebinder.section.create(groupRel, name)
            setTree(t)
            await selectSection(t, rel)
          } catch (err) {
            fail(err)
          }
        })()
      }
    })

  const addGroup = (): void =>
    setDialog({
      kind: 'name',
      title: 'New section group',
      label: 'Group name',
      submitLabel: 'Create',
      onSubmit: (name) => {
        void (async () => {
          try {
            const { rel, tree: t } = await window.pagebinder.section.createGroup(groupRel, name)
            setTree(t)
            await navigateGroup(t, rel)
          } catch (err) {
            fail(err)
          }
        })()
      }
    })

  const renameNode = (rel: string): void => {
    if (!tree) return
    const node = childrenOf(tree, groupRel).find((c) => c.relPath === rel)
    if (!node) return
    setDialog({
      kind: 'name',
      title: node.kind === 'section' ? 'Rename section' : 'Rename section group',
      label: 'Name',
      initial: node.name,
      submitLabel: 'Rename',
      onSubmit: (name) => {
        void (async () => {
          try {
            await savePage()
            const { rel: newRel, tree: t } = await window.pagebinder.section.rename(rel, name)
            setTree(t)
            if (node.kind === 'section' && sectionRel === rel) await selectSection(t, newRel)
            else if (node.kind === 'section' && sectionRel) {
              // The current page path may have changed if it lives under the renamed node.
              await selectSection(t, sectionRel)
            }
          } catch (err) {
            fail(err)
          }
        })()
      }
    })
  }

  const setColor = async (rel: string, color: string): Promise<void> => {
    try {
      setTree(await window.pagebinder.section.setColor(rel, color))
    } catch (err) {
      fail(err)
    }
  }

  const addPage = useCallback(async (): Promise<void> => {
    if (!sectionRel) return
    try {
      await savePage()
      const { relPath, tree: t } = await window.pagebinder.page.create(sectionRel, templateModeRef.current ? 'New template' : undefined)
      setTree(t)
      await openPage(relPath)
      setRenamingRel(relPath)
      recordCreate(relPath, 'new page')
    } catch (err) {
      fail(err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPage, savePage, sectionRel])

  const renamePage = async (rel: string, title: string): Promise<void> => {
    setRenamingRel(null)
    try {
      await savePage()
      const result = await window.pagebinder.page.rename(rel, title)
      remapHistory(rel, result.relPath)
      setTree(result.tree)
      if (pageRef.current?.relPath === rel) {
        setPage((cur) => (cur ? { ...cur, relPath: result.relPath, doc: result.doc, dirty: false, version: 0 } : cur))
        setSaveStatus('saved')
      }
    } catch (err) {
      fail(err)
    }
  }

  const deletePage = (target: PageRef): void =>
    setDialog({
      kind: 'confirm',
      title: templateMode ? 'Delete template' : 'Delete page',
      message: templateMode ? `Remove the template "${target.title}" from the library? Pages already made from it are not affected.` : `Move "${target.title || 'Untitled page'}" to the notebook's recycle folder?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        void (async () => {
          try {
            if (pageRef.current?.relPath === target.relPath) {
              clearTimers()
              setPage(null)
            }
            const section = target.relPath.slice(0, target.relPath.lastIndexOf('/'))
            const r = await window.pagebinder.page.delete(target.relPath)
            setTree(r.tree)
            if (pageRef.current === null) await selectSection(r.tree, sectionRel)
            let recycled = r.name
            if (!templateModeRef.current) pushHistory({
              kind: 'notebook',
              label: 'delete page',
              pageRel: target.relPath,
              undo: async (self) => {
                const back = await window.pagebinder.recycle.restore(recycled, section)
                self.pageRel = back.rel
                await showPage(back.tree, back.rel)
              },
              redo: async (self) => {
                if (pageRef.current?.relPath === self.pageRel) {
                  clearTimers()
                  setPage(null)
                }
                const again = await window.pagebinder.page.delete(self.pageRel)
                recycled = again.name
                await showPage(again.tree, null, section)
              }
            })
          } catch (err) {
            fail(err)
          }
        })()
      }
    })

  const restoreDraft = (): void => {
    setPage((cur) => (cur && cur.draft ? { ...cur, doc: cur.draft, draft: undefined, dirty: true, version: cur.version + 1, notices: cur.notices.filter((n) => n.kind !== 'draft-available') } : cur))
    window.setTimeout(() => void savePage(), 0)
  }
  const discardDraft = (): void => {
    const p = pageRef.current
    if (!p) return
    window.pagebinder.page.discardDraft(p.relPath).catch(fail)
    setPage((cur) => (cur ? { ...cur, draft: undefined, notices: cur.notices.filter((n) => n.kind !== 'draft-available') } : cur))
  }

  /* ---------- copy and paste ---------- */

  const copyObjects = useCallback((objects: CanvasObject[]): void => {
    const p = pageRef.current
    if (!p || !objects.length) return
    objectClipboard.current = { objects: JSON.parse(JSON.stringify(objects)) as CanvasObject[], fromRel: p.relPath }
    setCanPaste(true)
  }, [])

  const pasteObjects = useCallback(
    async (at?: { x: number; y: number }): Promise<void> => {
      const clip = objectClipboard.current
      const p = pageRef.current
      if (!clip || !p) return
      try {
        // Files that live in another page's folder are copied into this one first.
        const needed: { sub: 'images' | 'attachments'; name: string; originalName?: string }[] = []
        if (clip.fromRel !== p.relPath) {
          for (const o of clip.objects) {
            if (o.kind === 'image') needed.push({ sub: 'images', name: o.name, originalName: o.originalName })
            else if (o.kind === 'file') needed.push({ sub: 'attachments', name: o.name, originalName: o.originalName })
          }
        }
        const copied = needed.length ? await window.pagebinder.page.copyFilesBetween(clip.fromRel, p.relPath, needed) : []
        const rename = new Map(copied.map((c) => [`${c.sub}/${c.from}`, c.entry]))
        const minX = Math.min(...clip.objects.map((o) => o.x))
        const minY = Math.min(...clip.objects.map((o) => o.y))
        const dx = at ? at.x - minX : 24
        const dy = at ? at.y - minY : 24
        const ids: string[] = []
        const fresh: CanvasObject[] = clip.objects.map((o) => {
          const id = newId()
          ids.push(id)
          const moved = { ...o, id, x: o.x + dx, y: o.y + dy } as CanvasObject
          if (moved.kind === 'shape' && moved.a && moved.b) {
            moved.a = { x: moved.a.x + dx, y: moved.a.y + dy }
            moved.b = { x: moved.b.x + dx, y: moved.b.y + dy }
          }
          if (moved.kind === 'image') {
            const e = rename.get(`images/${moved.name}`)
            if (e) moved.name = e.name
          }
          if (moved.kind === 'file') {
            const e = rename.get(`attachments/${moved.name}`)
            if (e) moved.name = e.name
          }
          return moved
        })
        pushHistory({ kind: 'objects', pageRel: p.relPath, doc: p.doc })
        setPage((cur) => {
          if (!cur) return cur
          const manifest = {
            images: [...cur.doc.manifest.images, ...copied.filter((c) => c.sub === 'images').map((c) => c.entry)],
            attachments: [...cur.doc.manifest.attachments, ...copied.filter((c) => c.sub === 'attachments').map((c) => c.entry)]
          }
          return { ...cur, doc: { ...cur.doc, objects: [...cur.doc.objects, ...fresh], manifest }, dirty: true, version: cur.version + 1 }
        })
        setSaveStatus('unsaved')
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => void savePage(), 1000)
        canvasCommands.current.selectIds(ids)
      } catch (err) {
        fail(err)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savePage]
  )

  const pastePage = useCallback(async (): Promise<void> => {
    if (!copiedPage || !sectionRel) return
    try {
      await savePage()
      const { rel, tree: t } = await window.pagebinder.move.copyPage(copiedPage.relPath, sectionRel)
      setTree(t)
      await openPage(rel)
      recordCreate(rel, 'paste page')
    } catch (err) {
      fail(err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copiedPage, sectionRel, savePage, openPage])

  /** Full name from the OS account, then the date and time, inserted at the cursor in the current font. */
  const insertSignature = useCallback(async (editor: import('@tiptap/react').Editor): Promise<void> => {
    try {
      const name = await window.pagebinder.about.userName()
      const when = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      editor.chain().focus().insertContent(`${name} ${when}`).run()
    } catch (err) {
      fail(err)
    }
  }, [])

  /** Render a PDF attachment's pages as pictures stacked below its card, each sized to the printable width. */
  const insertPrintout = useCallback(
    async (obj: CanvasObject): Promise<void> => {
      const p = pageRef.current
      if (!p || obj.kind !== 'file') return
      try {
        setError(null)
        const data = await window.pagebinder.page.readAttachment(p.relPath, 'attachments', obj.name)
        const pages = await renderPdfPages(data)
        if (!pages.length) return
        const paper = paperPixels(p.doc.paper)
        const width = paper.width - paper.margins.left - paper.margins.right
        const entries: FileEntry[] = []
        for (let i = 0; i < pages.length; i++) {
          entries.push(await window.pagebinder.page.addImage(p.relPath, `${obj.originalName.replace(/\.pdf$/i, '')} page ${i + 1}.png`, pages[i]!.bytes))
        }
        pushHistory({ kind: 'objects', pageRel: p.relPath, doc: p.doc })
        let y = obj.y + 72
        const objects: CanvasObject[] = pages.map((pg, i) => {
          const height = Math.round((width * pg.height) / pg.width)
          const made: CanvasObject = {
            kind: 'image',
            id: newId(),
            x: paper.margins.left,
            y,
            width,
            height,
            name: entries[i]!.name,
            originalName: entries[i]!.originalName,
            printout: { source: obj.originalName, page: i + 1, text: pg.text }
          }
          y += height + 16
          return made
        })
        setPage((cur) => (cur ? { ...cur, doc: { ...cur.doc, objects: [...cur.doc.objects, ...objects], manifest: { ...cur.doc.manifest, images: [...cur.doc.manifest.images, ...entries] } }, dirty: true, version: cur.version + 1 } : cur))
        setSaveStatus('unsaved')
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => void savePage(), 1000)
      } catch (err) {
        fail(err)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savePage]
  )

  /* ---------- templates, move and copy ---------- */

  const addPageFromTemplate = async (ref: string): Promise<void> => {
    if (!sectionRel) return
    try {
      await savePage()
      const { relPath, tree: t } = await window.pagebinder.template.createPage(sectionRel, ref)
      setTree(t)
      await openPage(relPath)
      setRenamingRel(relPath)
      recordCreate(relPath, 'new page from template')
    } catch (err) {
      fail(err)
    }
  }

  const saveTemplate = async (page: PageRef, scope: 'notebook' | 'global', name: string, description: string): Promise<void> => {
    try {
      await savePage()
      await window.pagebinder.template.save(page.relPath, scope, name, description)
      await refreshTemplates()
    } catch (err) {
      fail(err)
      throw err
    }
  }

  const movePageTo = async (pageRel: string, targetSectionRel: string, copy: boolean): Promise<void> => {
    try {
      await savePage()
      if (pageRef.current?.relPath === pageRel && !copy) {
        clearTimers()
        setPage(null)
      }
      const fromSection = pageRel.slice(0, pageRel.lastIndexOf('/'))
      const { rel, tree: t } = copy ? await window.pagebinder.move.copyPage(pageRel, targetSectionRel) : await window.pagebinder.move.page(pageRel, targetSectionRel)
      setTree(t)
      setGroupRel(parentGroupRel(targetSectionRel))
      setSectionRel(targetSectionRel)
      await openPage(rel)
      if (copy) recordCreate(rel, 'copy page')
      else if (!templateModeRef.current) {
        pushHistory({
          kind: 'notebook',
          label: 'move page',
          pageRel: rel,
          undo: async (self) => {
            if (pageRef.current?.relPath === self.pageRel) {
              clearTimers()
              setPage(null)
            }
            const back = await window.pagebinder.move.page(self.pageRel, fromSection)
            self.pageRel = back.rel
            await showPage(back.tree, back.rel)
          },
          redo: async (self) => {
            if (pageRef.current?.relPath === self.pageRel) {
              clearTimers()
              setPage(null)
            }
            const again = await window.pagebinder.move.page(self.pageRel, targetSectionRel)
            self.pageRel = again.rel
            await showPage(again.tree, again.rel)
          }
        })
      }
    } catch (err) {
      fail(err)
    }
  }

  const moveContainerTo = async (node: TreeChild, targetContainerRel: string, copy: boolean): Promise<void> => {
    try {
      await savePage()
      clearTimers()
      setPage(null)
      const { rel, tree: t } = copy ? await window.pagebinder.move.copyContainer(node.relPath, targetContainerRel) : await window.pagebinder.move.container(node.relPath, targetContainerRel)
      setTree(t)
      if (node.kind === 'section') {
        setGroupRel(targetContainerRel)
        await selectSection(t, rel)
      } else await navigateGroup(t, rel)
    } catch (err) {
      fail(err)
    }
  }

  const deleteContainer = (node: TreeChild): void =>
    setDialog({
      kind: 'confirm',
      title: node.kind === 'section' ? 'Delete section' : 'Delete section group',
      message: `Move "${node.name}" and everything in it to the notebook's recycle folder? It can be restored from File > Recycled Pages.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        void (async () => {
          try {
            await savePage()
            clearTimers()
            setPage(null)
            const t = await window.pagebinder.move.deleteContainer(node.relPath)
            setTree(t)
            await navigateGroup(t, groupRel && findNodeRel(t, groupRel) ? groupRel : '')
          } catch (err) {
            fail(err)
          }
        })()
      }
    })

  const findNodeRel = (t: NotebookTree, rel: string): boolean => childrenOf(t, parentGroupRel(rel)).some((c) => c.relPath === rel)

  /* ---------- history, recycle, verify ---------- */

  const openHistory = useCallback(async (): Promise<void> => {
    if (!pageRef.current) return
    await savePage()
    setPanel('history')
  }, [savePage])

  const restoreVersion = async (name: string): Promise<void> => {
    const p = pageRef.current
    if (!p) return
    try {
      const result = await window.pagebinder.page.restoreSnapshot(p.relPath, name)
      setTree(result.tree)
      setPanel(null)
      undoStack.current = []
      redoStack.current = []
      await openPage(result.relPath)
    } catch (err) {
      fail(err)
    }
  }

  const copyVersion = async (name: string): Promise<void> => {
    const p = pageRef.current
    if (!p) return
    try {
      const result = await window.pagebinder.page.copySnapshot(p.relPath, name)
      setTree(result.tree)
      setPanel(null)
      await openPage(result.relPath)
    } catch (err) {
      fail(err)
    }
  }

  const restoreRecycled = async (name: string): Promise<void> => {
    const t = tree
    if (!t) return
    const fallback = sectionRel ?? firstSection(childrenOf(t, groupRel))?.relPath ?? firstSection(t.children)?.relPath
    if (!fallback) {
      setError('Create a section first, then restore the page into it.')
      return
    }
    try {
      const { rel, tree: next } = await window.pagebinder.recycle.restore(name, fallback)
      setTree(next)
      const sec = rel.slice(0, rel.lastIndexOf('/'))
      setGroupRel(parentGroupRel(sec))
      setSectionRel(sec)
      await openPage(rel)
    } catch (err) {
      fail(err)
    }
  }

  /* ---------- search ---------- */

  const openSearchHit = useCallback(
    async (hit: SearchHit, query: string): Promise<void> => {
      const t = tree
      if (!t) return
      const terms = query.split(/\s+/).map((x) => x.trim()).filter(Boolean)
      if (hit.kind === 'group') {
        await navigateGroup(t, hit.rel)
        setSearch(null)
        return
      }
      if (hit.kind === 'section') {
        setGroupRel(parentGroupRel(hit.rel))
        await selectSection(t, hit.rel)
        setSearch(null)
        return
      }
      setGroupRel(parentGroupRel(hit.sectionRel))
      setSectionRel(hit.sectionRel)
      await openPage(hit.rel)
      setSearch({ terms, active: 0 })
    },
    [tree, navigateGroup, selectSection, openPage]
  )
  const onSearchMatches = useCallback((n: number) => setMatchCount(n), [])

  /** Row height or column width for the current cell or the highlighted cells, in pixels. */
  const sizeDialog = (what: 'row' | 'column', current: number | null, editor?: Editor | null): void => {
    const ed = editor ?? activeEditorRef.current
    if (!ed) return
    setDialog({
      kind: 'name',
      title: what === 'row' ? 'Row height' : 'Column width',
      label: what === 'row' ? 'Height in pixels, 10 or more (leave empty for the 25 px default)' : 'Width in pixels (leave empty for automatic)',
      initial: current ? String(current) : '',
      submitLabel: 'Apply',
      allowEmpty: true,
      onSubmit: (value) => {
        const n = value.trim() ? Math.max(what === 'row' ? 10 : 24, Math.round(Number(value))) : null
        if (value.trim() && !Number.isFinite(n)) return
        if (what === 'row') ed.chain().focus().setRowHeight(n).run()
        else ed.chain().focus().setColumnWidth(n).run()
      }
    })
  }
  const stepMatch = (delta: number): void => setSearch((s) => (s && matchCount ? { ...s, active: (s.active + delta + matchCount) % matchCount } : s))

  /* ---------- images, page setup, printing ---------- */

  function newId(): string {
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  const placeImages = useCallback(
    (entries: FileEntry[], at?: { x: number; y: number }, display: 'inline' | 'card' = 'inline') => {
      if (!entries.length) return
      if (pageRef.current) pushHistory({ kind: 'objects', pageRel: pageRef.current.relPath, doc: pageRef.current.doc })
      setPage((cur) => {
        if (!cur) return cur
        const bottom = cur.doc.objects.reduce((acc, o) => Math.max(acc, o.y + (o.kind === 'image' ? o.height : 120)), 0)
        const x = at?.x ?? 96
        const y = at?.y ?? bottom + 16
        const objects = [
          ...cur.doc.objects,
          ...entries.map((e, i) => ({
            kind: 'image' as const,
            id: newId(),
            x: x + i * 24,
            y: y + i * (display === 'card' ? 56 : 24),
            width: display === 'card' ? 260 : 0,
            height: 0,
            name: e.name,
            originalName: e.originalName,
            ...(display === 'card' ? { display: 'card' as const } : {})
          }))
        ]
        return { ...cur, doc: { ...cur.doc, objects }, dirty: true, version: cur.version + 1 }
      })
      setSaveStatus('unsaved')
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void savePage(), 500)
    },
    [savePage]
  )

  const addImageFiles = useCallback(
    async (files: File[]): Promise<FileEntry[]> => {
      const p = pageRef.current
      if (!p) return []
      const entries: FileEntry[] = []
      for (const file of files) {
        try {
          entries.push(await window.pagebinder.page.addImage(p.relPath, file.name || 'pasted-image.png', await file.arrayBuffer()))
        } catch (err) {
          fail(err)
        }
      }
      // The manifest is the record of every file in the folder; objects reference it by name.
      setPage((cur) => (cur ? { ...cur, doc: { ...cur.doc, manifest: { ...cur.doc.manifest, images: [...cur.doc.manifest.images, ...entries] } }, dirty: true, version: cur.version + 1 } : cur))
      return entries
    },
    []
  )

  const insertImage = useCallback(
    async (display: 'inline' | 'card' = 'inline', at?: { x: number; y: number }): Promise<void> => {
      const p = pageRef.current
      if (!p) return
      try {
        placeImages(await window.pagebinder.page.pickImages(p.relPath), at, display)
      } catch (err) {
        fail(err)
      }
    },
    [placeImages]
  )

  const placeFiles = useCallback(
    (results: { entry: FileEntry; mail?: MailMeta }[], at?: { x: number; y: number }) => {
      if (!results.length) return
      if (pageRef.current) pushHistory({ kind: 'objects', pageRel: pageRef.current.relPath, doc: pageRef.current.doc })
      setPage((cur) => {
        if (!cur) return cur
        const bottom = cur.doc.objects.reduce((acc, o) => Math.max(acc, o.y + (o.kind === 'image' ? o.height : 120)), 0)
        const objects = [
          ...cur.doc.objects,
          ...results.map(({ entry, mail }, i) => ({ kind: 'file' as const, id: newId(), x: at?.x ?? 96, y: (at?.y ?? bottom + 16) + i * 92, width: 300, name: entry.name, originalName: entry.originalName, ...(mail ? { mail } : {}) }))
        ]
        return { ...cur, doc: { ...cur.doc, objects }, dirty: true, version: cur.version + 1 }
      })
      setSaveStatus('unsaved')
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void savePage(), 500)
    },
    [savePage]
  )

  const recordAttachments = (results: { entry: FileEntry; mail?: MailMeta }[]): void => {
    setPage((cur) =>
      cur ? { ...cur, doc: { ...cur.doc, manifest: { ...cur.doc.manifest, attachments: [...cur.doc.manifest.attachments, ...results.map((r) => r.entry)] } }, dirty: true, version: cur.version + 1 } : cur
    )
  }

  const addFilePaths = useCallback(async (paths: string[]): Promise<{ entry: FileEntry; mail?: MailMeta }[]> => {
    const p = pageRef.current
    if (!p || !paths.length) return []
    try {
      const results = await window.pagebinder.page.addFiles(p.relPath, paths)
      recordAttachments(results)
      return results
    } catch (err) {
      fail(err)
      return []
    }
  }, [])

  const addImagePaths = useCallback(async (paths: string[]): Promise<FileEntry[]> => {
    const p = pageRef.current
    if (!p || !paths.length) return []
    try {
      const entries = await window.pagebinder.page.addImagePaths(p.relPath, paths)
      setPage((cur) => (cur ? { ...cur, doc: { ...cur.doc, manifest: { ...cur.doc.manifest, images: [...cur.doc.manifest.images, ...entries] } }, dirty: true, version: cur.version + 1 } : cur))
      return entries
    } catch (err) {
      fail(err)
      return []
    }
  }, [])

  const insertFile = useCallback(
    async (at?: { x: number; y: number }): Promise<void> => {
      const p = pageRef.current
      if (!p) return
      try {
        const results = await window.pagebinder.page.pickFiles(p.relPath)
        recordAttachments(results)
        placeFiles(results, at)
      } catch (err) {
        fail(err)
      }
    },
    [placeFiles]
  )


  const applyPageSetup = (paper: PaperSettings, print: PrintSettings): void => {
    const p = pageRef.current
    if (!p) return
    onPageChange({ ...p.doc, paper, print }, { history: 'push' })
  }

  const setNotebookDefaultPaper = async (paper: PaperSettings): Promise<void> => {
    try {
      setTree(await window.pagebinder.notebook.setPaper(paper))
    } catch (err) {
      fail(err)
    }
  }

  const openPreview = useCallback(async (): Promise<void> => {
    const p = pageRef.current
    if (!p) return
    await savePage()
    const rel = pageRef.current?.relPath ?? p.relPath
    setPreviewUrl(window.pagebinder.fileUrl(`${rel}/page.html`))
  }, [savePage])

  const printPage = useCallback(async (): Promise<void> => {
    const p = pageRef.current
    if (!p) return
    try {
      await savePage()
      const cur = pageRef.current ?? p
      await window.pagebinder.print.print(cur.relPath, cur.doc.paper)
    } catch (err) {
      fail(err)
    }
  }, [savePage])

  const exportPdf = useCallback(async (): Promise<void> => {
    const p = pageRef.current
    if (!p) return
    try {
      await savePage()
      const cur = pageRef.current ?? p
      const out = await window.pagebinder.print.pdf(cur.relPath, cur.doc.paper, cur.doc.title)
      if (out) setError(`PDF saved to ${out}`)
    } catch (err) {
      fail(err)
    }
  }, [savePage])

  // Pasted images anywhere in the window go into the page as picture objects.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (!pageRef.current || !e.clipboardData) return
      const files = Array.from(e.clipboardData.files)
      if (!files.length) return
      e.preventDefault()
      e.stopPropagation()
      const withPath = files.map((f) => ({ file: f, path: window.pagebinder.file.pathFor(f) }))
      const imagePaths = withPath.filter((f) => f.path && isImageFile(f.file)).map((f) => f.path)
      const otherPaths = withPath.filter((f) => f.path && !isImageFile(f.file)).map((f) => f.path)
      const memoryImages = withPath.filter((f) => !f.path && isImageFile(f.file)).map((f) => f.file)
      void (async () => {
        if (imagePaths.length) placeImages(await addImagePaths(imagePaths))
        if (memoryImages.length) placeImages(await addImageFiles(memoryImages))
        if (otherPaths.length) placeFiles(await addFilePaths(otherPaths))
      })()
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [addImageFiles, addImagePaths, addFilePaths, placeImages, placeFiles])

  // The background folder check may find changes made outside the app; refresh the tree when it does.
  useEffect(() => {
    return window.pagebinder.notebook.onTreeChanged(() => {
      if (!templateModeRef.current && tree) void window.pagebinder.notebook.reload().then(setTree).catch(() => undefined)
    })
  }, [tree])

  /* ---------- startup ---------- */

  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void window.pagebinder.notebook.startupRoot().then((root) => {
      if (root) void openRecent(root)
    })
  }, [openRecent])

  /* ---------- menu and window events ---------- */

  useEffect(() => {
    const offs = [
      window.pagebinder.onMenu('menu:newNotebook', () => void createNotebook()),
      window.pagebinder.onMenu('menu:openNotebook', () => void openNotebookFolder()),
      window.pagebinder.onMenu('menu:newPage', () => void addPage()),
      window.pagebinder.onMenu('menu:save', () => void savePage()),
      window.pagebinder.onMenu('menu:togglePageBorder', () => setShowBorder((v) => !v)),
      window.pagebinder.onMenu('menu:toggleGrid', () => setShowGrid((v) => !v)),
      window.pagebinder.onMenu('menu:insertImage', () => void insertImage()),
      window.pagebinder.onMenu('menu:insertFile', () => void insertFile()),
      window.pagebinder.onMenu('menu:deleteObject', () => canvasCommands.current.deleteSelected()),
      window.pagebinder.onMenu('menu:undo', () => undo()),
      window.pagebinder.onMenu('menu:redo', () => redo()),
      window.pagebinder.onMenu('menu:zoomIn', () => setZoom((z) => clampZoom(z + 0.1))),
      window.pagebinder.onMenu('menu:zoomOut', () => setZoom((z) => clampZoom(z - 0.1))),
      window.pagebinder.onMenu('menu:zoomReset', () => setZoom(1)),
      window.pagebinder.onMenu('menu:history', () => void openHistory()),
      window.pagebinder.onMenu('menu:export', () => void savePage().then(() => setPanel('export'))),
      window.pagebinder.onMenu('menu:about', () => setAbout('about')),
      ...(['getting-started', 'readme', 'shortcuts', 'history-verify', 'recovery', 'description', 'dependencies', 'uninstall'] as const).map((d) => window.pagebinder.onMenu(`menu:doc:${d}`, () => setAbout(d))),
      window.pagebinder.onMenu('menu:recycle', () => setPanel('recycle')),
      window.pagebinder.onMenu('menu:verify', () => setPanel('verify')),
      window.pagebinder.onMenu('menu:insertTable', () => {
        if (!insertTableRef.current()) canvasCommands.current.insertTable()
      }),
      window.pagebinder.onMenu('menu:insertTextBox', () => canvasCommands.current.insertTextBox()),
      window.pagebinder.onMenu('menu:pageSetup', () => setPageSetupOpen(true)),
      window.pagebinder.onMenu('menu:printPreview', () => void openPreview()),
      window.pagebinder.onMenu('menu:print', () => void printPage()),
      window.pagebinder.onMenu('menu:exportPdf', () => void exportPdf())
    ]
    const onBlur = (): void => void savePage()
    const onUnload = (): void => {
      const p = pageRef.current
      if (p && p.dirty) void window.pagebinder.page.saveDraft(p.relPath, p.doc)
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [addPage, createNotebook, openNotebookFolder, savePage, insertImage, insertFile, openPreview, printPage, exportPdf, undo, redo, openHistory])

  /* ---------- render ---------- */

  if (!tree) {
    return (
      <>
        <Welcome onCreate={() => void createNotebook()} onOpen={() => void openNotebookFolder()} onOpenRecent={(r) => void openRecent(r)} onOpenTemplates={() => void openTemplatesNotebook()} onGettingStarted={() => setAbout('getting-started')} />
        {error && (
          <div className="error-bar">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {dialog && <Dialog spec={dialog} onClose={() => setDialog(null)} />}
        {about && <AboutDialog initial={about} onClose={() => setAbout(null)} />}
      </>
    )
  }

  const children = childrenOf(tree, groupRel)
  const section = findSection(tree, sectionRel)
  const exportScopes: ExportScope[] = [
    ...(page ? [{ label: `This page: ${page.doc.title || 'Untitled page'}`, rel: page.relPath }] : []),
    ...(section ? [{ label: `Section: ${section.name}`, rel: section.relPath }] : []),
    ...(groupRel ? [{ label: `Group: ${groupPath(tree, groupRel).slice(-1)[0]?.name ?? groupRel}`, rel: groupRel }] : []),
    { label: `Notebook: ${tree.meta.name}`, rel: '' }
  ]
  const counts = {
    sections: children.filter((c) => c.kind === 'section').length,
    pages: children.reduce((n, c) => n + (c.kind === 'section' ? c.pages.length : 0), 0)
  }

  return (
    <ActiveEditorProvider>
      <div className="app">
        <Toolbar
          notebookName={tree.meta.name}
          saveStatus={saveStatus}
          hasPage={!!page}
          templateMode={templateMode}
          onSwitchNotebook={() => void switchNotebook()}
          onUndo={undo}
          onRedo={redo}
          zoom={zoom}
          onZoom={(z) => setZoom(clampZoom(z))}
          drawTool={drawTool}
          onDrawTool={setDrawTool}
          hasShapeSelection={selectionInfo.shapes > 0}
          onShapeStyle={(style) => canvasCommands.current.styleShapes(style)}
        />
        <EditorBridge insertTable={insertTableRef} editorRef={activeEditorRef} />
        <Breadcrumb
          notebookName={tree.meta.name}
          path={groupPath(tree, groupRel)}
          counts={counts}
          right={
            templateMode ? (
              <span className="muted small template-hint" title="Edit a template here to change every page made from it later. Drag a template to another tab to change which library holds it.">
                Templates notebook · edits apply to pages made later · drag between tabs to move
              </span>
            ) : (
              <SearchBox sectionRel={sectionRel} sectionName={section?.name} onOpen={(hit, q) => void openSearchHit(hit, q)} />
            )
          }
          onNavigate={(rel) => void navigateGroup(tree, rel)}
        />
        <SectionTabs
          children={children}
          activeSectionRel={sectionRel}
          onSelectSection={(rel) => void selectSection(tree, rel)}
          onOpenGroup={(rel) => void navigateGroup(tree, rel)}
          onAddSection={addSection}
          onAddGroup={addGroup}
          onRename={renameNode}
          onSetColor={(rel, c) => void setColor(rel, c)}
          templates={templates}
          onSetDefaultTemplate={(rel, ref) => void window.pagebinder.template.setSectionDefault(rel, ref).then(setTree).catch(fail)}
          onMoveCopy={(node) => setMoveCopy({ mode: 'container', node })}
          onDelete={deleteContainer}
          onDropPage={(pageRel, secRel, copy) => void movePageTo(pageRel, secRel, templateMode ? false : copy)}
          templateMode={templateMode}
        />
        {error && (
          <div className="error-bar">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {page?.notices.map((n, i) => (
          <div key={i} className={`notice ${n.kind}`}>
            <span>{n.message}</span>
            {n.kind === 'draft-available' ? (
              <span className="notice-actions">
                <button type="button" className="primary" onClick={restoreDraft}>
                  Restore
                </button>
                <button type="button" onClick={discardDraft}>
                  Discard
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setPage((cur) => (cur ? { ...cur, notices: cur.notices.filter((x) => x !== n) } : cur))}>
                Dismiss
              </button>
            )}
          </div>
        ))}
        {search && page && (
          <div className="notice search-bar">
            <span>
              {matchCount ? `${search.active + 1} of ${matchCount} ${matchCount === 1 ? 'match' : 'matches'}` : 'No matches on this page'} for “{search.terms.join(' ')}”
            </span>
            <span className="notice-actions">
              <button type="button" disabled={!matchCount} onClick={() => stepMatch(-1)} title="Previous match">
                ↑
              </button>
              <button type="button" disabled={!matchCount} onClick={() => stepMatch(1)} title="Next match">
                ↓
              </button>
              <button type="button" onClick={() => setSearch(null)}>
                Done
              </button>
            </span>
          </div>
        )}
        <div className="body">
          {page ? (
            <Canvas
              doc={page.doc}
              pageRel={page.relPath}
              missing={page.missing}
              showBorder={showBorder}
              showGrid={showGrid}
              zoom={zoom}
              onZoom={setZoom}
              search={search}
              onSearchMatches={onSearchMatches}
              commands={canvasCommands}
              onSizeDialog={sizeDialog}
              drawTool={drawTool}
              onDrawTool={setDrawTool}
              onSelectionInfo={onSelectionInfo}
              onInsertPicture={(display, at) => void insertImage(display, at)}
              onInsertFile={(at) => void insertFile(at)}
              onCopyObjects={copyObjects}
              onPasteObjects={(at) => void pasteObjects(at)}
              canPaste={canPaste}
              onSignature={(ed) => void insertSignature(ed)}
              onPrintout={(o) => void insertPrintout(o)}
              onChange={onPageChange}
              onAddImages={addImageFiles}
              onAddImagePaths={addImagePaths}
              onAddFiles={addFilePaths}
            />
          ) : (
            <div className="empty-canvas">
              {section ? (
                <button type="button" className="primary" onClick={() => void addPage()}>
                  Add a page to {section.name}
                </button>
              ) : groupRel ? (
                <p className="muted">This group has no sections yet.</p>
              ) : (
                <p className="muted">Add a section with the + button above.</p>
              )}
            </div>
          )}
          <PageList
            section={section}
            activeRel={page?.relPath ?? null}
            renamingRel={renamingRel}
            onOpen={(rel) => void openPage(rel)}
            onAdd={() => void addPage()}
            onDelete={deletePage}
            onStartRename={setRenamingRel}
            onRename={(rel, title) => void renamePage(rel, title)}
            onCancelRename={() => setRenamingRel(null)}
            onHistory={(rel) => {
              void (async () => {
                await openPage(rel)
                await openHistory()
              })()
            }}
            templates={templates}
            templateMode={templateMode}
            onAddFromTemplate={(ref) => void addPageFromTemplate(ref)}
            onSaveAsTemplate={(p) => setTemplateFor(p)}
            onMoveCopy={(p) => setMoveCopy({ mode: 'page', page: p })}
            onCopyPage={(p) => setCopiedPage(p)}
            onPastePage={() => void pastePage()}
            copiedPageTitle={copiedPage?.title ?? null}
          />
        </div>
        {dialog && <Dialog spec={dialog} onClose={() => setDialog(null)} />}
        {pageSetupOpen && page && (
          <PageSetupDialog
            paper={page.doc.paper}
            print={page.doc.print}
            onApply={applyPageSetup}
            onSetDefault={(paper) => void setNotebookDefaultPaper(paper)}
            onClose={() => setPageSetupOpen(false)}
          />
        )}
        {panel === 'history' && page && (
          <HistoryPanel pageRel={page.relPath} pageTitle={page.doc.title} onRestore={(n) => void restoreVersion(n)} onCopy={(n) => void copyVersion(n)} onClose={() => setPanel(null)} />
        )}
        {panel === 'recycle' && <RecyclePanel onRestore={restoreRecycled} onClose={() => setPanel(null)} />}
        {about && <AboutDialog initial={about} onClose={() => setAbout(null)} />}
        {moveCopy && (
          <MoveCopyDialog
            tree={tree}
            mode={moveCopy.mode}
            subject={moveCopy.mode === 'page' ? moveCopy.page.title || 'Untitled page' : moveCopy.node.name}
            currentRel={moveCopy.mode === 'page' ? moveCopy.page.relPath.slice(0, moveCopy.page.relPath.lastIndexOf('/')) : parentGroupRel(moveCopy.node.relPath)}
            excludeRel={moveCopy.mode === 'container' ? moveCopy.node.relPath : undefined}
            onMove={(target) => (moveCopy.mode === 'page' ? movePageTo(moveCopy.page.relPath, target, false) : moveContainerTo(moveCopy.node, target, false))}
            onCopy={(target) => (moveCopy.mode === 'page' ? movePageTo(moveCopy.page.relPath, target, templateMode ? false : true) : moveContainerTo(moveCopy.node, target, true))}
            onClose={() => setMoveCopy(null)}
          />
        )}
        {templateFor && <TemplateDialog initialName={templateFor.title || 'Untitled page'} onSave={(scope, name, desc) => saveTemplate(templateFor, scope, name, desc)} onClose={() => setTemplateFor(null)} />}
        {panel === 'export' && (
          <ExportDialog
            scopes={exportScopes}
            onExport={(scopeRel, format) => {
              const label = exportScopes.find((s) => s.rel === scopeRel)?.label ?? tree.meta.name
              return window.pagebinder.print.exportPages(scopeRel, format, label.replace(/^(This page|Section|Group|Notebook): /, '')).catch((err: unknown) => {
                fail(err)
                return null
              })
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'verify' && <VerifyPanel onClose={() => setPanel(null)} onRebuildIndex={() => void window.pagebinder.search.rebuild()} />}
        {previewUrl && page && (
          <PrintPreview
            url={previewUrl}
            title={page.doc.title}
            onPrint={() => void printPage()}
            onPdf={() => void exportPdf()}
            onPageSetup={() => {
              setPreviewUrl(null)
              setPageSetupOpen(true)
            }}
            onClose={() => setPreviewUrl(null)}
          />
        )}
      </div>
    </ActiveEditorProvider>
  )
}

/** Exposes the active editor to handlers that live outside the provider. */
function EditorBridge({ insertTable, editorRef }: { insertTable: React.MutableRefObject<() => boolean>; editorRef: React.MutableRefObject<Editor | null> }): null {
  const { editor } = useActiveEditor()
  editorRef.current = editor
  insertTable.current = () => !!editor && editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()
  return null
}

export { parentGroupRel }
