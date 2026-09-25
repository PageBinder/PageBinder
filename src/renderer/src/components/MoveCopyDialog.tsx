import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { NotebookTree, TreeChild } from '@shared/types'

interface Target {
  rel: string
  label: string
  depth: number
  kind: 'section' | 'group' | 'root'
}

function flatten(children: TreeChild[], depth: number, out: Target[]): void {
  for (const c of children) {
    out.push({ rel: c.relPath, label: c.name, depth, kind: c.kind })
    if (c.kind === 'group') flatten(c.children, depth + 1, out)
  }
}

/** Pick a destination section (for pages) or group (for sections and groups), then Move or Copy. */
export function MoveCopyDialog({
  tree,
  subject,
  mode,
  currentRel,
  excludeRel,
  onMove,
  onCopy,
  onClose
}: {
  tree: NotebookTree
  subject: string
  /** 'page' targets sections; 'container' targets groups and the notebook root. */
  mode: 'page' | 'container'
  currentRel: string
  excludeRel?: string
  onMove: (targetRel: string) => Promise<void>
  onCopy: (targetRel: string) => Promise<void>
  onClose: () => void
}): JSX.Element {
  const all: Target[] = []
  flatten(tree.children, 1, all)
  const targets: Target[] = mode === 'page' ? all.filter((t) => t.kind === 'section') : [{ rel: '', label: tree.meta.name, depth: 0, kind: 'root' }, ...all.filter((t) => t.kind === 'group' && !(excludeRel && (t.rel === excludeRel || t.rel.startsWith(`${excludeRel}/`))))]
  const [target, setTarget] = useState<string>(targets.find((t) => t.rel !== currentRel)?.rel ?? targets[0]?.rel ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])
  const run = async (fn: (rel: string) => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn(target)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="dialog-backdrop" onMouseDown={busy ? undefined : onClose}>
      <div className="dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Move or copy: {subject}</h2>
        <p className="muted small">{mode === 'page' ? 'Choose the section to put the page in.' : 'Choose the group to put it in, or the notebook itself.'}</p>
        <div className="target-list">
          {targets.map((t) => (
            <button
              key={t.rel || '__root'}
              type="button"
              className={`target-row${t.rel === target ? ' on' : ''}${t.rel === currentRel ? ' current' : ''}`}
              style={{ paddingLeft: 12 + t.depth * 18 }}
              onClick={() => setTarget(t.rel)}
              onDoubleClick={() => void run(onMove)}
            >
              <span className="target-icon">{t.kind === 'section' ? '▭' : t.kind === 'group' ? '▣' : '▤'}</span>
              {t.label}
              {t.rel === currentRel && <span className="muted small"> (current)</span>}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <span className="spacer" />
          <button type="button" disabled={busy} onClick={() => void run(onCopy)} title="Make an independent duplicate, attachments included">
            Copy
          </button>
          <button type="button" className="primary" disabled={busy || target === currentRel} onClick={() => void run(onMove)}>
            Move
          </button>
        </div>
      </div>
    </div>
  )
}
