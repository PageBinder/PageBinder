import { randomBytes } from 'node:crypto'

/** Permanent random identifier for notebooks, groups, sections, pages, and objects. */
export function newId(): string {
  return randomBytes(12).toString('hex')
}

export function now(): string {
  return new Date().toISOString()
}

/** ISO timestamp made safe for file names on every platform. */
export function timestampForFileName(date = new Date()): string {
  return date.toISOString().replace(/:/g, '-')
}
