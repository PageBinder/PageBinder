/**
 * Pasting cells into a table copies only the cells' content (text with its
 * formatting) into the target cells. The target table keeps its own widths,
 * fills, and borders. Without this, pasted cells bring their formatting along.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TableMap, CellSelection, selectionCell } from '@tiptap/pm/tables'
import type { Node as PMNode, Slice } from '@tiptap/pm/model'

/** Rows of cell nodes found in a pasted slice, or null if it holds no table. */
function cellsInSlice(slice: Slice): PMNode[][] | null {
  let table: PMNode | null = null
  slice.content.descendants((node) => {
    if (table) return false
    if (node.type.name === 'table') {
      table = node
      return false
    }
    return true
  })
  if (!table) {
    // A bare set of rows (ProseMirror copies cell selections as rows).
    const rows: PMNode[][] = []
    slice.content.forEach((node) => {
      if (node.type.name === 'tableRow') {
        const cells: PMNode[] = []
        node.forEach((c) => cells.push(c))
        rows.push(cells)
      }
    })
    return rows.length ? rows : null
  }
  const rows: PMNode[][] = []
  ;(table as PMNode).forEach((row) => {
    const cells: PMNode[] = []
    row.forEach((c) => cells.push(c))
    rows.push(cells)
  })
  return rows
}

export const TableContentPaste = Extension.create({
  name: 'tableContentPaste',
  priority: 1100,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tableContentPaste'),
        props: {
          handlePaste: (view, _event, slice) => {
            const { state } = view
            let $cell
            try {
              $cell = selectionCell(state)
            } catch {
              return false
            }
            const rows = cellsInSlice(slice)
            if (!rows) return false
            const table = $cell.node(-1)
            const tableStart = $cell.start(-1)
            const map = TableMap.get(table)
            const sel = state.selection
            let top: number
            let left: number
            if (sel instanceof CellSelection) {
              const rect = map.rectBetween(sel.$anchorCell.pos - tableStart, sel.$headCell.pos - tableStart)
              top = rect.top
              left = rect.left
            } else {
              const rect = map.findCell($cell.pos - tableStart)
              top = rect.top
              left = rect.left
            }
            const tr = state.tr
            // Replace content cell by cell, from the bottom right up so earlier positions stay valid.
            const edits: { pos: number; node: PMNode; source: PMNode }[] = []
            rows.forEach((cells, r) =>
              cells.forEach((source, c) => {
                const row = top + r
                const col = left + c
                if (row >= map.height || col >= map.width) return
                const pos = map.map[row * map.width + col]!
                const node = table.nodeAt(pos)
                if (node) edits.push({ pos, node, source })
              })
            )
            const seen = new Set<number>()
            for (const e of edits.sort((a, b) => b.pos - a.pos)) {
              if (seen.has(e.pos)) continue
              seen.add(e.pos)
              const from = tableStart + e.pos + 1
              const to = from + e.node.content.size
              tr.replaceWith(from, to, e.source.content)
            }
            view.dispatch(tr.scrollIntoView())
            return true
          }
        }
      })
    ]
  }
})
