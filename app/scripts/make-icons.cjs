/**
 * Builds every PageBinder icon from the logo artwork.
 *   npx electron scripts/make-icons.cjs [artwork]      (default resources/logo-artwork.jpg)
 *
 * The artwork is a rounded-square badge on a pale background. The badge is found
 * by colour, cut out along its own outline (so the corners become transparent),
 * and written as:
 *   resources/icon.png                 1024 px, badge filling the square (window icon, Windows/Linux)
 *   resources/icon-mac.png             1024 px on Apple's icon grid: 824 px badge with a soft shadow (Dock)
 *   src/renderer/src/assets/logo.png   256 px, for the Welcome and About screens
 *   build/icon.icns, build/icon.ico, build/icon.png   for the installers (phase 8)
 * Resizing is done by macOS `sips` and the .icns by `iconutil`. No window is shown.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const arg = process.argv.slice(2).find((a) => !a.startsWith('-') && /\.(jpe?g|png)$/i.test(a))
const source = path.resolve(root, arg ?? 'resources/logo-artwork.jpg')

// Runs inside a hidden page: returns { full, mac, box } with 1024 px PNG data URLs.
function render(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('could not decode the artwork'))
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const g = c.getContext('2d'); g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, W, H).data
      const blue = (x, y) => { const i = (y * W + x) * 4; return px[i + 2] - px[i] > 60 && px[i + 2] > 110 }
      // Outline of the badge: for every row, the first and last badge pixel.
      const rows = []
      for (let y = 0; y < H; y++) {
        let l = -1, r = -1
        for (let x = 0; x < W; x++) if (blue(x, y)) { l = x; break }
        if (l < 0) continue
        for (let x = W - 1; x >= l; x--) if (blue(x, y)) { r = x; break }
        rows.push({ y, l, r })
      }
      if (rows.length < 50) return reject(new Error('no badge found in the artwork'))
      const top = rows[0].y, bottom = rows[rows.length - 1].y
      const left = Math.min(...rows.map((q) => q.l)), right = Math.max(...rows.map((q) => q.r))
      // Trace the outline 1.5 px inside the edge so no background colour survives at the rim.
      const inset = 1.5
      const inner = rows.filter((q) => q.y >= top + inset && q.y <= bottom - inset)
      const badge = document.createElement('canvas'); const bw = right - left + 1, bh = bottom - top + 1
      badge.width = bw; badge.height = bh
      const b = badge.getContext('2d')
      b.beginPath()
      inner.forEach((q, i) => (i ? b.lineTo(q.l + inset - left, q.y - top) : b.moveTo(q.l + inset - left, q.y - top)))
      for (let i = inner.length - 1; i >= 0; i--) b.lineTo(inner[i].r + 1 - inset - left, inner[i].y - top)
      b.closePath(); b.clip()
      b.drawImage(img, -left, -top)
      const out = (size, margin, shadow) => {
        const o = document.createElement('canvas'); o.width = o.height = 1024
        const q = o.getContext('2d'); q.imageSmoothingQuality = 'high'
        if (shadow) { q.shadowColor = 'rgba(0,0,0,0.28)'; q.shadowBlur = 24; q.shadowOffsetY = 10 }
        q.drawImage(badge, margin, margin, size, size)
        return o.toDataURL('image/png')
      }
      resolve({ full: out(1000, 12, false), mac: out(824, 100, true), box: { left, top, right, bottom } })
    }
    img.src = dataUrl
  })
}

function writePng(file, dataUrl) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
}
function resize(src, size, dest) {
  execFileSync('sips', ['-z', String(size), String(size), src, '--out', dest], { stdio: 'ignore' })
}
// A Windows .ico holding PNG images (supported since Windows Vista).
function writeIco(file, pngs) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length); let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const e = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, e); dir.writeUInt8(size >= 256 ? 0 : size, e + 1)
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6)
    dir.writeUInt32LE(data.length, e + 8); dir.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  fs.writeFileSync(file, Buffer.concat([header, dir, ...pngs.map((p) => p.data)]))
}

// Never hang: give up after a minute.
setTimeout(() => { console.error('timed out'); app.exit(2) }, 60000).unref()
app.dock?.hide()
app.whenReady().then(async () => {
  try {
    if (!fs.existsSync(source)) throw new Error(`artwork not found: ${source}`)
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
    await win.loadURL('about:blank')
    const mime = /\.png$/i.test(source) ? 'image/png' : 'image/jpeg'
    const data = `data:${mime};base64,${fs.readFileSync(source).toString('base64')}`
    const res = await win.webContents.executeJavaScript(`(${render.toString()})(${JSON.stringify(data)})`)
    const full = path.join(root, 'resources/icon.png'), mac = path.join(root, 'resources/icon-mac.png')
    writePng(full, res.full); writePng(mac, res.mac)
    resize(full, 256, path.join(root, 'src/renderer/src/assets/logo.png'))
    fs.mkdirSync(path.join(root, 'build'), { recursive: true })
    fs.copyFileSync(full, path.join(root, 'build/icon.png'))

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pagebinder-icons-'))
    const set = path.join(tmp, 'icon.iconset'); fs.mkdirSync(set)
    for (const s of [16, 32, 128, 256, 512]) {
      resize(mac, s, path.join(set, `icon_${s}x${s}.png`))
      resize(mac, s * 2, path.join(set, `icon_${s}x${s}@2x.png`))
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(root, 'build/icon.icns')])
    const ico = [16, 24, 32, 48, 64, 128, 256].map((s) => {
      const f = path.join(tmp, `ico-${s}.png`); resize(full, s, f)
      return { size: s, data: fs.readFileSync(f) }
    })
    writeIco(path.join(root, 'build/icon.ico'), ico)
    fs.rmSync(tmp, { recursive: true, force: true })
    console.log(`badge found at ${JSON.stringify(res.box)} in ${path.relative(root, source)}; icons written`)
    app.exit(0)
  } catch (err) {
    console.error(err)
    app.exit(1)
  }
})
