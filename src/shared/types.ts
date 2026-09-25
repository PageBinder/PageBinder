/**
 * Shared data model for PageBinder. Every file the app writes is one of these
 * shapes serialised as JSON. See PROGRAM_DESCRIPTION.md section 8.
 */

export const FORMAT_VERSION = 1

export type PaperSize = 'letter' | 'tabloid' | 'legal' | 'a4' | 'a3' | 'custom'
export type Orientation = 'portrait' | 'landscape'

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PaperSettings {
  size: PaperSize
  orientation: Orientation
  /** Only used when size is 'custom'. Inches. */
  widthIn?: number
  heightIn?: number
  /** Inches. */
  margins: Margins
}

export const DEFAULT_PAPER: PaperSettings = {
  size: 'letter',
  orientation: 'portrait',
  margins: { top: 1, right: 1, bottom: 1, left: 1 }
}

export const PAPER_DIMENSIONS_IN: Record<Exclude<PaperSize, 'custom'>, [number, number]> = {
  letter: [8.5, 11],
  tabloid: [11, 17],
  legal: [8.5, 14],
  a4: [8.27, 11.69],
  a3: [11.69, 16.54]
}

export interface NotebookMeta {
  format: number
  id: string
  name: string
  created: string
  modified: string
  /** Folder names of top-level sections and groups in display order. */
  order: string[]
  settings: {
    paper: PaperSettings
    history?: { enabled: boolean; keepAllHours: number; dailyDays: number; weeklyWeeks: number | null }
    recycleDays?: number
  }
}

export interface GroupMeta {
  format: number
  id: string
  name: string
  created: string
  /** Folder names of child sections and groups in display order. */
  order: string[]
}

export interface SectionMeta {
  format: number
  id: string
  name: string
  color: string
  created: string
  /** Page folder names in display order. */
  pageOrder: string[]
  defaultTemplate?: string
}

export interface FileEntry {
  /** File name inside images/ or attachments/ after the app's naming rules. */
  name: string
  /** Name the file arrived with, shown to the user. */
  originalName: string
  size: number
  sha256: string
  added: string
}

/** ProseMirror / TipTap JSON document. Kept loose on purpose. */
export type EditorJSON = { type: string; [key: string]: unknown }

export interface TextContainer {
  kind: 'text'
  id: string
  /** Canvas pixels, origin top-left of the canvas. */
  x: number
  y: number
  width: number
  content: EditorJSON
}

export interface ImageObject {
  kind: 'image'
  id: string
  x: number
  y: number
  width: number
  height: number
  /** File name inside the page's images folder. */
  name: string
  originalName: string
  /** Rendered in place (default) or shown as an attachment card. */
  display?: 'inline' | 'card'
}

/** Metadata read from an attached email at insert time. */
export interface MailMeta {
  subject: string
  from: string
  date: string
}

export interface FileObject {
  kind: 'file'
  id: string
  x: number
  y: number
  width: number
  /** File name inside the page's attachments folder. */
  name: string
  originalName: string
  mail?: MailMeta
}

export type DrawTool = 'line' | 'arrow' | 'rect' | 'ellipse'

/** A drawn shape. For lines and arrows, `a` and `b` are the end points; x, y, width, height is the bounding box. */
export interface ShapeObject {
  kind: 'shape'
  id: string
  shape: DrawTool
  x: number
  y: number
  width: number
  height: number
  a?: { x: number; y: number }
  b?: { x: number; y: number }
  stroke: string
  strokeWidth: number
  /** null means no fill: what is behind the shape shows through. */
  fill: string | null
}

export type CanvasObject = TextContainer | ImageObject | FileObject | ShapeObject

/** What to print in the margin bands. */
export interface PrintSettings {
  footerSheetNumbers: boolean
}

export const DEFAULT_PRINT: PrintSettings = { footerSheetNumbers: true }

export interface PageDoc {
  format: number
  id: string
  title: string
  created: string
  modified: string
  tags: string[]
  parentPageId?: string
  paper: PaperSettings
  print?: PrintSettings
  objects: CanvasObject[]
  manifest: {
    images: FileEntry[]
    attachments: FileEntry[]
  }
  /** SHA-256 of the canonical JSON of every field above. */
  checksum: string
}

/* ---------- Tree as shown in the UI ---------- */

export interface PageRef {
  id: string
  title: string
  /** Path of the page folder relative to the notebook root. */
  relPath: string
  modified: string
  parentPageId?: string
}

export interface SectionNode {
  kind: 'section'
  id: string
  name: string
  color: string
  relPath: string
  pages: PageRef[]
  defaultTemplate?: string
}

export interface GroupNode {
  kind: 'group'
  id: string
  name: string
  relPath: string
  children: TreeChild[]
}

export type TreeChild = SectionNode | GroupNode

export interface NotebookTree {
  root: string
  meta: NotebookMeta
  children: TreeChild[]
  /** Metadata files that were missing and regenerated with defaults. */
  regenerated: string[]
}

/* ---------- Results of loading and saving ---------- */

export interface RecoveryNotice {
  kind: 'recovered-from-history' | 'no-valid-version' | 'draft-available' | 'missing-files'
  message: string
  /** Snapshot file name when recovered from history. */
  snapshot?: string
}

export interface LoadPageResult {
  relPath: string
  doc: PageDoc
  notices: RecoveryNotice[]
  /** Names (under images/ or attachments/) that are missing or the wrong size. */
  missing: string[]
  /** Present when an autosave draft newer than the saved page exists. */
  draft?: PageDoc
}

export interface SavePageResult {
  /** May differ from the input when the title changed and the folder was renamed. */
  relPath: string
  doc: PageDoc
  /** Snapshot written to .history before this save, if any. */
  snapshot?: string
}

export interface HistoryEntry {
  name: string
  modified: string
  size: number
}

export const SECTION_COLORS = [
  '#1D9E75', '#D85A30', '#D4537E', '#EF9F27', '#7F77DD', '#378ADD', '#639922', '#888780'
]
