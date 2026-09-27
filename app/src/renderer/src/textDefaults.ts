/**
 * Defaults for new text boxes, kept per computer with the app's other conveniences.
 * The spacing chosen is written into each new box's paragraphs, so a page looks the same
 * wherever it is opened, whatever the default is on that computer.
 */
import { LINE_HEIGHTS, STANDARD_LINE_HEIGHT } from '@shared/render/lineHeight'

const KEY = 'pagebinder.defaultLineHeight'

export function defaultLineHeight(): string {
  try {
    const v = localStorage.getItem(KEY)
    return v && (LINE_HEIGHTS as readonly string[]).includes(v) ? v : STANDARD_LINE_HEIGHT
  } catch {
    return STANDARD_LINE_HEIGHT
  }
}

export function setDefaultLineHeight(value: string): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* storage unavailable: the standard spacing is used */
  }
}

/** Paragraph attributes for a new text box's first paragraph, from the default. */
export function newParagraphAttrs(): { lineHeight: string } | undefined {
  const v = defaultLineHeight()
  return v === STANDARD_LINE_HEIGHT ? undefined : { lineHeight: v }
}
