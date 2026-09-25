import type { JSX, ReactNode } from 'react'
import type { GroupNode } from '@shared/types'

export function Breadcrumb({
  notebookName,
  path,
  counts,
  right,
  onNavigate
}: {
  notebookName: string
  path: GroupNode[]
  counts: { sections: number; pages: number }
  right?: ReactNode
  onNavigate: (groupRel: string) => void
}): JSX.Element {
  const parent = path.length ? (path[path.length - 2]?.relPath ?? '') : ''
  return (
    <div className="breadcrumb">
      <button type="button" className="crumb-up" disabled={!path.length} onClick={() => onNavigate(parent)} title="Up one level">
        ↑
      </button>
      <button type="button" className={`crumb${path.length ? '' : ' current'}`} onClick={() => onNavigate('')}>
        {notebookName}
      </button>
      {path.map((g, i) => (
        <span key={g.relPath} className="crumb-wrap">
          <span className="crumb-sep">›</span>
          <button type="button" className={`crumb${i === path.length - 1 ? ' current' : ''}`} onClick={() => onNavigate(g.relPath)}>
            {g.name}
          </button>
        </span>
      ))}
      <span className="spacer" />
      <span className="muted small crumb-counts">
        {counts.sections} {counts.sections === 1 ? 'section' : 'sections'} · {counts.pages} {counts.pages === 1 ? 'page' : 'pages'}
      </span>
      {right}
    </div>
  )
}
