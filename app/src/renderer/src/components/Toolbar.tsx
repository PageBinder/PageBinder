import type { JSX } from 'react'
import { useState, type MouseEvent } from 'react'
import { useActiveEditor } from '../editorContext'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { FONT_FAMILIES, FONT_SIZES } from '@shared/render/extensions'
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
  const b = (label: string, active: boolean, run: () => void, title: string, enabled = can, className = ''): JSX.Element => (
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
        </G>
        <G>
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
          {b('≡', !!editor?.isActive({ textAlign: 'left' }), () => chain().setTextAlign('left').run(), 'Align left')}
          {b('☰', !!editor?.isActive({ textAlign: 'center' }), () => chain().setTextAlign('center').run(), 'Align centre')}
          {b('≡', !!editor?.isActive({ textAlign: 'right' }), () => chain().setTextAlign('right').run(), 'Align right', can, 'flip')}
        </G>
        <G>
          {b('H1', !!editor?.isActive('heading', { level: 1 }), () => chain().toggleHeading({ level: 1 }).run(), 'Heading 1')}
          {b('H2', !!editor?.isActive('heading', { level: 2 }), () => chain().toggleHeading({ level: 2 }).run(), 'Heading 2')}
          {b('H3', !!editor?.isActive('heading', { level: 3 }), () => chain().toggleHeading({ level: 3 }).run(), 'Heading 3')}
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
