import type { JSX } from 'react'
import React, { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type DragEvent } from 'react'
import type { PageDoc, EditorJSON, CanvasObject, FileEntry, MailMeta, DrawTool, ShapeObject as ShapeModel } from '@shared/types'
import { ShapeObject } from './ShapeObject'
import { lineBox, snapLineEnd } from '@shared/render/shapeSvg'
import type { BorderTarget, BorderWeight } from '@shared/render/tableBorders'
import { TextContainer } from './TextContainer'
import { ImageObject } from './ImageObject'
import { FileCard } from './FileCard'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { paperPixels } from '../paper'
import { snapPosition } from '../snap'
import { findRanges, applyHighlights, clearHighlights, scrollToRange } from '../highlight'
import type { Editor } from '@tiptap/react'
import { currentSizes } from '@shared/render/tableSizing'

function newId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/')
}

export interface CanvasCommands {
  deleteSelected: () => void
  /** Select these objects (after a paste). */
  selectIds: (ids: string[]) => void
  /** Apply a line or fill colour to every selected shape. */
  styleShapes: (style: { stroke?: string; fill?: string | null }) => void
  /** Insert a text box or table at a default spot (from the app menu). */
  insertTextBox: (at?: { x: number; y: number }) => void
  insertTable: (at?: { x: number; y: number }) => void
}



/** How a change should enter the page-level undo history. */
export interface ChangeOpts {
  history: 'push' | 'coalesce' | 'none'
  /** For coalesce: consecutive changes with the same key share one undo step. */
  key?: string
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
}

