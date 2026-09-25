import type { JSX } from 'react'
import React, { useState } from 'react'
import { SECTION_COLORS, type TreeChild } from '@shared/types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { TemplateInfo } from '../../../preload/api'

export function SectionTabs({
  children,
  activeSectionRel,
  onSelectSection,
  onOpenGroup,
  onAddSection,
  onAddGroup,
  onRename,
  onSetColor,
  templates,
  onSetDefaultTemplate,
  onMoveCopy,
  onDelete,
  onDropPage,
  templateMode
}: {
  children: TreeChild[]
  activeSectionRel: string | null
  onSelectSection: (rel: string) => void
  onOpenGroup: (rel: string) => void
  onAddSection: () => void
  onAddGroup: () => void
  onRename: (rel: string) => void
  onSetColor: (rel: string, color: string) => void
  templates: { notebook: TemplateInfo[]; global: TemplateInfo[] }
  onSetDefaultTemplate: (rel: string, ref: string | null) => void
  onMoveCopy: (node: TreeChild) => void
  onDelete: (node: TreeChild) => void
  onDropPage: (pageRel: string, sectionRel: string, copy: boolean) => void
  templateMode?: boolean
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeChild } | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null)

  const allTemplates = [...templates.notebook, ...templates.global]
  const items: MenuItem[] = menu
    ? [
        { label: 'Rename…', onClick: () => onRename(menu.node.relPath) },
        { label: 'Move or copy…', onClick: () => onMoveCopy(menu.node) },
        ...(menu.node.kind === 'section'
          ? [
              { separator: true },
              { swatches: { color: SECTION_COLORS.join(','), current: menu.node.color, onPick: (c: string) => onSetColor(menu.node.relPath, c) } },
              { separator: true },
              { label: `Default template: ${allTemplates.find((t) => t.ref === menu.node.kind && false) ? '' : allTemplates.find((t) => menu.node.kind === 'section' && t.ref === menu.node.defaultTemplate)?.name ?? 'blank page'}`, onClick: () => {} },
              { label: '   Use a blank page', onClick: () => onSetDefaultTemplate(menu.node.relPath, null) },
              ...allTemplates.map((t) => ({ label: `   Use “${t.name}”${t.scope === 'global' ? ' (global)' : ''}`, onClick: () => onSetDefaultTemplate(menu.node.relPath, t.ref) }))
            ]
          : []),
        { separator: true },
        { label: menu.node.kind === 'section' ? 'Delete section…' : 'Delete section group…', onClick: () => onDelete(menu.node) }
      ]
    : []
  const [dropRel, setDropRel] = useState<string | null>(null)
  const dragProps = (rel: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (templateMode && e.dataTransfer.types.includes('application/x-pagebinder-page')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
        setDropRel(rel)
      }
    },
    onDragLeave: () => setDropRel((r) => (r === rel ? null : r)),
    onDrop: (e: React.DragEvent) => {
      const pageRel = e.dataTransfer.getData('application/x-pagebinder-page')
      setDropRel(null)
      if (!pageRel) return
      e.preventDefault()
      onDropPage(pageRel, rel, e.altKey)
    }
  })

  return (
    <div className="section-tabs">
      {children.map((node) =>
        node.kind === 'section' ? (
          <button
            key={node.relPath}
            type="button"
            className={`tab${node.relPath === activeSectionRel ? ' on' : ''}${dropRel === node.relPath ? ' drop' : ''}`}
            style={{ borderTopColor: node.color }}
            {...dragProps(node.relPath)}
            onClick={() => onSelectSection(node.relPath)}
            onDoubleClick={() => onRename(node.relPath)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (!templateMode) setMenu({ x: e.clientX, y: e.clientY, node })
            }}
          >
            {node.name}
          </button>
        ) : (
          <button
            key={node.relPath}
            type="button"
            className="tab group"
            style={{ borderTopColor: '#7F77DD' }}
            onClick={() => onOpenGroup(node.relPath)}
            onDoubleClick={() => onRename(node.relPath)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, node })
            }}
            title="Section group"
          >
            <span className="folder-icon">▣</span> {node.name}
          </button>
        )
      )}
      {!templateMode && (
        <button type="button" className="tab add" onClick={(e) => setAddMenu({ x: e.clientX, y: e.clientY })} title="Add section or group">
          +
        </button>
      )}
      {children.length === 0 && <span className="muted small tabs-hint">No sections yet. Use + to add one.</span>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
      {addMenu && (
        <ContextMenu
          x={addMenu.x}
          y={addMenu.y}
          items={[
            { label: 'New section…', onClick: onAddSection },
            { label: 'New section group…', onClick: onAddGroup }
          ]}
          onClose={() => setAddMenu(null)}
        />
      )}
    </div>
  )
}
