import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { RecentNotebook } from '../../../preload/api'
import logo from '../assets/logo.png'

export function Welcome({ onCreate, onOpen, onOpenRecent, onOpenTemplates }: { onCreate: () => void; onOpen: () => void; onOpenRecent: (root: string) => void; onOpenTemplates: () => void }): JSX.Element {
  const [recent, setRecent] = useState<RecentNotebook[]>([])
  useEffect(() => {
    void window.pagebinder.notebook.recent().then(setRecent)
  }, [])
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <h1>PageBinder</h1>
        </div>
        <p className="muted">Local notebooks stored as plain folders. Nothing leaves this machine.</p>
        <div className="welcome-actions">
          <button type="button" className="primary" onClick={onCreate}>
            Create notebook
          </button>
          <button type="button" onClick={onOpen}>
            Open notebook folder
          </button>
        </div>
        <h2>System</h2>
        <ul className="recent-list">
          <li>
            <button type="button" onClick={onOpenTemplates}>
              <span className="recent-name">▦ Templates</span>
              <span className="recent-path">Every page template, in one section per notebook plus Global templates. Edit, rename, move, or delete templates here.</span>
            </button>
          </li>
        </ul>
        {recent.length > 0 && (
          <>
            <h2>Recent</h2>
            <ul className="recent-list">
              {recent.map((r) => (
                <li key={r.root}>
                  <div className="recent-row">
                    <button type="button" onClick={() => onOpenRecent(r.root)}>
                      <span className="recent-name">{r.name}</span>
                      <span className="recent-path">{r.root}</span>
                    </button>
                    <button
                      type="button"
                      className="recent-forget"
                      title="Remove from this list (the notebook folder is not touched)"
                      onClick={() => void window.pagebinder.notebook.forget(r.root).then(() => window.pagebinder.notebook.recent().then(setRecent))}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
