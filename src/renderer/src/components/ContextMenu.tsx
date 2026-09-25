import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { PALETTE, recentColors, rememberColor } from '../colors'

export interface ColorPick {
  current?: string | null
  onPick: (color: string) => void
  /** Offered as a final row when set, for "No fill", "Automatic", and the like. */
  onClear?: () => void
  clearLabel?: string
}

export interface MenuItem {
  label?: string
  onClick?: () => void
  separator?: boolean
  /** Deprecated flat swatch row; `colors` shows the full picker. */
  swatches?: { color: string; onPick: (color: string) => void; current?: string }
  colors?: ColorPick
  /** Keep the menu open after the click, for items that cycle a setting. */
  keepOpen?: boolean
  /** Opens these items in place of the menu, with a Back entry. */
  submenu?: MenuItem[]
  disabled?: boolean
}

function ColorPalette({ pick, onDone }: { pick: ColorPick; onDone: () => void }): JSX.Element {
  const [recent, setRecent] = useState<string[]>(() => recentColors())
  const inputRef = useRef<HTMLInputElement>(null)
  const choose = (c: string): void => {
    rememberColor(c)
    setRecent(recentColors())
    pick.onPick(c)
    onDone()
  }
  const cell = (c: string, key: string): JSX.Element => (
    <button key={key} type="button" className={`swatch${pick.current && pick.current.toLowerCase() === c.toLowerCase() ? ' current' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} title={c} onClick={() => choose(c)} />
  )
  return (
    <div className="color-picker" onMouseDown={(e) => e.stopPropagation()}>
      {recent.length > 0 && (
        <>
          <div className="color-label">Recent</div>
          <div className="context-swatches recent">{recent.map((c, i) => cell(c, `r${i}`))}</div>
        </>
      )}
      <div className="color-label">Colours</div>
      <div className="context-swatches grid">{PALETTE.map((c, i) => cell(c, `p${i}`))}</div>
      <div className="color-actions">
        <label className="color-custom">
          <span className="swatch rainbow" aria-hidden="true" />
          Custom…
          <input
            ref={inputRef}
            type="color"
            defaultValue={pick.current && /^#[0-9a-f]{6}$/i.test(pick.current) ? pick.current : '#378add'}
            onChange={(e) => choose(e.target.value)}
            onInput={(e) => pick.onPick((e.target as HTMLInputElement).value)}
          />
        </label>
        {pick.onClear && (
          <button
            type="button"
            className="context-item"
            onClick={() => {
              pick.onClear!()
              onDone()
            }}
          >
            {pick.clearLabel ?? 'None'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ContextMenu({ x, y, items: rootItems, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }): JSX.Element {
  // Submenus are remembered by index so re-rendered items (changed labels) show up while open.
  const [path, setPath] = useState<number[]>([])
  let level: MenuItem[] = rootItems
  for (const i of path) level = level[i]?.submenu ?? level
  const items: MenuItem[] = path.length ? [{ label: '‹ Back', keepOpen: true, onClick: () => setPath((p) => p.slice(0, -1)) }, { separator: true }, ...level] : rootItems
  useEffect(() => {
    const close = (): void => onClose()
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', close)
    }
  }, [onClose])
  // Keep the menu on screen: long menus move up, and scroll if they are taller than the window.
  const estimated = items.reduce((n, i) => n + (i.separator ? 9 : i.swatches ? 34 : i.colors ? 220 : 28), 8)
  const left = Math.min(x, window.innerWidth - 260)
  const top = Math.max(8, Math.min(y, window.innerHeight - estimated - 8))
  return (
    <div className="context-menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-separator" />
        ) : item.colors ? (
          <ColorPalette key={i} pick={item.colors} onDone={onClose} />
        ) : item.swatches ? (
          <div key={i} className="context-swatches">
            {item.swatches.color.split(',').map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${item.swatches!.current === c ? ' current' : ''}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => {
                  item.swatches!.onPick(c)
                  onClose()
                }}
              />
            ))}
          </div>
        ) : (
          <button
            key={i}
            type="button"
            className={`context-item${item.submenu ? ' has-sub' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.submenu) {
                // Index within the current level, ignoring the Back entry and its separator.
                setPath((p) => [...p, path.length ? i - 2 : i])
                return
              }
              item.onClick?.()
              if (!item.keepOpen) onClose()
            }}
          >
            {item.label}
            {item.submenu && <span className="sub-arrow">›</span>}
          </button>
        )
      )}
    </div>
  )
}
