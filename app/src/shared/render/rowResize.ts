/**
 * Row height for tables: a `height` attribute on table rows, and a
 * ProseMirror plugin that lets the user drag the bottom edge of a row to
 * change it, the same way column borders are dragged for width.
 */
import { Extension } from '@tiptap/core'
import { TableRow } from '@tiptap/extension-table'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export const DocTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const h = el.style.height || el.getAttribute('data-height')
          return h ? parseInt(h, 10) || null : null
        },
        renderHTML: (attrs: Record<string, unknown>) => (attrs['height'] ? { style: `height: ${attrs['height']}px`, 'data-height': String(attrs['height']) } : {})
      }
    }
  }
})

const EDGE = 5
/** Rows can be set as short as 10 px; a row still cannot be shorter than the text inside it. */
const MIN_HEIGHT = 10

interface Drag {
  rowPos: number
  startY: number
  startHeight: number
}

function rowAtEdge(view: EditorView, event: MouseEvent): { rowPos: number; height: number } | null {
  const target = event.target as HTMLElement | null
  const cell = target?.closest('td, th') as HTMLElement | null
  if (!cell || !view.dom.contains(cell)) return null
  const rect = cell.getBoundingClientRect()
  if (Math.abs(event.clientY - rect.bottom) > EDGE) return null
  const tr = cell.parentElement
  if (!tr) return null
  const pos = view.posAtDOM(tr, 0)
  const $pos = view.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth >= 0; depth--) {
    if ($pos.node(depth).type.name === 'tableRow') {
      return { rowPos: $pos.before(depth), height: tr.getBoundingClientRect().height }
    }
  }
  return null
}

export const RowResize = Extension.create({
  name: 'rowResize',
  addProseMirrorPlugins() {
    let drag: Drag | null = null
    return [
      new Plugin({
        key: new PluginKey('rowResize'),
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (drag) return false
              const hit = rowAtEdge(view, event)
              view.dom.style.cursor = hit ? 'row-resize' : ''
              return false
            },
            mousedown: (view, event) => {
              const hit = rowAtEdge(view, event)
              if (!hit) return false
              event.preventDefault()
              drag = { rowPos: hit.rowPos, startY: event.clientY, startHeight: hit.height }
              const zoom = Number((view.dom.closest('[data-zoom]') as HTMLElement | null)?.dataset['zoom'] ?? '1') || 1
              const move = (e: MouseEvent): void => {
                if (!drag) return
                const height = Math.max(MIN_HEIGHT, Math.round(drag.startHeight + (e.clientY - drag.startY) / zoom))
                const node = view.state.doc.nodeAt(drag.rowPos)
                if (!node) return
                view.dispatch(view.state.tr.setNodeMarkup(drag.rowPos, undefined, { ...node.attrs, height }))
              }
              const up = (): void => {
                drag = null
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
                view.dom.style.cursor = ''
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
              return true
            }
          }
        }
      })
    ]
  }
})
