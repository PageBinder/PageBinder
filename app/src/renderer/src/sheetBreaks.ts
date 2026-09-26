/**
 * Sheet breaks in the editor, so a text box that runs across a page break looks the way it prints.
 *
 * When page.html is printed, its pagination script (src/shared/render/paginate.ts) pushes every
 * paragraph, list item, and table that would straddle a sheet boundary down to the top of the next
 * sheet's printable area, and moves any that start in a sheet's top margin down to that sheet's
 * printable area. This module applies exactly the same rule to a live editor, as ProseMirror node
 * decorations (extra top margin), so nothing in the document changes and undo never sees it.
 *
 * Keep the selector and the rule in step with paginate.ts: they must decide identically.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'

/** The paper geometry that decides where sheet boundaries fall, in canvas pixels. */
export interface SheetGeometry {
  height: number
  marginTop: number
  marginBottom: number
}

const key = new PluginKey<DecorationSet>('sheetBreaks')

export const SheetBreaks = Extension.create({
  name: 'sheetBreaks',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const next = tr.getMeta(key) as DecorationSet | undefined
            return next ?? set.map(tr.mapping, tr.doc)
          }
        },
        props: { decorations: (state) => key.getState(state) }
      })
    ]
  }
})

/** Blocks the print script considers, relative to the editor's root (the .tiptap element). */
const BLOCKS = ':scope > *, li, table, blockquote > *'

function setDecorations(editor: Editor, set: DecorationSet): void {
  const tr = editor.state.tr.setMeta(key, set).setMeta('addToHistory', false)
  editor.view.dispatch(tr)
}

/**
 * Recompute the sheet-break spacing of one editor. `canvas` is the unscaled canvas element and
 * `zoom` its scale, so positions come out in canvas pixels as page.html measures them.
 */
export function layoutSheetBreaks(editor: Editor, canvas: HTMLElement, zoom: number, g: SheetGeometry): void {
  if (editor.isDestroyed) return
  const view = editor.view
  const H = g.height
  const printableH = H - g.marginTop - g.marginBottom
  if (!(H > 0) || !(printableH > 0)) return

  // Start from the natural layout: DOM updates happen synchronously, so nothing is painted in between.
  const current = key.getState(editor.state)
  if (current && current !== DecorationSet.empty && current.find().length) setDecorations(editor, DecorationSet.empty)

  const bandTop = (i: number): number => i * H + g.marginTop
  const bandBottom = (i: number): number => (i + 1) * H - g.marginBottom
  const sheetOf = (y: number): number => Math.max(0, Math.floor(y / H))
  const canvasTop = canvas.getBoundingClientRect().top

  // Map each block element back to its node, so the spacing can be added as a decoration.
  const positions = new Map<Element, number>()
  editor.state.doc.descendants((node, pos) => {
    if (!node.isBlock) return true
    const dom = view.nodeDOM(pos)
    if (dom instanceof Element) positions.set(dom, pos)
    return true
  })
  const posOf = (el: Element): number | undefined => positions.get(el) ?? (el.parentElement ? positions.get(el.parentElement) : undefined)

  const decorations: Decoration[] = []
  const blocks = (view.dom as HTMLElement).querySelectorAll(BLOCKS)
  for (let k = 0; k < blocks.length; k++) {
    const el = blocks[k] as HTMLElement
    if (el.querySelector('table') && el.tagName !== 'TABLE') continue
    const r = el.getBoundingClientRect()
    const top = (r.top - canvasTop) / zoom
    const bottom = (r.bottom - canvasTop) / zoom
    const h = r.height / zoom
    if (h <= 0 || h > printableH) continue
    const i = sheetOf(top)
    let shift = 0
    if (top < bandTop(i)) shift = bandTop(i) - top
    else if (bottom > bandBottom(i)) shift = bandTop(i + 1) - top
    if (shift <= 0.5) continue
    const pos = posOf(el)
    if (pos === undefined) continue
    const node = editor.state.doc.nodeAt(pos)
    if (!node) continue
    const margin = (parseFloat(getComputedStyle(el).marginTop) || 0) + shift
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `margin-top: ${margin}px`, 'data-sheet-break': '' }))
    // Apply at once, so every later block is measured where it will really be, as the print script does.
    setDecorations(editor, DecorationSet.create(editor.state.doc, decorations))
  }
}
