import { randomUUID } from 'node:crypto'
import { db } from './db.ts'
import { seal, unseal } from './secrets.ts'
import { googleConfig } from './oauth.ts'

// Connected calendars: Google Calendar (OAuth, read-only) and iCloud (CalDAV with an app-specific password).
// Credentials are stored encrypted; events are read on demand and cached for a minute.

db.exec(`
  CREATE TABLE IF NOT EXISTS calendar_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'icloud')),
    account TEXT NOT NULL,
    secret TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, provider, account)
  );
`)

export type CalEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean
  location?: string; url?: string; calendar: string; color?: string; source: 'google' | 'icloud'; account: string
}
type Row = { id: string; user_id: string; provider: 'google' | 'icloud'; account: string; secret: string; created_at: number }

export const connectionsOf = (userId: string) =>
  (db.prepare('SELECT id, provider, account, created_at FROM calendar_connections WHERE user_id = ? ORDER BY created_at').all(userId) as Omit<Row, 'secret' | 'user_id'>[])
    .map(r => ({ id: r.id, provider: r.provider, account: r.account, createdAt: r.created_at }))

function save(userId: string, provider: Row['provider'], account: string, secret: unknown) {
  db.prepare(`INSERT INTO calendar_connections (id, user_id, provider, account, secret, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, provider, account) DO UPDATE SET secret = excluded.secret`)
    .run(randomUUID(), userId, provider, account, seal(secret), Date.now())
  cache.clear()
}

export async function removeConnection(userId: string, id: string) {
  const row = db.prepare('SELECT * FROM calendar_connections WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined
  if (!row) return false
  if (row.provider === 'google') {
    // also withdraw CofDesk's access on Google's side
    const { refreshToken } = unseal<{ refreshToken: string }>(row.secret)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' }).catch(() => {})
  }
  db.prepare('DELETE FROM calendar_connections WHERE id = ?').run(id)
  cache.clear()
  return true
}

// ---------- Google Calendar ----------
export function saveGoogle(userId: string, email: string, refreshToken: string) {
  save(userId, 'google', email, { refreshToken })
}

const accessTokens = new Map<string, { token: string; until: number }>()
async function googleAccess(row: Row) {
  const hit = accessTokens.get(row.id)
  if (hit && hit.until > Date.now() + 60_000) return hit.token
  const cfg = googleConfig()
  if (!cfg) throw new Error('Google não está configurado no servidor')
  const { refreshToken } = unseal<{ refreshToken: string }>(row.secret)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.id, client_secret: cfg.secret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error === 'invalid_grant' ? 'O acesso ao Google expirou. Conecte de novo.' : 'Falha ao renovar o acesso ao Google')
  accessTokens.set(row.id, { token: data.access_token, until: Date.now() + (Number(data.expires_in) || 3600) * 1000 })
  return data.access_token as string
}

