/**
 * Body text of attached emails, for the search index only.
 */
import { promises as fs } from 'node:fs'
import { decompressRTF } from '@kenjiuno/decompressrtf'
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
      return msgBodyText(new mod.default(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).getFileData())
    }
  } catch {
    /* unreadable: index without a body */
  }
  return ''
}

/**
 * The body of an Outlook .msg, from whichever form the message carries. Outlook often saves only
 * an HTML body (as bytes) or only compressed RTF, with no plain-text body at all.
 */
export function msgBodyText(data: Record<string, unknown>): string {
  // eslint-disable-next-line no-control-regex
  const clean = (t: string): string => t.replace(/[\u0000-\u001f\s]+/g, ' ').trim().slice(0, MAX_TEXT)
  const body = typeof data['body'] === 'string' ? clean(data['body']) : ''
  if (body) return body
  if (typeof data['bodyHtml'] === 'string' && data['bodyHtml'].trim()) return clean(stripHtml(data['bodyHtml']))
  const html = data['html']
  if (html instanceof Uint8Array && html.length) {
    const codepage = typeof data['internetCodepage'] === 'number' ? data['internetCodepage'] : 65001
    return clean(stripHtml(decodeBytes(html, codepage)))
  }
  const rtf = data['compressedRtf']
  if (rtf instanceof Uint8Array && rtf.length >= 16) {
    try {
      return clean(rtfToText(Buffer.from(decompressRTF(Array.from(rtf))).toString('latin1')))
    } catch {
      /* damaged: no body */
    }
  }
  return ''
}

function decodeBytes(bytes: Uint8Array, codepage: number): string {
  const label = codepage === 65001 ? 'utf-8' : codepage === 1252 ? 'windows-1252' : codepage === 28591 ? 'iso-8859-1' : 'utf-8'
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Groups whose content is never body text. */
const SKIP_DESTINATIONS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'datastore', 'latentstyles'])

/**
 * Plain text from RTF, enough for search. Handles escapes, Unicode, and RTF that wraps an HTML
 * message (Outlook's \fromhtml), where the HTML markup sits in \htmltag groups and \htmlrtf marks
 * RTF-only passages; both are left out, leaving the message text.
 */
export function rtfToText(rtf: string): string {
  const out: string[] = []
  const win1252 = new TextDecoder('windows-1252')
  // Per group: skipping this group's text, and inside an \htmlrtf passage.
  let state = { skip: false, htmlrtf: false, uc: 1 }
  const stack: (typeof state)[] = []
  let pendingSkip = 0
  let i = 0
  const emit = (t: string): void => {
    if (pendingSkip > 0) {
      const n = Math.min(pendingSkip, t.length)
      pendingSkip -= n
      t = t.slice(n)
    }
    if (t && !state.skip && !state.htmlrtf) out.push(t)
  }
  while (i < rtf.length) {
    const c = rtf[i]!
    if (c === '{') {
      stack.push(state)
      state = { ...state }
      i++
      // A group starting with \* is an optional destination: never text.
      if (rtf.startsWith('\\*', i)) state.skip = true
      continue
    }
    if (c === '}') {
      state = stack.pop() ?? state
      i++
      continue
    }
    if (c === '\\') {
      const next = rtf[i + 1] ?? ''
      if (next === '\\' || next === '{' || next === '}') {
        emit(next)
        i += 2
        continue
      }
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4)
        emit(win1252.decode(Uint8Array.of(parseInt(hex, 16) || 32)))
        i += 4
        continue
      }
      if (next === '~') {
        emit(' ')
        i += 2
        continue
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40))
      if (!m) {
        i += 2
        continue
      }
      const [all, word, num] = m as unknown as [string, string, string | undefined]
      i += 1 + all.length
      if (SKIP_DESTINATIONS.has(word)) state.skip = true
      else if (word === 'htmltag') state.skip = true
      else if (word === 'htmlrtf') state.htmlrtf = num !== '0'
      else if (word === 'uc') state.uc = Number(num ?? 1)
      else if (word === 'u') {
        let code = Number(num ?? 0)
        if (code < 0) code += 65536
        emit(String.fromCharCode(code))
        pendingSkip = state.uc
      } else if (word === 'par' || word === 'line' || word === 'sect' || word === 'page' || word === 'row') {
        // A break keeps words apart even in an \htmlrtf passage, where it stands for the HTML's <br> or <p>.
        if (!state.skip) out.push('\n')
      }
      else if (word === 'tab' || word === 'cell') emit(' ')
      continue
    }
    if (c === '\r' || c === '\n') {
      i++
      continue
    }
    emit(c)
    i++
  }
  return out.join('')
}
