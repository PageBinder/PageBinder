import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import type { ImageObject as ImageObjectModel } from '@shared/types'
import { formatSize } from '@shared/format'

const MIN = 24

export function ImageObject({
  obj,
  src,
  size,
  selected,
  onSelect,
  onContextMenu,
  onDragStart,
  zoom,
  onMove,
  onResize,
  onNaturalSize
}: {
  obj: ImageObjectModel
  src: string
  /** File size in bytes from the manifest, for the card. */
  size?: number
  selected: boolean
  onContextMenu: (id: string, x: number, y: number) => void
  onDragStart: () => void
  zoom: number
  onSelect: (id: string, additive?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, width: number, height: number) => void
  onNaturalSize: (id: string, width: number, height: number) => void
}): JSX.Element {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const resizeRef = useRef<{ startX: number; width: number; height: number } | null>(null)

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const z = zoomRef.current
      if (dragRef.current) {
        const d = dragRef.current
        onMove(obj.id, Math.max(0, d.x + (e.clientX - d.startX) / z), Math.max(0, d.y + (e.clientY - d.startY) / z))
      } else if (resizeRef.current) {
        const r = resizeRef.current
        const width = Math.max(MIN, r.width + (e.clientX - r.startX) / z)
        onResize(obj.id, Math.round(width), Math.round((width * r.height) / r.width))
      }
    }
    const up = (): void => {
      dragRef.current = null
      resizeRef.current = null
      document.body.classList.remove('dragging')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [obj.id, onMove, onResize])

  const sized = obj.width > 0 && obj.height > 0
  const card = obj.display === 'card'
  return (
    <div
      data-object-id={obj.id}
      className={`${card ? 'file-card' : 'image-object'}${selected ? ' selected' : ''}`}
      style={card ? { left: obj.x, top: obj.y, width: obj.width || 260 } : { left: obj.x, top: obj.y, width: sized ? obj.width : 'auto', height: sized ? obj.height : 'auto' }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect(obj.id)
        onContextMenu(obj.id, e.clientX, e.clientY)
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect(obj.id, e.shiftKey)
        if (e.button !== 0) return
        e.preventDefault()
        onDragStart()
        dragRef.current = { startX: e.clientX, startY: e.clientY, x: obj.x, y: obj.y }
        document.body.classList.add('dragging')
      }}
      onClick={(e) => e.stopPropagation()}
      title={obj.originalName}
    >
      {card ? (
        <>
          <span className="file-icon" />
          <span style={{ minWidth: 0 }}>
            <span className="file-name">{obj.originalName}</span>
            <br />
            <span className="file-meta">{size !== undefined ? formatSize(size) : 'Picture'}</span>
          </span>
        </>
      ) : (
      <img
        src={src}
        alt={obj.originalName}
        draggable={false}
        onLoad={(e) => {
          if (!sized) {
            const img = e.currentTarget
            const scale = Math.min(1, 480 / Math.max(1, img.naturalWidth))
            onNaturalSize(obj.id, Math.round(img.naturalWidth * scale) || 200, Math.round(img.naturalHeight * scale) || 150)
          }
        }}
      />
      )}
      {selected && !card && (
        <div
          className="image-resize"
          title="Drag to resize"
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onDragStart()
            resizeRef.current = { startX: e.clientX, width: obj.width, height: obj.height }
            document.body.classList.add('dragging')
          }}
        />
      )}
    </div>
  )
}
