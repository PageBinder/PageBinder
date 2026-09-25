/**
 * Body text of attached emails, for the search index only.
 */
import { promises as fs } from 'node:fs'
import { stripHtml } from './text'

const MAX_BYTES = 512 * 1024
const MAX_TEXT = 100_000

function decodeQuotedPrintable(text: string): string {
  return text.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
}

/** Extract readable text from a .eml body: handles plain, quoted-printable, base64, and HTML parts. */
export function emlBodyText(raw: string): string {
  const [headerPart, ...rest] = raw.split(/\r?\n\r?\n/)
  const headers = (headerPart ?? '').replace(/\r?\n[ \t]+/g, ' ')
  const body = rest.join('\n\n')
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(headers)?.[1]
  const parts: { headers: string; body: string }[] = []
  if (boundary && body.includes(`--${boundary}`)) {
    for (const chunk of body.split(`--${boundary}`)) {
      const [h, ...b] = chunk.split(/\r?\n\r?\n/)
      if (b.length) parts.push({ headers: (h ?? '').replace(/\r?\n[ \t]+/g, ' '), body: b.join('\n\n') })
    }
  } else {
    parts.push({ headers, body })
  }
  const texts: string[] = []
  for (const part of parts) {
    const type = /content-type:\s*([^;\s]+)/i.exec(part.headers)?.[1]?.toLowerCase() ?? 'text/plain'
    if (!type.startsWith('text/')) continue
    const enc = /content-transfer-encoding:\s*([^\s;]+)/i.exec(part.headers)?.[1]?.toLowerCase() ?? ''
    let text = part.body
    if (enc === 'base64') {
      try {
        text = Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8')
      } catch {
        continue
      }
    } else if (enc === 'quoted-printable') text = decodeQuotedPrintable(text)
    texts.push(type === 'text/html' ? stripHtml(text) : text)
  }
  return texts.join('\n').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

export async function readMailBody(path: string): Promise<string> {
  const ext = path.toLowerCase().split('.').pop()
  try {
    if (ext === 'eml') {
      const handle = await fs.open(path, 'r')
      try {
        const buf = Buffer.alloc(MAX_BYTES)
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
        return emlBodyText(buf.subarray(0, bytesRead).toString('utf8'))
      } finally {
        await handle.close()
      }
    }
    if (ext === 'msg') {
      const mod = (await import('@kenjiuno/msgreader')) as unknown as { default: new (buf: ArrayBuffer) => { getFileData(): Record<string, unknown> } }
      const bytes = await fs.readFile(path)
      const data = new mod.default(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).getFileData()
      const body = typeof data['body'] === 'string' ? (data['body'] as string) : typeof data['bodyHtml'] === 'string' ? stripHtml(data['bodyHtml'] as string) : ''
      return body.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    }
  } catch {
    /* unreadable: index without a body */
  }
  return ''
}
