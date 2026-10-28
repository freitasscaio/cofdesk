import { createHash, randomBytes } from 'node:crypto'
import { db } from './db.ts'

// "Continue with Google" (OpenID Connect, authorization code flow with PKCE), plus the Google consent
// used to connect a Google Calendar. Configured by env vars.

/** Public address of this server; Google sends people back to it. */
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
/** Public address of the website, when it is served apart from the server (e.g. on Vercel). */
export const WEB_URL = (process.env.WEB_URL || PUBLIC_URL).replace(/\/$/, '')
/** The desktop app is opened back through this address scheme after signing in in the browser. */
export const DESKTOP_SCHEME = 'cofdesk://'
export type Client = 'web' | 'desktop'

const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET }
  : null

export const providers = () => ({ google: !!google })

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    purpose TEXT NOT NULL,
    verifier TEXT NOT NULL,
    nonce TEXT NOT NULL,
    user_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS identities (
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (provider, subject)
  );
  CREATE TABLE IF NOT EXISTS login_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
`)

// which app started the sign-in: the website or the desktop app (added after the first release)
if (!(db.prepare('PRAGMA table_info(oauth_states)').all() as { name: string }[]).some(c => c.name === 'client')) {
  db.exec("ALTER TABLE oauth_states ADD COLUMN client TEXT NOT NULL DEFAULT 'web'")
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const STATE_TTL = 10 * 60_000

export type Purpose = 'login' | 'calendar'

/** Starts a sign-in or consent: remembers state/PKCE on the server and returns the provider's URL. */
export function startUrl(provider: 'google', purpose: Purpose, userId: string | null = null, client: Client = 'web') {
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(32))
  const nonce = b64url(randomBytes(16))
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(Date.now() - STATE_TTL)
  db.prepare('INSERT INTO oauth_states (state, provider, purpose, verifier, nonce, user_id, client, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(state, provider, purpose, verifier, nonce, userId, client, Date.now())

  if (!google) throw new Error('google-off')
  const calendar = purpose === 'calendar'
  const q = new URLSearchParams({
    client_id: google.id,
    redirect_uri: `${PUBLIC_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: calendar ? 'openid email https://www.googleapis.com/auth/calendar.readonly' : 'openid email profile',
    state,
    nonce,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    // a refresh token is needed to read the calendar later, without the person present
    ...(calendar ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' } : { prompt: 'select_account' }),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

type State = { provider: string; purpose: Purpose; verifier: string; nonce: string; user_id: string | null; client: Client; created_at: number }

/** Reads and forgets a state; each one works once. */
export function takeState(state: string, provider: string): State {
  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as State | undefined
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state)
  if (!row || row.provider !== provider || Date.now() - row.created_at > STATE_TTL) throw new Error('A tentativa de login expirou. Tente de novo.')
  return row
}

const claims = (idToken: string) => JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))

async function tokenRequest(url: string, form: Record<string, string>) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Falha no login (${res.status})`)
  return data
}

export type Profile = { subject: string; email: string | null; emailVerified: boolean; name: string | null }

/**
 * Exchanges the code for tokens. The ID token comes straight from the provider's token endpoint over TLS,
 * authenticated by our client secret, so its claims are checked (issuer, audience, expiry, nonce) without
 * fetching signing keys — as OpenID Connect allows for tokens received this way.
 */
export async function googleExchange(code: string, st: State) {
  if (!google) throw new Error('Login com Google não está configurado.')
  const t = await tokenRequest('https://oauth2.googleapis.com/token', {
    client_id: google.id, client_secret: google.secret, code, code_verifier: st.verifier,
    grant_type: 'authorization_code', redirect_uri: `${PUBLIC_URL}/api/auth/google/callback`,
  })
  const c = claims(t.id_token)
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(c.iss) || c.aud !== google.id || c.exp * 1000 < Date.now() || c.nonce !== st.nonce) {
    throw new Error('Resposta do Google inválida.')
  }
  const profile: Profile = { subject: c.sub, email: c.email?.toLowerCase() ?? null, emailVerified: c.email_verified === true, name: c.name ?? null }
  return { profile, refreshToken: t.refresh_token as string | undefined }
}

/** Finds the CofDesk account for a Google identity, linking by verified e-mail or creating one. */
export function accountFor(provider: string, p: Profile, create: (email: string, name: string) => string): string {
  const linked = db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(provider, p.subject) as { user_id: string } | undefined
  if (linked) return linked.user_id
  if (!p.email || !p.emailVerified) throw new Error('Sua conta não tem um e-mail verificado.')
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(p.email) as { id: string } | undefined
  const userId = existing?.id ?? create(p.email, p.name || p.email.split('@')[0])
  db.prepare('INSERT INTO identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').run(provider, p.subject, userId, p.email, Date.now())
  return userId
}

/** A one-time code the browser trades for a session, so the session token never appears in a URL. */
export function loginCode(userId: string) {
  const code = b64url(randomBytes(24))
  db.prepare('DELETE FROM login_codes WHERE created_at < ?').run(Date.now() - 120_000)
  db.prepare('INSERT INTO login_codes (code, user_id, created_at) VALUES (?, ?, ?)').run(code, userId, Date.now())
  return code
}

export function redeemCode(code: string): string | null {
  const row = db.prepare('SELECT user_id, created_at FROM login_codes WHERE code = ?').get(code) as { user_id: string; created_at: number } | undefined
  db.prepare('DELETE FROM login_codes WHERE code = ?').run(code)
  return row && Date.now() - row.created_at < 120_000 ? row.user_id : null
}

export const identitiesOf = (userId: string) =>
  (db.prepare('SELECT provider FROM identities WHERE user_id = ?').all(userId) as { provider: string }[]).map(r => r.provider)

export const googleConfig = () => google
