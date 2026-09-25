/**
 * pagebinder://notebook/<relative path> serves files from the open notebook to
 * the sandboxed renderer: page images and rendered page.html files only.
 */
import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveInside } from './storage/paths'
import { currentNotebookRoot, resolveRel } from './ipc'
import { readSnapshot } from './storage/page'
import { renderPageHtml } from '../shared/render/renderPage'

export const SCHEME = 'pagebinder'

export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

const ALLOWED = /(^|\/)(images\/[^/]+|attachments\/[^/]+|page\.html|\.history\/[^/]+\.json)$/

export function registerProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const root = currentNotebookRoot()
    if (url.host !== 'notebook' || !root) return new Response('No notebook open', { status: 404 })
    const relIn = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!ALLOWED.test(relIn) || relIn.includes('..')) return new Response('Forbidden', { status: 403 })
    const resolved = resolveRel(relIn)
    const rel = resolved.rel
    // A history snapshot is served as a rendered page, so the history panel can preview it.
    const snap = /^(.*)\/\.history\/([^/]+\.json)$/.exec(rel)
    if (snap) {
      try {
        const doc = await readSnapshot(resolved.root, snap[1]!, snap[2]!)
        if (!doc) return new Response('Version not readable', { status: 404 })
        const html = renderPageHtml(doc, { imageBase: '../images/', attachmentBase: '../attachments/' })
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
      } catch {
        return new Response('Version not readable', { status: 404 })
      }
    }
    let abs: string
    try {
      abs = resolveInside(resolved.root, rel)
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
    const response = await net.fetch(pathToFileURL(abs).toString())
    // Rendered pages must not be cached: they change on every save.
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  })
}

export function notebookUrl(rel: string): string {
  return `${SCHEME}://notebook/${rel.split('/').map(encodeURIComponent).join('/')}`
}
