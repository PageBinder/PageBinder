import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import { documentExtensions } from '@shared/render/extensions'
import type { TextContainer as TextContainerModel, EditorJSON } from '@shared/types'
import type { Editor } from '@tiptap/react'
import { useActiveEditor } from '../editorContext'
import { SheetBreaks, layoutSheetBreaks, type SheetGeometry } from '../sheetBreaks'
import { AnchoredPictures, drawAnchoredPictures, type Corner } from '../anchoredPicturesView'
import { MIN_PICTURE_SIZE, textAreaWidth } from '@shared/render/anchoredPictures'
import type { AnchoredPicture } from '@shared/types'

const MIN_WIDTH = 160

export function TextContainer({
  obj,
  autoFocus,
  selected,
  onChange,
  onMove,
  onResize,
  onSelect,
  onDelete,
  onDragStart,
  zoom,
  onContextMenu,
  onMeasure,
  sheet,
  imageBase,
  onPicturesChange,
  onCopyPicture
}: {
  obj: TextContainerModel
  autoFocus: false | 'start' | 'end'
  selected: boolean
  onChange: (id: string, content: EditorJSON) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, width: number) => void
  onSelect: (id: string | null, additive?: boolean) => void
  onDelete: (id: string) => void
  onDragStart: () => void
  zoom: number
  onContextMenu: (id: string, x: number, y: number, tableEditor: Editor | null, textEditor: Editor | null, extra?: { pictureId?: string; at?: { x: number; y: number } }) => void
  onMeasure: (id: string, height: number) => void
  /** Paper geometry, so text crossing a sheet boundary is laid out as it will print. */
  sheet: SheetGeometry
  /** Where pictures inside the text are loaded from: this page's images folder. */
  imageBase: string
  /** Pictures anchored in the box were moved, resized, or removed. */
  onPicturesChange: (id: string, pictures: AnchoredPicture[]) => void
  onCopyPicture: (boxId: string, pictureId: string, cut: boolean) => void
}): JSX.Element {
  const { setEditor, editor: active } = useActiveEditor()
  const editor = useEditor({
    extensions: [...documentExtensions({ imageBase }), Placeholder.configure({ placeholder: 'Type here' }), SheetBreaks, AnchoredPictures],
    content: obj.content,
    autofocus: autoFocus || false,
    onUpdate: ({ editor }) => onChange(obj.id, editor.getJSON() as EditorJSON),
    onFocus: ({ editor }) => {
      setEditor(editor)
      onSelect(null)
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        const mod = event.metaKey || event.ctrlKey
        // Escape selects the whole text box so Delete or Backspace can remove it.
        // The DOM element itself is blurred so the next key press reaches the canvas.
        if (event.key === 'Escape') {
          ;(view.dom as HTMLElement).blur()
          onSelect(obj.id)
          return true
        }
        // Cmd/Ctrl+Shift+Backspace or Delete removes the whole text box.
        if (mod && event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
          onDelete(obj.id)
          return true
        }
        // Backspace in an empty text box removes it, as in OneNote.
        if (event.key === 'Backspace' && editor?.isEmpty) {
          onDelete(obj.id)
          return true
        }
        return false
      }
    }
  })

  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => onMeasure(obj.id, el.offsetHeight))
    ro.observe(el)
    onMeasure(obj.id, el.offsetHeight)
    return () => ro.disconnect()
  }, [obj.id, onMeasure])

  // Clear the active editor only when this container unmounts while active.
  const activeRef = useRef(active)
  activeRef.current = active
  const editorRef = useRef(editor)
  editorRef.current = editor
  useEffect(() => {
    return () => {
      if (activeRef.current && activeRef.current === editorRef.current) setEditor(null)
    }
  }, [setEditor])

  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const resizeRef = useRef<{ startX: number; width: number } | null>(null)

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // Lay out text that crosses a sheet boundary the way the printout will (see sheetBreaks.ts):
  // after every edit, move, resize, paper change, or zoom, and once the fonts have loaded.
  const sheetRef = useRef(sheet)
  sheetRef.current = sheet
  useEffect(() => {
    if (!editor) return
    let timer = 0
    const run = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const canvas = rootRef.current?.closest('.canvas') as HTMLElement | null
        if (canvas) layoutSheetBreaks(editor, canvas, zoomRef.current, sheetRef.current)
      }, 30)
    }
    run()
    void document.fonts?.ready.then(run)
    editor.on('update', run)
    return () => {
      editor.off('update', run)
      window.clearTimeout(timer)
    }
  }, [editor, obj.x, obj.y, obj.width, sheet.height, sheet.marginTop, sheet.marginBottom, sheet.continuous, zoom, JSON.stringify(obj.pictures ?? [])])

  // Pictures anchored in the box: drawn as floats at the start of the text, moved and resized by
  // dragging, selected by clicking, removed with Delete. They keep their size when the box is
  // resized and move with the box.
  const [selectedPicture, setSelectedPicture] = useState<string | null>(null)
  const picturesRef = useRef(obj.pictures ?? [])
  picturesRef.current = obj.pictures ?? []
  const pictureDrag = useRef<{ id: string; grip: Corner | null; startX: number; startY: number; orig: AnchoredPicture } | null>(null)
  const picturesKey = JSON.stringify(obj.pictures ?? [])
  useEffect(() => {
    if (!editor) return
    const draw = (): void =>
      drawAnchoredPictures(editor, picturesRef.current, obj.width, {
        selectedId: selectedPicture,
        imageBase,
        onPress: (id, e, grip) => {
          e.preventDefault()
          e.stopPropagation()
          const orig = picturesRef.current.find((p) => p.id === id)
          if (!orig) return
          setSelectedPicture(id)
          onDragStart()
          pictureDrag.current = { id, grip, startX: e.clientX, startY: e.clientY, orig }
          document.body.classList.add('dragging')
        }
      })
    draw()
    editor.on('update', draw)
    return () => {
      editor.off('update', draw)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, picturesKey, obj.width, selectedPicture, imageBase])
  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const d = pictureDrag.current
      if (!d) return
      const z = zoomRef.current
      const dx = (e.clientX - d.startX) / z
      const dy = (e.clientY - d.startY) / z
      const area = textAreaWidth(obj.width)
      const next = picturesRef.current.map((p) => {
        if (p.id !== d.id) return p
        if (!d.grip) {
          return { ...p, x: Math.round(Math.max(0, Math.min(area - p.width, d.orig.x + dx))), y: Math.round(Math.max(0, d.orig.y + dy)) }
        }
        // Resize from the grabbed corner, keeping the shape; the opposite corner stays put.
        const o = d.orig
        const ratio = o.width / Math.max(1, o.height)
        const sx = d.grip === 'tr' || d.grip === 'br' ? 1 : -1
        const sy = d.grip === 'bl' || d.grip === 'br' ? 1 : -1
        const grow = (sx * dx + sy * dy * ratio) / 2
        const maxWidth = sx > 0 ? area - o.x : o.x + o.width
        const width = Math.round(Math.max(MIN_PICTURE_SIZE, Math.min(maxWidth, o.width + grow)))
        const height = Math.round(width / ratio)
        return { ...p, width, height, x: sx > 0 ? o.x : o.x + o.width - width, y: sy > 0 ? o.y : Math.max(0, o.y + o.height - height) }
      })
      onPicturesChange(obj.id, next)
    }
    const up = (): void => {
      if (!pictureDrag.current) return
      pictureDrag.current = null
      document.body.classList.remove('dragging')
    }
    // Clicking anywhere else deselects the picture; Delete or Backspace removes a selected one.
    const down = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement | null)?.closest?.(`.anchored-picture-frame[data-id]`)) setSelectedPicture(null)
    }
    const key = (e: KeyboardEvent): void => {
      if (!selectedPicture) return
      // Cmd/Ctrl+C or X: copy or cut the selected picture, to paste onto the page or into a box.
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
        e.preventDefault()
        e.stopPropagation()
        onCopyPicture(obj.id, selectedPicture, e.key.toLowerCase() === 'x')
        if (e.key.toLowerCase() === 'x') setSelectedPicture(null)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      e.stopPropagation()
      onPicturesChange(obj.id, picturesRef.current.filter((p) => p.id !== selectedPicture))
      setSelectedPicture(null)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('mousedown', down, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('mousedown', down, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [obj.id, obj.width, onPicturesChange, onCopyPicture, selectedPicture])
  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const z = zoomRef.current
      if (dragRef.current) {
        const d = dragRef.current
        onMove(obj.id, Math.max(0, d.x + (e.clientX - d.startX) / z), Math.max(0, d.y + (e.clientY - d.startY) / z))
      } else if (resizeRef.current) {
        const r = resizeRef.current
        onResize(obj.id, Math.max(MIN_WIDTH, r.width + (e.clientX - r.startX) / z))
      }
    }
    const up = (): void => {
      dragRef.current = null
      resizeRef.current = null
      document.body.classList.remove('dragging')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [obj.id, onMove, onResize])

  const openMenu = (target: HTMLElement, x: number, y: number): void => {
    const cell = target.closest('td, th')
    const inTable = !!cell && !!editor && editor.view.dom.contains(cell)
    if (inTable && editor) {
      // Make this editor the active one, and put the caret in the clicked cell
      // unless a group of cells is already highlighted.
      const sel = editor.state.selection
      const isCells = 'forEachCell' in sel
      if (!isCells) {
        const pos = editor.view.posAtCoords({ left: x, top: y })
        if (pos) editor.chain().focus().setTextSelection(pos.pos).run()
        else editor.commands.focus()
      } else {
        editor.commands.focus()
      }
    }
    // A picture anchored in the box: select it, and offer its menu.
    const anchored = target.closest('.anchored-picture-frame[data-id]') as HTMLElement | null
    if (anchored && editor) {
      const id = anchored.dataset['id']!
      setSelectedPicture(id)
      onContextMenu(obj.id, x, y, null, editor, { pictureId: id })
      return
    }
    // A picture inside the text: select it, so the menu offers its wrap and size.
    const picture = target.closest('img.text-image')
    if (!inTable && editor && picture && editor.view.dom.contains(picture) && picture.parentNode) {
      const index = Array.prototype.indexOf.call(picture.parentNode.childNodes, picture) as number
      const pos = editor.view.posAtDOM(picture.parentNode, index)
      editor.chain().focus().setNodeSelection(pos).run()
      onContextMenu(obj.id, x, y, null, editor)
      return
    }
    // Menus that insert text need the editor focused where the user clicked.
    if (!inTable && editor) {
      const pos = editor.view.posAtCoords({ left: x, top: y })
      if (pos && !editor.isFocused) editor.chain().focus().setTextSelection(pos.pos).run()
    }
    // Where the click landed in the text area, for Insert picture.
    const area = editor ? (editor.view.dom as HTMLElement).getBoundingClientRect() : null
    const at = area ? { x: Math.max(0, (x - area.left) / zoomRef.current), y: Math.max(0, (y - area.top) / zoomRef.current) } : undefined
    onContextMenu(obj.id, x, y, inTable && editor ? editor : null, editor ?? null, { at })
  }

  const focused = !!editor && active === editor && editor.isFocused
  return (
    <div
      ref={rootRef}
      data-object-id={obj.id}
      className={`text-container${focused ? ' focused' : ''}${selected ? ' selected' : ''}`}
      style={{ left: obj.x, top: obj.y, width: obj.width }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation()
        // Open the context menu on the right-button press itself. Waiting for the
        // contextmenu event is unreliable here: the focus change it causes can
        // re-render the editor first, and the event then lands on the canvas.
        if (e.button === 2) {
          e.preventDefault()
          openMenu(e.target as HTMLElement, e.clientX, e.clientY)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div
        className="container-handle"
        title="Drag to move. Click to select the text box; Delete removes it."
        onMouseDown={(e) => {
          e.preventDefault()
          ;(editor?.view.dom as HTMLElement | undefined)?.blur()
          onSelect(obj.id, e.shiftKey)
          onDragStart()
          dragRef.current = { startX: e.clientX, startY: e.clientY, x: obj.x, y: obj.y }
          document.body.classList.add('dragging')
        }}
      />
      <EditorContent editor={editor} className="editor" />
      <div
        className="container-resize"
        title="Drag to resize"
        onMouseDown={(e) => {
          e.preventDefault()
          onDragStart()
          resizeRef.current = { startX: e.clientX, width: obj.width }
          document.body.classList.add('dragging')
        }}
      />
    </div>
  )
}
