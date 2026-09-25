import { describe, it, expect } from 'vitest'
import { canonicalJson, withChecksum, verifyChecksum } from '../src/main/storage/checksum'
import { newPageDoc } from '../src/main/storage/page'

describe('checksum', () => {
  it('canonical JSON is independent of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
  })
  it('a new page verifies', () => {
    expect(verifyChecksum(newPageDoc('x'))).toBe(true)
  })
  it('any change to the content breaks verification', () => {
    const doc = newPageDoc('x')
    expect(verifyChecksum({ ...doc, title: 'y' })).toBe(false)
    expect(verifyChecksum(withChecksum({ ...doc, title: 'y' }))).toBe(true)
  })
})
