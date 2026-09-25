import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { marked } from 'marked'
import type { AboutInfo, DocName } from '../../../preload/api'
import logo from '../assets/logo.png'

const DOCS: { id: DocName | 'about' | 'dependencies'; label: string }[] = [
  { id: 'about', label: 'About PageBinder' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'description', label: 'Program description' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'history-verify', label: 'Page history and Verify Notebook' },
  { id: 'recovery', label: 'Recovery guide' },
  { id: 'dependencies', label: 'Dependencies and licences' },
  { id: 'uninstall', label: 'Uninstalling' }
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function AboutDialog({ initial, onClose }: { initial: DocName | 'about' | 'dependencies'; onClose: () => void }): JSX.Element {
  const [current, setCurrent] = useState(initial)
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [html, setHtml] = useState('')

  useEffect(() => {
    void window.pagebinder.about.info().then(setInfo)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (current === 'about' || current === 'dependencies') {
      setHtml('')
      return
    }
    setHtml('<p class="muted">Loading…</p>')
    void window.pagebinder.about
      .doc(current)
      .then((md) => setHtml(marked.parse(md, { async: false }) as string))
      .catch((e: unknown) => setHtml(`<p>${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`))
  }, [current])

  const built = info?.buildTime && info.buildTime !== 'development' ? new Date(info.buildTime).toLocaleString() : 'development build'
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog about" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-nav">
          {DOCS.map((d) => (
            <button key={d.id} type="button" className={`about-link${current === d.id ? ' on' : ''}`} onClick={() => setCurrent(d.id)}>
              {d.label}
            </button>
          ))}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="about-body">
          {current === 'about' && info && (
            <div className="doc">
              <div className="brand">
                <img className="brand-logo" src={logo} alt="" />
                <h1>PageBinder</h1>
              </div>
              <p>Local-only, folder-based notebooks in the style of classic desktop OneNote. Nothing leaves this computer.</p>
              <table>
                <tbody>
                  <tr>
                    <td>Version</td>
                    <td>
                      {info.version}, built {built}
                    </td>
                  </tr>
                  <tr>
                    <td>Runtime</td>
                    <td>
                      Electron {info.electron}, Chromium {info.chrome}, Node {info.node}, {info.platform}
                    </td>
                  </tr>
                  <tr>
                    <td>Application folder</td>
                    <td>{info.appPath}</td>
                  </tr>
                  <tr>
                    <td>Settings folder</td>
                    <td>{info.userData}</td>
                  </tr>
                </tbody>
              </table>
              <p>Use the links on the left for the program description, keyboard shortcuts, how history and verification work, the recovery guide, the dependency list, and uninstall instructions.</p>
            </div>
          )}
          {current === 'dependencies' && info && (
            <div className="doc">
              <h1>Dependencies and licences</h1>
              <p>Open-source components shipped with this application, with their versions and licences.</p>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Version</th>
                    <th>Licence</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {info.dependencies.map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      <td>{d.version}</td>
                      <td>{d.license}</td>
                      <td>{d.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {current !== 'about' && current !== 'dependencies' && <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div>
  )
}
