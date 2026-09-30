import type { JSX } from 'react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useActiveEditor } from '../editorContext'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { applyFormat, captureFormat, domSelectionRange, editorAt, type CapturedFormat } from '../formatPainter'
import { FONT_FAMILIES, FONT_SIZES } from '@shared/render/extensions'
import { LINE_HEIGHTS, STANDARD_LINE_HEIGHT, lineHeightLabel } from '@shared/render/lineHeight'
import type { DrawTool } from '@shared/types'
import type React from 'react'

type SaveStatus = 'saved' | 'unsaved' | 'saving'


export function Toolbar({
  notebookName,
  saveStatus,
  hasPage,
  templateMode,
  onSwitchNotebook,
  onUndo,
  onRedo,
  zoom,
  onZoom,
  drawTool,
  onDrawTool,
  hasShapeSelection,
  onShapeStyle
}: {
  notebookName: string
  saveStatus: SaveStatus
  hasPage: boolean
  templateMode: boolean
  onSwitchNotebook: () => void
  onUndo: () => void
  onRedo: () => void
  zoom: number
  onZoom: (next: number) => void
  /** The shape tool armed for the next drag on the canvas, or null. */
  drawTool: DrawTool | null
  onDrawTool: (tool: DrawTool | null) => void
  hasShapeSelection: boolean
  onShapeStyle: (style: { stroke?: string; fill?: string | null }) => void
}): JSX.Element {
  const { editor } = useActiveEditor()
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const keep = (e: MouseEvent): void => e.preventDefault()
  const can = !!editor
  const chain = () => editor!.chain().focus()

  // Format painter: armed with the look of the text where it was clicked; the next text
  // highlighted (or word clicked) takes that look. A double click keeps it armed until Escape or
  // another click on the brush.
  const [painter, setPainter] = useState<{ format: CapturedFormat; sticky: boolean } | null>(null)
  const painterRef = useRef(painter)
  painterRef.current = painter
  const armPainter = (sticky: boolean): void => {
    if (!editor) return
    if (!sticky && painterRef.current) {
      setPainter(null)
      return
    }
    setPainter({ format: captureFormat(editor), sticky })
  }
  useEffect(() => {
    if (!painter) return
    document.body.classList.add('format-painting')
    const onDown = (e: globalThis.MouseEvent): void => {
      const t = e.target as Element
      // A press outside any text (other than on the brush itself) puts the brush down.
      if (!editorAt(t) && !t.closest('.tb.painter')) setPainter(null)
    }
    const onUp = (e: globalThis.MouseEvent): void => {
      const target = editorAt(e.target as Element)
      if (!target || e.button !== 0) return
      // Let the browser finish placing the selection first.
      window.setTimeout(() => {
        const p = painterRef.current
        if (!p || target.isDestroyed) return
        // The highlighted text, or else the word under the pointer.
        const hit = target.view.posAtCoords({ left: e.clientX, top: e.clientY })
        const range = domSelectionRange(target) ?? (hit ? { from: hit.pos, to: hit.pos } : null)
        if (range) applyFormat(target, p.format, range)
        if (!p.sticky) setPainter(null)
      }, 0)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPainter(null)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('mouseup', onUp, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.body.classList.remove('format-painting')
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('mouseup', onUp, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [painter])
  const b = (label: React.ReactNode, active: boolean, run: () => void, title: string, enabled = can, className = ''): JSX.Element => (
    <button type="button" className={`tb${active ? ' active' : ''}${className ? ` ${className}` : ''}`} disabled={!enabled} onMouseDown={keep} onClick={run} title={title}>
      {label}
    </button>
  )
  const openMenu = (e: MouseEvent<HTMLButtonElement>, items: MenuItem[]): void => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ x: r.left, y: r.bottom + 4, items })
  }
  const colorMenu = (current: string | undefined, pick: (c: string) => void, clear: () => void, clearLabel: string): MenuItem[] => [{ colors: { current: current ?? null, onPick: pick, onClear: clear, clearLabel } }]

  const shapeTarget = hasShapeSelection && !editor?.isFocused
  const attrs = editor?.getAttributes('textStyle') ?? {}
  const fontFamily = (attrs['fontFamily'] as string | undefined) ?? ''
  const fontSize = ((attrs['fontSize'] as string | undefined) ?? '').replace('px', '')
  const lineHeight = ((editor ? (editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph'))['lineHeight'] : null) as string | null) ?? STANDARD_LINE_HEIGHT

  const G = ({ children }: { children: React.ReactNode }): JSX.Element => <span className="tb-group">{children}</span>
  return (
    <div className="toolbar-wrap">
      <div className="toolbar">
        <G>
          <button type="button" className={`notebook-button${templateMode ? ' templates' : ''}`} onClick={(e) => openMenu(e, [{ label: 'Switch notebook…', onClick: onSwitchNotebook }])} title="Notebook menu">
            <span className="nb-icon">{templateMode ? '▦' : '▤'}</span>
            {templateMode ? 'Templates' : notebookName}
            <span className="chev">▾</span>
          </button>
        </G>
        <G>
          <select className="tb-select font" disabled={!can} value={fontFamily} title="Font" onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}>
            {FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value} style={{ fontFamily: f.value || undefined }}>
                {f.label}
              </option>
            ))}
          </select>
          <select className="tb-select size" disabled={!can} value={fontSize} title="Font size" onChange={(e) => (e.target.value ? chain().setFontSize(`${e.target.value}px`).run() : chain().unsetFontSize().run())}>
            <option value="">14</option>
            {FONT_SIZES.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
          <select className="tb-select spacing" disabled={!can} value={lineHeight} title="Line spacing" onChange={(e) => chain().setParagraphSpacing(e.target.value).run()}>
            {LINE_HEIGHTS.map((v) => (
              <option key={v} value={v}>
                {`↕ ${lineHeightLabel(v)}`}
              </option>
            ))}
          </select>
        </G>
        <G>
          <button
            type="button"
            className={`tb tb-icon painter${painter ? ' active' : ''}`}
            disabled={!can}
            onMouseDown={keep}
            onClick={(e) => {
              if (e.detail < 2) armPainter(false)
            }}
            onDoubleClick={() => armPainter(true)}
            title="Format painter: copy the look of this text, then highlight other text to paint it. Double-click to paint several times; Escape stops."
          >
            <PainterIcon />
          </button>
          {b('B', !!editor?.isActive('bold'), () => chain().toggleBold().run(), 'Bold (⌘B)', can, 'bold')}
          {b('I', !!editor?.isActive('italic'), () => chain().toggleItalic().run(), 'Italic (⌘I)', can, 'italic')}
          {b('U', !!editor?.isActive('underline'), () => chain().toggleUnderline().run(), 'Underline (⌘U)', can, 'underline')}
          {b('S', !!editor?.isActive('strike'), () => chain().toggleStrike().run(), 'Strikethrough', can, 'strike')}
          <button
            type="button"
            className="tb color"
            disabled={!can && !hasShapeSelection}
            onMouseDown={keep}
            title={shapeTarget ? 'Line colour of the selected shapes' : 'Text colour'}
            onClick={(e) =>
              openMenu(e, colorMenu(attrs['color'] as string | undefined, (c) => (shapeTarget ? onShapeStyle({ stroke: c }) : chain().setColor(c).run()), () => (shapeTarget ? onShapeStyle({ stroke: '#2c2c2a' }) : chain().unsetColor().run()), 'Automatic'))
            }
          >
            A<span className="color-bar" style={{ background: (attrs['color'] as string | undefined) ?? '#2c2c2a' }} />
          </button>
          <button
            type="button"
            className="tb color"
            disabled={!can && !hasShapeSelection}
            onMouseDown={keep}
            title={shapeTarget ? 'Fill colour of the selected shapes' : 'Highlight'}
            onClick={(e) =>
              openMenu(
                e,
                colorMenu(attrs['backgroundColor'] as string | undefined, (c) => (shapeTarget ? onShapeStyle({ fill: c }) : chain().setBackgroundColor(c).run()), () => (shapeTarget ? onShapeStyle({ fill: null }) : chain().unsetBackgroundColor().run()), shapeTarget ? 'No fill (see through)' : 'No highlight')
              )
            }
          >
            ▆<span className="color-bar" style={{ background: (attrs['backgroundColor'] as string | undefined) ?? '#fac775' }} />
          </button>
        </G>
        <G>
          {b(<AlignIcon kind="left" />, false, () => chain().setTextAlign('left').run(), 'Align left', can, 'tb-icon')}
          {b(<AlignIcon kind="center" />, false, () => chain().setTextAlign('center').run(), 'Center', can, 'tb-icon')}
          {b(<AlignIcon kind="right" />, false, () => chain().setTextAlign('right').run(), 'Align right', can, 'tb-icon')}
          {b(<AlignIcon kind="justify" />, false, () => chain().setTextAlign('justify').run(), 'Justify', can, 'tb-icon')}
        </G>
        <G>
          {b('• List', !!editor?.isActive('bulletList'), () => chain().toggleBulletList().run(), 'Bulleted list')}
          {b('1. List', !!editor?.isActive('orderedList'), () => chain().toggleOrderedList().run(), 'Numbered list')}
          {b('☑ To do', !!editor?.isActive('taskList'), () => chain().toggleTaskList().run(), 'To do list')}
          {b('❝', !!editor?.isActive('blockquote'), () => chain().toggleBlockquote().run(), 'Quote')}
          {b('</>', !!editor?.isActive('codeBlock'), () => chain().toggleCodeBlock().run(), 'Code block')}
        </G>
        <G>
          {b('↶', false, onUndo, 'Undo (⌘Z)', hasPage)}
          {b('↷', false, onRedo, 'Redo (⇧⌘Z)', hasPage)}
        </G>
        <G>
          <button type="button" className="tb" disabled={!hasPage} onClick={() => onZoom(zoom - 0.1)} title="Zoom out (⌘-)">
            −
          </button>
          <button type="button" className="tb zoom" disabled={!hasPage} onClick={() => onZoom(1)} title="Reset zoom (⌘0)">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="tb" disabled={!hasPage} onClick={() => onZoom(zoom + 0.1)} title="Zoom in (⌘+)">
            +
          </button>
        </G>
        <span className="spacer" />
        <G>
          {drawTool && (
            <button type="button" className="tb active" onClick={() => onDrawTool(null)} title="Drag on the page to draw. Click here or press Escape to stop.">
              ✎ Drawing: {drawTool} · Esc to stop
            </button>
          )}
          <span className={`save-status ${saveStatus}`}>{saveStatus === 'saved' ? 'All changes saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved changes'}</span>
        </G>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** Alignment symbols: four lines, long and short, lined up the way the button aligns text. */
function AlignIcon({ kind }: { kind: 'left' | 'center' | 'right' | 'justify' }): JSX.Element {
  const shortX = kind === 'center' ? 3.5 : kind === 'right' ? 6 : 1
  const short = kind === 'justify' ? { x: 1, width: 14 } : { x: shortX, width: 9 }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <rect x="1" y="2" width="14" height="1.6" rx="0.4" />
      <rect {...short} y="5.5" height="1.6" rx="0.4" />
      <rect x="1" y="9" width="14" height="1.6" rx="0.4" />
      <rect {...short} y="12.5" height="1.6" rx="0.4" />
    </svg>
  )
}

/** A paintbrush: bristles at the top, the handle running down. */
function PainterIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <rect x="2" y="1.5" width="11" height="4.5" rx="1" fill="currentColor" fillOpacity="0.25" />
      <path d="M13 3.75h1.25v4H8v2" />
      <rect x="6.75" y="9.75" width="2.5" height="5" rx="0.8" fill="currentColor" />
    </svg>
  )
}
