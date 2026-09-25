import type { JSX } from 'react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

export interface NameDialogSpec {
  kind: 'name'
  title: string
  label: string
  initial?: string
  submitLabel?: string
  allowEmpty?: boolean
  onSubmit: (value: string) => void
}

export interface ConfirmDialogSpec {
  kind: 'confirm'
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

export type DialogSpec = NameDialogSpec | ConfirmDialogSpec

export function Dialog({ spec, onClose }: { spec: DialogSpec; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState(spec.kind === 'name' ? (spec.initial ?? '') : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit(e: FormEvent): void {
    e.preventDefault()
    if (spec.kind === 'name') {
      if (!value.trim() && !spec.allowEmpty) return
      spec.onSubmit(value.trim())
    } else {
      spec.onConfirm()
    }
    onClose()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form className="dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{spec.title}</h2>
        {spec.kind === 'name' ? (
          <label>
            <span>{spec.label}</span>
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        ) : (
          <p>{spec.message}</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={spec.kind === 'confirm' && spec.danger ? 'danger' : 'primary'} ref={spec.kind === 'confirm' ? (el) => el?.focus() : undefined}>
            {spec.kind === 'name' ? (spec.submitLabel ?? 'OK') : (spec.confirmLabel ?? 'OK')}
          </button>
        </div>
      </form>
    </div>
  )
}
