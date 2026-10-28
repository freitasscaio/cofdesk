import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User { id: string; email: string; name: string }
export interface Workspace { id: string; name: string; role: 'owner' | 'editor' | 'viewer' }
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'readonly'

interface AuthState {
  token: string | null
  user: User | null
  workspaces: Workspace[]
  workspaceId: string | null
  sync: SyncStatus
  set: (patch: Partial<AuthState>) => void
}

export const useAuth = create<AuthState>()(
  persist(
    set => ({ token: null, user: null, workspaces: [], workspaceId: null, sync: 'idle', set: patch => set(patch) }),
    { name: 'cofdesk-auth', partialize: s => ({ token: s.token, user: s.user, workspaces: s.workspaces, workspaceId: s.workspaceId }) },
  ),
)

/** Identifies this tab, so the server does not echo our own changes back to us. */
export const CLIENT_ID = crypto.randomUUID()

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = useAuth.getState().token
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Erro de conexão')
  return data
}
