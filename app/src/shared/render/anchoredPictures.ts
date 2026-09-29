/**
 * Layout of pictures anchored in a text box, shared by the editor and page.html so both place them
 * identically.
 *
 * CSS floats make the text flow beside a picture. A float cannot be placed at an arbitrary height,
 * so each picture is preceded by an invisible zero-width "pusher" float on its side whose height
 * brings the picture down to its stored position. Pictures in the left half of the box float left
 * (text flows on their right); pictures in the right half float right. The floats sit at the very
 * start of the first paragraph, in the editor as ProseMirror widgets and in page.html as HTML.
 *
 * CSS never places a float above an earlier float, and floats on the same side stack, so the
 * pusher heights account for both. Where pictures would overlap, the later one sits below.
 */
import type { AnchoredPicture } from '../types'

/** The text area of a text box: its width less a 1 px border and 10 px padding on each side. */
export const TEXT_BOX_INSET = 11
export const textAreaWidth = (boxWidth: number): number => Math.max(40, boxWidth - 2 * TEXT_BOX_INSET)
/** Space between a picture and the text beside it. */
export const PICTURE_GAP = 10
export const MIN_PICTURE_SIZE = 16

export type FloatSide = 'left' | 'right'

export interface FloatBox {
  kind: 'pusher' | 'picture'
  side: FloatSide
  /** Inline CSS for the float. */
  style: string
  picture?: AnchoredPicture
}

/** Width and height kept within the text area, with the aspect ratio kept. */
export function fitPicture(p: AnchoredPicture, areaWidth: number): { width: number; height: number } {
  const width = Math.max(MIN_PICTURE_SIZE, Math.min(p.width, areaWidth))
  const height = Math.max(MIN_PICTURE_SIZE, Math.round((p.height * width) / Math.max(1, p.width)))
  return { width: Math.round(width), height }
}

export function floatLayout(pictures: AnchoredPicture[] | undefined, boxWidth: number): FloatBox[] {
  if (!pictures?.length) return []
  const area = textAreaWidth(boxWidth)
  const sorted = [...pictures].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: FloatBox[] = []
  const cursor: Record<FloatSide, number> = { left: 0, right: 0 }
  let lastTop = 0
  for (const p of sorted) {
    const { width, height } = fitPicture(p, area)
    const x = Math.max(0, Math.min(p.x, area - width))
    const side: FloatSide = x + width / 2 <= area / 2 ? 'left' : 'right'
    const start = Math.max(cursor[side], lastTop)
    const gap = Math.max(0, Math.round(Math.max(0, p.y) - start))
    out.push({ kind: 'pusher', side, style: `float: ${side}; clear: ${side}; width: 0; height: ${gap}px; margin: 0; padding: 0` })
    const top = start + gap
    // Offset from its own edge of the text area, and a gap on the side the text is on.
    const offset = side === 'left' ? x : area - x - width
    const margins = side === 'left' ? `margin: 0 ${PICTURE_GAP}px 0 ${Math.round(offset)}px` : `margin: 0 ${Math.round(offset)}px 0 ${PICTURE_GAP}px`
    out.push({ kind: 'picture', side, picture: p, style: `float: ${side}; clear: ${side}; width: ${width}px; height: ${height}px; ${margins}` })
    lastTop = top
    cursor[side] = top + height
  }
  return out
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The floats as HTML, for page.html: placed at the start of the text box's first paragraph. */
export function floatsHtml(pictures: AnchoredPicture[] | undefined, boxWidth: number, imageBase: string): string {
  return floatLayout(pictures, boxWidth)
    .map((f) =>
      f.kind === 'pusher'
        ? `<span class="anchored-pusher" style="display: block; ${f.style}"></span>`
        : `<img class="anchored-picture" data-id="${attr(f.picture!.id)}" src="${attr(imageBase + encodeURIComponent(f.picture!.name))}" alt="${attr(f.picture!.originalName)}" style="display: block; ${f.style}">`
    )
    .join('')
}

/** Put the floats at the start of the first paragraph or heading of rendered text-box HTML. */
export function withFloats(innerHtml: string, floats: string): string {
  if (!floats) return innerHtml
  const m = /<(p|h[1-6])(\s[^>]*)?>/i.exec(innerHtml)
  if (!m) return `<p>${floats}</p>${innerHtml}`
  const at = m.index + m[0].length
  return innerHtml.slice(0, at) + floats + innerHtml.slice(at)
}
