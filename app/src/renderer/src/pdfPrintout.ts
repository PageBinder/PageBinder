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
    if (blob) out.push({ bytes: await blob.arrayBuffer(), width: viewport.width / 2, height: viewport.height / 2 })
    onProgress?.(i, total)
  }
  await task.destroy()
  return out
}
