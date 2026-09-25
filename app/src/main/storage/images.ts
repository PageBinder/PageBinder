/**
 * Images entering a page folder. Thin wrappers over the attachment copier.
 */
import { promises as fs } from 'node:fs'
import type { FileEntry } from '../../shared/types'
import { copyFileIntoPage, writeBytesIntoPage, IMAGES_DIR } from './attachments'

export { IMAGES_DIR }

export async function addImageBytes(root: string, pageRel: string, originalName: string, bytes: Buffer): Promise<FileEntry> {
  return writeBytesIntoPage(root, pageRel, originalName || 'image.png', bytes, IMAGES_DIR)
}

export async function addImageFile(root: string, pageRel: string, sourcePath: string): Promise<FileEntry> {
  await fs.access(sourcePath)
  return copyFileIntoPage(root, pageRel, sourcePath, IMAGES_DIR)
}
