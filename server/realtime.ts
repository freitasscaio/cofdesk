import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

export interface Presence { clientId: string; userId: string; name: string; color: string; pageId: string | null; blockId: string | null }
interface Client { socket: WebSocket; workspaceId: string; presence: Presence }

const COLORS = ['#e03e3e', '#d9730d', '#0f7b6c', '#0b6e99', '#6940a5', '#ad1a72', '#64473a', '#dfab01']
const rooms = new Map<string, Set<Client>>()

const send = (c: Client, msg: unknown) => { if (c.socket.readyState === WebSocket.OPEN) c.socket.send(JSON.stringify(msg)) }

/** Sends to every socket in the workspace, optionally skipping the client that caused the change. */
export function broadcast(workspaceId: string, msg: unknown, exceptClientId?: string) {
  for (const c of rooms.get(workspaceId) ?? []) if (c.presence.clientId !== exceptClientId) send(c, msg)
}

const presenceOf = (workspaceId: string) => [...(rooms.get(workspaceId) ?? [])].map(c => c.presence)

export function attachRealtime(
  server: Server,
  authorize: (token: string, workspaceId: string) => { id: string; name: string } | null,
) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const workspaceId = url.searchParams.get('workspace') ?? ''
    const clientId = url.searchParams.get('client') ?? ''
    const user = authorize(url.searchParams.get('token') ?? '', workspaceId)
    if (!user || !clientId) { socket.close(4001, 'unauthorized'); return }

    const color = COLORS[[...user.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % COLORS.length]
    const client: Client = { socket, workspaceId, presence: { clientId, userId: user.id, name: user.name, color, pageId: null, blockId: null } }
    if (!rooms.has(workspaceId)) rooms.set(workspaceId, new Set())
    rooms.get(workspaceId)!.add(client)
    broadcast(workspaceId, { type: 'presence', peers: presenceOf(workspaceId) })

    socket.on('message', raw => {
      let msg: any
      try { msg = JSON.parse(String(raw)) } catch { return }
      if (msg.type === 'presence') {
        client.presence = { ...client.presence, pageId: msg.pageId ?? null, blockId: msg.blockId ?? null }
        broadcast(workspaceId, { type: 'presence', peers: presenceOf(workspaceId) })
      }
    })
    socket.on('close', () => {
      rooms.get(workspaceId)?.delete(client)
      broadcast(workspaceId, { type: 'presence', peers: presenceOf(workspaceId) })
    })
  })

  // drop dead connections
  setInterval(() => wss.clients.forEach(s => s.readyState === WebSocket.OPEN && s.ping()), 30_000)
}
