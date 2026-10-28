import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Loader, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useDialog } from '../a11y'
import { api } from '../auth'
import { rowsOf, useStore } from '../store'
import type { Page } from '../types'
import { PageIcon } from './icons'
import { HEX } from './Charts'
import '../calendar.css'
import { desktop } from '../config'

// The calendar: events from connected Google / iCloud calendars together with dated database items.

export type CalEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean
  location?: string; url?: string; calendar: string; color?: string; source: 'google' | 'icloud' | 'cofdesk'; account?: string
  pageId?: string
}
type Connection = { id: string; provider: 'google' | 'icloud'; account: string; createdAt: number }

/** One-off message shown after coming back from Google's consent screen. */
export const useCalendarNotice = create<{ notice: { ok?: string; error?: string } | null; set: (n: { ok?: string; error?: string } | null) => void }>(
  set => ({ notice: null, set: notice => set({ notice }) }),
)

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** The local day an event starts on ("2026-10-28"). */
export const dayOf = (e: CalEvent) => (e.allDay ? e.start.slice(0, 10) : iso(new Date(e.start)))
export const timeOf = (e: CalEvent) => (e.allDay ? 'Dia todo' : new Date(e.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))

/** Events from the connected calendars between two dates (refetched when the range changes). */
export function useExternalEvents(from: Date, to: Date, version = 0) {
  const [state, setState] = useState<{ events: CalEvent[]; errors: { account: string; error: string }[]; loading: boolean }>({ events: [], errors: [], loading: true })
  const key = `${from.toISOString()}|${to.toISOString()}|${version}`
  useEffect(() => {
    let live = true
    setState(s => ({ ...s, loading: true }))
    api<{ events: CalEvent[]; errors: { account: string; error: string }[] }>(`/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then(r => { if (live) setState({ ...r, loading: false }) })
      .catch(() => { if (live) setState({ events: [], errors: [], loading: false }) })
    return () => { live = false }
  }, [key])
  return state
}

/** Items of every database that has a date property, as calendar events. */
export function databaseEvents(pages: Record<string, Page>, from: string, to: string): CalEvent[] {
  return Object.values(pages)
    .filter(db => db.kind === 'database' && !db.trashed)
    .flatMap(db => {
      const date = db.schema?.find(p => p.type === 'date')
      if (!date) return []
      return rowsOf(pages, db.id)
        .filter(r => r.props[date.id] && r.props[date.id] >= from && r.props[date.id] <= to)
        .map(r => ({
          id: `l:${r.id}`, title: r.title || 'Sem título', start: r.props[date.id], end: r.props[date.id], allDay: true,
          calendar: db.title || 'Banco de dados', color: HEX.gray, source: 'cofdesk' as const, pageId: r.id,
        }))
    })
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarHome() {
  const pages = useStore(s => s.pages)
  const navigate = useStore(s => s.navigate)
  const notice = useCalendarNotice(s => s.notice)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [version, setVersion] = useState(0)
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [icloudOpen, setIcloudOpen] = useState(false)
  const [selected, setSelected] = useState<CalEvent | null>(null)

  const start = useMemo(() => { const d = new Date(cursor); d.setDate(1 - cursor.getDay()); return d }, [cursor])
  const end = useMemo(() => { const d = new Date(start); d.setDate(d.getDate() + 42); return d }, [start])
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const external = useExternalEvents(start, end, version)
  const all = [...external.events, ...databaseEvents(pages, iso(start), iso(end))]
  const byDay = new Map<string, CalEvent[]>()
  for (const e of all) byDay.set(dayOf(e), [...(byDay.get(dayOf(e)) ?? []), e])
  const today = iso(new Date())

  const loadConnections = () => api<{ connections: Connection[]; google: boolean }>('/calendar/connections')
    .then(r => { setConnections(r.connections); setGoogleReady(r.google) })
  useEffect(() => { loadConnections() }, [])

  const connectGoogle = async () => {
    try {
      const { url } = await api<{ url: string }>('/calendar/google', { body: { client: desktop ? 'desktop' : 'web' } })
      // the desktop app does the Google consent in the system browser, which sends it back through cofdesk://
      if (desktop) desktop.openExternal(url)
      else location.href = url
    }
    catch (e) { useCalendarNotice.getState().set({ error: (e as Error).message }) }
  }
  const remove = async (c: Connection) => {
    if (!confirm(`Desconectar ${c.account}? Os eventos deixam de aparecer no CofDesk.`)) return
    setConnections((await api<{ connections: Connection[] }>(`/calendar/connections/${c.id}`, { method: 'DELETE' })).connections)
    setVersion(v => v + 1)
  }
  const open = (e: CalEvent) => { if (e.pageId) navigate(e.pageId); else setSelected(e) }

  return (
    <div className="cal-home">
      <header className="cal-home-head">
        <h1><CalendarDays size={26} /> Calendário</h1>
        <div className="cal-home-nav">
          <button className="pill" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} title="Mês anterior"><ChevronLeft size={16} /></button>
          <button className="pill" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoje</button>
          <button className="pill" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} title="Próximo mês"><ChevronRight size={16} /></button>
          <strong>{(s => s[0].toUpperCase() + s.slice(1))(cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</strong>
          {external.loading && <Loader size={14} className="spin ico-muted" />}
        </div>
      </header>

      {notice && (
        <div className={`cal-notice ${notice.error ? 'err' : ''}`}>
          {notice.error ? <AlertCircle size={16} /> : <CalendarDays size={16} />} {notice.error ?? notice.ok}
          <button className="icon-btn" onClick={() => useCalendarNotice.getState().set(null)}><X size={14} /></button>
        </div>
      )}
      {external.errors.map(e => <div key={e.account} className="cal-notice err"><AlertCircle size={16} /> {e.account}: {e.error}</div>)}

      <div className="cal-home-body">
        <div className="cal-month">
          {WEEKDAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
          {days.map(d => {
            const key = iso(d)
            const items = byDay.get(key) ?? []
            return (
              <div key={key} className={`cal-cell ${d.getMonth() !== cursor.getMonth() ? 'out' : ''}`}>
                <span className={`cal-n ${key === today ? 'today' : ''}`}>{d.getDate()}</span>
                {items.slice(0, 4).map(e => (
                  <button key={e.id} className={`cal-ev ${e.allDay ? 'all-day' : ''}`} style={{ ['--ev' as any]: e.color ?? HEX.blue }} onClick={() => open(e)}
                    title={`${e.title}\n${timeOf(e)} · ${e.calendar}`}>
                    {!e.allDay && <small>{timeOf(e)}</small>} {e.title}
                  </button>
                ))}
                {items.length > 4 && <span className="cal-more">+{items.length - 4} mais</span>}
              </div>
            )
          })}
        </div>

        <aside className="cal-side" aria-label="Agendas conectadas">
          <div className="popover-title">Calendários conectados</div>
          {!connections && <div className="ai-thinking"><Loader size={14} className="spin" /> Carregando…</div>}
          {connections?.length === 0 && <p className="muted small">Nenhum ainda. Conecte para ver seus compromissos junto com as páginas.</p>}
          {connections?.map(c => (
            <div key={c.id} className="cal-conn">
              <span className={`cal-badge ${c.provider}`}>{c.provider === 'google' ? 'G' : ''}</span>
              <div className="grow"><strong>{c.provider === 'google' ? 'Google Agenda' : 'iCloud'}</strong><small>{c.account}</small></div>
              <button className="icon-btn" title="Desconectar" onClick={() => remove(c)}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="btn cal-connect" onClick={connectGoogle} disabled={!googleReady} title={googleReady ? '' : 'Configure GOOGLE_CLIENT_ID no servidor (veja o README)'}>
            <Plus size={14} /> Conectar Google Agenda
          </button>
          <button className="btn cal-connect" onClick={() => setIcloudOpen(true)}><Plus size={14} /> Conectar iCloud</button>
          {!googleReady && <p className="muted small">A conexão com o Google aparece quando o servidor tiver as credenciais do Google configuradas.</p>}

          <div className="popover-title">Também no calendário</div>
          <p className="muted small">Itens dos seus bancos de dados com data aparecem aqui automaticamente.</p>
        </aside>
      </div>

      {icloudOpen && <IcloudForm onClose={() => setIcloudOpen(false)} onDone={list => { setConnections(list); setIcloudOpen(false); setVersion(v => v + 1) }} />}
      {selected && <EventDetails e={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function IcloudForm({ onClose, onDone }: { onClose: () => void; onDone: (c: Connection[]) => void }) {
  const [appleId, setAppleId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useDialog<HTMLFormElement>(true, onClose)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { onDone((await api<{ connections: Connection[] }>('/calendar/icloud', { body: { appleId, password } })).connections) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <form ref={dialog} className="modal icloud-modal" role="dialog" aria-modal="true" aria-labelledby="icloud-title" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <header><strong id="icloud-title">Conectar calendário do iCloud</strong><button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={16} aria-hidden /></button></header>
        <ol className="icloud-steps">
          <li>Entre em <a href="https://account.apple.com/account/manage" target="_blank" rel="noreferrer">account.apple.com <ExternalLink size={11} /></a> com seu Apple ID.</li>
          <li>Em <b>Iniciar sessão e segurança</b>, abra <b>Senhas de apps</b> e crie uma chamada “CofDesk”.</li>
          <li>Cole abaixo a senha gerada (formato xxxx-xxxx-xxxx-xxxx). Não use a senha normal do Apple ID.</li>
        </ol>
        <label className="auth-field">Apple ID (e-mail)
          <input className="input" type="email" required autoFocus value={appleId} onChange={e => setAppleId(e.target.value)} autoComplete="off" />
        </label>
        <label className="auth-field">Senha de app
          <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" />
        </label>
        <p className="muted small">
          O CofDesk só lê seus eventos. A senha de app fica criptografada no servidor e você pode revogá-la a qualquer momento no site da Apple
          ou desconectando a agenda aqui. Veja a <a href="/privacidade" target="_blank">Política de Privacidade</a>.
        </p>
        <div className="auth-error" role="alert" hidden={!error}>{error}</div>
        <button className="btn primary" disabled={busy}>{busy ? 'Conectando…' : 'Conectar'}</button>
      </form>
    </div>
  )
}

function EventDetails({ e, onClose }: { e: CalEvent; onClose: () => void }) {
  const range = e.allDay
    ? new Date(e.start + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${new Date(e.start).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} – ${new Date(e.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  const dialog = useDialog(true, onClose)
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div ref={dialog} className="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title" onMouseDown={ev => ev.stopPropagation()}>
        <header><span className="cal-dot" style={{ background: e.color ?? HEX.blue }} /><strong id="event-title">{e.title}</strong><button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={16} aria-hidden /></button></header>
        <p>{range}</p>
        {e.location && <p className="muted"><MapPin size={13} /> {e.location}</p>}
        <p className="muted small">{e.calendar} · {e.source === 'google' ? 'Google Agenda' : 'iCloud'}{e.account ? ` (${e.account})` : ''}</p>
        {e.url && <a className="btn" href={e.url.startsWith('https://') ? e.url : '#'} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir no Google Agenda</a>}
      </div>
    </div>
  )
}

/** A dated row of a database, shown with its database's icon. */
export function EventSource({ e }: { e: CalEvent }) {
  const pages = useStore(s => s.pages)
  if (e.pageId) {
    const db = pages[pages[e.pageId]?.parentId ?? '']
    return db ? <span className="event-db"><PageIcon page={db} size={14} /> {db.title}</span> : null
  }
  return <span className="event-db"><span className="cal-dot" style={{ background: e.color ?? HEX.blue }} /> {e.calendar}</span>
}
