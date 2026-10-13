import type { JSX } from 'react'
import { useState } from 'react'
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
  templates: TemplateInfo[]
  onSetDefaultTemplate: (rel: string, ref: string | null) => void
  onMoveCopy: (node: TreeChild) => void
  onDelete: (node: TreeChild) => void
  /** The Templates notebook is open: its sections take no default template. */
  templateMode?: boolean
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeChild } | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null)

  // Two templates with the same name are told apart by their section.
  const named = (t: TemplateInfo): string => (templates.some((o) => o !== t && o.name === t.name) ? `${t.name} (${t.section})` : t.name)
  const defaultRef = menu?.node.kind === 'section' ? menu.node.defaultTemplate : undefined
  const current = defaultRef ? templates.find((t) => t.ref === defaultRef) : undefined
  const items: MenuItem[] = menu
    ? [
        { label: 'Rename…', onClick: () => onRename(menu.node.relPath) },
        { label: 'Move or copy…', onClick: () => onMoveCopy(menu.node) },
        ...(menu.node.kind === 'section'
          ? [
              { separator: true },
              { swatches: { color: SECTION_COLORS.join(','), current: menu.node.color, onPick: (c: string) => onSetColor(menu.node.relPath, c) } },
              ...(templateMode
                ? []
                : [
                    { separator: true },
                    { label: `Default template: ${current ? named(current) : 'blank page'}`, heading: true },
                    { label: '   Use a blank page', onClick: () => onSetDefaultTemplate(menu.node.relPath, null) },
                    ...templates.map((t) => ({ label: `   Use “${named(t)}”`, onClick: () => onSetDefaultTemplate(menu.node.relPath, t.ref) }))
                  ])
            ]
          : []),
        { separator: true },
        { label: menu.node.kind === 'section' ? 'Delete section…' : 'Delete section group…', onClick: () => onDelete(menu.node) }
      ]
    : []
  return (
    <div className="section-tabs">
      {children.map((node) =>
        node.kind === 'section' ? (
          <button
            key={node.relPath}
            type="button"
            className={`tab${node.relPath === activeSectionRel ? ' on' : ''}`}
            style={{ borderTopColor: node.color }}
            onClick={() => onSelectSection(node.relPath)}
            onDoubleClick={() => onRename(node.relPath)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, node })
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
      <button type="button" className="tab add" onClick={(e) => setAddMenu({ x: e.clientX, y: e.clientY })} title="Add section or group">
        +
      </button>
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
