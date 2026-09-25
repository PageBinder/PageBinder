/**
 * Row height and column width for the current cell or the highlighted cells.
 */
import { Extension } from '@tiptap/core'
import { TableMap, CellSelection, selectionCell } from '@tiptap/pm/tables'
import type { EditorState, Transaction } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableSizing: {
      setRowHeight: (height: number | null) => ReturnType
      setColumnWidth: (width: number | null) => ReturnType
    }
  }
}

interface Target {
  tableStart: number
  map: TableMap
  rows: Set<number>
  cols: Set<number>
}

/** Rows and columns covered by the selection: a cell selection or the cell holding the cursor. */
export function selectedRowsAndCols(state: EditorState): Target | null {
  let $cell
  try {
    $cell = selectionCell(state)
  } catch {
    return null
  }
  const table = $cell.node(-1)
  const tableStart = $cell.start(-1)
  const map = TableMap.get(table)
  const rows = new Set<number>()
  const cols = new Set<number>()
  const add = (cellPos: number): void => {
    const rect = map.findCell(cellPos)
    for (let r = rect.top; r < rect.bottom; r++) rows.add(r)
    for (let c = rect.left; c < rect.right; c++) cols.add(c)
  }
  const sel = state.selection
  if (sel instanceof CellSelection) sel.forEachCell((_node, pos) => add(pos - tableStart))
  else add($cell.pos - tableStart)
  return { tableStart, map, rows, cols }
}

/** Current height of the first selected row and width of the first selected column, for dialogs. */
export function currentSizes(state: EditorState): { rowHeight: number | null; columnWidth: number | null; cells: number } | null {
  const t = selectedRowsAndCols(state)
  if (!t) return null
  const table = state.doc.nodeAt(t.tableStart - 1)
  if (!table) return null
  const firstRow = Math.min(...t.rows)
  const firstCol = Math.min(...t.cols)
  const row = table.child(firstRow)
  const cellPos = t.map.map[firstRow * t.map.width + firstCol]
  const cell = cellPos !== undefined ? table.nodeAt(cellPos) : null
  const widths = (cell?.attrs['colwidth'] as number[] | null) ?? null
  return { rowHeight: (row.attrs['height'] as number | null) ?? null, columnWidth: widths?.[0] ?? null, cells: t.rows.size * t.cols.size }
}

function applyRowHeight(state: EditorState, tr: Transaction, height: number | null): boolean {
  const t = selectedRowsAndCols(state)
  if (!t) return false
  const table = state.doc.nodeAt(t.tableStart - 1)
  if (!table) return false
  table.forEach((row, offset, index) => {
    if (t.rows.has(index)) tr.setNodeMarkup(t.tableStart + offset, undefined, { ...row.attrs, height })
  })
  return true
}

function applyColumnWidth(state: EditorState, tr: Transaction, width: number | null): boolean {
  const t = selectedRowsAndCols(state)
  if (!t) return false
  const table = state.doc.nodeAt(t.tableStart - 1)
  if (!table) return false
  const seen = new Set<number>()
  for (let r = 0; r < t.map.height; r++) {
    for (const c of t.cols) {
      const cellPos = t.map.map[r * t.map.width + c]
      if (cellPos === undefined || seen.has(cellPos)) continue
      seen.add(cellPos)
      const cell = table.nodeAt(cellPos)
      if (!cell) continue
      const rect = t.map.findCell(cellPos)
      const span = rect.right - rect.left
      const existing = (cell.attrs['colwidth'] as number[] | null) ?? null
      let colwidth: number[] | null
      if (width === null) colwidth = null
      else {
        colwidth = Array.from({ length: span }, (_, i) => existing?.[i] ?? width)
        for (let i = 0; i < span; i++) if (t.cols.has(rect.left + i)) colwidth[i] = width
      }
      tr.setNodeMarkup(t.tableStart + cellPos, undefined, { ...cell.attrs, colwidth })
    }
  }
  return true
}

export const TableSizing = Extension.create({
  name: 'tableSizing',
  addCommands() {
    return {
      setRowHeight:
        (height) =>
        ({ state, tr, dispatch }) => {
          const ok = applyRowHeight(state, tr, height)
          if (ok && dispatch) dispatch(tr)
          return ok
        },
      setColumnWidth:
        (width) =>
        ({ state, tr, dispatch }) => {
          const ok = applyColumnWidth(state, tr, width)
          if (ok && dispatch) dispatch(tr)
          return ok
        }
    }
  }
})
