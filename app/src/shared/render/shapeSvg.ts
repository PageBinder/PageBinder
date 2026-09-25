/**
 * SVG markup for drawn shapes, shared by the editor and page.html so both
 * draw exactly the same thing.
 */
import type { ShapeObject } from '../types'

function esc(s: string): string {
  return s.replace(/[<>"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' })[c] ?? c)
}

export function shapeSvgInner(obj: ShapeObject): string {
  const sw = obj.strokeWidth
  const stroke = esc(obj.stroke)
  const fill = obj.fill ? esc(obj.fill) : 'none'
  const w = Math.max(1, obj.width)
  const h = Math.max(1, obj.height)
  if (obj.shape === 'rect') {
    return `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
  }
  if (obj.shape === 'ellipse') {
    return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - sw / 2)}" ry="${Math.max(0, h / 2 - sw / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
  }
  const a = obj.a ?? { x: obj.x, y: obj.y }
  const b = obj.b ?? { x: obj.x + obj.width, y: obj.y + obj.height }
  const x1 = a.x - obj.x
  const y1 = a.y - obj.y
  const x2 = b.x - obj.x
  const y2 = b.y - obj.y
  if (obj.shape === 'arrow') {
    const id = `arrow-${obj.id}`
    return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${Math.max(6, sw * 4)}" markerHeight="${Math.max(6, sw * 4)}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" marker-end="url(#${id})"/>`
  }
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`
}

export function shapeSvg(obj: ShapeObject, extraAttrs = ''): string {
  const w = Math.max(1, obj.width)
  const h = Math.max(1, obj.height)
  return `<svg class="shape-svg" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible;display:block" ${extraAttrs}>${shapeSvgInner(obj)}</svg>`
}

/** Bounding box for a line between two points, padded for the stroke. */
export function lineBox(a: { x: number; y: number }, b: { x: number; y: number }, strokeWidth: number): { x: number; y: number; width: number; height: number } {
  const pad = Math.ceil(strokeWidth / 2) + 4
  const x = Math.min(a.x, b.x) - pad
  const y = Math.min(a.y, b.y) - pad
  return { x, y, width: Math.abs(b.x - a.x) + pad * 2, height: Math.abs(b.y - a.y) + pad * 2 }
}

/** Snap a line end to horizontal or vertical when it is nearly so. */
export function snapLineEnd(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const tolerance = Math.max(4, 0.06 * Math.max(Math.abs(dx), Math.abs(dy)))
  if (Math.abs(dy) <= tolerance && Math.abs(dx) > Math.abs(dy)) return { x: b.x, y: a.y }
  if (Math.abs(dx) <= tolerance && Math.abs(dy) >= Math.abs(dx)) return { x: a.x, y: b.y }
  return b
}
