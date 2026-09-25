/**
 * Atomic, durable file writes. See PROGRAM_DESCRIPTION.md section 15.3.
 *
 * Every write goes to a temporary file in the same directory, is fsynced,
 * and is then renamed over the target. The directory is fsynced afterwards
 * so the rename itself survives power loss. A reader, or a backup job,
 * can only ever observe the complete old file or the complete new file.
 */
import { promises as fs } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { randomBytes } from 'node:crypto'

export const TMP_PREFIX = '.tmp-'

export async function fsyncDir(dir: string): Promise<void> {
  // Directory fsync is supported on macOS and Linux. Windows cannot open a
  // directory handle this way, so the failure is ignored there.
  try {
    const handle = await fs.open(dir, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    /* not supported on this platform */
  }
}

/**
 * Rename, retrying briefly on Windows. There a rename fails with EPERM, EACCES, or EBUSY while
 * another program holds the file or folder open without sharing delete access: a virus scanner,
 * the search indexer, a backup job, or Explorer's preview pane. Those holds last milliseconds to a
 * second or two, so the rename is tried again for up to about three seconds before giving up.
 */
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY'])
export async function renameDurable(from: string, to: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  const delays = platform === 'win32' ? [20, 50, 100, 200, 400, 800, 1200] : []
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      const wait = delays[attempt]
      if (wait === undefined || !TRANSIENT.has(code)) throw err
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}

export async function atomicWriteFile(target: string, data: string | Buffer): Promise<void> {
  const dir = dirname(target)
  const tmp = join(dir, `${TMP_PREFIX}${basename(target)}-${randomBytes(6).toString('hex')}`)
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await renameDurable(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
  await fsyncDir(dir)
}

/** Copy a file durably: read, atomic write. Files here are small (page documents). */
export async function durableCopy(src: string, dest: string): Promise<void> {
  const data = await fs.readFile(src)
  await atomicWriteFile(dest, data)
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/** Remove leftover temporary files from interrupted writes in a directory. */
export async function cleanTempFiles(dir: string): Promise<string[]> {
  const removed: string[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return removed
  }
  for (const name of entries) {
    if (name.startsWith(TMP_PREFIX)) {
      await fs.rm(join(dir, name), { force: true })
      removed.push(name)
    }
  }
  return removed
}
