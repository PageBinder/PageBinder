/**
 * Renders a page document to a self-contained HTML file. Used for page.html,
 * print preview, printing, and PDF export, so all four look the same.
 */
import { generateHTML } from '@tiptap/html/server'
import { PAPER_DIMENSIONS_IN, DEFAULT_PRINT, type PageDoc, type PaperSettings } from '../types'
import { documentExtensions } from './extensions'
import { docCss, DOC_FONT } from './docCss'
import { paginateScript } from './paginate'
import { formatSize, fileKind, fileExt } from '../format'
import { shapeSvg } from './shapeSvg'

const DPI = 96

export function paperSizePx(paper: PaperSettings): { width: number; height: number; widthIn: number; heightIn: number } {
  let w: number
  let h: number
  if (paper.size === 'custom') {
    w = paper.widthIn ?? 8.5
    h = paper.heightIn ?? 11
  } else {
    ;[w, h] = PAPER_DIMENSIONS_IN[paper.size]
  }
  if (paper.orientation === 'landscape') [w, h] = [h, w]
  return { width: Math.round(w * DPI), height: Math.round(h * DPI), widthIn: w, heightIn: h }
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function attr(text: string): string {
  return esc(text)
}


/** Markup for an attachment card, shared by pictures shown as cards and file objects. */
export function fileCardHtml(opts: { id: string; href: string; x: number; y: number; width: number; name: string; meta: string; kind: string; sub?: string }): string {
  const iconClass = opts.kind === 'mail' || opts.kind === 'video' || opts.kind === 'image' ? ` ${opts.kind}` : ''
  const ext = iconClass ? '' : `<span class="file-ext">${esc(fileExt(opts.name))}</span>`
  return `<a class="file-card" data-id="${attr(opts.id)}" href="${attr(opts.href)}" style="left:${opts.x}px;top:${opts.y}px;width:${opts.width}px"><span class="file-head"><span class="file-icon${iconClass}">${ext}</span><span style="min-width:0"><span class="file-name">${esc(opts.name)}</span>${opts.sub ? `<span class="file-sub">${esc(opts.sub)}</span>` : ''}<span class="file-meta">${esc(opts.meta)}</span></span></span></a>`
}

export function renderObjectsHtml(doc: PageDoc, imageBase = 'images/', attachmentBase = 'attachments/'): string {
  const extensions = documentExtensions()
  return doc.objects
    .map((obj) => {
      if (obj.kind === 'text') {
        let inner = ''
        try {
          inner = generateHTML(obj.content as Parameters<typeof generateHTML>[0], extensions)
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err)
          inner = `<p><em>This container could not be rendered.</em></p><!-- ${esc(why).replace(/--/g, '- -')} -->`
        }
        return `<div class="text-container" data-id="${attr(obj.id)}" style="left:${obj.x}px;top:${obj.y}px;width:${obj.width}px"><div class="editor"><div class="tiptap">${inner}</div></div></div>`
      }
      if (obj.kind === 'shape') {
        return `<div class="shape-object" data-id="${attr(obj.id)}" style="left:${obj.x}px;top:${obj.y}px;width:${obj.width}px;height:${obj.height}px">${shapeSvg(obj)}</div>`
      }
      if (obj.kind === 'file') {
        const entry = doc.manifest.attachments.find((e) => e.name === obj.name)
        const kind = fileKind(obj.name)
        const meta = [entry ? formatSize(entry.size) : '', obj.mail?.date ? new Date(obj.mail.date).toLocaleDateString() : ''].filter(Boolean).join(' · ')
        return fileCardHtml({
          id: obj.id,
          href: attachmentBase + encodeURIComponent(obj.name),
          x: obj.x,
          y: obj.y,
          width: obj.width,
          name: obj.mail?.subject || obj.originalName,
          meta,
          kind,
          ...(obj.mail ? { sub: obj.mail.from } : {})
        })
      }
      if (obj.display === 'card') {
        const entry = doc.manifest.images.find((e) => e.name === obj.name)
        return fileCardHtml({ id: obj.id, href: imageBase + encodeURIComponent(obj.name), x: obj.x, y: obj.y, width: obj.width, name: obj.originalName, meta: entry ? formatSize(entry.size) : '', kind: 'image' })
      }
      return `<div class="image-object" data-id="${attr(obj.id)}" style="left:${obj.x}px;top:${obj.y}px;width:${obj.width}px;height:${obj.height}px"><img src="${attr(imageBase + encodeURIComponent(obj.name))}" alt="${attr(obj.originalName)}"></div>`
    })
    .join('\n')
}

const pageCss = `
html, body { margin: 0; padding: 0; }
body { background: #e4e2dc; font-family: ${DOC_FONT}; color: #2c2c2a; }
.chrome { padding: 10px 16px; background: #f8f7f4; border-bottom: 1px solid #d9d7d0; font-size: 12px; color: #5f5e5a; display: flex; gap: 16px; align-items: baseline; }
.chrome b { color: #2c2c2a; font-size: 14px; }
#sheets { padding: 24px; display: flex; flex-direction: column; gap: 24px; align-items: center; }
.sheet { position: relative; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15); overflow: hidden; }
.clip { position: absolute; overflow: hidden; }
.clip #canvas, .clip > div { position: absolute; left: 0; top: 0; }
.band { position: absolute; display: flex; align-items: center; font-size: 10px; color: #8a8983; padding: 0 2px; box-sizing: border-box; }
.band.footer { justify-content: flex-end; }
#measure { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; }
#canvas { position: relative; }
.unpaginated #sheets { display: none; }
@media print {
  body { background: #fff; }
  .chrome { display: none; }
  #sheets { padding: 0; gap: 0; display: block; }
  .sheet { box-shadow: none; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
}
`

export function renderPageHtml(doc: PageDoc, options: { imageBase?: string; attachmentBase?: string } = {}): string {
  const paper = paperSizePx(doc.paper)
  const m = doc.paper.margins
  const print = doc.print ?? DEFAULT_PRINT
  const created = new Date(doc.created)
  const dateText = Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  const objects = renderObjectsHtml(doc, options.imageBase, options.attachmentBase)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="PageBinder">
<title>${esc(doc.title || 'Untitled page')}</title>
<style>
@page { size: ${paper.widthIn}in ${paper.heightIn}in; margin: 0; }
${pageCss}
${docCss}
</style>
</head>
<body class="unpaginated"
  data-paper-w="${paper.width}" data-paper-h="${paper.height}"
  data-mt="${Math.round(m.top * DPI)}" data-mr="${Math.round(m.right * DPI)}" data-mb="${Math.round(m.bottom * DPI)}" data-ml="${Math.round(m.left * DPI)}"
  data-title="${attr(doc.title)}" data-date="${attr(dateText)}"
  data-footer-nums="${print.footerSheetNumbers ? 1 : 0}">
<div class="chrome"><b>${esc(doc.title || 'Untitled page')}</b><span>Rendered copy from PageBinder. Open the page in PageBinder to edit it.</span><span>${esc(dateText)}</span></div>
<div id="measure"><div id="canvas">
${objects}
</div></div>
<div id="sheets"></div>
<script>${paginateScript}</script>
</body>
</html>
`
}
