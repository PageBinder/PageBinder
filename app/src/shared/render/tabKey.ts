/**
 * Tab behaves as in a word processor: in a table it moves between cells
 * (handled by the table extension), in ordinary text it inserts a tab stop of
 * half an inch, and in a list it moves the highlighted items to the right.
 *
 * List items carry an `indent` attribute (whole tab stops, rendered as a left
 * margin) so that highlighted items shift right together and keep their bullet
 * or number style. With the cursor in a single item, Tab nests it under the item
 * above when that is possible, which is how sub-lists are made; when it is not
 * (the first item of a list) the item shifts right instead. Shift+Tab reverses
 * the shift first, and outdents the nesting when there is no shift left.
 */
import { Extension } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'

const LIST_ITEMS = ['listItem', 'taskItem']
const MAX_INDENT = 20
export const INDENT_PX = 48

/** Positions of the outermost list items that the selection touches. */
function selectedItems(tr: Transaction): { pos: number; indent: number }[] {
  const { from, to } = tr.selection
  const items: { pos: number; indent: number }[] = []
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (LIST_ITEMS.includes(node.type.name)) {
      items.push({ pos, indent: Number(node.attrs['indent'] ?? 0) })
      return false // children of a shifted item move with it
    }
    return true
  })
  return items
}

function shiftItems(tr: Transaction, delta: number): boolean {
  const items = selectedItems(tr)
  if (items.length === 0) return false
  if (delta < 0 && !items.some((i) => i.indent > 0)) return false
  for (const { pos, indent } of items) {
    const next = Math.max(0, Math.min(MAX_INDENT, indent + delta))
    if (next !== indent) tr.setNodeAttribute(pos, 'indent', next)
  }
  return true
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabKey: {
      /** Shift the highlighted list items right (delta 1) or left (delta -1) by one tab stop. */
      shiftListItems: (delta: 1 | -1) => ReturnType
    }
  }
}

export const TabKey = Extension.create({
  name: 'tabKey',
  // Above the list and task-item extensions, whose own Tab bindings would otherwise run first.
  priority: 1000,

  addGlobalAttributes() {
    return [
      {
        types: LIST_ITEMS,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const m = /margin-left:\s*([\d.]+)px/.exec(el.getAttribute('style') ?? '')
              return m ? Math.max(0, Math.min(MAX_INDENT, Math.round(Number(m[1]) / INDENT_PX))) : 0
            },
            renderHTML: (attrs) => {
              const n = Number(attrs['indent'] ?? 0)
              return n > 0 ? { style: `margin-left: ${n * INDENT_PX}px` } : {}
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      shiftListItems:
        (delta) =>
        ({ tr, dispatch }) => {
          const changed = shiftItems(tr, delta)
          if (changed && dispatch) dispatch(tr)
          return changed
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('table')) return false
        const item = LIST_ITEMS.find((t) => editor.isActive(t))
        if (item) {
          const { from, to } = editor.state.selection
          const items = selectedItems(editor.state.tr)
          const single = from === to || items.length <= 1
          // A single item nests under the one above when it can; otherwise every
          // highlighted item shifts right together, bullets and numbers unchanged.
          if (single && editor.can().sinkListItem(item)) return editor.commands.sinkListItem(item)
          editor.commands.shiftListItems(1)
          return true // never type a tab over a list
        }
        return editor.commands.insertContent('\t')
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('table')) return false
        const item = LIST_ITEMS.find((t) => editor.isActive(t))
        if (item) {
          if (editor.commands.shiftListItems(-1)) return true
          if (editor.can().liftListItem(item)) return editor.commands.liftListItem(item)
          return true
        }
        // Remove a tab just before the cursor, if there is one.
        const { from } = editor.state.selection
        const before = editor.state.doc.textBetween(Math.max(0, from - 1), from)
        if (before === '\t') return editor.commands.deleteRange({ from: from - 1, to: from })
        return true
      }
    }
  }
})
