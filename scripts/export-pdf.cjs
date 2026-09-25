// Helper for pagebinder-export --pdf: loads an HTML file in a hidden window and prints it to PDF.
const { app, BrowserWindow } = require('electron')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs')
const [, , htmlPath, pdfPath] = process.argv
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL(pathToFileURL(htmlPath).toString())
  await win.webContents.executeJavaScript('new Promise(r => setTimeout(r, 300))')
  const data = await win.webContents.printToPDF({ printBackground: true, margins: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true })
  fs.writeFileSync(pdfPath, data)
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
