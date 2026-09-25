/**
 * The one list of editor extensions. The app's editors and the page.html
 * renderer both use it, so what is editable is exactly what is rendered.
 */
import { StarterKit } from '@tiptap/starter-kit'
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { DocTableRow, RowResize } from './rowResize'
import { TableSizing } from './tableSizing'
import { TableBorders, bordersToStyle, type Borders } from './tableBorders'
import { TabKey } from './tabKey'
import { TableContentPaste } from './tableContentPaste'

/** Cells carry a fill colour and vertical alignment, set from the table toolbar. */
const cellAttributes = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || el.getAttribute('data-bg') || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs['backgroundColor'] ? { style: `background-color: ${attrs['backgroundColor']}`, 'data-bg': attrs['backgroundColor'] } : {})
  },
  borders: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute('data-borders')
      if (!raw) return null
      try {
        return JSON.parse(raw) as Borders
      } catch {
        return null
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const b = attrs['borders'] as Borders | null
      if (!b || !Object.keys(b).length) return {}
      return { style: bordersToStyle(b), 'data-borders': JSON.stringify(b) }
    }
  }
}

export const DocTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes }
  }
})
export const DocTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes }
  }
})

export const FONT_FAMILIES = [
  { label: 'System', value: '' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", sans-serif' },
  { label: 'Wingdings 2', value: '"Wingdings 2"' }
]

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

export function documentExtensions() {
  return [
    StarterKit.configure({ link: { openOnClick: false } }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 40 }, tableCell: false, tableHeader: false, tableRow: false }),
    DocTableCell,
    DocTableHeader,
    DocTableRow,
    RowResize,
    TableSizing,
    TableBorders,
    TabKey,
    TableContentPaste,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyleKit,
    TextAlign.configure({ types: ['heading', 'paragraph'] })
  ]
}
