import { describe, it, expect } from 'vitest'
import { sanitizeName, sanitizeFileName, FILE_NAME_MAX } from '../src/main/storage/names'

describe('sanitizeName', () => {
  it('replaces characters invalid on Windows', () => {
    expect(sanitizeName('RE: Ridge Road / survey?')).toBe('RE Ridge Road survey')
  })
  it('caps length at 60 for folders', () => {
    expect(sanitizeName('a'.repeat(200)).length).toBe(60)
  })
  it('strips leading and trailing dots and spaces', () => {
    expect(sanitizeName('  .hidden. ')).toBe('hidden')
  })
  it('falls back to Untitled', () => {
    expect(sanitizeName('???')).toBe('Untitled')
  })
  it('avoids reserved device names', () => {
    expect(sanitizeName('CON')).toBe('CON_')
  })
})

describe('sanitizeFileName', () => {
  it('keeps the extension and caps at 100 characters with a hash', () => {
    const name = sanitizeFileName(`${'subject '.repeat(40)}.msg`)
    expect(name.endsWith('.msg')).toBe(true)
    expect(name.length).toBeLessThanOrEqual(FILE_NAME_MAX)
    expect(name).toMatch(/-[0-9a-f]{8}\.msg$/)
  })
  it('leaves short names alone', () => {
    expect(sanitizeFileName('scan.e57')).toBe('scan.e57')
  })
})
