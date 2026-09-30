import { describe, it, expect } from 'vitest'
import { msgBodyText, rtfToText, emlBodyText } from '../src/main/search/mail'

/** Compressed RTF as Outlook stores it, in the "compressed" form with only literal runs. */
function lzfu(text: string): Uint8Array {
  const raw = Buffer.from(text, 'latin1')
  const body: number[] = []
  for (let i = 0; i < raw.length; i += 8) body.push(0, ...raw.subarray(i, i + 8))
  // The decompressor stops at a dictionary reference to its own write position.
  body.push(1, 0, 0)
  const head = Buffer.alloc(16)
  head.writeUInt32LE(body.length + 12, 0)
  head.writeUInt32LE(raw.length, 4)
  head.writeUInt32LE(0x75465a4c, 8)
  return new Uint8Array([...head, ...body])
}
/** The same in the uncompressed form. */
function mela(text: string): Uint8Array {
  const raw = Buffer.from(text, 'latin1')
  const head = Buffer.alloc(16)
  head.writeUInt32LE(raw.length + 12, 0)
  head.writeUInt32LE(raw.length, 4)
  head.writeUInt32LE(0x414c454d, 8)
  return new Uint8Array([...head, ...raw])
}

const plainRtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0 Calibri;}}{\colortbl;\red0\green0\blue0;}{\*\generator Riched20;}\pard Hello Farm team,\par The tractor invoice is attached. Caf\'e9 meeting ` + '\\u8212?' + String.raw` Thursday.\par}`
const htmlRtf = String.raw`{\rtf1\ansi\fbidis\ansicpg1252\deff0\fromhtml1{\fonttbl{\f0 Arial;}}{\*\htmltag19 <html>}{\*\htmltag50 <body>}\htmlrtf {\f0 \htmlrtf0 Rabies certificate for Mae is due in October.{\*\htmltag244 <br>}\htmlrtf \par \htmlrtf0 Vet clinic{\*\htmltag58 </body>}\htmlrtf }\htmlrtf0 }`

describe('email body text for search', () => {
  it('uses the plain-text body when the message has one', () => {
    expect(msgBodyText({ body: '  Plain   body\r\ntext ' })).toBe('Plain body text')
  })

  it('reads an HTML body stored as bytes (no plain-text body)', () => {
    const html = new TextEncoder().encode('<html><body><p>Hay delivery on <b>Friday</b></p><style>p{}</style></body></html>')
    expect(msgBodyText({ html, internetCodepage: 65001 })).toContain('Hay delivery on Friday')
  })

  it('reads a compressed RTF body (no plain-text or HTML body)', () => {
    const text = msgBodyText({ compressedRtf: lzfu(plainRtf) })
    expect(text).toContain('Hello Farm team,')
    expect(text).toContain('tractor invoice is attached')
    expect(text).toContain('Café meeting — Thursday')
    expect(text).not.toContain('Calibri')
    expect(text).not.toContain('Riched20')
    expect(msgBodyText({ compressedRtf: mela(plainRtf) })).toContain('tractor invoice')
  })

  it('reads RTF that wraps an HTML message, leaving out the HTML markup', () => {
    const text = rtfToText(htmlRtf).replace(/\s+/g, ' ').trim()
    expect(text).toBe('Rabies certificate for Mae is due in October. Vet clinic')
    expect(msgBodyText({ compressedRtf: lzfu(htmlRtf) })).toBe('Rabies certificate for Mae is due in October. Vet clinic')
  })

  it('returns nothing for damaged or missing bodies', () => {
    expect(msgBodyText({})).toBe('')
    expect(msgBodyText({ compressedRtf: new Uint8Array(20) })).toBe('')
  })

  it('reads .eml bodies in plain, quoted-printable, and HTML parts', () => {
    const eml = 'Subject: x\r\nContent-Type: multipart/alternative; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nFence repair =\r\nquote\r\n--b\r\nContent-Type: text/html\r\n\r\n<p>Fence <i>repair</i> quote</p>\r\n--b--\r\n'
    expect(emlBodyText(eml)).toContain('Fence repair quote')
  })
})
