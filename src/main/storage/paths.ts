import { resolve, relative, isAbsolute, sep } from 'node:path'

export const PAGE_SUFFIX = '.page'
export const HISTORY_DIR = '.history'
export const INDEX_DIR = '.index'
export const RECYCLE_DIR = '.recycle'
export const TEMPLATES_DIR = 'templates'
export const NOTEBOOK_META = 'notebook.json'
export const GROUP_META = 'group.json'
export const SECTION_META = 'section.json'
export const PAGE_DOC = 'page.json'
export const PAGE_HTML = 'page.html'
export const ATTACHMENTS_DIR_NAME = 'attachments'
export const PAGE_DRAFT = 'page.json.autosave'
export const LOCK_FILE = '.lock'

/** Resolve a notebook-relative path and refuse anything that escapes the root. */
export function resolveInside(root: string, rel: string): string {
  const abs = resolve(root, rel)
  const back = relative(root, abs)
  if (back.startsWith('..') || isAbsolute(back)) {
    throw new Error(`Path escapes notebook root: ${rel}`)
  }
  return abs
}

export function toRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/')
}

export function isHiddenEntry(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Files the operating system drops into folders on its own: dot files (macOS .DS_Store and ._
 * resource forks), Explorer's thumbnail cache and folder settings, and the macOS custom-icon file.
 * They travel with NAS copies between the two systems and are never part of a page.
 */
const SYSTEM_FILES = new Set(['thumbs.db', 'ehthumbs.db', 'desktop.ini', 'icon\r'])
export function isSystemFile(name: string): boolean {
  return name.startsWith('.') || SYSTEM_FILES.has(name.toLowerCase())
}
