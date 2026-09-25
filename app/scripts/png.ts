/** Test pictures built in code, so their bytes are identical on every platform. */
import { crc32, deflateSync } from 'node:zlib'

/** An 8 x 8 PNG, solid teal, encoded here so its bytes are the same on every platform. */
export function tealPng(): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(8, 0)
  header.writeUInt32BE(8, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array.from({ length: 8 }, () => [0x1d, 0x9e, 0x75]).flat()])))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
