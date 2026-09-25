import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { DEFAULT_PRINT, type PaperSettings, type PrintSettings, type PaperSize, type Orientation } from '@shared/types'

const SIZES: { id: PaperSize; label: string }[] = [
  { id: 'letter', label: 'Letter (8.5 × 11 in)' },
  { id: 'tabloid', label: 'Tabloid (11 × 17 in)' },
  { id: 'legal', label: 'Legal (8.5 × 14 in)' },
  { id: 'a4', label: 'A4 (210 × 297 mm)' },
  { id: 'a3', label: 'A3 (297 × 420 mm)' },
  { id: 'custom', label: 'Custom' }
]

export function PageSetupDialog({
  paper,
  print,
  onApply,
  onSetDefault,
  onClose
}: {
  paper: PaperSettings
  print: PrintSettings | undefined
  onApply: (paper: PaperSettings, print: PrintSettings) => void
  onSetDefault: (paper: PaperSettings) => void
  onClose: () => void
}): JSX.Element {
  const [p, setP] = useState<PaperSettings>(paper)
  const [pr, setPr] = useState<PrintSettings>(print ?? DEFAULT_PRINT)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const PRESETS: { id: string; label: string; m: PaperSettings['margins'] | null }[] = [
    { id: 'standard', label: 'Standard (1 in all round)', m: { top: 1, right: 1, bottom: 1, left: 1 } },
    { id: 'narrow', label: 'Narrow (0.5 in all round)', m: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } },
    { id: 'wide', label: 'Wide (1 in top and bottom, 2 in sides)', m: { top: 1, right: 2, bottom: 1, left: 2 } },
    { id: 'custom', label: 'Custom', m: null }
  ]
  const same = (a: PaperSettings['margins'], b: PaperSettings['margins']): boolean => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
  const [custom, setCustom] = useState(!PRESETS.some((x) => x.m && same(x.m, paper.margins)))
  const presetId = custom ? 'custom' : (PRESETS.find((x) => x.m && same(x.m, p.margins))?.id ?? 'custom')
  const margin = (key: keyof PaperSettings['margins'], label: string): JSX.Element => (
    <label className="inline">
      <span>{label}</span>
      <input type="number" step="0.25" min="0" max="3" value={p.margins[key]} onChange={(e) => setP({ ...p, margins: { ...p.margins, [key]: Number(e.target.value) } })} />
    </label>
  )
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog wide"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onApply(p, pr)
          onClose()
        }}
      >
        <h2>Page setup</h2>
        <div className="setup-grid">
          <label>
            <span>Paper size</span>
            <select value={p.size} onChange={(e) => setP({ ...p, size: e.target.value as PaperSize })}>
              {SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Orientation</span>
            <select value={p.orientation} onChange={(e) => setP({ ...p, orientation: e.target.value as Orientation })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          {p.size === 'custom' && (
            <>
              <label className="inline">
                <span>Width (in)</span>
                <input type="number" step="0.1" min="2" max="60" value={p.widthIn ?? 8.5} onChange={(e) => setP({ ...p, widthIn: Number(e.target.value) })} />
              </label>
              <label className="inline">
                <span>Height (in)</span>
                <input type="number" step="0.1" min="2" max="60" value={p.heightIn ?? 11} onChange={(e) => setP({ ...p, heightIn: Number(e.target.value) })} />
              </label>
            </>
          )}
        </div>
        <h3>Margins</h3>
        <div className="setup-grid">
          <label>
            <span>Preset</span>
            <select
              value={presetId}
              onChange={(e) => {
                const chosen = PRESETS.find((x) => x.id === e.target.value)
                if (chosen?.m) {
                  setCustom(false)
                  setP({ ...p, margins: chosen.m })
                } else setCustom(true)
              }}
            >
              {PRESETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {presetId === 'custom' && (
          <div className="setup-grid four" style={{ marginTop: 8 }}>
            {margin('top', 'Top (in)')}
            {margin('bottom', 'Bottom (in)')}
            {margin('left', 'Left (in)')}
            {margin('right', 'Right (in)')}
          </div>
        )}
        <h3>Printing</h3>
        <div className="setup-checks">
          <label>
            <input type="checkbox" checked={pr.footerSheetNumbers} onChange={(e) => setPr({ ...pr, footerSheetNumbers: e.target.checked })} /> Print page numbers in the footer
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={() => onSetDefault(p)} title="New pages in this notebook will use this paper size, orientation, and margins">
            Use as notebook default
          </button>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Apply to this page
          </button>
        </div>
      </form>
    </div>
  )
}
