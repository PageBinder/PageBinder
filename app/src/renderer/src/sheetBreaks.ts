/**
 * Sheet breaks in the editor, so a text box that runs across a page break looks the way it prints.
 *
 * When page.html is printed, its pagination script (src/shared/render/paginate.ts) moves every line
 * of text that would cross the bottom of a sheet's printable area, or that starts in a sheet's top
 * margin, to the top of the next printable area, splitting the paragraph there. When the line is a
 * block's first, the whole block moves instead, taking its bullet or checkbox with it. Tables, rules,
 * and empty paragraphs move whole.
 *
 * This module applies exactly the same rule to a live editor with ProseMirror decorations: a widget
 * (a zero-width block spacer) where a paragraph splits, and extra top margin where a block moves.
 * Nothing in the document changes and undo never sees it.
 *
 * Keep the rule, the selectors, and the order of work in step with paginate.ts: both must decide
 * identically, and the phase 8 suite compares them.
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

const EPS = 0.5
const CANDIDATES = 'p, h1, h2, h3, h4, h5, h6, pre, hr, table'
const TEXTBLOCK = /^(P|H[1-6]|PRE)$/

interface Line {
  node: Text
  offset: number
  top: number
  bottom: number
}

function setDecorations(editor: Editor, set: DecorationSet): void {
  editor.view.dispatch(editor.state.tr.setMeta(key, set).setMeta('addToHistory', false))
}

/** What moves when a block's first line moves: the list item or quote it opens, if any. */
function pushTarget(el: HTMLElement): HTMLElement {
  let t = el
  for (;;) {
    const p = t.parentElement
    if (!p || p.classList.contains('tiptap')) return t
    const first = p.firstElementChild
    if (p.tagName === 'LI') {
      if (first === t || (first && first.tagName === 'LABEL' && first.nextElementSibling === t)) {
        t = p
        continue
      }
      return t
    }
    if ((p.tagName === 'BLOCKQUOTE' || (p.tagName === 'DIV' && p.parentElement?.tagName === 'LI')) && first === t) {
      t = p
      continue
    }
    return t
  }
}

/**
 * Recompute the sheet-break layout of one editor. `canvas` is the unscaled canvas element and
 * `zoom` its scale, so positions come out in canvas pixels as page.html measures them.
 */
