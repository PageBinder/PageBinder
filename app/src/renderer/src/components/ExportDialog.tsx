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
              <option value="html">Web page with attachments (.zip)</option>
            </select>
          </label>
        </div>
        <p className="muted small export-explain" style={{ marginTop: 12 }}>
          {format === 'pdf'
            ? "One PDF with the pages exactly as they print, in notebook order, each starting on a new sheet with its own paper size. Pictures and printouts are included; other attachments appear only as cards, without the files themselves."
            : "One .zip file to share with anyone, even without PageBinder. It holds a web page of the pages, in notebook order, together with every picture and attached file. Unzip it anywhere and open the .html file inside with any web browser; clicking an attachment opens it (some browsers save it to Downloads first). Large attachments make the .zip large."}
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
