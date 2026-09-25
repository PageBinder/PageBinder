import { PAPER_DIMENSIONS_IN, type PaperSettings } from '@shared/types'

export const DPI = 96

export function paperPixels(paper: PaperSettings): { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } } {
  let w: number
  let h: number
  if (paper.size === 'custom') {
    w = paper.widthIn ?? 8.5
    h = paper.heightIn ?? 11
  } else {
    ;[w, h] = PAPER_DIMENSIONS_IN[paper.size]
  }
  if (paper.orientation === 'landscape') [w, h] = [h, w]
  return {
    width: Math.round(w * DPI),
    height: Math.round(h * DPI),
    margins: {
      top: Math.round(paper.margins.top * DPI),
      right: Math.round(paper.margins.right * DPI),
      bottom: Math.round(paper.margins.bottom * DPI),
      left: Math.round(paper.margins.left * DPI)
    }
  }
}
