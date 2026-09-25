/**
 * Cell borders, set per side like a spreadsheet: none, thin, medium, or thick.
 * Stored on the cell so the editor and page.html draw the same lines.
 */
import { Extension } from '@tiptap/core'
import { TableMap, CellSelection, selectionCell } from '@tiptap/pm/tables'
import type { EditorState, Transaction } from '@tiptap/pm/state'

export type BorderWeight = 'none' | 'thin' | 'medium' | 'thick'
export type BorderSide = 'top' | 'right' | 'bottom' | 'left'
export type BorderTarget = 'all' | 'outside' | 'inside' | BorderSide
export type Borders = Partial<Record<BorderSide, BorderWeight>>

export const BORDER_CSS: Record<BorderWeight, string> = {
  none: 'hidden',
  thin: '1px solid #b9b7af',
  medium: '2px solid #2c2c2a',
  thick: '3px solid #2c2c2a'
}

export function bordersToStyle(borders: Borders | null | undefined): string {
  if (!borders) return ''
  return (['top', 'right', 'bottom', 'left'] as BorderSide[])
    .filter((s) => borders[s])
    .map((s) => (borders[s] === 'none' ? `border-${s}-style: hidden` : `border-${s}: ${BORDER_CSS[borders[s]!]}`))
    .join('; ')
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableBorders: {
      setCellBorders: (target: BorderTarget, weight: BorderWeight) => ReturnType
    }
  }
}

function apply(state: EditorState, tr: Transaction, target: BorderTarget, weight: BorderWeight): boolean {
  let $cell
  try {
    $cell = selectionCell(state)
  } catch {
    return false
  }
  const table = $cell.node(-1)
  const tableStart = $cell.start(-1)
  const map = TableMap.get(table)
  const cells: number[] = []
  const sel = state.selection
  if (sel instanceof CellSelection) sel.forEachCell((_n, pos) => cells.push(pos - tableStart))
  else cells.push($cell.pos - tableStart)
  const rects = cells.map((c) => map.findCell(c))
  const top = Math.min(...rects.map((r) => r.top))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  const left = Math.min(...rects.map((r) => r.left))
  const right = Math.max(...rects.map((r) => r.right))
  // Every cell inside the selected rectangle, not only the cells the selection touched.
  const inRect = new Set<number>()
  for (let r = top; r < bottom; r++) for (let c = left; c < right; c++) inRect.add(map.map[r * map.width + c]!)
  for (const cellPos of inRect) {
    const rect = map.findCell(cellPos)
    const sides: BorderSide[] = []
    const onTop = rect.top === top
    const onBottom = rect.bottom === bottom
    const onLeft = rect.left === left
    const onRight = rect.right === right
    if (target === 'all') sides.push('top', 'right', 'bottom', 'left')
    else if (target === 'outside') {
      if (onTop) sides.push('top')
      if (onBottom) sides.push('bottom')
      if (onLeft) sides.push('left')
      if (onRight) sides.push('right')
    } else if (target === 'inside') {
      if (!onTop) sides.push('top')
      if (!onBottom) sides.push('bottom')
      if (!onLeft) sides.push('left')
      if (!onRight) sides.push('right')
    } else if ((target === 'top' && onTop) || (target === 'bottom' && onBottom) || (target === 'left' && onLeft) || (target === 'right' && onRight)) sides.push(target)
    if (!sides.length) continue
    const node = table.nodeAt(cellPos)
    if (!node) continue
    const borders: Borders = { ...((node.attrs['borders'] as Borders | null) ?? {}) }
    for (const s of sides) borders[s] = weight
    tr.setNodeMarkup(tableStart + cellPos, undefined, { ...node.attrs, borders })
  }
  return true
}

export const TableBorders = Extension.create({
  name: 'tableBorders',
  addCommands() {
    return {
      setCellBorders:
        (target, weight) =>
        ({ state, tr, dispatch }) => {
          const ok = apply(state, tr, target, weight)
          if (ok && dispatch) dispatch(tr)
          return ok
        }
    }
  }
})
