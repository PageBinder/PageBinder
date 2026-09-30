/**
 * Format painter: copy the look of some text and paint it onto other text, as in Word and OneNote.
 *
 * What is copied: the character formatting (font, size, colour, highlight, bold, italic, underline,
 * strike-through) and the paragraph's alignment and line spacing. Character formatting replaces the
 * painted text's own; paragraph formatting goes only to paragraphs the painted range covers whole.
 * One paint is one transaction, so a single Undo reverses it.
 */
import type { Editor } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'

const PAINT_MARKS = ['bold', 'italic', 'underline', 'strike', 'textStyle']
const PARAGRAPH_ATTRS = ['textAlign', 'lineHeight'] as const

export interface CapturedFormat {
  marks: Record<string, unknown>[]
  paragraph: Partial<Record<(typeof PARAGRAPH_ATTRS)[number], unknown>>
}

/** The formatting at the start of the editor's selection (or at the cursor). */
export function captureFormat(editor: Editor): CapturedFormat {
  const { state } = editor
  const { from, to, empty, $from } = state.selection
  let marks: readonly Mark[] = empty ? (state.storedMarks ?? $from.marks()) : []
  if (!empty) {
    let found: readonly Mark[] | null = null
    state.doc.nodesBetween(from, to, (node) => {
      if (found) return false
      if (node.isText) found = node.marks
      return true
    })
    marks = found ?? $from.marks()
  }
  const paragraph: CapturedFormat['paragraph'] = {}
  for (const a of PARAGRAPH_ATTRS) if (a in $from.parent.attrs) paragraph[a] = $from.parent.attrs[a]
  return { marks: marks.filter((m) => PAINT_MARKS.includes(m.type.name)).map((m) => m.toJSON() as Record<string, unknown>), paragraph }
}

/** The word around a document position, for a paint by a plain click. */
function wordAt(editor: Editor, pos: number): { from: number; to: number } | null {
  const $pos = editor.state.doc.resolve(pos)
  const parent = $pos.parent
  if (!parent.isTextblock) return null
  // One character per inline node, so offsets line up with document positions.
  const text = parent.textBetween(0, parent.content.size, undefined, '￼')
  const isWord = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}_'’-]/u.test(c)
  let a = $pos.parentOffset
  let b = $pos.parentOffset
  while (a > 0 && isWord(text[a - 1])) a--
  while (b < text.length && isWord(text[b])) b++
  if (a === b) return null
  const start = $pos.start()
  return { from: start + a, to: start + b }
}

/**
 * Paint `format` onto `target` (by default the editor's selection), or onto the word at that spot
 * when nothing is highlighted.
 */
export function applyFormat(editor: Editor, format: CapturedFormat, target?: { from: number; to: number }): boolean {
  const { state } = editor
  const sel = target ?? { from: state.selection.from, to: state.selection.to }
  const range = sel.from === sel.to ? wordAt(editor, sel.from) : sel
  if (!range) return false
  const { from, to } = range
  const tr = state.tr
  for (const name of PAINT_MARKS) {
    const type = state.schema.marks[name]
    if (type) tr.removeMark(from, to, type)
  }
  for (const json of format.marks) {
    try {
      tr.addMark(from, to, state.schema.markFromJSON(json))
    } catch {
      /* a mark this editor does not know */
    }
  }
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const whole = from <= pos + 1 && to >= pos + node.nodeSize - 1
    if (whole) {
      const attrs: Record<string, unknown> = { ...node.attrs }
      let changed = false
      for (const a of PARAGRAPH_ATTRS) {
        if (a in attrs && a in format.paragraph) {
          attrs[a] = format.paragraph[a]
          changed = true
        }
      }
      if (changed) tr.setNodeMarkup(pos, undefined, attrs)
    }
    return false
  })
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** The editor of the text box holding `el` (its text or its margins), if any. */
export function editorAt(el: Element | null): Editor | null {
  const dom = (el?.closest('.canvas .tiptap') ?? el?.closest('.canvas .text-container')?.querySelector('.tiptap')) as (HTMLElement & { editor?: Editor }) | null | undefined
  return dom?.editor ?? null
}

/** The browser's current selection inside `editor`, as document positions (it can be ahead of the editor's own). */
export function domSelectionRange(editor: Editor): { from: number; to: number } | null {
  const sel = window.getSelection()
  const view = editor.view
  if (!sel || !sel.rangeCount || !sel.anchorNode || !sel.focusNode) return null
  if (!view.dom.contains(sel.anchorNode) || !view.dom.contains(sel.focusNode)) return null
  try {
    const a = view.posAtDOM(sel.anchorNode, sel.anchorOffset)
    const f = view.posAtDOM(sel.focusNode, sel.focusOffset)
    return { from: Math.min(a, f), to: Math.max(a, f) }
  } catch {
    return null
  }
}
