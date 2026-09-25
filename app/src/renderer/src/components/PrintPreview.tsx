import type { JSX } from 'react'
import { useEffect, useState } from 'react'

export function PrintPreview({
  url,
  title,
  onPrint,
  onPdf,
  onPageSetup,
  onClose
}: {
  url: string
  title: string
  onPrint: () => void
  onPdf: () => void
  onPageSetup: () => void
  onClose: () => void
}): JSX.Element {
  const [nonce] = useState(() => Date.now())
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="preview-backdrop">
      <div className="preview">
        <div className="preview-bar">
          <span className="preview-title">Print preview · {title}</span>
          <span className="spacer" />
          <button type="button" onClick={onPageSetup}>
            Page setup…
          </button>
          <button type="button" onClick={onPdf}>
            Save as PDF…
          </button>
          <button type="button" className="primary" onClick={onPrint}>
            Print…
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <iframe className="preview-frame" title="Print preview" src={`${url}?t=${nonce}`} sandbox="allow-scripts" />
      </div>
    </div>
  )
}
