// CofDesk for the desktop. The window shows the same front end as the website, loaded from files inside
// the app (app://cofdesk), so it opens without internet; data syncs with the CofDesk server when online.
// Sign-in with Google happens in the system browser, which comes back through cofdesk:// links.
// Updates are downloaded from the GitHub Releases of freitasscaio/cofdesk.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const SCHEME = 'app'
const HOST = 'cofdesk'
const ORIGIN = `${SCHEME}://${HOST}`
const WEB = path.join(__dirname, 'web')
const LINK = 'cofdesk'

// The app's pages may only run its own scripts; embeds and images can come from other sites, and the
// server is reached over https (or localhost while developing).
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", 'img-src * data: blob:', 'media-src * data: blob:',
  'frame-src https:', "connect-src 'self' https: wss: http://localhost:* ws://localhost:*", "font-src 'self' data:",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ')

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

// One copy of the app: opening a cofdesk:// link while it runs hands the link to the open window.
if (!app.requestSingleInstanceLock()) app.quit()

if (process.defaultApp) app.setAsDefaultProtocolClient(LINK, process.execPath, [path.resolve(process.argv[1])])
else app.setAsDefaultProtocolClient(LINK)

let win = null
const pendingLink = { url: process.argv.find(a => a.startsWith(`${LINK}://`)) ?? null }

/** Only web addresses and e-mail links leave the app, opened in the system browser or mail app. */
function openOutside(url) {
  try {
    const { protocol: p } = new URL(url)
    if (p === 'https:' || p === 'http:' || p === 'mailto:') shell.openExternal(url)
  } catch { /* not a URL */ }
}

/** cofdesk://login?oauth=… and cofdesk://?calendar=… become the same path inside the app. */
function openLink(link) {
  let u
  try { u = new URL(link) } catch { return false }
  if (u.protocol !== `${LINK}:`) return false
  const route = `/${u.host}${u.pathname === '/' ? '' : u.pathname}`
  if (route !== '/' && route !== '/login') return false
  if (!win) { pendingLink.url = link; return true }
  win.loadURL(`${ORIGIN}${route}${u.search}`)
  if (win.isMinimized()) win.restore()
  win.focus()
  return true
}

function serveFiles() {
  protocol.handle(SCHEME, async request => {
    const { pathname } = new URL(request.url)
    let file = path.join(WEB, decodeURIComponent(pathname))
    const inside = !path.relative(WEB, file).startsWith('..') && !path.isAbsolute(path.relative(WEB, file))
    // routes such as /login or /privacidade are the single-page app's index
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html')
    const response = await net.fetch(pathToFileURL(file).toString())
    if (!file.endsWith('.html')) return response
    const headers = new Headers(response.headers)
    headers.set('Content-Type', 'text/html; charset=utf-8')
    headers.set('Content-Security-Policy', CSP)
    return new Response(response.body, { status: response.status, headers })
  })
}

const isOurs = url => url.startsWith(`${ORIGIN}/`) || url === ORIGIN

function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    // the app's own pages (Privacy Policy, Terms…) open in a window of the app; everything else outside
    if (isOurs(url)) return { action: 'allow', overrideBrowserWindowOptions: windowOptions() }
    openOutside(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isOurs(url)) return
    event.preventDefault()
    openOutside(url)
  })
}

function windowOptions() {
  return {
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    title: 'CofDesk',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  }
}

function createWindow() {
  win = new BrowserWindow(windowOptions())
  win.on('closed', () => { win = null })
  const link = pendingLink.url
  pendingLink.url = null
  if (!link || !openLink(link)) win.loadURL(`${ORIGIN}/`)
}

function setupUpdates() {
  if (!app.isPackaged) return
  autoUpdater.on('update-downloaded', info => {
    dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      message: `A versão ${info.version} do CofDesk está pronta.`,
      detail: 'Reinicie o aplicativo para usar a nova versão. Se escolher depois, ela é instalada quando você fechar o CofDesk.',
    }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall() })
  })
  // offline or GitHub unreachable: try again on the next check
  autoUpdater.on('error', () => {})
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 6 * 60 * 60 * 1000)
}

function setupMenu() {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Arquivo', submenu: [isMac ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair' }] },
    { label: 'Editar', submenu: [
      { role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' },
      { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' },
      { role: 'selectAll', label: 'Selecionar tudo' },
    ] },
    { label: 'Exibir', submenu: [
      { role: 'reload', label: 'Recarregar' }, { type: 'separator' },
      { role: 'resetZoom', label: 'Tamanho real' }, { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela cheia' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }]),
    ] },
    { label: 'Ajuda', submenu: [
      { label: 'Procurar atualizações', enabled: app.isPackaged, click: () => autoUpdater.checkForUpdates().catch(() => {}) },
      { label: `CofDesk ${app.getVersion()}`, enabled: false },
    ] },
  ]))
}

app.on('second-instance', (_event, argv) => {
  const link = argv.find(a => a.startsWith(`${LINK}://`))
  if (link) openLink(link)
  else if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})
// macOS delivers links this way
app.on('open-url', (event, url) => { event.preventDefault(); openLink(url) })
app.on('web-contents-created', (_event, contents) => guard(contents))

ipcMain.on('app-info', event => { event.returnValue = { version: app.getVersion(), platform: process.platform } })
ipcMain.on('open-external', (event, url) => {
  if (isOurs(event.senderFrame?.url ?? '')) openOutside(String(url))
})

// Pages and edits made offline live in the page's storage, which Chromium writes to disk lazily.
// Writing it every few seconds and on quit keeps them if the computer shuts down or the app is killed.
const flush = () => session.defaultSession?.flushStorageData()
app.on('before-quit', flush)

app.whenReady().then(() => {
  setInterval(flush, 3000)
  serveFiles()
  setupMenu()
  createWindow()
  setupUpdates()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
