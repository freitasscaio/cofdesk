// Where the pieces of CofDesk live. The same front end runs in three places:
// - development: Vite serves it and proxies /api and /ws to the local server (both variables empty)
// - the web: served by the server itself, or by Vercel with VITE_API_URL pointing at the server
// - the desktop app: loaded from the app's own files (app://cofdesk), with VITE_API_URL set at build time

/** Address of the CofDesk server. Empty: the same origin as the page. */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Public address of the web app, for links people share (published pages, page links). */
export const WEB_URL = (import.meta.env.VITE_WEB_URL || (location.protocol.startsWith('http') ? location.origin : API_URL)).replace(/\/$/, '')

export const apiUrl = (path: string) => `${API_URL}/api${path}`

export function wsUrl(path: string) {
  if (API_URL) return API_URL.replace(/^http/, 'ws') + path
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`
}

/** What the desktop app's preload script exposes; undefined in a browser. */
export interface DesktopBridge {
  version: string
  platform: string
  openExternal: (url: string) => void
}
export const desktop = (window as unknown as { cofdeskDesktop?: DesktopBridge }).cofdeskDesktop
