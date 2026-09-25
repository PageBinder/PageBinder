/**
 * Printing and PDF export. Both load the page's rendered page.html into a
 * hidden window, so paper output is exactly the rendered copy.
 */
import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { PaperSettings } from '../shared/types'
import { paperSizePx } from '../shared/render/renderPage'
import { atomicWriteFile } from './storage/atomic'
import { notebookUrl } from './protocol'
import { sanitizeFileName } from './storage/names'
import { stageForPdf, exportHtml } from './export'
import { pathToFileURL } from 'node:url'

async function loadHidden(rel: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: false } })
  await win.loadURL(notebookUrl(`${rel}/page.html`))
  // Give the pagination script a moment to build the sheets.
  await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
  return win
}

function microns(inches: number): number {
  return Math.round(inches * 25400)
}

export async function printPage(rel: string, paper: PaperSettings, parent?: BrowserWindow): Promise<void> {
  const size = paperSizePx(paper)
  const win = await loadHidden(rel)
  try {
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: 'none' },
          landscape: paper.orientation === 'landscape',
          pageSize: { width: microns(Math.min(size.widthIn, size.heightIn)), height: microns(Math.max(size.widthIn, size.heightIn)) }
        },
        (ok, reason) => (ok || reason === 'cancelled' || reason === 'Print job canceled' ? resolve() : reject(new Error(reason)))
      )
    })
  } finally {
    win.destroy()
    parent?.focus()
  }
}

export async function exportPdf(rel: string, paper: PaperSettings, title: string, outPath?: string, parent?: BrowserWindow): Promise<string | null> {
  let target = outPath
  if (!target) {
    const result = await dialog.showSaveDialog(parent!, {
      title: 'Export page as PDF',
      defaultPath: `${sanitizeFileName(title || 'page')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  const size = paperSizePx(paper)
  const win = await loadHidden(rel)
  try {
    // Chromium wants the portrait dimensions plus a landscape flag.
    const data = await win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      landscape: paper.orientation === 'landscape',
      pageSize: { width: Math.min(size.widthIn, size.heightIn), height: Math.max(size.widthIn, size.heightIn) },
      preferCSSPageSize: true
    })
    await atomicWriteFile(target, data)
    return target
  } finally {
    win.destroy()
  }
}

export async function sheetCount(rel: string): Promise<number> {
  const win = await loadHidden(rel)
  try {
    const n = (await win.webContents.executeJavaScript('Number(document.body.dataset.sheets || 1)')) as number
    return n
  } finally {
    win.destroy()
  }
}

export { join, fs }

/** File > Export: every page under `targetDir` as one PDF or one HTML file. */
export async function exportPages(targetDir: string, format: 'html' | 'pdf', suggestedName: string, parent?: BrowserWindow): Promise<string | null> {
  // Test seam: automated checks cannot drive the native save dialog.
  const preset = process.env['PAGEBINDER_TEST_SAVE_PATH']
  const result = preset
    ? { canceled: false, filePath: preset }
    : await dialog.showSaveDialog(parent!, {
        title: format === 'pdf' ? 'Export as PDF' : 'Export as HTML',
        defaultPath: `${sanitizeFileName(suggestedName || 'export')}.${format}`,
        filters: [format === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'HTML', extensions: ['html'] }]
      })
  if (result.canceled || !result.filePath) return null
  if (format === 'html') {
    await exportHtml(targetDir, result.filePath)
    return result.filePath
  }
  const staged = await stageForPdf(targetDir)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    await win.loadURL(pathToFileURL(staged.htmlPath).toString())
    await win.webContents.executeJavaScript('new Promise(r => setTimeout(r, 300))')
    const data = await win.webContents.printToPDF({ printBackground: true, margins: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true })
    await atomicWriteFile(result.filePath, data)
    return result.filePath
  } finally {
    win.destroy()
    await staged.cleanup()
  }
}
