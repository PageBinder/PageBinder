import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { PageRef, SectionNode } from '@shared/types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { TemplateInfo } from '../../../preload/api'
import { formatDate, formatDateTime } from '../tree'

function RenameRow({ page, onCommit, onCancel }: { page: PageRef; onCommit: (title: string) => void; onCancel: () => void }): JSX.Element {
  const [value, setValue] = useState(page.title)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = (): void => {
    const t = value.trim()
    if (t && t !== page.title) onCommit(t)
    else onCancel()
  }
  return (
    <div className="page-row renaming">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onCancel()
        }}
      />
    </div>
  )
}

export function PageList({
  section,
  activeRel,
  renamingRel,
  onOpen,
  onAdd,
  onDelete,
  onStartRename,
  onRename,
  onCancelRename,
  onHistory,
  templates,
  templateMode,
  onAddFromTemplate,
  onSaveAsTemplate,
  onMoveCopy,
  onCopyPage,
  onPastePage,
  copiedPageTitle
}: {
  section: SectionNode | undefined
  activeRel: string | null
  renamingRel: string | null
  onOpen: (rel: string) => void
  onAdd: () => void
  onDelete: (page: PageRef) => void
  onStartRename: (rel: string) => void
  onRename: (rel: string, title: string) => void
  onCancelRename: () => void
  onHistory: (rel: string) => void
  templates: { notebook: TemplateInfo[]; global: TemplateInfo[] }
  templateMode: boolean
  onAddFromTemplate: (ref: string) => void
  onSaveAsTemplate: (page: PageRef) => void
  onMoveCopy: (page: PageRef) => void
  onCopyPage: (page: PageRef) => void
  onPastePage: () => void
  copiedPageTitle: string | null
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; page: PageRef } | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null)
  const pages = section?.pages ?? []
  const addItems: MenuItem[] = [
    { label: 'New page', onClick: onAdd },
    ...(copiedPageTitle ? [{ label: `Paste page here: ${copiedPageTitle}`, onClick: onPastePage }] : []),
    ...(templates.notebook.length ? [{ separator: true }, ...templates.notebook.map((t) => ({ label: `From template: ${t.name}`, onClick: () => onAddFromTemplate(t.ref) }))] : []),
    ...(templates.global.length ? [{ separator: true }, ...templates.global.map((t) => ({ label: `From global template: ${t.name}`, onClick: () => onAddFromTemplate(t.ref) }))] : [])
  ]
  const parents = new Set(pages.map((p) => p.id))
  return (
    <aside className="page-list">
      <div className="page-list-head">
        <span>{section ? (templateMode ? `Templates: ${section.name}` : `Pages in ${section.name}`) : 'Pages'}</span>
        <button type="button" className="icon" onClick={(e) => (!templateMode && (templates.notebook.length || templates.global.length || copiedPageTitle) ? setAddMenu({ x: e.clientX, y: e.clientY }) : onAdd())} disabled={!section} title={templateMode ? 'New template' : 'Add page (templates and paste)'} onContextMenu={(e) => { e.preventDefault(); if (!templateMode) setAddMenu({ x: e.clientX, y: e.clientY }) }}>
          +
        </button>
      </div>
      <div className="page-list-body">
        {pages.map((p) =>
          p.relPath === renamingRel ? (
            <RenameRow key={p.relPath} page={p} onCommit={(t) => onRename(p.relPath, t)} onCancel={onCancelRename} />
          ) : (
            <button
              key={p.relPath}
              type="button"
              className={`page-row${p.relPath === activeRel ? ' on' : ''}${p.parentPageId && parents.has(p.parentPageId) ? ' sub' : ''}`}
              style={p.relPath === activeRel ? { borderLeftColor: section?.color } : undefined}
              title={templateMode ? `Drag onto the other library tab to move this template` : `Last edited ${formatDateTime(p.modified)}`}
              draggable={templateMode}
              onDragStart={(e) => {
                if (!templateMode) return
                e.dataTransfer.setData('application/x-pagebinder-page', p.relPath)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => onOpen(p.relPath)}
              onDoubleClick={() => onStartRename(p.relPath)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, page: p })
              }}
            >
              <span className="page-title-text">{p.title || 'Untitled page'}</span>
              <span className="page-date">{formatDate(p.modified)}</span>
            </button>
          )
        )}
        {section && (
          <button type="button" className="page-row add" onClick={onAdd} onContextMenu={(e) => { e.preventDefault(); if (!templateMode) setAddMenu({ x: e.clientX, y: e.clientY }) }}>
            {templateMode ? '+ New template' : '+ Add page'}
          </button>
        )}
        {!section && <p className="muted small pad">Select a section to see its pages.</p>}
      </div>
      {addMenu && <ContextMenu x={addMenu.x} y={addMenu.y} items={addItems} onClose={() => setAddMenu(null)} />}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: 'Rename…', onClick: () => onStartRename(menu.page.relPath) },
            { label: 'Page history…', onClick: () => onHistory(menu.page.relPath) },
            { separator: true },
            ...(templateMode
              ? [{ label: 'Move to the other library…', onClick: () => onMoveCopy(menu.page) }]
              : [
                  { label: 'Copy page', onClick: () => onCopyPage(menu.page) },
                  { label: 'Save as template…', onClick: () => onSaveAsTemplate(menu.page) }
                ]),
            { separator: true },
            { label: templateMode ? 'Delete template' : 'Delete page', onClick: () => onDelete(menu.page) }
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  )
}
