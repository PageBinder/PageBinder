/**
 * Plain text extraction for the search index: only what a reader would see.
 */
import type { PageDoc, EditorJSON } from '../../shared/types'

function walk(node: EditorJSON | undefined, out: string[]): void {
  if (!node) return
  if (node.type === 'text' && typeof node['text'] === 'string') out.push(node['text'])
  const children = node['content'] as EditorJSON[] | undefined
  if (Array.isArray(children)) {
    for (const child of children) walk(child, out)
    // Block boundaries become line breaks so words in different paragraphs never join.
    if (node.type !== 'text' && node.type !== 'doc') out.push('\n')
  }
}

export function extractPageText(doc: PageDoc): { body: string; files: string; printouts: string } {
  const body: string[] = []
  const files: string[] = []
  const printouts: string[] = []
  for (const obj of doc.objects) {
    if (obj.kind === 'text') walk(obj.content, body)
    else if (obj.kind === 'file') {
      files.push(obj.originalName)
      if (obj.mail) files.push(obj.mail.subject, obj.mail.from)
    } else if (obj.kind === 'image') {
      files.push(obj.originalName)
      // Only printouts contribute document text; a plain attachment contributes its name alone.
      if (obj.printout?.text) printouts.push(obj.printout.text)
    }
  }
  for (const e of doc.manifest.attachments) files.push(e.originalName)
  for (const e of doc.manifest.images) files.push(e.originalName)
  return {
    body: body.join(' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(),
    files: [...new Set(files)].join('\n'),
    printouts: printouts.join('\n')
  }
}

/** Strip HTML tags and collapse whitespace, for email bodies. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
