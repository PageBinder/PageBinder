/**
 * Saving in end-to-end tests. A key press sent by a test never reaches the File menu's Cmd/Ctrl+S
 * shortcut (menu shortcuts are handled outside the page), so pressing it only waited for the
 * 20-second autosave. Tests save the way the menu does instead, which made the suites many times
 * faster. The shortcut itself is checked once, in e2e.ts, by reading the File menu.
 */
import type { ElectronApplication, Page } from 'playwright'

let current: ElectronApplication | null = null

/** The app the next save goes to: call it right after each launch. */
export function useApp(app: ElectronApplication): void {
  current = app
}

/** True when the toolbar shows "All changes saved" (not "Unsaved changes" or "Saving…"). */
const settled = (): boolean => {
  const s = document.querySelector('.save-status')
  return !!s && !s.classList.contains('unsaved') && !s.classList.contains('saving')
}

/**
 * Save the open page as File > Save does, and wait until it is written. Some changes reach the page
 * a moment after the action that caused them (a picture loading, the signature fetching the user's
 * name); if the page turns unsaved again just after a save, it is saved again.
 */
export async function saveViaMenu(page: Page): Promise<void> {
  const app = current
  if (!app) throw new Error('saveViaMenu: call useApp(app) after launching the app')
  for (let attempt = 0; attempt < 20; attempt++) {
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('menu:save')
    })
    const done = await page.waitForFunction(settled, undefined, { timeout: 2000 }).then(() => true, () => false)
    if (!done) continue
    // The page list and index refresh just after the write; a late change shows up as unsaved here.
    await page.waitForTimeout(250)
    if (await page.evaluate(settled)) return
  }
  const seen = await page.evaluate(() => ({
    status: document.querySelector('.save-status')?.className ?? 'no save status shown',
    messages: Array.from(document.querySelectorAll('.error, .error-banner, .notice, .dialog')).map((e) => (e.textContent ?? '').trim().slice(0, 160))
  }))
  throw new Error(`the save did not finish: ${seen.status}; on screen: ${JSON.stringify(seen.messages)}`)
}
