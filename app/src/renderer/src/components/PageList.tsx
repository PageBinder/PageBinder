import type { JSX } from 'react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
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
  onDeletePages,
  onStartRename,
  onRename,
  onCancelRename,
  onHistory,
  templates,
  templateMode,
  onAddFromTemplate,
  onSaveAsTemplate,
  onCopyPages,
  onCutPages,
  cutRels,
  onPastePage,
  copiedPageTitle
}: {
  section: SectionNode | undefined
  activeRel: string | null
  renamingRel: string | null
  onOpen: (rel: string) => void
  onAdd: () => void
  /** Delete one or several pages (templates in the Templates notebook). */
  onDeletePages: (pages: PageRef[]) => void
  onStartRename: (rel: string) => void
  onRename: (rel: string, title: string) => void
  onCancelRename: () => void
  onHistory: (rel: string) => void
  /** Templates offered by the + menu (not in the Templates notebook itself). */
  templates: TemplateInfo[]
  templateMode: boolean
  onAddFromTemplate: (ref: string) => void
  onSaveAsTemplate: (page: PageRef) => void
  /** Copy one or several pages, to paste with the + menu's Paste. */
  onCopyPages: (pages: PageRef[]) => void
  /** Cut one or several pages: pasting moves them. */
  onCutPages: (pages: PageRef[]) => void
  /** Pages waiting to be moved by a paste, shown dimmed. */
  cutRels: Set<string> | null
  onPastePage: () => void
  copiedPageTitle: string | null
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; page: PageRef } | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null)
  const pages = section?.pages ?? []
  // Selected pages, as in File Explorer or Finder: a click selects one page and opens it;
  // Ctrl-click (Cmd-click on a Mac) adds or removes one; Shift-click selects a run from the last click.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activeRel ? [activeRel] : []))
  const anchor = useRef<string | null>(activeRel)
  useEffect(() => {
    setSelected(new Set(activeRel ? [activeRel] : []))
    anchor.current = activeRel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section?.relPath])
  const lastActive = useRef(activeRel)
  useEffect(() => {
    const opened = activeRel !== lastActive.current
    lastActive.current = activeRel
    // Pages that are gone (deleted, renamed) leave the selection.
    setSelected((cur) => {
      const live = new Set(pages.map((p) => p.relPath))
      // A page opened some other way (search, a new page) starts a new selection.
      if (opened && activeRel && live.has(activeRel) && !cur.has(activeRel)) {
        anchor.current = activeRel
        return new Set([activeRel])
      }
      const next = new Set([...cur].filter((r) => live.has(r)))
      if (activeRel && live.has(activeRel) && !next.size) next.add(activeRel)
      return next.size === cur.size && [...next].every((r) => cur.has(r)) ? cur : next
    })
  }, [pages, activeRel])
  const choose = (e: MouseEvent, rel: string): void => {
    if (e.shiftKey) {
      const start = pages.some((p) => p.relPath === anchor.current) ? anchor.current : activeRel
      const from = pages.findIndex((p) => p.relPath === start)
      const to = pages.findIndex((p) => p.relPath === rel)
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from]
        setSelected(new Set(pages.slice(a, b + 1).map((p) => p.relPath)))
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((cur) => {
        const next = new Set(cur)
        if (next.has(rel)) next.delete(rel)
        else next.add(rel)
        return next
      })
      anchor.current = rel
      return
    }
    setSelected(new Set([rel]))
    anchor.current = rel
    onOpen(rel)
  }
  const selectedPages = (around: PageRef): PageRef[] => (selected.has(around.relPath) && selected.size > 1 ? pages.filter((p) => selected.has(p.relPath)) : [around])
  // Templates are listed by their section in the Templates notebook, under its name when there are several.
  const offered = templateMode ? [] : templates
  const templateSections = [...new Set(offered.map((t) => t.section))]
  const addItems: MenuItem[] = [
    { label: templateMode ? 'New template' : 'New page', onClick: onAdd },
    ...(copiedPageTitle ? [{ label: `${templateMode ? 'Paste template here' : 'Paste page here'}: ${copiedPageTitle}`, onClick: onPastePage }] : []),
    ...templateSections.flatMap((name): MenuItem[] => [
      { separator: true },
      ...(templateSections.length > 1 ? [{ label: name, heading: true }] : []),
      ...offered.filter((t) => t.section === name).map((t) => ({ label: `From template: ${t.name}`, onClick: () => onAddFromTemplate(t.ref) }))
    ])
  ]
  const parents = new Set(pages.map((p) => p.id))
  return (
    <aside className="page-list">
      <div className="page-list-head">
        <span>{section ? (templateMode ? `Templates: ${section.name}` : `Pages in ${section.name}`) : 'Pages'}</span>
        <button type="button" className="icon" onClick={(e) => (offered.length || copiedPageTitle ? setAddMenu({ x: e.clientX, y: e.clientY }) : onAdd())} disabled={!section} title={templateMode ? 'New template (and paste)' : 'Add page (templates and paste)'} onContextMenu={(e) => { e.preventDefault(); setAddMenu({ x: e.clientX, y: e.clientY }) }}>
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
              className={`page-row${p.relPath === activeRel ? ' on' : ''}${selected.has(p.relPath) && (selected.size > 1 || p.relPath !== activeRel) ? ' selected' : ''}${cutRels?.has(p.relPath) ? ' cut' : ''}${p.parentPageId && parents.has(p.parentPageId) ? ' sub' : ''}`}
              style={p.relPath === activeRel ? { borderLeftColor: section?.color } : undefined}
              title={`Last edited ${formatDateTime(p.modified)}. Ctrl-click (Cmd-click on a Mac) or Shift-click to select several.`}
              onClick={(e) => choose(e, p.relPath)}
              onDoubleClick={(e) => {
                if (!e.shiftKey && !e.metaKey && !e.ctrlKey) onStartRename(p.relPath)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                // Right-clicking a page outside the selection selects just that page, as in Explorer.
                if (!selected.has(p.relPath)) {
                  setSelected(new Set([p.relPath]))
                  anchor.current = p.relPath
                }
                setMenu({ x: e.clientX, y: e.clientY, page: p })
              }}
            >
              <span className="page-title-text">{p.title || 'Untitled page'}</span>
              <span className="page-date">{formatDate(p.modified)}</span>
            </button>
          )
        )}
        {section && (
          <button type="button" className="page-row add" onClick={onAdd} onContextMenu={(e) => { e.preventDefault(); setAddMenu({ x: e.clientX, y: e.clientY }) }}>
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
          items={(() => {
            const group = selectedPages(menu.page)
            const noun = templateMode ? 'templates' : 'pages'
            if (group.length > 1) {
              return [
                { label: `Cut ${group.length} ${noun}`, onClick: () => onCutPages(group) },
                { label: `Copy ${group.length} ${noun}`, onClick: () => onCopyPages(group) },
                { separator: true },
                { label: `Delete ${group.length} ${noun}`, onClick: () => onDeletePages(group) }
              ]
            }
            return [
              { label: 'Rename…', onClick: () => onStartRename(menu.page.relPath) },
              { label: 'Page history…', onClick: () => onHistory(menu.page.relPath) },
              { separator: true },
              { label: templateMode ? 'Cut template' : 'Cut page', onClick: () => onCutPages([menu.page]) },
              { label: templateMode ? 'Copy template' : 'Copy page', onClick: () => onCopyPages([menu.page]) },
              ...(templateMode ? [] : [{ label: 'Save as template…', onClick: () => onSaveAsTemplate(menu.page) }]),
              { separator: true },
              { label: templateMode ? 'Delete template' : 'Delete page', onClick: () => onDeletePages([menu.page]) }
            ]
          })()}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  )
}
