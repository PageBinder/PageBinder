/** Recursive folder copy that clones files on APFS and never leaves a half-copied folder under the final name. */
import { promises as fs, constants as fsConstants } from 'node:fs'
import { join, dirname, basename } from 'node:path'

export async function copyDir(src: string, dest: string, skip: (name: string, relFromSrc: string) => boolean = () => false): Promise<void> {
  const tmp = join(dirname(dest), `.tmp-${basename(dest)}`)
  await fs.rm(tmp, { recursive: true, force: true })
  const walk = async (from: string, to: string, rel: string): Promise<void> => {
    await fs.mkdir(to, { recursive: true })
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name
      if (skip(entry.name, r)) continue
      if (entry.isDirectory()) await walk(join(from, entry.name), join(to, entry.name), r)
      else if (entry.isFile()) await fs.copyFile(join(from, entry.name), join(to, entry.name), fsConstants.COPYFILE_FICLONE)
    }
  }
  await walk(src, tmp, '')
  await fs.rename(tmp, dest)
}
