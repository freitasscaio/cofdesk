// The only things the page can ask of the desktop app (src/config.ts reads them as window.cofdeskDesktop).
const { contextBridge, ipcRenderer } = require('electron')

const info = ipcRenderer.sendSync('app-info')

contextBridge.exposeInMainWorld('cofdeskDesktop', {
  version: info.version,
  platform: info.platform,
  /** Opens a web address in the system browser (used for signing in with Google). */
  openExternal: url => ipcRenderer.send('open-external', String(url)),
})
