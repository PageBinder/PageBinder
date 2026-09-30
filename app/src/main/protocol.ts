/**
 * pagebinder://notebook/<relative path> serves files from the open notebook to
 * the sandboxed renderer: page images and rendered page.html files only.
 */
import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveInside } from './storage/paths'
import { currentNotebookRoot, resolveRel } from './ipc'
import { readSnapshot, readValidPage } from './storage/page'
import { PAGE_DOC } from './storage/paths'
import { join } from 'node:path'
import { renderPageHtml } from '../shared/render/renderPage'
import { fileResponse, needsNodeRead } from './fileResponse'

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
    // A history snapshot is served as a rendered page, so the history panel can preview it, showing
    // the whole canvas as the page.html backup does.
    const snap = /^(.*)\/\.history\/([^/]+\.json)$/.exec(rel)
    if (snap) {
      try {
        const doc = await readSnapshot(resolved.root, snap[1]!, snap[2]!)
        if (!doc) return new Response('Version not readable', { status: 404 })
        const html = renderPageHtml(doc, { imageBase: '../images/', attachmentBase: '../attachments/', view: 'canvas' })
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
    // A page's rendered copy is rendered afresh from the page itself, so printing, Print Preview,
    // and PDF export always use this version's layout, even for a page last saved by an older one.
    // Nothing is written: the stored page.html is brought up to date by the page's next save.
    const page = /^(.*)\/page\.html$/.exec(rel)
    if (page) {
      const doc = await readValidPage(join(abs, '..', PAGE_DOC)).catch(() => undefined)
      if (doc) return new Response(renderPageHtml(doc, { view: 'sheets' }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
    }
    const response = needsNodeRead(abs) ? await fileResponse(abs, request.headers.get('Range')) : await net.fetch(pathToFileURL(abs).toString())
    // Rendered pages must not be cached: they change on every save.
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  })
}

export function notebookUrl(rel: string): string {
  return `${SCHEME}://notebook/${rel.split('/').map(encodeURIComponent).join('/')}`
}
