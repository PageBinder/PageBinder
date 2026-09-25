/** Palette and recent colours shared by every colour menu. */
export const PALETTE: string[] = [
  // The first row matches the earlier fill swatches so existing habits still work.
  '#fac775', '#c0dd97', '#9fe1cb', '#b5d4f4', '#cecbf6', '#f4c0d1', '#f5c4b3', '#f7c1c1', '#fff3a3', '#a5e8d5',
  '#ef9f27', '#639922', '#1d9e75', '#378add', '#7f77dd', '#d4537e', '#d85a30', '#e24b4a', '#f5c400', '#0f6e56',
  '#633806', '#27500a', '#085041', '#0c447c', '#3c3489', '#72243e', '#712b13', '#791f1f', '#7a6400', '#04342c',
  '#000000', '#2c2c2a', '#444441', '#888780', '#b4b2a9', '#d3d1c7', '#f1efe8', '#ffffff', '#a32d2d', '#185fa5'
]

const KEY = 'pagebinder.recentColors'
/** Key used before the rename from DigiNote; read when the new key is still empty. */
const OLD_KEY = 'diginote.recentColors'
const MAX = 10

export function recentColors(): string[] {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberColor(color: string): void {
  try {
    const list = [color.toLowerCase(), ...recentColors().filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable: recent colours are a convenience only */
  }
}
