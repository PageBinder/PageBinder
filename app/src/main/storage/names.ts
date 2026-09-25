/**
 * File and folder naming rules. See PROGRAM_DESCRIPTION.md section 7.3.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { sha256 } from './checksum'

export const FOLDER_NAME_MAX = 60
export const FILE_NAME_MAX = 100

// Characters invalid on Windows plus control characters. macOS only forbids
// ':' and '/', so the Windows set covers both platforms.
const INVALID = /[<>:"/\\|?*\u0000-\u001f]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function sanitizeName(input: string, max = FOLDER_NAME_MAX): string {
  let name = input.normalize('NFC').replace(INVALID, ' ').replace(/\s+/g, ' ').trim()
  name = name.replace(/^[. ]+|[. ]+$/g, '')
  if (RESERVED.test(name)) name = `${name}_`
  if (name.length > max) name = name.slice(0, max).replace(/[. ]+$/g, '')
  if (!name) name = 'Untitled'
  return name
}

/**
 * Pick a folder or file name inside `dir` that does not yet exist, based on
 * `base` and `suffix` (for example ".page"). Collisions get " (2)", " (3)"...
 */
export async function uniqueName(dir: string, base: string, suffix = ''): Promise<string> {
  const candidates = new Set<string>()
  try {
    for (const entry of await fs.readdir(dir)) candidates.add(entry.toLowerCase())
  } catch {
    /* directory does not exist yet: anything is unique */
  }
  let name = `${base}${suffix}`
  let n = 2
  while (candidates.has(name.toLowerCase())) {
    name = `${base} (${n})${suffix}`
    n += 1
  }
  return name
}

/** Name for a file entering a page folder. Keeps the extension, caps length, hashes on overflow. */
export function sanitizeFileName(original: string): string {
  const trimmed = original.trim()
  const dot = trimmed.lastIndexOf('.')
  const rawExt = dot > 0 && trimmed.length - dot <= 16 ? trimmed.slice(dot) : ''
  const ext = rawExt.replace(INVALID, '').replace(/\s+/g, '')
  let stem = sanitizeName(dot > 0 && rawExt ? trimmed.slice(0, dot) : trimmed, 1000)
  const room = FILE_NAME_MAX - ext.length
  if (stem.length > room) {
    const tag = sha256(original).slice(0, 8)
    stem = `${stem.slice(0, room - tag.length - 1).trimEnd()}-${tag}`
  }
  return `${stem}${ext}`
}

export function pathExistsSync(path: string): Promise<boolean> {
  return fs.access(path).then(() => true, () => false)
}

export { join }
