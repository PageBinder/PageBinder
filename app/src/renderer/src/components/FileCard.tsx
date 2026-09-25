import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import type { FileObject, ImageObject } from '@shared/types'
import { formatSize, fileKind, fileExt } from '@shared/format'

/** Attachment card for file objects and for pictures shown as cards. */
export function FileCard({
  obj,
  href,
  size,
  missing,
  selected,
  onSelect,
  onContextMenu,
  onOpen,
  onDragStart,
  zoom,
  onMove
}: {
  obj: FileObject | ImageObject
  href: string
  size?: number
  missing: boolean
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onContextMenu: (id: string, x: number, y: number) => void
  onOpen: (id: string) => void
  onDragStart: () => void
  zoom: number
  onMove: (id: string, x: number, y: number) => void
}): JSX.Element {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const d = dragRef.current
      if (!d) return
      const z = zoomRef.current
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) d.moved = true
      onMove(obj.id, Math.max(0, d.x + (e.clientX - d.startX) / z), Math.max(0, d.y + (e.clientY - d.startY) / z))
    }
    const up = (): void => {
      dragRef.current = null
      document.body.classList.remove('dragging')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [obj.id, onMove])

  const kind = fileKind(obj.name)
  const mail = obj.kind === 'file' ? obj.mail : undefined
  const title = mail?.subject || obj.originalName
  const meta = [size !== undefined ? formatSize(size) : '', mail?.date ? new Date(mail.date).toLocaleDateString() : ''].filter(Boolean).join(' · ')
  const iconClass = kind === 'mail' || kind === 'video' || kind === 'image' ? ` ${kind}` : ''
  const width = obj.width || 300
  return (
    <div
      data-object-id={obj.id}
      className={`file-card${kind === 'video' ? ' video' : ''}${selected ? ' selected' : ''}${missing ? ' missing' : ''}`}
      style={{ left: obj.x, top: obj.y, width }}
      title={missing ? `${obj.originalName} is missing from the page folder` : `${obj.originalName}. Double-click to open.`}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect(obj.id, e.shiftKey)
        if (e.button !== 0) return
        if ((e.target as HTMLElement).tagName === 'VIDEO') return
        e.preventDefault()
        onDragStart()
        dragRef.current = { startX: e.clientX, startY: e.clientY, x: obj.x, y: obj.y, moved: false }
        document.body.classList.add('dragging')
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (!missing) onOpen(obj.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect(obj.id)
        onContextMenu(obj.id, e.clientX, e.clientY)
      }}
    >
      <div className="file-head">
        <span className={`file-icon${iconClass}`}>{iconClass ? '' : <span className="file-ext">{fileExt(obj.name)}</span>}</span>
        <span style={{ minWidth: 0 }}>
          <span className="file-name">{title}</span>
          {mail?.from && <span className="file-sub">{mail.from}</span>}
          <span className="file-meta">{missing ? 'Missing file' : meta || 'Attachment'}</span>
        </span>
      </div>
      {kind === 'video' && !missing && <video src={href} controls preload="metadata" />}
    </div>
  )
}
