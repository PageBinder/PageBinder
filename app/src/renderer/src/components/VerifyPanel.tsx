import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { VerifyReport, Finding } from '../../../preload/api'

const REPAIR_LABELS: Record<NonNullable<Finding['repair']>, string> = {
  'restore-from-history': 'Restore from history',
  'regenerate-html': 'Regenerate page.html',
  'recycle-orphan': 'Move to recycle folder',
  'prune-history': 'Remove old snapshots',
  'remove-temp': 'Remove temp file'
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i

const LABELS: Record<Finding['kind'], string> = {
  'corrupt-page': 'Damaged page',
  'missing-file': 'Missing or damaged file',
  'orphan-file': 'Unused file',
  'stale-html': 'Rendered copy out of date',
  'history-over-policy': 'History beyond policy',
  'temp-file': 'Leftover temporary file',
  'regenerated-meta': 'Rebuilt metadata',
  'long-path': 'Long file path'
}

export function VerifyPanel({ onClose, onRebuildIndex }: { onClose: () => void; onRebuildIndex: () => void }): JSX.Element {
  const [mode, setMode] = useState<'quick' | 'full'>('quick')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<{ rel: string; name: string } | null>(null)

  useEffect(() => window.pagebinder.verify.onProgress(setProgress), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !running) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, running])

  const run = async (): Promise<void> => {
    setRunning(true)
    setReport(null)
    setResults({})
    try {
      setReport(await window.pagebinder.verify.run(mode))
    } finally {
      setRunning(false)
    }
  }
  const key = (f: Finding): string => `${f.kind}|${f.rel}|${f.file ?? ''}`
  const repair = async (f: Finding): Promise<void> => {
    const msg = await window.pagebinder.verify.repair(f)
    setResults((r) => ({ ...r, [key(f)]: msg }))
  }
  const repairAll = async (): Promise<void> => {
    if (!report) return
    for (const f of report.findings) if (f.repair && !results[key(f)]) await repair(f)
  }
  const repairable = report?.findings.filter((f) => f.repair && !results[key(f)]).length ?? 0

  return (
    <div className="dialog-backdrop">
      <div className="dialog wide verify" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Verify notebook</h2>
        <p className="muted small">
          Checks every page document, every referenced file, unused files, rendered copies, and history. Repairs never delete a source file: unused files go to the recycle folder and damaged pages are restored from history.
        </p>
        <div className="verify-controls">
          <label>
            <input type="radio" checked={mode === 'quick'} onChange={() => setMode('quick')} disabled={running} /> Quick (names and sizes)
          </label>
          <label>
            <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} disabled={running} /> Full (also verifies every file's content hash; slow on large notebooks)
          </label>
          <span className="spacer" />
          <button type="button" className="primary" disabled={running} onClick={() => void run()}>
            {running ? `Checking${progress ? ` ${progress.done} of ${progress.total}` : ''}…` : 'Run check'}
          </button>
        </div>
        {report && (
          <div className="verify-report">
            <p>
              Checked {report.pagesChecked} {report.pagesChecked === 1 ? 'page' : 'pages'} and {report.filesChecked} {report.filesChecked === 1 ? 'file' : 'files'}.{' '}
              {report.findings.length === 0 ? 'No problems found.' : `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'}.`}
            </p>
            <div className="verify-list">
              {report.findings.map((f) => (
                <div key={key(f)} className="verify-row">
                  <span className="verify-text">
                    <span className="verify-kind">{LABELS[f.kind]}</span>
                    <span className="muted small">
                      {f.rel}
                      {f.file ? ` · ${f.file}` : ''}
                    </span>
                    <span className="small">{results[key(f)] ?? f.detail}</span>
                  </span>
                  {f.file && (
                    <button type="button" onClick={() => void window.pagebinder.file.reveal(`${f.rel}/${f.file}`)} title="Show this file in Finder or Explorer">
                      Show file
                    </button>
                  )}
                  {f.file && f.kind !== 'temp-file' && (
                    <button
                      type="button"
                      onClick={() => (IMAGE_EXT.test(f.file!) ? setPreview({ rel: `${f.rel}/${f.file}`, name: f.file! }) : void window.pagebinder.file.open(`${f.rel}/${f.file}`))}
                      title={IMAGE_EXT.test(f.file) ? 'Preview this picture here' : 'Open this file in its default application'}
                    >
                      {IMAGE_EXT.test(f.file) ? 'Preview' : 'Open'}
                    </button>
                  )}
                  {f.kind === 'corrupt-page' && (
                    <button type="button" onClick={() => void window.pagebinder.file.reveal(`${f.rel}/page.json`)} title="Show the page folder in Finder or Explorer">
                      Show folder
                    </button>
                  )}
                  {f.repair && !results[key(f)] && (
                    <button type="button" onClick={() => void repair(f)} title={f.repair === 'recycle-orphan' ? 'Moves the file to the notebook\'s recycle folder; nothing is deleted' : undefined}>
                      {REPAIR_LABELS[f.repair]}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {preview && (
          <div className="verify-preview">
            <div className="preview-bar">
              <span className="preview-title">{preview.name}</span>
              <span className="spacer" />
              <button type="button" onClick={() => setPreview(null)}>
                Close preview
              </button>
            </div>
            <img src={window.pagebinder.fileUrl(preview.rel)} alt={preview.name} />
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onRebuildIndex} title="Delete and rebuild the search index from the page files">
            Rebuild search index
          </button>
          <span className="spacer" />
          {repairable > 0 && (
            <button type="button" onClick={() => void repairAll()} title="Runs every listed repair. Unused files go to the recycle folder, nothing is deleted.">
              Apply all repairs ({repairable})
            </button>
          )}
          <button type="button" onClick={onClose} disabled={running}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
