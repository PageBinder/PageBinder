import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchHit, SearchResults, IndexProgress } from '../../../preload/api'

export function SearchBox({
  sectionRel,
  sectionName,
  onOpen
}: {
  sectionRel: string | null
  sectionName: string | undefined
  onOpen: (hit: SearchHit, query: string) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'notebook' | 'section'>('notebook')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [progress, setProgress] = useState<IndexProgress | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  useEffect(() => {
    void window.pagebinder.search.status().then(setProgress)
    return window.pagebinder.search.onProgress(setProgress)
  }, [])

  const runQuery = useCallback(
    (q: string, sc: 'notebook' | 'section') => {
      const id = ++requestId.current
      if (!q.trim()) {
        setResults(null)
        return
      }
      void window.pagebinder.search.query(q, sc === 'section' && sectionRel ? sectionRel : '').then((r) => {
        if (id === requestId.current) {
          setResults(r)
          setCursor(0)
        }
      })
    },
    [sectionRel]
  )

  useEffect(() => {
    const t = window.setTimeout(() => runQuery(query, scope), 40)
    return () => window.clearTimeout(t)
  }, [query, scope, runQuery])

  // Close when clicking elsewhere; Cmd/Ctrl+F focuses the box.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const flat: SearchHit[] = results ? [...results.titles, ...results.pages, ...results.files] : []
  const choose = (hit: SearchHit): void => {
    onOpen(hit, query)
    setOpen(false)
  }
  const group = (label: string, hits: SearchHit[], offset: number): JSX.Element | null =>
    hits.length ? (
      <div className="search-group">
        <div className="search-group-label">{label}</div>
        {hits.map((h, i) => (
          <button
            key={`${h.kind}:${h.rel}:${h.matchedIn}`}
            type="button"
            className={`search-hit${offset + i === cursor ? ' cursor' : ''}`}
            onMouseEnter={() => setCursor(offset + i)}
            onClick={() => choose(h)}
          >
            <span className="search-hit-icon">{h.kind === 'page' ? '▫' : h.kind === 'section' ? '▭' : '▣'}</span>
            <span className="search-hit-text">
              <span className="search-hit-title">{h.title || 'Untitled'}</span>
              {h.kind === 'page' && h.section && <span className="search-hit-where"> · {h.section}</span>}
              {h.snippet && h.matchedIn !== 'title' && <span className="search-hit-snippet" dangerouslySetInnerHTML={{ __html: h.snippet.replace(/</g, (m, off, str) => (str.startsWith('<b>', off) || str.startsWith('</b>', off) ? m : '&lt;')) }} />}
            </span>
          </button>
        ))}
      </div>
    ) : null

  const indexing = progress?.phase === 'indexing'
  return (
    <div className="search-box" ref={boxRef}>
      <div className="search-field">
        <span className="search-icon">⌕</span>
        <input
          ref={inputRef}
          value={query}
          placeholder={indexing ? `Indexing ${progress!.done} of ${progress!.total}…` : 'Search (⌘F)'}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(flat.length - 1, c + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            } else if (e.key === 'Enter') {
              const hit = flat[cursor]
              if (hit) choose(hit)
            }
          }}
        />
        <select className="search-scope" value={scope} onChange={(e) => setScope(e.target.value as 'notebook' | 'section')} title="Where to search">
          <option value="notebook">This notebook</option>
          <option value="section" disabled={!sectionRel}>
            {sectionName ? `Section: ${sectionName}` : 'This section'}
          </option>
        </select>
      </div>
      {open && query.trim() && (
        <div className="search-dropdown">
          {results && flat.length === 0 && <div className="search-empty">No matches{indexing ? ' yet. Indexing is still running.' : '.'}</div>}
          {results && group('Section and page titles', results.titles, 0)}
          {results && group('In pages', results.pages, results.titles.length)}
          {results && group('Attachments', results.files, results.titles.length + results.pages.length)}
          {results?.truncated && <div className="search-empty">More matches exist. Keep typing to narrow the search.</div>}
          {indexing && <div className="search-empty">Indexing {progress!.done} of {progress!.total} pages…</div>}
        </div>
      )}
    </div>
  )
}
