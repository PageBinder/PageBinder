import { describe, it, expect } from 'vitest'
import { renderPageHtml } from '../src/shared/render/renderPage'
import { newPageDoc } from '../src/main/storage/page'
import type { PageDoc } from '../src/shared/types'

function docWith(objects: PageDoc['objects']): PageDoc {
  return { ...newPageDoc('Render me'), objects }
}

describe('renderPageHtml', () => {
  it('renders text, lists, tables, task items, images and attachment cards', () => {
    const html = renderPageHtml(
      docWith([
        {
          kind: 'text', id: 'a', x: 96, y: 96, width: 400,
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }] },
              { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] }] },
              { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pass' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '60 m' }] }] }] }] }
            ]
          }
        },
        { kind: 'image', id: 'b', x: 500, y: 200, width: 200, height: 100, name: 'photo 1.jpg', originalName: 'photo 1.jpg' },
        { kind: 'image', id: 'c', x: 500, y: 400, width: 260, height: 0, name: 'scan.png', originalName: 'scan.png', display: 'card' }
      ])
    )
    expect(html).toContain('<title>Render me</title>')
    expect(html).toContain('class="file-card"')
    expect(html).toContain('href="images/scan.png"')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('<th')
    expect(html).toContain('<td')
    expect(html).toContain('src="images/photo%201.jpg"')
    expect(html).toContain('@page { size: 8.5in 11in; margin: 0; }')
    expect(html).toContain('data-paper-w="816"')
  })

  it('uses the paper size and orientation', () => {
    const doc = docWith([])
    doc.paper = { ...doc.paper, size: 'tabloid', orientation: 'landscape' }
    const html = renderPageHtml(doc)
    expect(html).toContain('@page { size: 17in 11in; margin: 0; }')
    expect(html).toContain('data-paper-w="1632"')
    expect(html).toContain('data-paper-h="1056"')
  })

  it('escapes the title', () => {
    const doc = docWith([])
    doc.title = '<script>x</script>'
    expect(renderPageHtml(doc)).not.toContain('<script>x')
  })
})
