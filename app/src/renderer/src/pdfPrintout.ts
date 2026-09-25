/**
 * Render the pages of a PDF attachment to PNG images, for a printout view on the page.
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const MAX_PRINTOUT_PAGES = 50

export interface RenderedPage {
  bytes: ArrayBuffer
  width: number
  height: number
  /** The page's text layer; empty for a scanned page. */
  text: string
}

/** Longest text kept per printout page, so a pathological PDF cannot bloat the page file. */
export const MAX_PRINTOUT_TEXT = 100_000

/** Plain text of one PDF page, in reading order, with line breaks where the PDF has them. */
async function pageText(page: pdfjs.PDFPageProxy): Promise<string> {
  try {
    const content = await page.getTextContent()
    let out = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      out += item.str
      out += item.hasEOL ? '\n' : item.str && !/\s$/.test(item.str) ? ' ' : ''
    }
    return out.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_PRINTOUT_TEXT)
  } catch {
    return ''
  }
}

export async function renderPdfPages(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<RenderedPage[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  const total = Math.min(doc.numPages, MAX_PRINTOUT_PAGES)
  const out: RenderedPage[] = []
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    // Two CSS pixels per PDF point: crisp on paper, modest in size.
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (blob) out.push({ bytes: await blob.arrayBuffer(), width: viewport.width / 2, height: viewport.height / 2, text: await pageText(page) })
    onProgress?.(i, total)
  }
  await task.destroy()
  return out
}
