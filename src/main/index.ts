import { app, BrowserWindow, Menu, dialog, screen, session, shell, systemPreferences, type MenuItemConstructorOptions } from 'electron'
import { join, resolve } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerIpc, closeCurrentNotebookSync } from './ipc'
import { registerScheme, registerProtocolHandler } from './protocol'
import { chooseSettingsFolder, decideFirstRun, earlierSettings, firstRunQuestion, readInstallRecord, setAsideEarlierSettings, writeInstallRecord } from './settingsFolder'

registerScheme()

// Windows groups taskbar buttons and Start menu shortcuts by this id; it matches appId in
// electron-builder.yml so the installed shortcut and the running window share one button.
if (process.platform === 'win32') app.setAppUserModelId('app.pagebinder.desktop')

// The installed app and the development build keep separate settings folders, so nothing from
// development ever shows in an installed copy. See settingsFolder.ts.
{
  const folder = chooseSettingsFolder({
    packaged: app.isPackaged,
    explicitDir: process.argv.some((a) => a.startsWith('--user-data-dir')),
    appData: app.getPath('appData'),
    sharedDir: app.getPath('userData')
  })
  if (folder) app.setPath('userData', folder)
}

/**
 * This installation's ID, so a new installation can be told from a restart. On Windows the installer
 * writes the time of installation beside the app (build/installer.nsh); on macOS, copying the app
 * into Applications makes a new bundle with a new creation time.
 */
function installationId(): string {
  try {
    const written = join(process.resourcesPath, 'install-id.txt')
    if (existsSync(written)) return `installer:${readFileSync(written, 'utf8').trim()}`
    const target = process.platform === 'darwin' ? resolve(process.execPath, '../../..') : process.execPath
    const st = statSync(target)
    return `${process.platform}:${Math.round(st.birthtimeMs || st.ctimeMs)}`
  } catch {
    return 'unknown'
  }
}

/**
 * On the first start of every installation (a reinstall or an update) that finds settings left by
 * an earlier one, the user chooses: keep them, or start fresh (they move to a backup folder). Test seams: PAGEBINDER_TEST_PACKAGED=1 runs this outside an installed copy, and
 * PAGEBINDER_TEST_SETTINGS_CHOICE=keep|fresh answers the question.
 */
async function confirmSettings(): Promise<void> {
  if (!app.isPackaged && process.env['PAGEBINDER_TEST_PACKAGED'] !== '1') return
  const dir = app.getPath('userData')
  const version = app.getVersion()
  const id = installationId()
  const earlier = earlierSettings(dir)
  const decision = decideFirstRun(readInstallRecord(dir), earlier, id)
  if (decision === 'nothing') return
  if (decision === 'ask' && earlier) {
    const q = firstRunQuestion(earlier, dir)
    const preset = process.env['PAGEBINDER_TEST_SETTINGS_CHOICE']
    const choice = preset
      ? preset === 'fresh'
        ? 1
        : 0
      : dialog.showMessageBoxSync({ type: 'question', title: 'PageBinder', message: q.message, detail: q.detail, buttons: q.buttons, defaultId: 0, cancelId: 0, noLink: true })
    if (choice === 1) {
      setAsideEarlierSettings(dir)
      await session.defaultSession.clearStorageData({ storages: ['localstorage'] })
    }
  }
  writeInstallRecord(dir, version, id)
}

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

app.whenReady().then(async () => {
  // The packaged app takes its Dock icon from the bundle; during development it is set here.
  if (process.platform === 'darwin' && existsSync(DOCK_ICON)) app.dock?.setIcon(DOCK_ICON)
  // Before any window: settings from an earlier installation are kept or set aside first.
  try {
    await confirmSettings()
  } catch {
    /* the app works without its settings files; never block startup on them */
  }
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
