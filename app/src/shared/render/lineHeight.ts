/**
 * Line spacing for paragraphs and headings, set from the ribbon or a text box's right-click menu.
 *
 * Stored as a paragraph attribute (`lineHeight`: a multiple of the font size) and rendered as an
 * inline style, so the editor and page.html lay text out identically. The standard spacing, 1.5,
 * is stored as no attribute at all, which keeps pages that never change it exactly as before.
 * A new paragraph made with Enter keeps the spacing of the one it was split from.
 *
 * TextStyleKit's own character-level line height is switched off in extensions.ts: spacing is a
 * property of the paragraph, as in a word processor.
 */
import { Extension } from '@tiptap/core'

/** The choices offered, as stored values. */
export const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3'] as const
/** The spacing text has when no line spacing is set (the .tiptap rule in docCss). */
export const STANDARD_LINE_HEIGHT = '1.5'

export function lineHeightLabel(value: string): string {
  return value.includes('.') ? value : `${value}.0`
}

const TYPES = ['paragraph', 'heading']

/** A stored value, or null for the standard spacing or anything not offered. */
function normalise(value: string | null | undefined): string | null {
  if (!value) return null
  const v = String(Number(value))
  return v === STANDARD_LINE_HEIGHT || !(LINE_HEIGHTS as readonly string[]).includes(v) ? null : v
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      /** Set the line spacing of every paragraph and heading the selection touches (null: standard). */
      setParagraphSpacing: (value: string | null) => ReturnType
    }
  }
}

export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          lineHeight: {
            default: null,
            // Pasted text keeps only the spacings offered here, never a stray pixel line height.
            parseHTML: (el) => normalise(el.style.lineHeight),
            renderHTML: (attrs) => {
              const v = normalise(attrs['lineHeight'] as string | null)
              // An empty paragraph is one line tall at its own spacing.
              return v ? { style: `line-height: ${v}; min-height: ${v}em` } : {}
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setParagraphSpacing:
        (value) =>
        ({ tr, state, dispatch }) => {
          const v = normalise(value)
          const { from, to } = state.selection
          let changed = false
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (TYPES.includes(node.type.name) && (node.attrs['lineHeight'] ?? null) !== v) {
              tr.setNodeAttribute(pos, 'lineHeight', v)
              changed = true
            }
            return true
          })
          if (changed && dispatch) dispatch(tr)
          return true
        }
    }
  }
})
