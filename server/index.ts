import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { db } from './db.ts'
import { attachRealtime, broadcast } from './realtime.ts'
import { mergePage } from '../src/merge.ts'
import { unfurl } from './unfurl.ts'
import { aiPrompt, askPrompt, streamAi } from './ai.ts'
import { DESKTOP_SCHEME, PUBLIC_URL, WEB_URL, accountFor, type Client, googleExchange, identitiesOf, loginCode, providers, redeemCode, startUrl, takeState } from './oauth.ts'
import { connectIcloud, connectionsOf, eventsFor, removeConnection, saveGoogle } from './calendar.ts'
import { codeEmail, mailConfigured, sendMail } from './mail.ts'
import { deleteAccount, deletionPreview, exportData, logAccess, purgeExpired } from './account.ts'

// hosting services (Railway, Render…) say which port to use in PORT
const PORT = Number(process.env.PORT ?? process.env.COFDESK_API_PORT ?? 3001)
const SESSION_DAYS = 30
const DIST = resolve('dist')

type User = { id: string; email: string; name: string }
type Role = 'owner' | 'editor' | 'viewer'
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

// ---------- helpers ----------
const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
const checkPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(':')
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64))
}

let lastTs = 0
const serverTs = () => (lastTs = Math.max(Date.now(), lastTs + 1))

async function body(req: IncomingMessage): Promise<any> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 20_000_000) throw new HttpError(413, 'Conteúdo grande demais')
  }
  try { return raw ? JSON.parse(raw) : {} } catch { throw new HttpError(400, 'JSON inválido') }
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' })
  res.end()
  return null
}