export function layoutSheetBreaks(editor: Editor, canvas: HTMLElement, zoom: number, g: SheetGeometry): void {
  if (editor.isDestroyed) return
  const view = editor.view
  const H = g.height
  const printableH = H - g.marginTop - g.marginBottom
  if (!(H > 0) || !(printableH > 0)) return

  // Start from the natural layout. DOM updates happen synchronously, so nothing is painted in between.
  const current = key.getState(editor.state)
  if (current && current.find().length) setDecorations(editor, DecorationSet.empty)

  const bandTop = (i: number): number => i * H + g.marginTop
  const bandBottom = (i: number): number => (i + 1) * H - g.marginBottom
  const sheetOf = (v: number): number => Math.max(0, Math.floor(v / H))
  // The canvas is measured again before every decision: adding space can make the browser adjust
  // the scroll position to keep the view steady, which moves the canvas on screen.
  let canvasTop = canvas.getBoundingClientRect().top
  const remeasure = (): void => {
    canvasTop = canvas.getBoundingClientRect().top
  }
  const y = (v: number): number => (v - canvasTop) / zoom

  const margins = new Map<number, Decoration>()
  const spacers: Decoration[] = []
  const commit = (): void => setDecorations(editor, DecorationSet.create(editor.state.doc, [...margins.values(), ...spacers]))

  // Block elements back to document positions, for the margin decorations.
  let positions = new Map<Element, number>()
  const mapPositions = (): void => {
    positions = new Map()
    editor.state.doc.descendants((node, pos) => {
      if (!node.isBlock) return true
      const dom = view.nodeDOM(pos)
      if (dom instanceof Element) positions.set(dom, pos)
      return true
    })
  }
  mapPositions()
  const posOf = (el: Element): number | undefined => {
    const direct = positions.get(el) ?? (el.parentElement ? positions.get(el.parentElement) : undefined)
    if (direct !== undefined) return direct
    mapPositions()
    return positions.get(el) ?? (el.parentElement ? positions.get(el.parentElement) : undefined)
  }

  // The lines of a text block: where each starts, and the top and bottom of its characters.
  const linesOf = (block: HTMLElement): Line[] => {
    const out: Line[] = []
    let prev: DOMRect | null = null
    let cur: Line | null = null
    const range = document.createRange()
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const text = n.data
      for (let k = 0; k < text.length; k++) {
        const c = text.charAt(k)
        if (c === '\n' || c === '\r') continue
        range.setStart(n, k)
        range.setEnd(n, k + 1)
        const r = range.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (!prev || !cur || r.left < prev.left - EPS || r.top >= prev.bottom - EPS) {
          cur = { node: n, offset: k, top: y(r.top), bottom: y(r.bottom) }
          out.push(cur)
        } else {
          cur.top = Math.min(cur.top, y(r.top))
          cur.bottom = Math.max(cur.bottom, y(r.bottom))
        }
        prev = r
      }
    }
    return out
  }

  const pushBlock = (el: HTMLElement, dest: number): boolean => {
    const t = pushTarget(el)
    const shift = dest - y(t.getBoundingClientRect().top)
    if (shift <= EPS) return false
    const pos = posOf(t)
    if (pos === undefined) return false
    const node = editor.state.doc.nodeAt(pos)
    const dom = view.nodeDOM(pos)
    if (!node || !(dom instanceof HTMLElement)) return false
    const margin = (parseFloat(getComputedStyle(dom).marginTop) || 0) + shift
    margins.set(pos, Decoration.node(pos, pos + node.nodeSize, { style: `margin-top: ${margin}px`, 'data-sheet-break': '' }))
    commit()
    return true
  }

  const splitBefore = (line: Line, dest: number): boolean => {
    const pos = view.posAtDOM(line.node, line.offset)
    const spacer = document.createElement('span')
    spacer.setAttribute('data-sheet-spacer', '')
    spacer.style.display = 'block'
    spacer.style.height = '0px'
    // Drawn before a cursor at this position, so the cursor sits at the start of the moved line.
    spacers.push(Decoration.widget(pos, spacer, { side: -1, ignoreSelection: true, key: `sheet-spacer-${pos}` }))
    commit()
    remeasure()
    const h = dest - y(spacer.getBoundingClientRect().top)
    if (h <= EPS) {
      spacers.pop()
      commit()
      return false
    }
    // The widget's own element: ProseMirror ignores changes to its style.
    spacer.style.height = `${h}px`
    return true
  }

  // One change to a block, or false when it needs none.
  const step = (el: HTMLElement): boolean => {
    remeasure()
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return false
    const top = y(rect.top)
    const bottom = y(rect.bottom)
    const i = sheetOf(top)
    if (top >= bandTop(i) - EPS && bottom <= bandBottom(i) + EPS) return false
    const lines = TEXTBLOCK.test(el.tagName) ? linesOf(el) : []
    if (!lines.length) {
      if (el.tagName === 'TABLE' && rect.height / zoom > printableH) return false
      return pushBlock(el, top < bandTop(i) - EPS ? bandTop(i) : bandTop(i + 1))
    }
    for (let k = 0; k < lines.length; k++) {
      const L = lines[k]!
      const j = sheetOf(L.top)
      let dest = -1
      if (L.top < bandTop(j) - EPS) dest = bandTop(j)
      else if (L.bottom > bandBottom(j) + EPS) dest = bandTop(j + 1)
      if (dest < 0) continue
      if (k === 0 ? pushBlock(el, dest) : splitBefore(L, dest)) return true
    }
    return false
  }

  const root = view.dom as HTMLElement
  const query = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES))
  let blocks = query()
  for (let b = 0; b < blocks.length; b++) {
    // Text inside a table moves with its table.
    if (blocks[b]!.parentElement?.closest('td, th')) continue
    for (let tries = 0; tries < 400; tries++) {
      if (!blocks[b]!.isConnected) blocks = query()
      const el = blocks[b]
      if (!el || !step(el)) break
    }
  }
}
