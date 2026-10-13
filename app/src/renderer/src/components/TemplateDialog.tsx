import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'

/** Save as template: the page is copied into a section of the Templates notebook under a name. */
export function TemplateDialog({ initialName, onSave, onClose }: { initialName: string; onSave: (sectionRel: string, name: string) => Promise<void>; onClose: () => void }): JSX.Element {
  const [name, setName] = useState(initialName)
  const [sections, setSections] = useState<{ rel: string; name: string }[] | null>(null)
  const [sectionRel, setSectionRel] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void window.pagebinder.template.sections().then((list) => {
      setSections(list)
      setSectionRel(list[0]?.rel ?? '')
    })
  }, [])
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
          if (!name.trim() || !sectionRel) return
          setBusy(true)
          void onSave(sectionRel, name.trim())
            .then(onClose)
            .finally(() => setBusy(false))
        }}
      >
        <h2>Save as template</h2>
        <label>
          <span>Template name</span>
          <input ref={ref} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {sections && sections.length > 1 && (
          <label style={{ marginTop: 10 }}>
            <span>Section in the Templates notebook</span>
            <select value={sectionRel} onChange={(e) => setSectionRel(e.target.value)}>
              {sections.map((s) => (
                <option key={s.rel} value={s.rel}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          A copy of the page goes into the Templates notebook, and the template is offered in every notebook on this computer. Placeholders such as {'{{date}}'}, {'{{section}}'}, {'{{notebook}}'}, and {'{{title}}'} are filled in when a page is made from the template.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !sectionRel}>
            Save template
          </button>
        </div>
      </form>
    </div>
  )
}
