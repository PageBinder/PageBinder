/**
 * In-page search highlighting with the CSS Custom Highlight API, which marks
 * text without touching the editor's DOM.
 */
type HighlightCtor = new (...ranges: Range[]) => unknown
interface HighlightRegistry {
  set(name: string, h: unknown): void
  delete(name: string): void
}

function registry(): HighlightRegistry | undefined {
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights
}

function ctor(): HighlightCtor | undefined {
  return (window as unknown as { Highlight?: HighlightCtor }).Highlight
}

/** Find every occurrence of the terms in the text nodes under `root`. */
export function findRanges(root: HTMLElement, terms: string[]): Range[] {
  const needles = terms.map((t) => t.toLowerCase()).filter(Boolean)
  if (!needles.length) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? ''
    const lower = text.toLowerCase()
    for (const needle of needles) {
      let from = 0
      for (;;) {
        const at = lower.indexOf(needle, from)
        if (at < 0) break
        const r = document.createRange()
        r.setStart(node, at)
        r.setEnd(node, at + needle.length)
        ranges.push(r)
        from = at + needle.length
      }
    }
  }
  ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b))
  return ranges
}

export function applyHighlights(ranges: Range[], active: number): void {
  const reg = registry()
  const H = ctor()
  if (!reg || !H) return
  reg.set('search', new H(...ranges))
  const current = ranges[active]
  if (current) reg.set('search-active', new H(current))
  else reg.delete('search-active')
}

export function clearHighlights(): void {
  const reg = registry()
  if (!reg) return
  reg.delete('search')
  reg.delete('search-active')
}

export function scrollToRange(range: Range): void {
  const rect = range.getBoundingClientRect()
  const el = range.startContainer.parentElement
  if (!el) return
  if (rect.top < 120 || rect.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center' })
}
