import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'

export function TemplateDialog({ initialName, onSave, onClose }: { initialName: string; onSave: (scope: 'notebook' | 'global', name: string, description: string) => Promise<void>; onClose: () => void }): JSX.Element {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<'notebook' | 'global'>('notebook')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])
  return (
    <div className="dialog-backdrop" onMouseDown={busy ? undefined : onClose}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          setBusy(true)
          void onSave(scope, name.trim(), description.trim())
            .then(onClose)
            .finally(() => setBusy(false))
        }}
      >
        <h2>Save as template</h2>
        <label>
          <span>Template name</span>
          <input ref={ref} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ marginTop: 10 }}>
          <span>Description (optional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label style={{ marginTop: 10 }}>
          <span>Library</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as 'notebook' | 'global')}>
            <option value="notebook">This notebook (travels with the notebook folder)</option>
            <option value="global">All notebooks on this computer</option>
          </select>
        </label>
        <p className="muted small" style={{ marginTop: 10 }}>
          Text, tables, and pictures are kept. Placeholders such as {'{{date}}'}, {'{{section}}'}, {'{{notebook}}'}, and {'{{title}}'} are filled in when a page is made from the template. Attachments are not allowed in templates.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Save template
          </button>
        </div>
      </form>
    </div>
  )
}
