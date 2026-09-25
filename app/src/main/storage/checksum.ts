import { createHash } from 'node:crypto'
import type { PageDoc } from '../../shared/types'

/** Deterministic JSON: object keys sorted at every level, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function computePageChecksum(doc: Omit<PageDoc, 'checksum'> | PageDoc): string {
  const { checksum: _ignored, ...rest } = doc as PageDoc
  return sha256(canonicalJson(rest))
}

export function withChecksum(doc: Omit<PageDoc, 'checksum'> | PageDoc): PageDoc {
  return { ...(doc as PageDoc), checksum: computePageChecksum(doc) }
}

export function verifyChecksum(doc: PageDoc): boolean {
  return typeof doc.checksum === 'string' && doc.checksum === computePageChecksum(doc)
}
