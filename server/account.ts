import type { IncomingMessage } from 'node:http'
import { db } from './db.ts'
import { connectionsOf, removeConnection } from './calendar.ts'

// The account holder's rights under the LGPD (art. 18: access, portability, deletion), the access
// log the Marco Civil da Internet (Lei 12.965/2014, art. 15) requires, and deletion of data past its use.

db.exec(`
  -- application access records (IP, port, date/time), kept for 6 months by legal obligation.
  -- No foreign key: the obligation outlives the account.
  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event TEXT NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS access_logs_at ON access_logs (at);
`)

const LOG_RETENTION = 183 * 86_400_000

/** Behind a reverse proxy (TRUST_PROXY=1) the client address comes from X-Forwarded-For. */
function clientAddress(req: IncomingMessage) {
  if (process.env.TRUST_PROXY === '1') {
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    const port = Number(req.headers['x-forwarded-port']) || null
    if (ip) return { ip, port }
  }
  return { ip: req.socket.remoteAddress ?? '', port: req.socket.remotePort ?? null }
}

export function logAccess(req: IncomingMessage, userId: string, event: 'login' | 'signup' | 'google') {
  const { ip, port } = clientAddress(req)
  db.prepare('INSERT INTO access_logs (user_id, event, ip, port, at) VALUES (?, ?, ?, ?, ?)').run(userId, event, ip, port, Date.now())
}

/** Removes what is no longer needed: expired sessions and sign-ups, and access logs past retention. */
export function purgeExpired() {
  const now = Date.now()
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now)
  db.prepare('DELETE FROM pending_signups WHERE expires_at < ?').run(now)
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(now - 10 * 60_000)
  db.prepare('DELETE FROM login_codes WHERE created_at < ?').run(now - 120_000)
  db.prepare('DELETE FROM access_logs WHERE at < ?').run(now - LOG_RETENTION)
}

/** Everything CofDesk keeps about the person, in a machine-readable form (portability, LGPD art. 18, V). */
export function exportData(userId: string) {
  const user = db.prepare('SELECT id, email, name, created_at, password_hash FROM users WHERE id = ?').get(userId) as
    { id: string; email: string; name: string; created_at: number; password_hash: string }
  const workspaces = (db.prepare(`SELECT w.id, w.name, m.role FROM workspaces w JOIN members m ON m.workspace_id = w.id
    WHERE m.user_id = ? ORDER BY w.created_at`).all(userId) as { id: string; name: string; role: string }[])
    .map(w => ({
      ...w,
      pages: (db.prepare('SELECT data FROM pages WHERE workspace_id = ? AND deleted = 0').all(w.id) as { data: string }[]).map(r => JSON.parse(r.data)),
    }))
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : null)
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, name: user.name, createdAt: iso(user.created_at), signsInWithPassword: !!user.password_hash },
    linkedLogins: (db.prepare('SELECT provider, email, created_at FROM identities WHERE user_id = ?').all(userId) as any[])
      .map(r => ({ provider: r.provider, email: r.email, linkedAt: iso(r.created_at) })),
    connectedCalendars: connectionsOf(userId).map(c => ({ provider: c.provider, account: c.account, connectedAt: iso(c.createdAt) })),
    workspaces,
    comments: (db.prepare('SELECT id, workspace_id, page_id, body, created_at, edited_at FROM comments WHERE user_id = ? ORDER BY created_at').all(userId) as any[])
      .map(c => ({ id: c.id, workspaceId: c.workspace_id, pageId: c.page_id, body: c.body, createdAt: iso(c.created_at), editedAt: iso(c.edited_at) })),
    accessLog: (db.prepare('SELECT event, ip, port, at FROM access_logs WHERE user_id = ? ORDER BY at DESC').all(userId) as any[])
      .map(r => ({ event: r.event, ip: r.ip, port: r.port, at: iso(r.at) })),
  }
}

/** Workspaces that would be deleted, and those that would pass to another member, if the account were deleted. */
export function deletionPreview(userId: string) {
  const owned = db.prepare('SELECT id, name FROM workspaces WHERE owner_id = ?').all(userId) as { id: string; name: string }[]
  const heirOf = (ws: string) => db.prepare(`SELECT u.id, u.name FROM members m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ? AND m.user_id <> ? ORDER BY CASE m.role WHEN 'editor' THEN 0 ELSE 1 END, u.created_at LIMIT 1`)
    .get(ws, userId) as { id: string; name: string } | undefined
  return owned.map(w => ({ ...w, heir: heirOf(w.id) ?? null }))
}

/**
 * Deletes the account and the personal data tied to it (LGPD art. 18, VI). A workspace the person owns
 * passes to another member when there is one, so colleagues don't lose their work; otherwise it is deleted.
 * Access logs stay until their legal retention ends (LGPD art. 16, I).
 */
export async function deleteAccount(userId: string) {
  // withdraw CofDesk's access to connected calendars first (calls Google)
  for (const c of connectionsOf(userId)) await removeConnection(userId, c.id)
  const email = (db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined)?.email
  db.exec('BEGIN')
  try {
    for (const w of deletionPreview(userId)) {
      if (w.heir) {
        db.prepare('UPDATE workspaces SET owner_id = ? WHERE id = ?').run(w.heir.id, w.id)
        db.prepare("UPDATE members SET role = 'owner' WHERE workspace_id = ? AND user_id = ?").run(w.id, w.heir.id)
      } else {
        db.prepare('DELETE FROM workspaces WHERE id = ?').run(w.id)
      }
    }
    db.prepare('DELETE FROM page_versions WHERE user_id = ?').run(userId)
    db.prepare('UPDATE shares SET created_by = (SELECT owner_id FROM workspaces w WHERE w.id = shares.workspace_id) WHERE created_by = ?').run(userId)
    db.prepare('DELETE FROM mention_reads WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM oauth_states WHERE user_id = ?').run(userId)
    if (email) db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email)
    // sessions, memberships, comments, linked logins and login codes go with the user (ON DELETE CASCADE)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
