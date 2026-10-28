import { create } from 'zustand'
import { ApiError, CLIENT_ID, api, useAuth } from './auth'
import { mergePage } from './merge'
import { seed, useStore } from './store'
import type { Page } from './types'

const PUSH_DELAY = 250
const PULL_EVERY = 15000

type PullResult = { serverTime: number; pages: Page[]; deleted: string[] }
export interface Peer { clientId: string; userId: string; name: string; color: string; pageId: string | null; blockId: string | null }

/** Live state that is not persisted: who else is here and change counters for comments/inbox. */
export const useLive = create<{ peers: Peer[]; commentsVersion: number; inboxVersion: number; connected: boolean }>(() => ({
  peers: [], commentsVersion: 0, inboxVersion: 0, connected: false,
}))

// What the server is known to hold, by object reference: pages are immutable,
// so a page whose reference differs from `synced` has local changes to push.
let synced: Record<string, Page> = {}
let since = 0
let workspaceId: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
let pullTimer: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined
let applyingRemote = false
let pushing: Promise<void> | null = null
let socket: WebSocket | null = null
let retry = 0
let presence: { pageId: string | null; blockId: string | null } = { pageId: null, blockId: null }

const setStatus = (sync: ReturnType<typeof useAuth.getState>['sync']) => useAuth.getState().set({ sync })

function handleError(e: unknown) {
  if (e instanceof ApiError && e.status === 401) { logout(); return }
  if (e instanceof ApiError && e.status === 403) { setStatus('readonly'); return }
  setStatus('offline')
}

function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, PUSH_DELAY)
}

async function push() {
  if (!workspaceId) return
  if (pushing) { await pushing; return push() }
  const pages = useStore.getState().pages
  const upserts = Object.values(pages).filter(p => synced[p.id] !== p)
  const deletes = Object.keys(synced).filter(id => !pages[id])
  if (!upserts.length && !deletes.length) return
  setStatus('saving')
  const ws = workspaceId
  const before = { ...synced }
  const bases = Object.fromEntries(upserts.filter(p => synced[p.id]).map(p => [p.id, synced[p.id]]))
  pushing = api<{ merged: Page[] }>(`/workspaces/${ws}/sync`, { body: { upserts, deletes, bases } })
    .then(r => {
      if (ws !== workspaceId) return
      // a remote change may have landed meanwhile; then keep its base
      for (const p of upserts) if (synced[p.id] === before[p.id]) synced[p.id] = p
      for (const id of deletes) delete synced[id]
      // the server merged our edit with someone else's: adopt its result
      if (r.merged.length) applyRemote(r.merged, [])
      setStatus('saved')
    })
    .catch(handleError)
    .finally(() => { pushing = null })
  await pushing
}

/** Applies pages coming from the server, merging with unsaved local edits block by block. */
function applyRemote(pages: Page[], deleted: string[]) {
  if (!pages.length && !deleted.length) return
  const local = { ...useStore.getState().pages }
  let needsPush = false
  for (const incoming of pages) {
    const mine = local[incoming.id]
    const base = synced[incoming.id]
    if (mine && mine !== base) { local[incoming.id] = mergePage(base, mine, incoming); needsPush = true }
    else local[incoming.id] = incoming
    synced[incoming.id] = incoming
  }
  for (const id of deleted) { delete local[id]; delete synced[id] }
  applyingRemote = true
  useStore.setState(s => ({ pages: local, currentId: s.currentId && local[s.currentId] ? s.currentId : null }))
  applyingRemote = false
  if (needsPush) schedulePush()
}

async function pull() {
  if (!workspaceId) return
  const ws = workspaceId
  try {
    const r = await api<PullResult>(`/workspaces/${ws}/pages?since=${since}`)
    if (ws !== workspaceId) return
    since = r.serverTime
    applyRemote(r.pages, r.deleted)
    if (useAuth.getState().sync === 'offline') setStatus('saved')
  } catch (e) { handleError(e) }
}

function connect() {
  const { token } = useAuth.getState()
  const ws = workspaceId
  if (!ws || !token) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const s = new WebSocket(`${proto}://${location.host}/ws?workspace=${ws}&client=${CLIENT_ID}&token=${token}`)
  socket = s
  s.onopen = () => {
    retry = 0
    useLive.setState({ connected: true })
    sendPresence()
    pull() // catch up on anything missed while disconnected
  }
  s.onmessage = e => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'pages') applyRemote(msg.pages, msg.deleted)
    if (msg.type === 'presence') useLive.setState({ peers: msg.peers.filter((p: Peer) => p.clientId !== CLIENT_ID) })
    if (msg.type === 'comments') {
      const me = useAuth.getState().user?.id
      useLive.setState(st => ({
        commentsVersion: st.commentsVersion + 1,
        inboxVersion: me && msg.mentions?.includes(me) ? st.inboxVersion + 1 : st.inboxVersion,
      }))
    }
  }
  s.onclose = () => {
    if (socket !== s) return
    socket = null
    useLive.setState({ connected: false, peers: [] })
    if (workspaceId === ws) setTimeout(() => { if (workspaceId === ws && !socket) connect() }, Math.min(1000 * 2 ** retry++, 15000))
  }
}

function sendPresence() {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'presence', ...presence }))
}

/** Tells collaborators which page/block this user is on. */
export function setPresence(pageId: string | null, blockId: string | null = null) {
  if (presence.pageId === pageId && presence.blockId === blockId) return
  presence = { pageId, blockId }
  sendPresence()
}

export function stopSync() {
  clearTimeout(pushTimer)
  clearInterval(pullTimer)
  unsubscribe?.()
  const s = socket
  socket = null
  s?.close()
  workspaceId = null
  synced = {}
  since = 0
  useLive.setState({ peers: [], connected: false })
}

/** Loads a workspace from the server and keeps it in sync until stopSync(). */
export async function startSync(id: string) {
  stopSync()
  workspaceId = id
  setStatus('saving')
  const r = await api<PullResult>(`/workspaces/${id}/pages?since=0`)
  if (workspaceId !== id) return
  let pages = Object.fromEntries(r.pages.map(p => [p.id, p]))
  synced = { ...pages }
  since = r.serverTime
  const fresh = !r.pages.length && !r.deleted.length
  if (fresh) pages = seed()
  applyingRemote = true
  useStore.setState(s => ({ pages, currentId: s.currentId && pages[s.currentId] ? s.currentId : null }))
  applyingRemote = false
  unsubscribe = useStore.subscribe((s, prev) => {
    if (!applyingRemote && s.pages !== prev.pages) schedulePush()
  })
  pullTimer = setInterval(pull, PULL_EVERY)
  connect()
  if (fresh) await push()
  else setStatus('saved')
}

// flush pending edits when the tab is hidden or closed
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push() })
addEventListener('online', () => push().then(pull))

export async function logout() {
  await push().catch(() => {})
  api('/auth/logout', { method: 'POST' }).catch(() => {})
  stopSync()
  useStore.setState({ pages: {}, currentId: null })
  useAuth.getState().set({ token: null, user: null, workspaces: [], workspaceId: null, sync: 'idle' })
}

export async function switchWorkspace(id: string) {
  await push().catch(() => {})
  useAuth.getState().set({ workspaceId: id })
  await startSync(id)
}
