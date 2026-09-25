import type { JSX } from 'react'
import { useEffect, useState } from 'react'

export interface ExportScope {
  label: string
  rel: string
}

export function ExportDialog({ scopes, onExport, onClose }: { scopes: ExportScope[]; onExport: (scopeRel: string, format: 'html' | 'pdf') => Promise<string | null>; onClose: () => void }): JSX.Element {
  const [scope, setScope] = useState(scopes[0]?.rel ?? '')
  const [format, setFormat] = useState<'html' | 'pdf'>('pdf')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])
  return (
    <div className="dialog-backdrop" onMouseDown={busy ? undefined : onClose}>
      <form
        className="dialog wide"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setResult(null)
          void onExport(scope, format)
            .then((out) => setResult(out ? `Written to ${out}` : null))
            .finally(() => setBusy(false))
        }}
      >
        <h2>Export pages</h2>
        <div className="setup-grid">
          <label>
            <span>What to export</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {scopes.map((s) => (
                <option key={s.rel || '__root'} value={s.rel}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as 'html' | 'pdf')}>
              <option value="pdf">One PDF file</option>
              <option value="html">One HTML file (opens in any browser)</option>
            </select>
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Pages are exported in notebook order, each starting on a new sheet, using each page's own paper size. The HTML file links to pictures and attachments on this computer; the PDF is self-contained.
        </p>
        {result && <p className="small">{result}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            {result ? 'Close' : 'Cancel'}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Exporting…' : 'Export…'}
          </button>
        </div>
      </form>
    </div>
  )
}
