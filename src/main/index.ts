import { app, BrowserWindow, Menu, screen, shell, systemPreferences, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { registerIpc, closeCurrentNotebookSync } from './ipc'
import { registerScheme, registerProtocolHandler } from './protocol'

registerScheme()

/**
 * The program was called DigiNote before 1.0.1, and Electron names the settings folder after
 * the program. Once, on the first start under the new name, the app's own files are carried
 * across from the old folder: the recent-notebooks list, the global template library, and the
 * window storage (recent colours). Anything already present in the new folder is kept, and the
 * old folder is left in place. A marker file records that it has been done.
 */
function migrateSettingsFolder(): void {
  if (process.argv.some((a) => a.startsWith('--user-data-dir'))) return
  try {
    const current = app.getPath('userData')
    const previous = join(app.getPath('appData'), 'diginote')
    const marker = join(current, '.migrated-from-diginote')
    if (!existsSync(previous) || existsSync(marker)) return
    mkdirSync(current, { recursive: true })
    for (const name of ['recent-notebooks.json', 'templates']) {
      const from = join(previous, name)
      if (existsSync(from)) cpSync(from, join(current, name), { recursive: true, force: false })
    }
    // Browser storage is a database: take the old one whole, or not at all.
    const storage = join(previous, 'Local Storage')
    if (existsSync(storage) && !existsSync(join(current, 'Local Storage'))) cpSync(storage, join(current, 'Local Storage'), { recursive: true })
    writeFileSync(marker, new Date().toISOString())
  } catch {
    /* the app works without them; nothing in a notebook depends on the settings folder */
  }
}
migrateSettingsFolder()

/** Icons are generated from resources/logo-artwork.jpg by scripts/make-icons.cjs. */
const ICON = join(__dirname, '../../resources/icon.png')
const DOCK_ICON = join(__dirname, '../../resources/icon-mac.png')

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'PageBinder',
    icon: ICON,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })
  win.once('ready-to-show', () => win.show())
  // Test seam: automated runs (PAGEBINDER_OPEN) keep their window on the second display so the
  // main one stays free; PAGEBINDER_TEST_DISPLAY=1 or 2 overrides.
  const testDisplay = process.env['PAGEBINDER_TEST_DISPLAY'] ?? (process.env['PAGEBINDER_OPEN'] ? '2' : '')
  if (testDisplay === '2') {
    const displays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    const second = displays.find((d) => d.id !== primary.id)
    if (second) {
      const { x, y, width, height } = second.workArea
      win.setBounds({ x: x + Math.max(0, Math.floor((width - 1280) / 2)), y: y + Math.max(0, Math.floor((height - 860) / 2)), width: Math.min(1280, width), height: Math.min(860, height) })
    }
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function send(channel: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel)
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  // macOS slips its own "Enter Full Screen" item into any menu called View; this default turns that off
  // so the menu keeps only the app's Toggle Full Screen item.
  if (isMac) systemPreferences.setUserDefault('NSFullScreenMenuItemEverywhere', 'boolean', false)
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: 'About PageBinder', click: () => send('menu:about') },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Notebook…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('menu:newNotebook') },
        { label: 'Open Notebook…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:openNotebook') },
        { type: 'separator' },
        { label: 'New Page', accelerator: 'CmdOrCtrl+N', click: () => send('menu:newPage') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { type: 'separator' },
        { label: 'Page Setup…', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('menu:pageSetup') },
        { label: 'Print Preview', accelerator: 'CmdOrCtrl+Alt+P', click: () => send('menu:printPreview') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => send('menu:print') },
        { label: 'Export This Page as PDF…', click: () => send('menu:exportPdf') },
        { label: 'Export Pages…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('menu:export') },
        { type: 'separator' },
        { label: 'Page History…', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('menu:history') },
        { label: 'Recycled Pages…', click: () => send('menu:recycle') },
        { label: 'Verify Notebook…', click: () => send('menu:verify') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: () => send('menu:undo') },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', registerAccelerator: false, click: () => send('menu:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Delete Selected Object', accelerator: 'CmdOrCtrl+Shift+Backspace', click: () => send('menu:deleteObject') }
      ]
    },
    {
      label: 'Insert',
      submenu: [
        { label: 'Text Box', accelerator: 'CmdOrCtrl+Shift+X', click: () => send('menu:insertTextBox') },
        { label: 'Picture…', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('menu:insertImage') },
        { label: 'File Attachment…', accelerator: 'CmdOrCtrl+Shift+A', click: () => send('menu:insertFile') },
        { label: 'Table', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('menu:insertTable') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Page Border', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('menu:togglePageBorder') },
        { label: 'Toggle Grid', accelerator: 'CmdOrCtrl+Shift+G', click: () => send('menu:toggleGrid') },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
            win?.setFullScreen(!win.isFullScreen())
          }
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('menu:zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('menu:zoomOut') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => send('menu:zoomReset') },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'About PageBinder', click: () => send('menu:about') },
        { label: 'Getting Started', click: () => send('menu:doc:getting-started') },
        { label: 'Program Description', click: () => send('menu:doc:description') },
        { label: 'Keyboard Shortcuts', click: () => send('menu:doc:shortcuts') },
        { label: 'Page History and Verify Notebook', click: () => send('menu:doc:history-verify') },
        { label: 'Recovery Guide', click: () => send('menu:doc:recovery') },
        { label: 'Dependencies and Licences', click: () => send('menu:doc:dependencies') },
        { label: 'Uninstalling', click: () => send('menu:doc:uninstall') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  // The packaged app takes its Dock icon from the bundle; during development it is set here.
  if (process.platform === 'darwin' && existsSync(DOCK_ICON)) app.dock?.setIcon(DOCK_ICON)
  registerIpc()
  registerProtocolHandler()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Closing the last window releases the notebook so another window or
  // instance can open it, even on macOS where the app keeps running.
  closeCurrentNotebookSync()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeCurrentNotebookSync()
})

process.on('SIGINT', () => {
  closeCurrentNotebookSync()
  app.quit()
})
process.on('SIGTERM', () => {
  closeCurrentNotebookSync()
  app.quit()
})
