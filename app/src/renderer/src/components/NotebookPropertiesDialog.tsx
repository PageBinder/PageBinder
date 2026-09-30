import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { NotebookProperties } from '../../../preload/api'
import { formatSize } from '@shared/format'

/** File > Notebook Properties: the open notebook's size, files, history, large attachments, and last edit. */
export function NotebookPropertiesDialog({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
  const [props, setProps] = useState<NotebookProperties | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.pagebinder.notebook
      .properties()
      .then(setProps)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const when = props?.lastEdit ? new Date(props.lastEdit.when) : null
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog wide properties" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Notebook properties</h2>
        {error && <p className="small">Could not read the notebook: {error}</p>}
        {!props && !error && <p className="muted small">Reading the notebook folder…</p>}
        {props && (
          <dl className="properties-list">
            <dt>Notebook</dt>
            <dd>{name}</dd>
            <dt>Location</dt>
            <dd className="small">{props.root}</dd>
            <dt>Last edited</dt>
            <dd className="last-edit">
              {props.lastEdit && when ? (
                <>
                  {when.toLocaleDateString(undefined, { dateStyle: 'long' })} at {when.toLocaleTimeString(undefined, { timeStyle: 'short' })}
                  <br />
                  by {props.lastEdit.by ?? <span className="muted">not recorded (saved by an earlier version)</span>}
                  <br />
                  <span className="muted small">on the page “{props.lastEdit.title || 'Untitled page'}”</span>
                </>
              ) : (
                <span className="muted">No pages yet</span>
              )}
            </dd>
            <dt>Size on disk</dt>
            <dd className="total-size">
              {formatSize(props.totalBytes)} in {props.fileCount.toLocaleString()} {props.fileCount === 1 ? 'file' : 'files'}
            </dd>
            <dt>Page history</dt>
            <dd className="history-size">
              {formatSize(props.historyBytes)} in {props.historyFiles.toLocaleString()} saved {props.historyFiles === 1 ? 'version' : 'versions'}
            </dd>
            <dt>Large attachments</dt>
            <dd className="large-attachments">
              {props.largeAttachments.length === 0 ? (
                <span className="muted">None over 50 MB</span>
              ) : (
                <>
                <span className="large-total">
                  {formatSize(props.largeAttachments.reduce((n, a) => n + a.bytes, 0))} in {props.largeAttachments.length} {props.largeAttachments.length === 1 ? 'attachment' : 'attachments'} of 50 MB or more
                </span>
                {props.largeAttachments.length > 1 && <span className="muted small"> · the largest {Math.min(5, props.largeAttachments.length)}:</span>}
                <ul>
                  {props.largeAttachments.slice(0, 5).map((a) => (
                    <li key={a.rel}>
                      <span className="small">{a.rel}</span> <b>{formatSize(a.bytes)}</b>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </dd>
          </dl>
        )}
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
