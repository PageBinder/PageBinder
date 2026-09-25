import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import type { ShapeObject as ShapeModel } from '@shared/types'
import { shapeSvg, lineBox, snapLineEnd } from '@shared/render/shapeSvg'

export function ShapeObject({
  obj,
  selected,
  zoom,
  onSelect,
  onDragStart,
  onMove,
  onChange,
  onContextMenu
}: {
  obj: ShapeModel
  selected: boolean
  zoom: number
  onSelect: (id: string, additive?: boolean) => void
  onDragStart: () => void
  onMove: (id: string, x: number, y: number) => void
  /** Geometry change other than a plain move: resize, or an endpoint drag. */
  onChange: (next: ShapeModel) => void
  onContextMenu: (id: string, x: number, y: number) => void
}): JSX.Element {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null)
  const endRef = useRef<{ which: 'a' | 'b'; startX: number; startY: number; origin: { x: number; y: number } } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const objRef = useRef(obj)
  objRef.current = obj

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const z = zoomRef.current
      const o = objRef.current
      if (dragRef.current) {
        const d = dragRef.current
        onMove(o.id, Math.max(0, d.x + (e.clientX - d.startX) / z), Math.max(0, d.y + (e.clientY - d.startY) / z))
      } else if (resizeRef.current) {
        const r = resizeRef.current
        onChange({ ...o, width: Math.max(8, Math.round(r.width + (e.clientX - r.startX) / z)), height: Math.max(8, Math.round(r.height + (e.clientY - r.startY) / z)) })
      } else if (endRef.current) {
        const en = endRef.current
        const raw = { x: Math.max(0, Math.round(en.origin.x + (e.clientX - en.startX) / z)), y: Math.max(0, Math.round(en.origin.y + (e.clientY - en.startY) / z)) }
        const other = en.which === 'a' ? (o.b ?? { x: o.x + o.width, y: o.y + o.height }) : (o.a ?? { x: o.x, y: o.y })
        const snapped = snapLineEnd(other, raw)
        const a = en.which === 'a' ? snapped : other
        const b = en.which === 'b' ? snapped : other
        onChange({ ...o, a, b, ...lineBox(a, b, o.strokeWidth) })
      }
    }
    const up = (): void => {
      dragRef.current = null
      resizeRef.current = null
      endRef.current = null
      document.body.classList.remove('dragging')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [onMove, onChange])

  const isLine = obj.shape === 'line' || obj.shape === 'arrow'
  const a = obj.a ?? { x: obj.x, y: obj.y }
  const b = obj.b ?? { x: obj.x + obj.width, y: obj.y + obj.height }
  return (
    <div
      data-object-id={obj.id}
      className={`shape-object${selected ? ' selected' : ''}`}
      style={{ left: obj.x, top: obj.y, width: obj.width, height: obj.height }}
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
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect(obj.id)
        onContextMenu(obj.id, e.clientX, e.clientY)
      }}
    >
      <div className="shape-body" dangerouslySetInnerHTML={{ __html: shapeSvg(obj) }} />
      {selected && !isLine && (
        <div
          className="shape-resize"
          title="Drag to resize"
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onDragStart()
            resizeRef.current = { startX: e.clientX, startY: e.clientY, width: obj.width, height: obj.height }
            document.body.classList.add('dragging')
          }}
        />
      )}
      {selected &&
        isLine &&
        (['a', 'b'] as const).map((which) => {
          const pt = which === 'a' ? a : b
          return (
            <div
              key={which}
              className="shape-end"
              style={{ left: pt.x - obj.x - 5, top: pt.y - obj.y - 5 }}
              title="Drag to move this end"
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onDragStart()
                endRef.current = { which, startX: e.clientX, startY: e.clientY, origin: pt }
                document.body.classList.add('dragging')
              }}
            />
          )
        })}
    </div>
  )
}