// Production pages only run CofDesk's own scripts; embeds (iframes) and images may come from other sites.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", 'img-src * data: blob:', 'media-src * data: blob:',
  'frame-src https:', "connect-src 'self' ws: wss:", "font-src 'self' data:", "object-src 'none'", "base-uri 'self'",
  "frame-ancestors 'self'", "form-action 'self'",
].join('; ')
function securityHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (PUBLIC_URL.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

// Pages from other addresses that may call the API: the website when it is hosted apart (Vercel) and the
// desktop app, which loads its pages from app://cofdesk. More can be listed in CORS_ORIGINS (comma-separated).
const ALLOWED_ORIGINS = new Set([
  new URL(WEB_URL).origin, new URL(PUBLIC_URL).origin, 'app://cofdesk',
  ...(process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
])
function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  res.setHeader('Vary', 'Origin')
  if (origin && ALLOWED_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now() + SESSION_DAYS * 86_400_000)
  return token
}

const userByToken = (token: string) => db.prepare(`
  SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now()) as User | undefined

function auth(req: IncomingMessage): User {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  if (!token) throw new HttpError(401, 'Não autenticado')
  const user = userByToken(token)
  if (!user) throw new HttpError(401, 'Sessão expirada')
  return user
}

const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 400_000) : undefined)
const clientIdOf = (req: IncomingMessage) => String(req.headers['x-client-id'] ?? '')

type PageRow = { id: string; data: string | null; deleted: number }
const livePages = (ws: string) =>
  (db.prepare('SELECT id, data, deleted FROM pages WHERE workspace_id = ? AND deleted = 0').all(ws) as PageRow[])
    .map(r => JSON.parse(r.data!))

/** The page plus every non-trashed descendant (subpages, database rows). */
function subtree(ws: string, rootId: string) {
  const all = livePages(ws)
  const byParent = new Map<string, any[]>()
  for (const p of all) if (p.parentId) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p])
  const root = all.find(p => p.id === rootId && !p.trashed)
  if (!root) return null
  const out = [root]
  for (let i = 0; i < out.length; i++) for (const child of byParent.get(out[i].id) ?? []) if (!child.trashed) out.push(child)
  return out
}

const COMMENT_SELECT = `SELECT c.id, c.page_id AS pageId, c.block_id AS blockId, c.thread_id AS threadId, c.body, c.mentions,
  c.resolved, c.created_at AS createdAt, c.edited_at AS editedAt, c.user_id AS userId, u.name AS userName
  FROM comments c JOIN users u ON u.id = c.user_id`
const toComment = (r: any) => ({ ...r, mentions: JSON.parse(r.mentions), resolved: !!r.resolved })

function roleIn(workspaceId: string, userId: string): Role {
  const row = db.prepare('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId) as { role: Role } | undefined
  if (!row) throw new HttpError(404, 'Workspace não encontrado')
  return row.role
}

const workspacesOf = (userId: string) => db.prepare(`
  SELECT w.id, w.name, m.role FROM workspaces w JOIN members m ON m.workspace_id = w.id
  WHERE m.user_id = ? ORDER BY w.created_at`).all(userId)

function createWorkspace(name: string, ownerId: string) {
  const id = randomUUID()
  db.prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').run(id, name, ownerId, Date.now())
  db.prepare("INSERT INTO members (workspace_id, user_id, role) VALUES (?, ?, 'owner')").run(id, ownerId)
  return id
}

const me = (user: User) => ({ user, workspaces: workspacesOf(user.id) })

// ---------- password guessing ----------
// after 10 wrong passwords for one e-mail, that e-mail is locked out of password sign-in for 15 minutes
const FAIL_WINDOW = 15 * 60_000
const MAX_FAILS = 10
const failures = new Map<string, { count: number; since: number }>()
function checkLockout(email: string) {
  const f = failures.get(email)
  if (f && Date.now() - f.since > FAIL_WINDOW) failures.delete(email)
  else if (f && f.count >= MAX_FAILS) throw new HttpError(429, 'Muitas tentativas. Tente de novo em alguns minutos.')
}
function countFailure(email: string) {
  const f = failures.get(email)
  failures.set(email, f ? { ...f, count: f.count + 1 } : { count: 1, since: Date.now() })
}

// ---------- sign-up with an e-mailed code ----------
const CODE_TTL = 15 * 60_000
const RESEND_AFTER = 60_000
const MAX_ATTEMPTS = 5
const codeHash = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest('hex')
type Pending = { email: string; name: string; password_hash: string; code_hash: string; attempts: number; sent_at: number; expires_at: number }
const pendingOf = (email: string) => db.prepare('SELECT * FROM pending_signups WHERE email = ?').get(email) as Pending | undefined

/** Sends a fresh 6-digit code; refuses if the last one went out less than a minute ago. */
async function sendSignupCode(email: string, name: string, passwordHash: string) {
  const prev = pendingOf(email)
  const wait = prev ? Math.ceil((prev.sent_at + RESEND_AFTER - Date.now()) / 1000) : 0
  if (wait > 0) throw new HttpError(429, `Aguarde ${wait} s para pedir outro código.`)
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  db.prepare(`INSERT INTO pending_signups (email, name, password_hash, code_hash, attempts, sent_at, expires_at) VALUES (?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT (email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash, code_hash = excluded.code_hash,
    attempts = 0, sent_at = excluded.sent_at, expires_at = excluded.expires_at`)
    .run(email, name, passwordHash, codeHash(email, code), Date.now(), Date.now() + CODE_TTL)
  const mail = codeEmail(name, code)
  try { await sendMail(email, mail.subject, mail.text, mail.html) }
  catch (e) { console.error(e); throw new HttpError(502, 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.') }
}

/** Accounts created through Google have no password (an empty hash). */
function createOAuthUser(email: string, name: string) {
  const id = randomUUID()
  db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, '', ?)").run(id, email, name, Date.now())
  createWorkspace(`Workspace de ${name}`, id)
  return id
}

/**
 * Sends the browser back after a Google step. The website gets a redirect; the desktop app is opened through
 * cofdesk://, from a small page (browsers ask before opening an app, and the tab would otherwise stay blank).
 */
function backTo(res: ServerResponse, client: Client, path: string) {
  if (client === 'web') return redirect(res, `${WEB_URL}${path}`)
  const href = `${DESKTOP_SCHEME}${path.replace(/^\//, '')}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" })
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${href}"><title>CofDesk</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#37352f;text-align:center">
<main><h1 style="font-size:22px">Pronto! Volte para o aplicativo CofDesk.</h1>
<p><a href="${href}" style="color:#0b6bcb">Abrir o CofDesk</a></p>
<p style="color:#6f6e69;font-size:14px">Você pode fechar esta aba.</p></main></body></html>`)
  return null
}

/** Finishes a Google sign-in: sends the person back to the app with a one-time code. */
function finishLogin(res: ServerResponse, client: Client, provider: string, profile: Parameters<typeof accountFor>[1]) {
  const userId = accountFor(provider, profile, createOAuthUser)
  return backTo(res, client, `/login?oauth=${loginCode(userId)}`)
}
const loginError = (res: ServerResponse, e: unknown, client: Client = 'web') =>
  backTo(res, client, `/login?oauth_error=${encodeURIComponent((e as Error).message || 'Não foi possível entrar')}`)

// ---------- version history ----------
// Every save is kept as a version. Consecutive saves by the same person within a few minutes
// are folded into one version, like an editing session.
const SESSION_GAP = 10 * 60_000
const versionContent = (p: any) => JSON.stringify({ ...p, updatedAt: 0 })
function snapshot(ws: string, page: any, userId: string, now: number) {
  const last = db.prepare('SELECT id, user_id, created_at, started_at, data FROM page_versions WHERE workspace_id = ? AND page_id = ? ORDER BY id DESC LIMIT 1')
    .get(ws, page.id) as { id: number; user_id: string; created_at: number; started_at: number; data: string } | undefined
  if (last && versionContent(JSON.parse(last.data)) === versionContent(page)) return
  const data = JSON.stringify(page)
  if (last && last.user_id === userId && now - last.created_at < SESSION_GAP) {
    db.prepare('UPDATE page_versions SET data = ?, created_at = ? WHERE id = ?').run(data, now, last.id)
  } else {
    db.prepare('INSERT INTO page_versions (workspace_id, page_id, user_id, data, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ws, page.id, userId, data, now, now)
  }
}

// ---------- routes ----------
// a handler returns [status, json], or null when it wrote the response itself (streaming)
type Handler = (req: IncomingMessage, params: string[], url: URL, res: ServerResponse) => Promise<[number, unknown] | null> | [number, unknown] | null
const routes: [string, RegExp, Handler][] = [
  ['POST', /^\/api\/auth\/register$/, async req => {
    const { name, email, password } = await body(req)
    const mail = String(email ?? '').trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(mail)) throw new HttpError(400, 'E-mail inválido')
    if (String(password ?? '').length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres')
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) throw new HttpError(409, 'Este e-mail já está cadastrado')
    // the account only exists after the e-mailed code is confirmed (POST /api/auth/verify)
    await sendSignupCode(mail, String(name ?? '').trim().slice(0, 80) || mail.split('@')[0], hashPassword(password))
    return [202, { pending: true, email: mail, devConsole: !mailConfigured() }]
  }],
  ['POST', /^\/api\/auth\/resend$/, async req => {
    const mail = String((await body(req)).email ?? '').trim().toLowerCase()
    const prev = pendingOf(mail)
    if (!prev) throw new HttpError(404, 'Comece o cadastro de novo.')
    await sendSignupCode(mail, prev.name, prev.password_hash)
    return [202, { pending: true }]
  }],
  ['POST', /^\/api\/auth\/verify$/, async req => {
    const { email, code } = await body(req)
    const mail = String(email ?? '').trim().toLowerCase()
    const p = pendingOf(mail)
    if (!p || p.expires_at < Date.now()) throw new HttpError(400, 'Este código expirou. Peça um novo.')
    if (p.attempts >= MAX_ATTEMPTS) {
      db.prepare('DELETE FROM pending_signups WHERE email = ?').run(mail)
      throw new HttpError(429, 'Muitas tentativas. Comece o cadastro de novo.')
    }
    const given = Buffer.from(codeHash(mail, String(code ?? '').replace(/\D/g, '')), 'hex')
    if (!timingSafeEqual(given, Buffer.from(p.code_hash, 'hex'))) {
      db.prepare('UPDATE pending_signups SET attempts = attempts + 1 WHERE email = ?').run(mail)
      const left = MAX_ATTEMPTS - p.attempts - 1
      throw new HttpError(400, left > 0 ? `Código incorreto. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.` : 'Código incorreto.')
    }
    db.prepare('DELETE FROM pending_signups WHERE email = ?').run(mail)
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) throw new HttpError(409, 'Este e-mail já está cadastrado')
    const user: User = { id: randomUUID(), email: mail, name: p.name }
    db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, user.email, user.name, p.password_hash, Date.now())
    createWorkspace(`Workspace de ${user.name}`, user.id)
    logAccess(req, user.id, 'signup')
    return [201, { token: createSession(user.id), ...me(user) }]
  }],
  // first step of the email-first sign-in: decides between "enter password" and "create account"
  ['POST', /^\/api\/auth\/check$/, async req => {
    const { email } = await body(req)
    const mail = String(email ?? '').trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(mail)) throw new HttpError(400, 'Digite um e-mail válido')
    const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(mail) as { id: string; password_hash: string } | undefined
    return [200, { exists: !!row, password: !!row?.password_hash, providers: row ? identitiesOf(row.id) : [] }]
  }],
  ['POST', /^\/api\/auth\/login$/, async req => {
    const { email, password } = await body(req)
    const mail = String(email ?? '').trim().toLowerCase()
    checkLockout(mail)
    const row = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(mail) as (User & { password_hash: string }) | undefined
    if (row && !row.password_hash) throw new HttpError(401, 'Esta conta entra com o Google. Use o botão “Continuar com Google”.')
    if (!row || !checkPassword(String(password ?? ''), row.password_hash)) {
      countFailure(mail)
      throw new HttpError(401, 'E-mail ou senha incorretos')
    }
    failures.delete(mail)
    const user = { id: row.id, email: row.email, name: row.name }
    logAccess(req, user.id, 'login')
    return [200, { token: createSession(user.id), ...me(user) }]
  }],
  ['POST', /^\/api\/auth\/logout$/, req => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.headers.authorization?.replace(/^Bearer /, '') ?? '')
    return [200, { ok: true }]
  }],
  ['GET', /^\/api\/me$/, req => [200, me(auth(req))]],

  // ---------- sign in with Google ----------
  ['GET', /^\/api\/auth\/providers$/, () => [200, providers()]],
  ['GET', /^\/api\/auth\/google\/start$/, (_req, _p, url, res) => {
    const client: Client = url.searchParams.get('client') === 'desktop' ? 'desktop' : 'web'
    try { return redirect(res, startUrl('google', 'login', null, client)) }
    catch { return loginError(res, new Error('O login com Google ainda não foi configurado neste servidor.'), client) }
  }],
  ['GET', /^\/api\/auth\/google\/callback$/, async (_req, _p, url, res) => {
    const fail = url.searchParams.get('error')
    const purpose = (() => { try { return takeState(String(url.searchParams.get('state')), 'google') } catch (e) { return e as Error } })()
    if (purpose instanceof Error) return loginError(res, purpose)
    if (purpose.purpose === 'calendar') {
      try {
        if (fail) throw new Error('Você não autorizou o acesso à agenda.')
        const r = await googleExchange(String(url.searchParams.get('code')), purpose)
        if (!r.refreshToken || !purpose.user_id) throw new Error('O Google não liberou acesso contínuo. Tente de novo.')
        saveGoogle(purpose.user_id, r.profile.email ?? r.profile.subject, r.refreshToken)
        return backTo(res, purpose.client, '/?calendar=google')
      } catch (e) { return backTo(res, purpose.client, `/?calendar_error=${encodeURIComponent((e as Error).message)}`) }
    }
    try {
      if (fail) throw new Error(fail === 'access_denied' ? 'Login cancelado.' : 'O Google recusou o login.')
      const { profile } = await googleExchange(String(url.searchParams.get('code')), purpose)
      return finishLogin(res, purpose.client, 'google', profile)
    } catch (e) { return loginError(res, e, purpose.client) }
  }],
  ['POST', /^\/api\/auth\/finish$/, async req => {
    const userId = redeemCode(String((await body(req)).code ?? ''))
    if (!userId) throw new HttpError(401, 'Este login expirou. Tente de novo.')
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId) as User
    logAccess(req, user.id, 'google')
    return [200, { token: createSession(user.id), ...me(user) }]
  }],

  // ---------- connected calendars ----------
  ['GET', /^\/api\/calendar\/connections$/, req => [200, { connections: connectionsOf(auth(req).id), google: providers().google }]],
  ['POST', /^\/api\/calendar\/google$/, async req => {
    const user = auth(req)
    const client: Client = (await body(req)).client === 'desktop' ? 'desktop' : 'web'
    try { return [200, { url: startUrl('google', 'calendar', user.id, client) }] }
    catch { throw new HttpError(503, 'A conexão com o Google ainda não foi configurada neste servidor.') }
  }],
  ['POST', /^\/api\/calendar\/icloud$/, async req => {
    const user = auth(req)
    const { appleId, password } = await body(req)
    if (!/^\S+@\S+\.\S+$/.test(String(appleId ?? '')) || !String(password ?? '').trim()) throw new HttpError(400, 'Informe o Apple ID e a senha de app')
    try { await connectIcloud(user.id, String(appleId), String(password)) }
    catch (e) { throw new HttpError(422, (e as Error).message) }
    return [201, { connections: connectionsOf(user.id) }]
  }],
  ['DELETE', /^\/api\/calendar\/connections\/([\w-]+)$/, async (req, [id]) => {
    const user = auth(req)
    if (!(await removeConnection(user.id, id))) throw new HttpError(404, 'Conexão não encontrada')
    return [200, { connections: connectionsOf(user.id) }]
  }],
  ['GET', /^\/api\/calendar\/events$/, async (req, _p, url) => {
    const user = auth(req)
    const from = new Date(String(url.searchParams.get('from')))
    const to = new Date(String(url.searchParams.get('to')))
    if (Number.isNaN(+from) || Number.isNaN(+to) || to <= from || +to - +from > 400 * 864e5) throw new HttpError(400, 'Intervalo de datas inválido')
    return [200, await eventsFor(user.id, from, to)]
  }],
  ['GET', /^\/api\/unfurl$/, async (req, _, url) => {
    auth(req)
    try { return [200, await unfurl(String(url.searchParams.get('url')))] }
    catch (e) { throw new HttpError(422, `Não foi possível carregar o link: ${(e as Error).message}`) }
  }],
  ['PATCH', /^\/api\/me$/, async req => {
    const user = auth(req)
    const name = String((await body(req)).name ?? '').trim().slice(0, 80)
    if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id)
    return [200, me({ ...user, name: name || user.name })]
  }],
  // ---------- the account holder's rights (LGPD art. 18) ----------
  ['GET', /^\/api\/me\/export$/, req => [200, exportData(auth(req).id)]],
  ['GET', /^\/api\/me\/deletion$/, req => {
    const user = auth(req)
    const { password_hash } = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }
    return [200, { workspaces: deletionPreview(user.id), password: !!password_hash }]
  }],
  ['POST', /^\/api\/me\/delete$/, async req => {
    const user = auth(req)
    const { email, password } = await body(req)
    if (String(email ?? '').trim().toLowerCase() !== user.email) throw new HttpError(400, 'Digite o e-mail da conta para confirmar.')
    const { password_hash } = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }
    checkLockout(user.email)
    if (password_hash && !checkPassword(String(password ?? ''), password_hash)) { countFailure(user.email); throw new HttpError(401, 'Senha incorreta.') }
    await deleteAccount(user.id)
    return [200, { ok: true }]
  }],
  ['POST', /^\/api\/workspaces$/, async req => {
    const user = auth(req)
    const { name } = await body(req)
    const id = createWorkspace(String(name ?? '').trim() || 'Novo workspace', user.id)
    return [201, { id, workspaces: workspacesOf(user.id) }]
  }],
  ['PATCH', /^\/api\/workspaces\/([\w-]+)$/, async (req, [ws]) => {
    const user = auth(req)
    if (roleIn(ws, user.id) !== 'owner') throw new HttpError(403, 'Apenas o dono pode renomear')
    const { name } = await body(req)
    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(String(name ?? '').trim() || 'Workspace', ws)
    return [200, { workspaces: workspacesOf(user.id) }]
  }],
  ['GET', /^\/api\/workspaces\/([\w-]+)\/members$/, (req, [ws]) => {
    roleIn(ws, auth(req).id)
    return [200, db.prepare(`SELECT u.id, u.name, u.email, m.role FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ? ORDER BY u.name`).all(ws)]
  }],
  ['POST', /^\/api\/workspaces\/([\w-]+)\/members$/, async (req, [ws]) => {
    const user = auth(req)
    if (roleIn(ws, user.id) !== 'owner') throw new HttpError(403, 'Apenas o dono pode convidar')
    const { email, role = 'editor' } = await body(req)
    if (!['editor', 'viewer'].includes(role)) throw new HttpError(400, 'Papel inválido')
    const invited = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email ?? '').trim().toLowerCase()) as { id: string } | undefined
    if (!invited) throw new HttpError(404, 'Nenhuma conta com este e-mail. Peça para a pessoa se cadastrar primeiro.')
    db.prepare('INSERT INTO members (workspace_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET role = excluded.role')
      .run(ws, invited.id, role)
    return [201, { ok: true }]
  }],
  ['DELETE', /^\/api\/workspaces\/([\w-]+)\/members\/([\w-]+)$/, (req, [ws, memberId]) => {
    const user = auth(req)
    const role = roleIn(ws, user.id)
    if (role !== 'owner' && memberId !== user.id) throw new HttpError(403, 'Sem permissão')
    if (roleIn(ws, memberId) === 'owner') throw new HttpError(400, 'O dono não pode ser removido')
    db.prepare('DELETE FROM members WHERE workspace_id = ? AND user_id = ?').run(ws, memberId)
    return [200, { ok: true }]
  }],
  // incremental pull: everything changed after `since` (server clock)
  ['GET', /^\/api\/workspaces\/([\w-]+)\/pages$/, (req, [ws], url) => {
    roleIn(ws, auth(req).id)
    const since = Number(url.searchParams.get('since') ?? 0)
    const rows = db.prepare('SELECT id, data, deleted, server_ts FROM pages WHERE workspace_id = ? AND server_ts > ?')
      .all(ws, since) as { id: string; data: string | null; deleted: number; server_ts: number }[]
    return [200, {
      serverTime: rows.reduce((m, r) => Math.max(m, r.server_ts), since),
      pages: rows.filter(r => !r.deleted).map(r => JSON.parse(r.data!)),
      deleted: rows.filter(r => r.deleted).map(r => r.id),
    }]
  }],
  // push: upserts (last write wins by page.updatedAt) and permanent deletions
  ['POST', /^\/api\/workspaces\/([\w-]+)\/sync$/, async (req, [ws]) => {
    const user = auth(req)
    if (roleIn(ws, user.id) === 'viewer') throw new HttpError(403, 'Você só tem permissão de leitura')
    const { upserts = [], deletes = [], bases = {} } = await body(req)
    const current = db.prepare('SELECT data, updated_at, deleted FROM pages WHERE workspace_id = ? AND id = ?')
    const upsert = db.prepare(`INSERT INTO pages (id, workspace_id, data, updated_at, server_ts, deleted) VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT (workspace_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, server_ts = excluded.server_ts, deleted = 0`)
    const remove = db.prepare(`INSERT INTO pages (id, workspace_id, data, updated_at, server_ts, deleted) VALUES (?, ?, NULL, ?, ?, 1)
      ON CONFLICT (workspace_id, id) DO UPDATE SET data = NULL, server_ts = excluded.server_ts, deleted = 1`)
    const accepted: any[] = []
    const merged: any[] = []
    const now = Date.now()
    const deleted: string[] = deletes.filter((id: unknown) => typeof id === 'string')
    db.exec('BEGIN')
    try {
      for (let page of upserts) {
        if (typeof page?.id !== 'string') continue
        const prev = current.get(ws, page.id) as { data: string; updated_at: number; deleted: number } | undefined
        if (prev?.deleted) continue
        const base = bases[page.id]
        // someone else saved since the version this client started from: merge block by block
        if (prev && prev.updated_at !== base?.updatedAt) {
          page = mergePage(base, page, JSON.parse(prev.data))
          merged.push(page)
        }
        upsert.run(page.id, ws, JSON.stringify(page), Number(page.updatedAt) || Date.now(), serverTs())
        snapshot(ws, page, user.id, now)
        accepted.push(page)
      }
      for (const id of deleted) remove.run(id, ws, Date.now(), serverTs())
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    if (accepted.length || deleted.length) broadcast(ws, { type: 'pages', pages: accepted, deleted }, clientIdOf(req))
    return [200, { accepted: accepted.length, merged }]
  }],

  // ---------- version history ----------
  ['GET', /^\/api\/workspaces\/([\w-]+)\/pages\/([\w-]+)\/versions$/, (req, [ws, pageId]) => {
    roleIn(ws, auth(req).id)
    const rows = db.prepare(`SELECT v.id, v.started_at, v.created_at, v.data, u.name FROM page_versions v JOIN users u ON u.id = v.user_id
      WHERE v.workspace_id = ? AND v.page_id = ? ORDER BY v.id DESC`).all(ws, pageId) as any[]
    return [200, rows.map(r => {
      const p = JSON.parse(r.data)
      return { id: r.id, startedAt: r.started_at, createdAt: r.created_at, author: r.name, title: p.title, blocks: p.blocks?.length ?? 0 }
    })]
  }],
  ['GET', /^\/api\/workspaces\/([\w-]+)\/versions\/(\d+)$/, (req, [ws, id]) => {
    roleIn(ws, auth(req).id)
    const row = db.prepare('SELECT data FROM page_versions WHERE workspace_id = ? AND id = ?').get(ws, Number(id)) as { data: string } | undefined
    if (!row) throw new HttpError(404, 'Versão não encontrada')
    return [200, JSON.parse(row.data)]
  }],

  // ---------- AI (Claude) ----------
  ['POST', /^\/api\/workspaces\/([\w-]+)\/ai$/, async (req, [ws], _url, res) => {
    roleIn(ws, auth(req).id)
    const { action, text, page, prompt, lang } = await body(req)
    if (typeof action !== 'string') throw new HttpError(400, 'Ação inválida')
    const { system, content, effort } = aiPrompt({ action, text: str(text), page: str(page), prompt: str(prompt), lang: str(lang) })
    await streamAi(req, res, system, content, effort)
    return null
  }],
  ['POST', /^\/api\/workspaces\/([\w-]+)\/ask$/, async (req, [ws], _url, res) => {
    roleIn(ws, auth(req).id)
    const question = (str((await body(req)).question) ?? '').trim()
    if (!question) throw new HttpError(400, 'Faça uma pergunta')
    const { system, content, effort } = askPrompt(question, livePages(ws))
    await streamAi(req, res, system, content, effort)
    return null
  }],

  // ---------- comments ----------
  ['GET', /^\/api\/workspaces\/([\w-]+)\/pages\/([\w-]+)\/comments$/, (req, [ws, pageId]) => {
    roleIn(ws, auth(req).id)
    return [200, (db.prepare(`${COMMENT_SELECT} WHERE c.workspace_id = ? AND c.page_id = ? ORDER BY c.created_at`).all(ws, pageId)).map(toComment)]
  }],
  ['GET', /^\/api\/workspaces\/([\w-]+)\/comment-counts$/, (req, [ws]) => {
    roleIn(ws, auth(req).id)
    return [200, db.prepare(`SELECT page_id AS pageId, block_id AS blockId, COUNT(*) AS n FROM comments
      WHERE workspace_id = ? AND resolved = 0 GROUP BY page_id, block_id`).all(ws)]
  }],
  ['POST', /^\/api\/workspaces\/([\w-]+)\/pages\/([\w-]+)\/comments$/, async (req, [ws, pageId]) => {
    const user = auth(req)
    roleIn(ws, user.id)
    const { body: text, blockId = null, threadId = null, mentions = [] } = await body(req)
    if (!String(text ?? '').trim()) throw new HttpError(400, 'Comentário vazio')
    const id = randomUUID()
    const thread = threadId ?? id
    const memberIds = new Set((db.prepare('SELECT user_id FROM members WHERE workspace_id = ?').all(ws) as { user_id: string }[]).map(r => r.user_id))
    const validMentions = (Array.isArray(mentions) ? mentions : []).filter((m: string) => memberIds.has(m) && m !== user.id)
    db.prepare(`INSERT INTO comments (id, workspace_id, page_id, block_id, thread_id, user_id, body, mentions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, ws, pageId, blockId, thread, user.id, String(text).trim(), JSON.stringify(validMentions), Date.now())
    if (threadId) db.prepare('UPDATE comments SET resolved = 0 WHERE thread_id = ?').run(threadId)
    broadcast(ws, { type: 'comments', pageId, mentions: validMentions })
    return [201, toComment(db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id))]
  }],
  ['PATCH', /^\/api\/workspaces\/([\w-]+)\/comments\/([\w-]+)$/, async (req, [ws, id]) => {
    const user = auth(req)
    roleIn(ws, user.id)
    const c = db.prepare('SELECT user_id, thread_id, page_id FROM comments WHERE id = ? AND workspace_id = ?').get(id, ws) as any
    if (!c) throw new HttpError(404, 'Comentário não encontrado')
    const { body: text, resolved } = await body(req)
    if (typeof resolved === 'boolean') db.prepare('UPDATE comments SET resolved = ? WHERE thread_id = ?').run(resolved ? 1 : 0, c.thread_id)
    if (typeof text === 'string') {
      if (c.user_id !== user.id) throw new HttpError(403, 'Só o autor pode editar')
      db.prepare('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?').run(text.trim(), Date.now(), id)
    }
    broadcast(ws, { type: 'comments', pageId: c.page_id })
    return [200, { ok: true }]
  }],
  ['DELETE', /^\/api\/workspaces\/([\w-]+)\/comments\/([\w-]+)$/, (req, [ws, id]) => {
    const user = auth(req)
    const role = roleIn(ws, user.id)
    const c = db.prepare('SELECT user_id, page_id, thread_id FROM comments WHERE id = ? AND workspace_id = ?').get(id, ws) as any
    if (!c) throw new HttpError(404, 'Comentário não encontrado')
    if (c.user_id !== user.id && role !== 'owner') throw new HttpError(403, 'Sem permissão')
    // deleting the first comment removes the whole thread
    if (c.thread_id === id) db.prepare('DELETE FROM comments WHERE thread_id = ?').run(id)
    else db.prepare('DELETE FROM comments WHERE id = ?').run(id)
    broadcast(ws, { type: 'comments', pageId: c.page_id })
    return [200, { ok: true }]
  }],
  // mentions of the current user in this workspace (the inbox)
  ['GET', /^\/api\/workspaces\/([\w-]+)\/inbox$/, (req, [ws]) => {
    const user = auth(req)
    roleIn(ws, user.id)
    const rows = (db.prepare(`${COMMENT_SELECT} WHERE c.workspace_id = ? AND c.mentions LIKE ? ORDER BY c.created_at DESC LIMIT 50`)
      .all(ws, `%"${user.id}"%`)).map(toComment)
    const read = new Set((db.prepare('SELECT comment_id FROM mention_reads WHERE user_id = ?').all(user.id) as any[]).map(r => r.comment_id))
    return [200, rows.map(r => ({ ...r, read: read.has(r.id) }))]
  }],
  ['POST', /^\/api\/workspaces\/([\w-]+)\/inbox\/read$/, async (req, [ws]) => {
    const user = auth(req)
    roleIn(ws, user.id)
    const { ids = [] } = await body(req)
    const mark = db.prepare('INSERT OR IGNORE INTO mention_reads (user_id, comment_id) VALUES (?, ?)')
    for (const id of ids) if (typeof id === 'string') mark.run(user.id, id)
    return [200, { ok: true }]
  }],

  // ---------- sharing ----------
  ['GET', /^\/api\/workspaces\/([\w-]+)\/pages\/([\w-]+)\/share$/, (req, [ws, pageId]) => {
    roleIn(ws, auth(req).id)
    const row = db.prepare('SELECT token FROM shares WHERE workspace_id = ? AND page_id = ?').get(ws, pageId) as { token: string } | undefined
    return [200, { token: row?.token ?? null }]
  }],
  ['POST', /^\/api\/workspaces\/([\w-]+)\/pages\/([\w-]+)\/share$/, (req, [ws, pageId]) => {
    const user = auth(req)
    if (roleIn(ws, user.id) === 'viewer') throw new HttpError(403, 'Leitores não podem publicar')
    const existing = db.prepare('SELECT token FROM shares WHERE workspace_id = ? AND page_id = ?').get(ws, pageId) as { token: string } | undefined
    if (existing) return [200, existing]
    const token = randomBytes(12).toString('base64url')
    db.prepare('INSERT INTO shares (token, workspace_id, page_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(token, ws, pageId, user.id, Date.now())
    return [201, { token }]
  }],
  ['DELETE', /^\/api\/workspaces\/([\w-]+)\/pages\/([\w-]+)\/share$/, (req, [ws, pageId]) => {
    if (roleIn(ws, auth(req).id) === 'viewer') throw new HttpError(403, 'Sem permissão')
    db.prepare('DELETE FROM shares WHERE workspace_id = ? AND page_id = ?').run(ws, pageId)
    return [200, { token: null }]
  }],
  // every page of the workspace that is published on the web
  ['GET', /^\/api\/workspaces\/([\w-]+)\/shares$/, (req, [ws]) => {
    roleIn(ws, auth(req).id)
    return [200, db.prepare(`SELECT s.token, s.page_id AS pageId, s.created_at AS createdAt, u.name AS createdBy
      FROM shares s JOIN users u ON u.id = s.created_by WHERE s.workspace_id = ? ORDER BY s.created_at DESC`).all(ws)]
  }],
  // public, no login: the shared page and its subpages, read-only
  ['GET', /^\/api\/public\/([\w-]+)$/, (_req, [token]) => {
    const share = db.prepare('SELECT workspace_id, page_id FROM shares WHERE token = ?').get(token) as { workspace_id: string; page_id: string } | undefined
    const pages = share && subtree(share.workspace_id, share.page_id)
    if (!pages) throw new HttpError(404, 'Esta página não está publicada ou foi removida')
    return [200, { rootId: share!.page_id, pages }]
  }],
]

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  securityHeaders(res)
  try {
    if (url.pathname.startsWith('/api/')) {
      cors(req, res)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
          'Access-Control-Max-Age': '600',
        })
        return void res.end()
      }
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re)
        if (m && req.method === method) {
          const out = await handler(req, m.slice(1), url, res)
          return out ? send(res, out[0], out[1]) : undefined
        }
      }
      throw new HttpError(404, 'Rota não encontrada')
    }
    // production: serve the built frontend (npm run build) with SPA fallback
    let file = join(DIST, decodeURIComponent(url.pathname))
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
    if (!existsSync(file)) throw new HttpError(404, 'Frontend não compilado. Rode "npm run build" ou use "npm run dev".')
    const html = extname(file) === '.html'
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      ...(html ? { 'Content-Security-Policy': CSP } : {}),
      // published pages are reachable by link only
      ...(url.pathname.startsWith('/p/') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    })
    res.end(readFileSync(file))
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(e)
    if (res.headersSent) return void res.end()
    send(res, status, { error: status === 500 ? 'Erro interno' : (e as Error).message })
  }
})

attachRealtime(server, (token, workspaceId) => {
  const user = userByToken(token)
  if (!user) return null
  try { roleIn(workspaceId, user.id); return user } catch { return null }
})
// data past its use (expired sessions and sign-ups, old access logs) is deleted every hour
purgeExpired()
setInterval(purgeExpired, 3_600_000).unref()
server.listen(PORT, () => console.log(`CofDesk API em http://localhost:${PORT}`))
