import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { RecycledPage } from '../../../preload/api'

export function RecyclePanel({ onRestore, onClose }: { onRestore: (name: string) => Promise<void>; onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<RecycledPage[] | null>(null)
  const reload = (): void => {
    void window.pagebinder.recycle.list().then(setItems)
  }
  useEffect(reload, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Recycled pages, sections, and groups</h2>
        <p className="muted small">Deleted pages stay here for 30 days, then are removed. Restore puts a page back in its section.</p>
        <div className="recycle-list">
          {items === null && <p className="muted">Loading…</p>}
          {items?.length === 0 && <p className="muted">Nothing has been deleted.</p>}
          {items?.map((r) => (
            <div key={r.name} className="recycle-row">
              <span className="recycle-text">
                <span className="recycle-title">
                  {r.kind !== 'page' && <span className="muted">{r.kind === 'section' ? 'Section: ' : 'Group: '}</span>}
                  {r.title}
                </span>
                <span className="muted small">
                  from {r.originalSection || 'unknown section'} · deleted {r.deleted ? new Date(r.deleted).toLocaleString() : 'unknown'}
                </span>
              </span>
              <button type="button" onClick={() => void onRestore(r.name).then(reload)}>
                Restore
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (confirm(`Permanently remove "${r.title}"? This cannot be undone.`)) void window.pagebinder.recycle.purge(r.name).then(reload)
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
