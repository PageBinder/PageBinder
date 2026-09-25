import type { CanvasObject } from '@shared/types'

export interface SnapResult {
  x: number
  y: number
  guideX?: number
  guideY?: number
}

const TOLERANCE = 6
const GRID = 8

/**
 * Snap a dragged object's top-left corner to the margins, to the edges of
 * other objects, and optionally to an 8 px grid. Returns guide lines to draw.
 */
export function snapPosition(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  objects: CanvasObject[],
  heights: Record<string, number>,
  paper: { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } },
  useGrid: boolean
): SnapResult {
  // Edges: margins and the edges of other objects. Centers: the printable
  // area's center line and the centers of other objects.
  const xs: number[] = [paper.margins.left, paper.width - paper.margins.right - width, (paper.margins.left + paper.width - paper.margins.right) / 2 - width / 2]
  const ys: number[] = [paper.margins.top]
  for (const o of objects) {
    if (o.id === id) continue
    const h = o.kind === 'image' ? o.height : (heights[o.id] ?? 48)
    xs.push(o.x, o.x + o.width - width, o.x + o.width / 2 - width / 2)
    ys.push(o.y, o.y + h + 8, o.y + h - height, o.y + h / 2 - height / 2)
  }
  let best: SnapResult = { x, y }
  let dx = TOLERANCE + 1
  for (const c of xs) {
    const d = Math.abs(c - x)
    if (d < dx) {
      dx = d
      best = { ...best, x: Math.round(c), guideX: Math.round(c) }
    }
  }
  let dy = TOLERANCE + 1
  for (const c of ys) {
    const d = Math.abs(c - y)
    if (d < dy) {
      dy = d
      best = { ...best, y: Math.round(c), guideY: Math.round(c) }
    }
  }
  if (dx > TOLERANCE) {
    best.x = useGrid ? Math.round(x / GRID) * GRID : x
    delete best.guideX
  }
  if (dy > TOLERANCE) {
    best.y = useGrid ? Math.round(y / GRID) * GRID : y
    delete best.guideY
  }
  return best
}