export function Canvas({
  doc,
  pageRel,
  missing,
  showBorder,
  showGrid,
  zoom,
  onZoom,
  search,
  onSearchMatches,
  commands,
  onSizeDialog,
  drawTool,
  onDrawTool,
  onSelectionInfo,
  onInsertPicture,
  onInsertFile,
  onCopyObjects,
  onPasteObjects,
  canPaste,
  onSignature,
  onPrintout,
  onChange,
  onAddImages,
  onAddImagePaths,
  onAddFiles
}: {
  doc: PageDoc
  pageRel: string
  missing: string[]
  showBorder: boolean
  showGrid: boolean
  zoom: number
  onZoom: (next: number) => void
  /** Terms to highlight on the page and which match is current, or null for none. */
  search: { terms: string[]; active: number } | null
  onSearchMatches: (count: number) => void
  commands: React.MutableRefObject<CanvasCommands>
  /** Ask the user for a row height or column width; the app shows the dialog and applies it. */
  onSizeDialog: (what: 'row' | 'column', current: number | null, editor?: Editor | null) => void
  drawTool: DrawTool | null
  onDrawTool: (tool: DrawTool | null) => void
  onSelectionInfo: (info: { shapes: number; total: number }) => void
  /** Open the picture or file dialogs and place the result at a point. */
  onInsertPicture: (display: 'inline' | 'card', at: { x: number; y: number }) => void
  onInsertFile: (at: { x: number; y: number }) => void
  /** Copy the given objects to the app clipboard; paste them at a point. */
  onCopyObjects: (objects: CanvasObject[]) => void
  onPasteObjects: (at?: { x: number; y: number }) => void
  canPaste: boolean
  /** Insert the user's signature into the given editor. */
  onSignature: (editor: Editor) => void
  /** Render a PDF attachment as pictures below the card. */
  onPrintout: (obj: CanvasObject) => void
  onChange: (next: PageDoc, opts?: ChangeOpts) => void
  /** In-memory image files (paste, or drops without a path). */
  onAddImages: (files: File[]) => Promise<FileEntry[]>
  /** Image files on disk, copied by path. */
  onAddImagePaths: (paths: string[]) => Promise<FileEntry[]>
  /** Any other files on disk, copied into attachments. */
  onAddFiles: (paths: string[]) => Promise<{ entry: FileEntry; mail?: MailMeta }[]>
}): JSX.Element {
  const paper = useMemo(() => paperPixels(doc.paper), [doc.paper])
  const canvasRef = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<{ id: string; at: 'start' | 'end' } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeRef = useRef<{ x0: number; y0: number; moved: boolean; box: { x0: number; y0: number; x1: number; y1: number } | null } | null>(null)
  const suppressClickRef = useRef(false)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [objectMenu, setObjectMenu] = useState<{ id: string; x: number; y: number; tableEditor?: Editor | null; textEditor?: Editor | null } | null>(null)

  // A new text box takes focus once; the id is cleared so undo or redo cannot re-focus it.
  useEffect(() => {
    if (!focusId) return
    const t = window.setTimeout(() => setFocusId(null), 300)
    return () => window.clearTimeout(t)
  }, [focusId])
  const onMeasure = useCallback((id: string, height: number) => {
    setHeights((h) => (h[id] === height ? h : { ...h, [id]: height }))
  }, [])

  const docRef = useRef(doc)
  docRef.current = doc
  const heightsRef = useRef(heights)
  heightsRef.current = heights
  const paperRef = useRef(paper)
  paperRef.current = paper
  const gridRef = useRef(showGrid)
  gridRef.current = showGrid
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds
  useEffect(() => {
    const shapes = doc.objects.filter((o) => selectedIds.has(o.id) && o.kind === 'shape').length
    onSelectionInfo({ shapes, total: selectedIds.size })
  }, [selectedIds, doc.objects, onSelectionInfo])
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; at: { x: number; y: number } } | null>(null)
  const drawRef = useRef<{ tool: DrawTool; start: { x: number; y: number }; id: string } | null>(null)
  const drawToolRef = useRef(drawTool)
  drawToolRef.current = drawTool

  /** Click selects one object; shift-click adds or removes; clicking an already selected object keeps the group. */
  const select = useCallback((id: string | null, additive = false) => {
    setSelectedIds((cur) => {
      if (id === null) return cur.size ? new Set() : cur
      if (additive) {
        const next = new Set(cur)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      if (cur.has(id)) return cur
      return new Set([id])
    })
  }, [])
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  // Each drag or resize gets its own session so all of its moves undo as one step.
  const sessionRef = useRef(0)
  const onDragStart = useCallback(() => {
    sessionRef.current += 1
  }, [])

  const update = useCallback(
    (mutate: (objects: CanvasObject[]) => CanvasObject[], opts: ChangeOpts = { history: 'push' }) => {
      const current = docRef.current
      onChange({ ...current, objects: mutate(current.objects) }, opts)
    },
    [onChange]
  )

  /**
   * Stacking order. Objects stack in the order they are stored, in the editor and in page.html
   * alike, so reordering the list is all that is needed. Several selected objects keep their
   * order relative to each other.
   */
  const reorder = useCallback(
    (ids: Set<string>, how: 'front' | 'back' | 'forward' | 'backward') => {
      update((objs) => {
        if (how === 'front') return [...objs.filter((o) => !ids.has(o.id)), ...objs.filter((o) => ids.has(o.id))]
        if (how === 'back') return [...objs.filter((o) => ids.has(o.id)), ...objs.filter((o) => !ids.has(o.id))]
        const arr = [...objs]
        if (how === 'forward') {
          for (let i = arr.length - 2; i >= 0; i--) if (ids.has(arr[i]!.id) && !ids.has(arr[i + 1]!.id)) [arr[i], arr[i + 1]] = [arr[i + 1]!, arr[i]!]
        } else {
          for (let i = 1; i < arr.length; i++) if (ids.has(arr[i]!.id) && !ids.has(arr[i - 1]!.id)) [arr[i - 1], arr[i]] = [arr[i]!, arr[i - 1]!]
        }
        return arr
      })
    },
    [update]
  )

  const removeObject = useCallback(
    (id: string) => {
      update((objs) => objs.filter((o) => o.id !== id))
      setSelectedIds((cur) => {
        if (!cur.has(id)) return cur
        const next = new Set(cur)
        next.delete(id)
        return next
      })
    },
    [update]
  )
  const removeObjects = useCallback(
    (ids: Set<string>) => {
      if (!ids.size) return
      update((objs) => objs.filter((o) => !ids.has(o.id)))
      setSelectedIds(new Set())
    },
    [update]
  )
  const deleteSelected = useCallback(() => {
    if (selectedRef.current.size) removeObjects(selectedRef.current)
  }, [removeObjects])
  const styleShapes = useCallback(
    (style: { stroke?: string; fill?: string | null }) => {
      const ids = selectedRef.current
      if (!ids.size) return
      // Lines and arrows have no fill; a fill from the toolbar leaves them alone.
      update((objs) =>
        objs.map((o) =>
          o.kind === 'shape' && ids.has(o.id)
            ? { ...o, ...(style.stroke !== undefined ? { stroke: style.stroke } : {}), ...(style.fill !== undefined && o.shape !== 'line' && o.shape !== 'arrow' ? { fill: style.fill } : {}) }
            : o
        )
      )
    },
    [update]
  )
  const insertTextBox = useCallback(
    (at?: { x: number; y: number }) => {
      const p = at ?? { x: 96, y: Math.max(96, docRef.current.objects.reduce((acc, o) => Math.max(acc, o.y + 120), 0) + 16) }
      const id = newId()
      setFocusId({ id, at: 'end' })
      setSelectedIds(new Set())
      update((objs) => [...objs, { kind: 'text', id, x: p.x, y: Math.max(0, p.y - 12), width: 360, content: { type: 'doc', content: [{ type: 'paragraph' }] } }])
    },
    [update]
  )
  const insertTable = useCallback(
    (at?: { x: number; y: number }) => {
      const p = at ?? { x: 96, y: Math.max(96, docRef.current.objects.reduce((acc, o) => Math.max(acc, o.y + 120), 0) + 16) }
      const cell = () => ({ type: 'tableCell', content: [{ type: 'paragraph' }] })
      const row = () => ({ type: 'tableRow', content: [cell(), cell(), cell()] })
      const id = newId()
      // Focus at the start so the cursor lands in the first cell and Tab moves between cells.
      setFocusId({ id, at: 'start' })
      setSelectedIds(new Set())
      update((objs) => [...objs, { kind: 'text', id, x: p.x, y: Math.max(0, p.y - 12), width: 480, content: { type: 'doc', content: [{ type: 'table', content: [row(), row(), row()] }, { type: 'paragraph' }] } }])
    },
    [update]
  )
  commands.current = { deleteSelected, styleShapes, insertTextBox, insertTable, selectIds: (ids) => setSelectedIds(new Set(ids)) }

  // Text edits are undone by the editor's own history, not the page history.
  const onContentChange = useCallback(
    (id: string, content: EditorJSON) => update((objs) => objs.map((o) => (o.id === id && o.kind === 'text' ? { ...o, content } : o)), { history: 'none' }),
    [update]
  )
  const objectHeight = (o: CanvasObject): number => (o.kind === 'shape' ? o.height : o.kind === 'image' && o.display !== 'card' ? o.height : o.kind === 'text' ? (heightsRef.current[o.id] ?? 48) : 56)
  const shifted = (o: CanvasObject, dx: number, dy: number): CanvasObject =>
    o.kind === 'shape' && o.a && o.b
      ? { ...o, x: o.x + dx, y: o.y + dy, a: { x: o.a.x + dx, y: o.a.y + dy }, b: { x: o.b.x + dx, y: o.b.y + dy } }
      : { ...o, x: Math.max(0, o.x + dx), y: Math.max(0, o.y + dy) }
  const onMove = useCallback(
    (id: string, x: number, y: number) => {
      const objs = docRef.current.objects
      const obj = objs.find((o) => o.id === id)
      if (!obj) return
      const group = selectedRef.current
      const moveGroup = group.has(id) && group.size > 1
      const others = moveGroup ? objs.filter((o) => group.has(o.id) && o.id !== id) : []
      const snapped = snapPosition(id, x, y, obj.width || 300, objectHeight(obj), moveGroup ? objs.filter((o) => !group.has(o.id)) : objs, heightsRef.current, paperRef.current, gridRef.current)
      setGuides({ ...(snapped.guideX !== undefined ? { x: snapped.guideX } : {}), ...(snapped.guideY !== undefined ? { y: snapped.guideY } : {}) })
      const dx = snapped.x - obj.x
      const dy = snapped.y - obj.y
      if (!dx && !dy) return
      const key = `move:${moveGroup ? [...group].sort().join('+') : id}:${sessionRef.current}`
      update(
        (list) =>
          list.map((o) => {
            if (o.id === id) return shifted(o, dx, dy)
            if (others.some((g) => g.id === o.id)) return shifted(o, dx, dy)
            return o
          }),
        { history: 'coalesce', key }
      )
    },
    [update]
  )
  useEffect(() => {
    const clear = (): void => setGuides({})
    window.addEventListener('mouseup', clear)
    return () => window.removeEventListener('mouseup', clear)
  }, [])
  const onResize = useCallback(
    (id: string, width: number) => update((objs) => objs.map((o) => (o.id === id ? { ...o, width } : o)), { history: 'coalesce', key: `resize:${id}:${sessionRef.current}` }),
    [update]
  )
  const onResizeImage = useCallback(
    (id: string, width: number, height: number) =>
      update((objs) => objs.map((o) => (o.id === id && o.kind === 'image' ? { ...o, width, height } : o)), { history: 'coalesce', key: `resize:${id}:${sessionRef.current}` }),
    [update]
  )
  const onShapeChange = useCallback(
    (next: ShapeModel) => update((objs) => objs.map((o) => (o.id === next.id ? next : o)), { history: 'coalesce', key: `shape:${next.id}:${sessionRef.current}` }),
    [update]
  )
  // The first size of a freshly inserted picture is not a user action.
  const onNaturalSize = useCallback(
    (id: string, width: number, height: number) => update((objs) => objs.map((o) => (o.id === id && o.kind === 'image' ? { ...o, width, height } : o)), { history: 'none' }),
    [update]
  )

  // Search highlights: recomputed whenever the page content or the terms change.
  const matchesRef = useRef(0)
  useEffect(() => {
    const root = canvasRef.current
    if (!root || !search || !search.terms.length) {
      clearHighlights()
      root?.querySelectorAll('.image-object.search-match').forEach((el) => el.classList.remove('search-match'))
      if (matchesRef.current !== 0) {
        matchesRef.current = 0
        onSearchMatches(0)
      }
      return
    }
    const t = window.setTimeout(() => {
      const ranges = findRanges(root, search.terms)
      applyHighlights(ranges, search.active)
      const current = ranges[search.active]
      if (current) scrollToRange(current)
      // A match inside a printout's hidden text cannot be painted on the picture, so the picture is outlined.
      root.querySelectorAll('.image-object.search-match').forEach((el) => el.classList.remove('search-match'))
      const holder = current?.startContainer.parentElement?.closest('.image-object')
      if (holder && current?.startContainer.parentElement?.closest('.printout-text')) {
        holder.classList.add('search-match')
        holder.scrollIntoView({ block: 'center' })
      }
      if (matchesRef.current !== ranges.length) {
        matchesRef.current = ranges.length
        onSearchMatches(ranges.length)
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [search, doc, onSearchMatches])

  // Delete or Backspace removes the selected objects when no editor or input has focus; Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (e.key === 'Escape') {
        if (selectedRef.current.size) setSelectedIds(new Set())
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && selectedRef.current.size) {
        e.preventDefault()
        onCopyObjects(docRef.current.objects.filter((o) => selectedRef.current.has(o.id)))
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        onPasteObjects()
        return
      }
      if (!selectedRef.current.size || (e.key !== 'Delete' && e.key !== 'Backspace')) return
      e.preventDefault()
      deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected, onCopyObjects, onPasteObjects])

  // Rubber-band selection: press on empty canvas and drag; every object the box touches is selected.
  useEffect(() => {
    const move = (e: globalThis.MouseEvent): void => {
      const d = drawRef.current
      if (d) {
        const raw = canvasPoint(e)
        if (d.tool === 'line' || d.tool === 'arrow') {
          const end = snapLineEnd(d.start, raw)
          update(
            (objs) => objs.map((o) => (o.id === d.id && o.kind === 'shape' ? { ...o, a: d.start, b: end, ...lineBox(d.start, end, o.strokeWidth) } : o)),
            { history: 'coalesce', key: `shape:${d.id}:${sessionRef.current}` }
          )
        } else {
          const x = Math.min(d.start.x, raw.x)
          const y = Math.min(d.start.y, raw.y)
          update(
            (objs) => objs.map((o) => (o.id === d.id && o.kind === 'shape' ? { ...o, x, y, width: Math.max(1, Math.abs(raw.x - d.start.x)), height: Math.max(1, Math.abs(raw.y - d.start.y)) } : o)),
            { history: 'coalesce', key: `shape:${d.id}:${sessionRef.current}` }
          )
        }
        return
      }
      const m = marqueeRef.current
      if (!m) return
      const pt = canvasPoint(e)
      if (Math.abs(pt.x - m.x0) + Math.abs(pt.y - m.y0) > 4) m.moved = true
      if (m.moved) {
        m.box = { x0: Math.min(m.x0, pt.x), y0: Math.min(m.y0, pt.y), x1: Math.max(m.x0, pt.x), y1: Math.max(m.y0, pt.y) }
        setMarquee(m.box)
      }
    }
    const up = (): void => {
      const d = drawRef.current
      if (d) {
        drawRef.current = null
        suppressClickRef.current = true
        const made = docRef.current.objects.find((o) => o.id === d.id)
        // A click without a drag leaves nothing behind.
        if (made && made.kind === 'shape' && made.width <= 2 && made.height <= 2 && (!made.a || (made.a.x === made.b?.x && made.a.y === made.b?.y))) {
          update((objs) => objs.filter((o) => o.id !== d.id), { history: 'none' })
        } else setSelectedIds(new Set([d.id]))
        onDrawTool(null)
        return
      }
      const m = marqueeRef.current
      if (!m) return
      marqueeRef.current = null
      setMarquee(null)
      if (!m.moved || !m.box) return
      suppressClickRef.current = true
      const root = canvasRef.current
      const box = m.box
      if (!root) return
      const rootRect = root.getBoundingClientRect()
      const z = zoomRef.current
      const hit = new Set<string>()
      root.querySelectorAll<HTMLElement>('[data-object-id]').forEach((el) => {
        const r = el.getBoundingClientRect()
        const left = (r.left - rootRect.left) / z
        const top = (r.top - rootRect.top) / z
        const right = left + r.width / z
        const bottom = top + r.height / z
        if (right >= box.x0 && left <= box.x1 && bottom >= box.y0 && top <= box.y1) hit.add(el.dataset['objectId']!)
      })
      ;(document.activeElement as HTMLElement | null)?.blur()
      setSelectedIds(hit)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, onDrawTool])

  function canvasPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 96, y: 96 }
    const z = zoomRef.current
    return { x: Math.max(0, Math.round((e.clientX - rect.left) / z)), y: Math.max(0, Math.round((e.clientY - rect.top) / z)) }
  }

  // Ctrl+wheel, or a trackpad pinch (which arrives as a wheel event with ctrlKey), zooms the page.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey && Math.abs(e.deltaY) < 20 ? 0.01 : 0.002))
      onZoom(clampZoom(zoomRef.current * factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoom])

  /** Left-click on empty canvas only clears the selection; everything is inserted from the right-click menu. */
  function onCanvasClick(): void {
    if (suppressClickRef.current) suppressClickRef.current = false
  }

  function startShape(e: MouseEvent<HTMLDivElement>, tool: DrawTool): void {
    const start = canvasPoint(e)
    const id = newId()
    const stroke = '#2c2c2a'
    const strokeWidth = 2
    const base: ShapeModel = tool === 'line' || tool === 'arrow'
      ? { kind: 'shape', id, shape: tool, ...lineBox(start, start, strokeWidth), a: start, b: start, stroke, strokeWidth, fill: null }
      : { kind: 'shape', id, shape: tool, x: start.x, y: start.y, width: 1, height: 1, stroke, strokeWidth, fill: null }
    drawRef.current = { tool, start, id }
    onDragStart()
    update((objs) => [...objs, base], { history: 'push' })
  }

  async function dropFiles(e: DragEvent<HTMLDivElement>): Promise<void> {
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    e.preventDefault()
    const at = canvasPoint(e)
    const asCard = e.altKey
    const withPath = files.map((f) => ({ file: f, path: window.pagebinder.file.pathFor(f) }))
    const imagePaths = withPath.filter((f) => f.path && isImageFile(f.file) && !asCard).map((f) => f.path)
    const otherPaths = withPath.filter((f) => f.path && (!isImageFile(f.file) || asCard)).map((f) => f.path)
    const memoryImages = withPath.filter((f) => !f.path && isImageFile(f.file)).map((f) => f.file)
    const added: CanvasObject[] = []
    let offset = 0
    const place = (): { x: number; y: number } => ({ x: at.x + offset * 24, y: at.y + offset++ * 24 })
    for (const entry of [...(imagePaths.length ? await onAddImagePaths(imagePaths) : []), ...(memoryImages.length ? await onAddImages(memoryImages) : [])]) {
      const p = place()
      added.push({ kind: 'image', id: newId(), x: p.x, y: p.y, width: 0, height: 0, name: entry.name, originalName: entry.originalName })
    }
    for (const { entry, mail } of otherPaths.length ? await onAddFiles(otherPaths) : []) {
      const p = place()
      added.push({ kind: 'file', id: newId(), x: p.x, y: p.y, width: 300, name: entry.name, originalName: entry.originalName, ...(mail ? { mail } : {}) })
    }
    if (added.length) update((objs) => [...objs, ...added], { history: 'push' })
  }

  const missingSet = useMemo(() => new Set(missing), [missing])
  const relFor = (o: CanvasObject): string => (o.kind === 'file' ? `${pageRel}/attachments/${o.name}` : `${pageRel}/images/${(o as { name: string }).name}`)

  const [borderWeight, setBorderWeight] = useState<BorderWeight>('thin')
  const menuItems = (id: string, tableEditor: Editor | null = null, textEditor: Editor | null = null): MenuItem[] => {
    const obj = doc.objects.find((o) => o.id === id)
    if (!obj) return []
    const orderIds = selectedIds.has(id) && selectedIds.size > 1 ? new Set(selectedIds) : new Set([id])
    const orderItem: MenuItem = {
      label: 'Order',
      submenu: [
        { label: 'Bring to front', onClick: () => reorder(orderIds, 'front') },
        { label: 'Bring forward', onClick: () => reorder(orderIds, 'forward') },
        { label: 'Send backward', onClick: () => reorder(orderIds, 'backward') },
        { label: 'Send to back', onClick: () => reorder(orderIds, 'back') }
      ]
    }
    const copyItem: MenuItem = { label: selectedIds.has(id) && selectedIds.size > 1 ? `Copy ${selectedIds.size} objects` : 'Copy', onClick: () => onCopyObjects(doc.objects.filter((o) => (selectedIds.has(id) ? selectedIds.has(o.id) : o.id === id))) }
    if (obj.kind === 'shape') {
      const setShape = (patch: Partial<ShapeModel>): void => update((objs) => objs.map((o) => (o.id === id && o.kind === 'shape' ? { ...o, ...patch } : o)))
      const isLine = obj.shape === 'line' || obj.shape === 'arrow'
      return [
        ...(isLine ? [] : [{ label: 'Fill colour', submenu: [{ colors: { current: obj.fill, onPick: (c: string) => setShape({ fill: c }), onClear: () => setShape({ fill: null }), clearLabel: 'No fill (see through)' } }] }]),
        { label: 'Line colour', submenu: [{ colors: { current: obj.stroke, onPick: (c: string) => setShape({ stroke: c }) } }] },
        { label: `Line weight: ${obj.strokeWidth} px (click to change)`, keepOpen: true, onClick: () => setShape({ strokeWidth: obj.strokeWidth >= 6 ? 1 : obj.strokeWidth + 1 }) },
        { separator: true },
        orderItem,
        copyItem,
        { label: 'Delete', onClick: () => removeObject(id) }
      ]
    }
    if (selectedIds.has(id) && selectedIds.size > 1) {
      const n = selectedIds.size
      return [orderItem, { label: `Delete ${n} selected objects`, onClick: () => removeObjects(selectedIds) }]
    }
    if (obj.kind === 'text') {
      const items: MenuItem[] = []
      const ed = tableEditor ?? textEditor
      if (tableEditor && ed) {
        const sizes = currentSizes(ed.state)
        const many = (sizes?.cells ?? 1) > 1
        const chain = () => ed.chain().focus()
        const w = borderWeight
        const border = (label: string, target: BorderTarget): MenuItem => ({ label, onClick: () => chain().setCellBorders(target, w).run() })
        const cellBg = (ed.getAttributes('tableCell')['backgroundColor'] as string | undefined) ?? (ed.getAttributes('tableHeader')['backgroundColor'] as string | undefined) ?? null
        items.push(
          { label: 'Cell fill colour', submenu: [{ colors: { current: cellBg, onPick: (c: string) => chain().setCellAttribute('backgroundColor', c).run(), onClear: () => chain().setCellAttribute('backgroundColor', null).run(), clearLabel: 'No fill' } }] },
          {
            label: 'Borders',
            submenu: [
              border(`All (${w})`, 'all'),
              border(`Outside (${w})`, 'outside'),
              border(`Inside (${w})`, 'inside'),
              border(`Top (${w})`, 'top'),
              border(`Bottom (${w})`, 'bottom'),
              border(`Left (${w})`, 'left'),
              border(`Right (${w})`, 'right'),
              { label: 'None', onClick: () => chain().setCellBorders('all', 'none').run() },
              { separator: true },
              { label: `Weight: ${w} (click to change)`, keepOpen: true, onClick: () => setBorderWeight(w === 'thin' ? 'medium' : w === 'medium' ? 'thick' : 'thin') }
            ]
          },
          { separator: true },
          { label: many ? 'Row height for selected rows…' : 'Row height…', onClick: () => onSizeDialog('row', sizes?.rowHeight ?? null, ed) },
          { label: many ? 'Column width for selected columns…' : 'Column width…', onClick: () => onSizeDialog('column', sizes?.columnWidth ?? null, ed) },
          { separator: true },
          { label: 'Insert row above', onClick: () => chain().addRowBefore().run() },
          { label: 'Insert row below', onClick: () => chain().addRowAfter().run() },
          { label: 'Insert column left', onClick: () => chain().addColumnBefore().run() },
          { label: 'Insert column right', onClick: () => chain().addColumnAfter().run() },
          { separator: true },
          { label: 'Delete row', onClick: () => chain().deleteRow().run() },
          { label: 'Delete column', onClick: () => chain().deleteColumn().run() },
          { label: many ? 'Merge cells' : 'Split cell', onClick: () => (many ? chain().mergeCells().run() : chain().splitCell().run()) },
          { label: 'Delete table', onClick: () => chain().deleteTable().run() },
          { separator: true }
        )
      }
      if (ed) items.push({ label: 'Insert signature', onClick: () => onSignature(ed) }, { separator: true })
      items.push(orderItem, copyItem, { label: 'Delete text box', onClick: () => removeObject(id) })
      return items
    }
    const fileItems: MenuItem[] = [
      { label: 'Open in default application', onClick: () => void window.pagebinder.file.open(relFor(obj)) },
      { label: navigator.userAgent.includes('Windows') ? 'Show in Explorer' : 'Show in Finder', onClick: () => void window.pagebinder.file.reveal(relFor(obj)) },
      { separator: true }
    ]
    if (obj.kind === 'image') {
      fileItems.push({
        label: obj.display === 'card' ? 'Show as picture' : 'Show as attachment',
        onClick: () => update((objs) => objs.map((o) => (o.id === id && o.kind === 'image' ? { ...o, display: o.display === 'card' ? 'inline' : 'card', ...(o.display === 'card' ? { width: 0, height: 0 } : {}) } : o)))
      })
      fileItems.push({ separator: true })
    }
    if (obj.kind === 'file' && /\.pdf$/i.test(obj.name)) fileItems.push({ label: 'Insert printout of this PDF', onClick: () => onPrintout(obj) }, { separator: true })
    fileItems.push(orderItem, copyItem, { label: 'Delete', onClick: () => removeObject(id) })
    return fileItems
  }

  const contentBottom = doc.objects.reduce((acc, o) => Math.max(acc, o.y + objectHeight(o)), 0)
  const contentRight = doc.objects.reduce((acc, o) => Math.max(acc, o.x + (o.width || 300)), 0)
  const sheetCount = Math.max(1, Math.ceil((contentBottom + paper.margins.bottom) / paper.height))
  const canvasWidth = Math.max(paper.width, contentRight) + 160
  const canvasHeight = sheetCount * paper.height + 160
  const sheets = Array.from({ length: sheetCount }, (_, i) => i)
  const showNumbers = doc.print?.footerSheetNumbers !== false

  return (
    <div
      ref={scrollRef}
      className={`canvas-scroll${showBorder ? ' bordered' : ''}`}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) e.preventDefault()
      }}
      onDrop={(e) => void dropFiles(e)}
    >
      <div className="canvas-zoom" style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
      <div
        ref={canvasRef}
        className={`canvas${showGrid ? ' grid' : ''}${drawTool ? ' drawing' : ''}`}
        data-zoom={zoom}
        style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        onClick={onCanvasClick}
        onContextMenu={(e) => {
          e.preventDefault()
          setCanvasMenu({ x: e.clientX, y: e.clientY, at: canvasPoint(e) })
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          if (drawToolRef.current) {
            e.preventDefault()
            startShape(e, drawToolRef.current)
            return
          }
          const pt = canvasPoint(e)
          marqueeRef.current = { x0: pt.x, y0: pt.y, moved: false, box: null }
          if (!e.shiftKey) setSelectedIds(new Set())
        }}
      >
        {showBorder &&
          sheets.map((i) => (
            <div key={i} className="paper" style={{ top: i * paper.height, width: paper.width, height: paper.height }}>
              <div
                className="margins"
                style={{ left: paper.margins.left, top: paper.margins.top, width: paper.width - paper.margins.left - paper.margins.right, height: paper.height - paper.margins.top - paper.margins.bottom }}
              />
              {showNumbers && (
                <span className="page-number" style={{ right: paper.margins.right + 2, top: paper.height - paper.margins.bottom, height: paper.margins.bottom, lineHeight: `${paper.margins.bottom}px` }}>
                  Page {i + 1} of {sheetCount}
                </span>
              )}
            </div>
          ))}
        {guides.x !== undefined && <div className="guide v" style={{ left: guides.x }} />}
        {guides.y !== undefined && <div className="guide h" style={{ top: guides.y }} />}
        {marquee && <div className="marquee" style={{ left: marquee.x0, top: marquee.y0, width: marquee.x1 - marquee.x0, height: marquee.y1 - marquee.y0 }} />}
        {doc.objects.map((obj) =>
          obj.kind === 'text' ? (
            <TextContainer
              key={obj.id}
              obj={obj}
              autoFocus={focusId?.id === obj.id ? focusId.at : false}
              selected={selectedIds.has(obj.id)}
              onChange={onContentChange}
              onMove={onMove}
              onResize={onResize}
              onSelect={select}
              onDelete={removeObject}
              onDragStart={onDragStart}
              zoom={zoom}
              onContextMenu={(id, x, y, tableEditor, textEditor) => setObjectMenu({ id, x, y, tableEditor, textEditor })}
              onMeasure={onMeasure}
              sheet={{ height: paper.height, marginTop: paper.margins.top, marginBottom: paper.margins.bottom }}
            />
          ) : obj.kind === 'shape' ? (
            <ShapeObject
              key={obj.id}
              obj={obj}
              selected={selectedIds.has(obj.id)}
              zoom={zoom}
              onSelect={select}
              onDragStart={onDragStart}
              onMove={onMove}
              onChange={onShapeChange}
              onContextMenu={(id, x, y) => setObjectMenu({ id, x, y })}
            />
          ) : obj.kind === 'file' || obj.display === 'card' ? (
            <FileCard
              key={obj.id}
              obj={obj}
              href={window.pagebinder.fileUrl(relFor(obj))}
              size={(obj.kind === 'file' ? doc.manifest.attachments : doc.manifest.images).find((e) => e.name === obj.name)?.size}
              missing={missingSet.has(obj.name)}
              selected={selectedIds.has(obj.id)}
              onSelect={select}
              onContextMenu={(id, x, y) => setObjectMenu({ id, x, y })}
              onOpen={() => void window.pagebinder.file.open(relFor(obj))}
              onDragStart={onDragStart}
              zoom={zoom}
              onMove={onMove}
            />
          ) : (
            <ImageObject
              key={obj.id}
              obj={obj}
              src={window.pagebinder.fileUrl(relFor(obj))}
              size={doc.manifest.images.find((e) => e.name === obj.name)?.size}
              selected={selectedIds.has(obj.id)}
              onSelect={select}
              onContextMenu={(id, x, y) => setObjectMenu({ id, x, y })}
              onDragStart={onDragStart}
              zoom={zoom}
              onMove={onMove}
              onResize={onResizeImage}
              onNaturalSize={onNaturalSize}
            />
          )
        )}
      </div>
      </div>
      {objectMenu && <ContextMenu x={objectMenu.x} y={objectMenu.y} items={menuItems(objectMenu.id, objectMenu.tableEditor, objectMenu.textEditor)} onClose={() => setObjectMenu(null)} />}
      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={[
            { label: 'Paste', disabled: !canPaste, onClick: () => onPasteObjects(canvasMenu.at) },
            { separator: true },
            { label: 'Text box', onClick: () => insertTextBox(canvasMenu.at) },
            { label: 'Table (3 × 3)', onClick: () => insertTable(canvasMenu.at) },
            { label: 'Picture…', onClick: () => onInsertPicture('inline', canvasMenu.at) },
            { label: 'File attachment…', onClick: () => onInsertFile(canvasMenu.at) },
            { separator: true },
            { label: 'Draw line', onClick: () => onDrawTool('line') },
            { label: 'Draw arrow', onClick: () => onDrawTool('arrow') },
            { label: 'Draw rectangle', onClick: () => onDrawTool('rect') },
            { label: 'Draw ellipse', onClick: () => onDrawTool('ellipse') },
            ...(selectedIds.size ? [{ separator: true }, { label: `Delete ${selectedIds.size} selected`, onClick: () => removeObjects(selectedIds) }] : [])
          ]}
          onClose={() => setCanvasMenu(null)}
        />
      )}
    </div>
  )
}
