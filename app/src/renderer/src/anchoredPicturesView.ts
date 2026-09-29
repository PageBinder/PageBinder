/**
 * Pictures anchored in a text box, drawn in the editor as ProseMirror widgets: the floats from
 * anchoredPictures.ts placed at the start of the first paragraph, exactly where page.html puts
 * them. Nothing in the document changes; the pictures live in the text box's `pictures` list.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import type { AnchoredPicture } from '@shared/types'
import { floatLayout } from '@shared/render/anchoredPictures'

const key = new PluginKey<DecorationSet>('anchoredPictures')

export type Corner = 'tl' | 'tr' | 'bl' | 'br'
/** How close to a corner, in screen pixels, a press resizes rather than moves. */
const GRIP = 14

function cornerAt(frame: HTMLElement, e: MouseEvent): Corner | null {
  const r = frame.getBoundingClientRect()
  const grip = Math.min(GRIP, r.width / 3, r.height / 3)
  const left = e.clientX - r.left < grip, right = r.right - e.clientX < grip
  const top = e.clientY - r.top < grip, bottom = r.bottom - e.clientY < grip
  if (top && left) return 'tl'
  if (top && right) return 'tr'
  if (bottom && left) return 'bl'
  if (bottom && right) return 'br'
  return null
}

export const AnchoredPictures = Extension.create({
  name: 'anchoredPictures',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => (tr.getMeta(key) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc)
        },
        props: { decorations: (state) => key.getState(state) }
      })
    ]
  }
})

export interface PictureHandlers {
  selectedId: string | null
  imageBase: string
  /** A press on a picture: in its middle to move it, near a corner to resize it from that corner. */
  onPress: (id: string, event: MouseEvent, grip: Corner | null) => void
}

export function drawAnchoredPictures(editor: Editor, pictures: AnchoredPicture[] | undefined, boxWidth: number, h: PictureHandlers): void {
  if (editor.isDestroyed) return
  const floats = floatLayout(pictures, boxWidth)
  // The start of the first paragraph or heading.
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (pos >= 0) return false
    if (node.isTextblock) {
      pos = p + 1
      return false
    }
    return true
  })
  const decorations =
    pos < 0
      ? []
      : floats.map((f, i) => {
          const selected = !!f.picture && f.picture.id === h.selectedId
          return Decoration.widget(
            pos,
            () => {
              const frame = document.createElement('span')
              frame.contentEditable = 'false'
              if (f.kind === 'pusher') {
                frame.className = 'anchored-pusher'
                frame.setAttribute('style', `display: block; ${f.style}`)
                return frame
              }
              const p = f.picture!
              frame.className = `anchored-picture-frame${selected ? ' selected' : ''}`
              frame.dataset['id'] = p.id
              frame.setAttribute('style', `display: block; position: relative; ${f.style}`)
              frame.title = `${p.originalName}: drag to move, drag a corner to resize`
              const img = document.createElement('img')
              img.className = 'anchored-picture'
              img.src = h.imageBase + encodeURIComponent(p.name)
              img.alt = p.originalName
              img.draggable = false
              img.setAttribute('style', 'display: block; width: 100%; height: 100%; pointer-events: none')
              // A mark in each corner shows where to grab; the whole corner area is the grip.
              const marks = (['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => {
                const m = document.createElement('span')
                m.className = `anchored-corner ${c}`
                return m
              })
              frame.append(img, ...marks)
              frame.addEventListener('mousemove', (e) => {
                const c = cornerAt(frame, e)
                frame.style.cursor = c === 'tl' || c === 'br' ? 'nwse-resize' : c ? 'nesw-resize' : 'move'
              })
              frame.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return
                h.onPress(p.id, e, cornerAt(frame, e))
              })
              return frame
            },
            { side: -1000 + i, ignoreSelection: true, stopEvent: () => true, key: `anchored-${i}-${f.kind}-${f.picture?.id ?? ''}-${f.style}-${selected}-${f.picture?.name ?? ''}` }
          )
        })
  editor.view.dispatch(editor.state.tr.setMeta(key, DecorationSet.create(editor.state.doc, decorations)).setMeta('addToHistory', false))
}
