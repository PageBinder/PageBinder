/**
 * Files attached to a page. Copied into the page's attachments folder under
 * the app's naming rules; never referenced at their original location.
 * See PROGRAM_DESCRIPTION.md sections 7 and 7.3.
 */
import { promises as fs, constants as fsConstants, createReadStream } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import type { FileEntry, MailMeta } from '../../shared/types'
import { now } from './ids'
import { sanitizeFileName, uniqueName } from './names'
import { resolveInside } from './paths'
import { atomicWriteFile, fsyncDir } from './atomic'

export const ATTACHMENTS_DIR = 'attachments'
export const IMAGES_DIR = 'images'

/** Files above this size are recorded with their size only; hashing them would take minutes. */
export const HASH_LIMIT_BYTES = 256 * 1024 * 1024

async function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject)
  })
}

async function pickName(dir: string, originalName: string): Promise<string> {
  const safe = sanitizeFileName(originalName || 'file')
  const dot = safe.lastIndexOf('.')
  const stem = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''
  return uniqueName(dir, stem, ext)
}

/**
 * Copy a file from anywhere on disk into the page folder. On APFS the copy is
 * a clone and completes instantly; elsewhere it is a full copy. The file is
 * copied to a temporary name and renamed, so a half-copied file never carries
 * the final name.
 */
export async function copyFileIntoPage(root: string, pageRel: string, sourcePath: string, sub: string, originalName = basename(sourcePath)): Promise<FileEntry> {
  const dir = join(resolveInside(root, pageRel), sub)
  await fs.mkdir(dir, { recursive: true })
  const name = await pickName(dir, originalName)
  const tmp = join(dir, `.tmp-${name}`)
  await fs.copyFile(sourcePath, tmp, fsConstants.COPYFILE_FICLONE)
  await fs.rename(tmp, join(dir, name))
  await fsyncDir(dir)
  const stat = await fs.stat(join(dir, name))
  const sha256 = stat.size <= HASH_LIMIT_BYTES ? await hashFile(join(dir, name)) : ''
  return { name, originalName, size: stat.size, sha256, added: now() }
}

export async function writeBytesIntoPage(root: string, pageRel: string, originalName: string, bytes: Buffer, sub: string): Promise<FileEntry> {
  const dir = join(resolveInside(root, pageRel), sub)
  await fs.mkdir(dir, { recursive: true })
  const name = await pickName(dir, originalName)
  await atomicWriteFile(join(dir, name), bytes)
  return { name, originalName, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), added: now() }
}

/* ---------- email metadata ---------- */

function decodeHeader(value: string): string {
  // RFC 2047 encoded words: =?charset?B?...?= and =?charset?Q?...?=
  return value
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
      try {
        if (enc.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString(charset.toLowerCase().includes('utf') ? 'utf8' : 'latin1')
        const q = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)))
        return q
      } catch {
        return text
      }
    })
    .trim()
}

/** Read subject, sender, and date from the headers of an .eml file. */
export async function readEmlMeta(path: string): Promise<MailMeta | undefined> {
  let head: string
  try {
    const handle = await fs.open(path, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
      head = buf.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
  const headers = head.split(/\r?\n\r?\n/)[0] ?? ''
  const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ')
  const get = (name: string): string => {
    const m = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(unfolded)
    return m ? decodeHeader(m[1] ?? '') : ''
  }
  const subject = get('Subject')
  const from = get('From')
  const dateRaw = get('Date')
  if (!subject && !from) return undefined
  const date = dateRaw ? new Date(dateRaw) : undefined
  return { subject, from, date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : '' }
}

/** Read subject, sender, and date from an Outlook .msg file. */
export async function readMsgMeta(path: string): Promise<MailMeta | undefined> {
  try {
    const mod = (await import('@kenjiuno/msgreader')) as unknown as { default: new (buf: ArrayBuffer) => { getFileData(): Record<string, unknown> } }
    const bytes = await fs.readFile(path)
    const reader = new mod.default(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const data = reader.getFileData()
    const subject = String(data['subject'] ?? '')
    const senderName = String(data['senderName'] ?? '')
    const senderEmail = String(data['senderEmail'] ?? '')
    const from = senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderName || senderEmail
    const rawDate = (data['messageDeliveryTime'] ?? data['clientSubmitTime'] ?? data['creationTime']) as string | undefined
    const date = rawDate ? new Date(rawDate) : undefined
    if (!subject && !from) return undefined
    return { subject, from, date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : '' }
  } catch {
    return undefined
  }
}

export async function readMailMeta(path: string): Promise<MailMeta | undefined> {
  const ext = path.toLowerCase().split('.').pop()
  if (ext === 'eml') return readEmlMeta(path)
  if (ext === 'msg') return readMsgMeta(path)
  return undefined
}

/** Verify that every file in a manifest exists with the recorded size. Returns the names that do not. */
export async function findMissingFiles(root: string, pageRel: string, entries: { sub: string; files: FileEntry[] }[]): Promise<string[]> {
  const missing: string[] = []
  for (const group of entries) {
    for (const file of group.files) {
      try {
        const stat = await fs.stat(join(resolveInside(root, pageRel), group.sub, file.name))
        if (stat.size !== file.size) missing.push(file.name)
      } catch {
        missing.push(file.name)
      }
    }
  }
  return missing
}
