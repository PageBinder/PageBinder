/**
 * Serve a notebook file straight from disk through Node, for paths Chromium's own file loader may
 * not reach: on Windows, full paths past the classic 260-character limit. Node's file functions
 * add the \\?\ prefix there, so any length works. Byte ranges are honoured so video can seek.
 */
import { promises as fs, createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { extname } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
}

/** Paths at or past this length on Windows are served by fileResponse rather than Chromium. */
export const WINDOWS_SAFE_PATH = 250

export function needsNodeRead(abs: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' && abs.length >= WINDOWS_SAFE_PATH
}

export async function fileResponse(abs: string, rangeHeader: string | null): Promise<Response> {
  let size: number
  try {
    const stat = await fs.stat(abs)
    if (!stat.isFile()) return new Response('Not found', { status: 404 })
    size = stat.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const headers = new Headers({ 'Content-Type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' })
  const range = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null
  if (range && (range[1] || range[2])) {
    // "bytes=a-b", "bytes=a-" (to the end), or "bytes=-n" (the last n bytes).
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size || start > end) {
      headers.set('Content-Range', `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }
    start = Math.max(0, start)
    end = Math.max(start, end)
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    headers.set('Content-Length', String(end - start + 1))
    return new Response(Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream, { status: 206, headers })
  }
  headers.set('Content-Length', String(size))
  return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, { status: 200, headers })
}
