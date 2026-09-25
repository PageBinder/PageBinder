import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { HistoryEntry } from '@shared/types'

export function HistoryPanel({
  pageRel,
  pageTitle,
  onRestore,
  onCopy,
  onClose
}: {
  pageRel: string
  pageTitle: string
  onRestore: (name: string) => void
  onCopy: (name: string) => void
  onClose: () => void
}): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.pagebinder.page.listHistory(pageRel).then((list) => {
      setEntries(list)
      setSelected(list[0]?.name ?? null)
    })
  }, [pageRel])

  useEffect(() => {
    if (!selected) return
    setError(null)
    window.pagebinder.page.readSnapshot(pageRel, selected).then((d) => {
      if (!d) setError('This version could not be read.')
    })
  }, [pageRel, selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const when = (name: string): string => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(name)
    if (!m) return name
    const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="preview-backdrop">
      <div className="preview history">
        <div className="preview-bar">
          <span className="preview-title">Page history · {pageTitle}</span>
          <span className="spacer" />
          <button type="button" disabled={!selected} onClick={() => selected && onCopy(selected)} title="Make a new page from this version">
            Copy to new page
          </button>
          <button type="button" className="primary" disabled={!selected} onClick={() => selected && onRestore(selected)} title="Make this version the current page. The current version is kept in history.">
            Restore this version
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="history-body">
          <div className="history-list">
            {entries === null && <p className="muted pad">Loading…</p>}
            {entries?.length === 0 && <p className="muted pad">No earlier versions yet. A version is kept every time the page is saved.</p>}
            {entries?.map((e) => (
              <button key={e.name} type="button" className={`history-row${e.name === selected ? ' on' : ''}`} onClick={() => setSelected(e.name)}>
                <span>{when(e.name)}</span>
                <span className="muted small">{Math.max(1, Math.round(e.size / 1024))} KB</span>
              </button>
            ))}
          </div>
          <div className="history-preview">
            {error && <p className="error-text pad">{error}</p>}
            {selected && !error && <iframe key={selected} className="preview-frame" title="Version preview" sandbox="allow-scripts" src={`${window.pagebinder.fileUrl(`${pageRel}/.history/${selected}`)}?t=${Date.now()}`} />}
          </div>
        </div>
      </div>
    </div>
  )
}