async function googleEvents(row: Row, from: Date, to: Date): Promise<CalEvent[]> {
  const token = await googleAccess(row)
  const get = async (path: string) => {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Google Agenda respondeu ${res.status}`)
    return res.json()
  }
  const list = await get('/users/me/calendarList?minAccessRole=reader')
  const calendars = (list.items ?? []).filter((c: any) => c.selected !== false && !c.hidden)
  const out: CalEvent[] = []
  await Promise.all(calendars.map(async (c: any) => {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '500' })
    const data = await get(`/calendars/${encodeURIComponent(c.id)}/events?${q}`)
    for (const e of data.items ?? []) {
      if (e.status === 'cancelled') continue
      const allDay = !!e.start?.date
      out.push({
        id: `g:${c.id}:${e.id}`, title: e.summary || '(sem título)', allDay,
        start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date,
        location: e.location, url: e.htmlLink, calendar: c.summaryOverride ?? c.summary, color: c.backgroundColor,
        source: 'google', account: row.account,
      })
    }
  }))
  return out
}

// ---------- iCloud (CalDAV) ----------
const ICLOUD = 'https://caldav.icloud.com/'
type Icloud = { appleId: string; password: string; home?: string }

/** CalDAV request that follows Apple's redirects by hand so the credentials are only ever sent to icloud.com. */
async function dav(method: string, url: string, cred: Icloud, body: string, depth: '0' | '1') {
  let target = new URL(url)
  for (let hop = 0; hop < 5; hop++) {
    if (target.protocol !== 'https:' || !(target.hostname === 'icloud.com' || target.hostname.endsWith('.icloud.com'))) throw new Error('Resposta inesperada do iCloud')
    const res = await fetch(target, {
      method, redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${cred.appleId}:${cred.password}`).toString('base64'),
        Depth: depth, 'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    })
    const next = res.status >= 300 && res.status < 400 && res.headers.get('location')
    if (next) { target = new URL(next, target); continue }
    if (res.status === 401) throw new Error('Apple ID ou senha de app incorretos')
    if (!res.ok && res.status !== 207) throw new Error(`iCloud respondeu ${res.status}`)
    return { xml: await res.text(), url: target }
  }
  throw new Error('Redirecionamentos demais no iCloud')
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, '\r').replace(/&amp;/g, '&')
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`))?.[1]
const responses = (xml: string) => [...xml.matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/g)].map(m => m[1])
const hrefIn = (xml?: string) => xml && decode(tag(xml, 'href') ?? '').trim()

async function icloudHome(cred: Icloud) {
  const principal = await dav('PROPFIND', ICLOUD, cred, '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', '0')
  const p = hrefIn(tag(principal.xml, 'current-user-principal'))
  if (!p) throw new Error('Não foi possível encontrar sua conta no iCloud')
  const home = await dav('PROPFIND', new URL(p, principal.url).href, cred,
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', '0')
  const h = hrefIn(tag(home.xml, 'calendar-home-set'))
  if (!h) throw new Error('Não foi possível encontrar seus calendários no iCloud')
  return new URL(h, home.url).href
}

export async function connectIcloud(userId: string, appleId: string, password: string) {
  const cred: Icloud = { appleId: appleId.trim(), password: password.replace(/\s/g, '') }
  const home = await icloudHome(cred) // also proves the credentials work
  save(userId, 'icloud', cred.appleId.toLowerCase(), { ...cred, home })
}

/** Minimal iCalendar reader: the VEVENTs of a CalDAV response (already expanded to single occurrences). */
function parseIcs(ics: string) {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const events: Record<string, { value: string; params: string }>[] = []
  let cur: Record<string, { value: string; params: string }> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null }
    else if (cur) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/)
      if (m && !cur[m[1]]) cur[m[1]] = { params: m[2], value: m[3] }
    }
  }
  return events
}
const unescape = (s = '') => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
function icsDate(v: { value: string; params: string }) {
  const m = v.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (!h) return { iso: `${y}-${mo}-${d}`, allDay: true }
  return { iso: z ? `${y}-${mo}-${d}T${h}:${mi}:${s}Z` : `${y}-${mo}-${d}T${h}:${mi}:${s}`, allDay: false }
}
const icalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

async function icloudEvents(row: Row, from: Date, to: Date): Promise<CalEvent[]> {
  const cred = unseal<Icloud>(row.secret)
  const home = cred.home ?? await icloudHome(cred)
  const list = await dav('PROPFIND', home, cred, `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
    <d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>`, '1')
  const calendars = responses(list.xml)
    // event calendars only (not reminder lists, which hold VTODOs)
    .filter(r => /<(?:[\w-]+:)?calendar\b/.test(tag(r, 'resourcetype') ?? '') && (!/comp\b[^>]*name=/.test(r) || /name="VEVENT"/.test(r)))
    .map(r => ({ href: new URL(hrefIn(r)!, list.url).href, name: decode(tag(r, 'displayname') ?? 'iCloud'), color: tag(r, 'calendar-color')?.slice(0, 7) }))
  const range = `start="${icalStamp(from)}" end="${icalStamp(to)}"`
  const out: CalEvent[] = []
  await Promise.all(calendars.map(async c => {
    const res = await dav('REPORT', c.href, cred, `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:prop><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop>
      <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${range}/></c:comp-filter></c:comp-filter></c:filter>
    </c:calendar-query>`, '1')
    for (const r of responses(res.xml)) {
      const data = tag(r, 'calendar-data')
      if (!data) continue
      for (const e of parseIcs(decode(data))) {
        const start = e.DTSTART && icsDate(e.DTSTART)
        if (!start) continue
        const end = (e.DTEND && icsDate(e.DTEND)) || start
        out.push({
          id: `i:${e.UID?.value}:${e['RECURRENCE-ID']?.value ?? start.iso}`, title: unescape(e.SUMMARY?.value) || '(sem título)',
          start: start.iso, end: end.iso, allDay: start.allDay, location: unescape(e.LOCATION?.value) || undefined,
          calendar: c.name, color: c.color, source: 'icloud', account: row.account,
        })
      }
    }
  }))
  return out
}

// ---------- reading ----------
const cache = new Map<string, { at: number; events: CalEvent[] }>()

export async function eventsFor(userId: string, from: Date, to: Date) {
  const rows = db.prepare('SELECT * FROM calendar_connections WHERE user_id = ?').all(userId) as Row[]
  const errors: { connection: string; account: string; error: string }[] = []
  const lists = await Promise.all(rows.map(async row => {
    const key = `${row.id}:${from.toISOString()}:${to.toISOString()}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < 60_000) return hit.events
    try {
      const events = row.provider === 'google' ? await googleEvents(row, from, to) : await icloudEvents(row, from, to)
      cache.set(key, { at: Date.now(), events })
      return events
    } catch (e) {
      errors.push({ connection: row.id, account: row.account, error: (e as Error).message })
      return []
    }
  }))
  const events = lists.flat().sort((a, b) => a.start.localeCompare(b.start))
  return { events, errors }
}
