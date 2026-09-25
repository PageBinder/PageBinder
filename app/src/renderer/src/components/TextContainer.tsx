import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import { documentExtensions } from '@shared/render/extensions'
import type { TextContainer as TextContainerModel, EditorJSON } from '@shared/types'
import type { Editor } from '@tiptap/react'
import { useActiveEditor } from '../editorContext'

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
  onMeasure
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
  onContextMenu: (id: string, x: number, y: number, tableEditor: Editor | null, textEditor: Editor | null) => void
  onMeasure: (id: string, height: number) => void
}): JSX.Element {
  const { setEditor, editor: active } = useActiveEditor()
  const editor = useEditor({
    extensions: [...documentExtensions(), Placeholder.configure({ placeholder: 'Type here' })],
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
    // Menus that insert text need the editor focused where the user clicked.
    if (!inTable && editor) {
      const pos = editor.view.posAtCoords({ left: x, top: y })
      if (pos && !editor.isFocused) editor.chain().focus().setTextSelection(pos.pos).run()
    }
    onContextMenu(obj.id, x, y, inTable && editor ? editor : null, editor ?? null)
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
