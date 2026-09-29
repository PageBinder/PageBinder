/**
 * Pictures inside a text box: part of the text, in line with a line of text or floated to the
 * left or right with the text wrapping beside it. They move with their paragraph and print the
 * same as on screen, because the editor and page.html render them from this one definition.
 *
 * The page stores only the picture's file name in its images folder (plus its original name, width
 * as a percentage of the text box, and wrap). The address is built when rendering, from the
 * `imageBase` option: the page's images folder in the editor, `images/` in page.html. The file is
 * also listed in the page's manifest, like every picture, so Verify, page copies, and templates
 * keep it.
 */
import { Node } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

export type TextImageWrap = 'inline' | 'left' | 'right'
export const TEXT_IMAGE_WIDTHS = [25, 50, 75, 100] as const

export interface TextImageAttrs {
  name: string
  originalName: string
  width: number
  wrap: TextImageWrap
}

export interface TextImageOptions {
  /** Prefix for the picture's address, ending in a slash. */
  imageBase: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textImage: {
      /** Insert pictures at the cursor. */
      insertTextImages: (images: { name: string; originalName: string }[]) => ReturnType
      /** Change the width or wrap of the selected picture. */
      updateTextImage: (attrs: Partial<Pick<TextImageAttrs, 'width' | 'wrap'>>) => ReturnType
    }
  }
}

const WRAPS: TextImageWrap[] = ['inline', 'left', 'right']

export const TextImage = Node.create<TextImageOptions>({
  name: 'textImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { imageBase: 'images/' }
  },

  addAttributes() {
    // Rendered by renderHTML below, so none of these writes its own HTML attribute.
    return {
      name: { default: '', parseHTML: (el) => el.getAttribute('data-name') ?? '', renderHTML: () => ({}) },
      originalName: { default: '', parseHTML: (el) => el.getAttribute('alt') ?? '', renderHTML: () => ({}) },
      width: {
        default: 50,
        parseHTML: (el) => {
          const w = Number(el.getAttribute('data-width'))
          return w > 0 && w <= 100 ? w : 50
        },
        renderHTML: () => ({})
      },
      wrap: {
        default: 'inline',
        parseHTML: (el) => {
          const w = el.getAttribute('data-wrap') as TextImageWrap | null
          return w && WRAPS.includes(w) ? w : 'inline'
        },
        renderHTML: () => ({})
      }
    }
  },

  // Only PageBinder's own pictures are taken from pasted HTML; other images need a file first.
  parseHTML() {
    return [{ tag: 'img[data-name]' }]
  },

  renderHTML({ node }) {
    const a = node.attrs as TextImageAttrs
    const wrap = WRAPS.includes(a.wrap) ? a.wrap : 'inline'
    const width = a.width > 0 && a.width <= 100 ? a.width : 50
    return [
      'img',
      {
        src: `${this.options.imageBase}${encodeURIComponent(a.name)}`,
        alt: a.originalName,
        'data-name': a.name,
        'data-width': String(width),
        'data-wrap': wrap,
        class: `text-image wrap-${wrap}`,
        style: `width: ${width}%`
      }
    ]
  },

  addCommands() {
    return {
      insertTextImages:
        (images) =>
        ({ chain }) =>
          chain()
            .insertContent(images.map((i) => ({ type: this.name, attrs: { name: i.name, originalName: i.originalName, width: 50, wrap: 'inline' } })))
            .run(),
      updateTextImage:
        (attrs) =>
        ({ state, tr, dispatch }) => {
          const sel = state.selection
          if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name) return false
          if (dispatch) {
            tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, ...attrs })
            tr.setSelection(NodeSelection.create(tr.doc, sel.from))
            dispatch(tr)
          }
          return true
        }
    }
  }
})

/** Every picture name used by text content, for copying pictures along with a text box. */
export function textImageNames(content: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const node = n as { type?: string; attrs?: { name?: string }; content?: unknown[] }
    if (node.type === 'textImage' && node.attrs?.name) out.push(node.attrs.name)
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(content)
  return out
}

/** A copy of text content with picture names replaced, after the pictures were copied under new names. */
export function renameTextImages<T>(content: T, rename: (name: string) => string | undefined): T {
  const walk = (n: unknown): unknown => {
    if (!n || typeof n !== 'object') return n
    const node = n as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
    const next: Record<string, unknown> = { ...node }
    if (node.type === 'textImage' && typeof node.attrs?.['name'] === 'string') {
      const to = rename(node.attrs['name'] as string)
      if (to) next['attrs'] = { ...node.attrs, name: to }
    }
    if (Array.isArray(node.content)) next['content'] = node.content.map(walk)
    return next
  }
  return walk(content) as T
}
