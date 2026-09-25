import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export async function tempDir(): Promise<string> {
  const dir = join(tmpdir(), `pagebinder-test-${randomBytes(4).toString('hex')}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}
