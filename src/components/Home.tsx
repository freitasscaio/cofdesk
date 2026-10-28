import { useMemo } from 'react'
import { CalendarDays, Clock, LayoutTemplate, Plus } from 'lucide-react'
import { useAuth } from '../auth'
import { useStore } from '../store'
import { TEMPLATES } from '../templates'
import { IconView, PageIcon } from './icons'
import { createFromTemplate } from './Sidebar'
import { EventSource, databaseEvents, dayOf, timeOf, useExternalEvents } from './CalendarHome'

const I = { size: 16, strokeWidth: 1.8 }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function relativeDay(value: string) {
  const today = new Date()
  const d = new Date(value + 'T00:00')
  const diff = Math.round((d.getTime() - new Date(iso(today) + 'T00:00').getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  const s = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  return s[0].toUpperCase() + s.slice(1)
}

const ago = (t: number) => {
  const m = (Date.now() - t) / 60000
  if (m < 60) return `${Math.max(1, Math.floor(m))} min atrás`
  if (m < 1440) return `${Math.floor(m / 60)} h atrás`
  return new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

export function Home() {
  const pages = useStore(s => s.pages)
  const user = useAuth(s => s.user)
  const { navigate, createPage } = useStore.getState()
  const recent = Object.values(pages)
    .filter(p => !p.trashed && pages[p.parentId ?? '']?.kind !== 'database')
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10)

  // upcoming: connected calendars plus dated database items, for the next 30 days
  const today = iso(new Date())
  const [from, to] = useMemo(() => { const f = new Date(); f.setHours(0, 0, 0, 0); const t = new Date(f); t.setDate(t.getDate() + 30); return [f, t] }, [])
  const external = useExternalEvents(from, to)
  const events = [...external.events.filter(e => e.allDay || new Date(e.end) >= new Date()), ...databaseEvents(pages, today, iso(to))]
    .sort((a, b) => (dayOf(a) + (a.allDay ? '' : a.start)).localeCompare(dayOf(b) + (b.allDay ? '' : b.start)))
    .slice(0, 8)

  const hour = new Date().getHours()
  const first = user?.name?.split(' ')[0]
  return (
    <div className="home">
      <h1>{hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}{first ? `, ${first}` : ''}</h1>

      <section>
        <div className="home-label"><Clock {...I} /> Visitados recentemente</div>
        <div className="recent-row">
          {recent.map(p => (
            <button key={p.id} className="recent-card" onClick={() => navigate(p.id)}>
              <div className="recent-cover" style={p.cover ? { background: p.cover } : undefined} />
              <span className="recent-icon"><PageIcon page={p} size={28} /></span>
              <div className="recent-title">{p.title || 'Sem título'}</div>
              <div className="recent-meta"><span className="avatar xs">{user?.name?.[0]}</span>{ago(p.updatedAt)}</div>
            </button>
          ))}
          <button className="recent-card new" onClick={() => navigate(createPage(null))}>
            <Plus size={20} strokeWidth={1.6} /><span>Nova página</span>
          </button>
        </div>
      </section>

      <section>
        <div className="home-label"><CalendarDays {...I} /> Próximos eventos</div>
        <div className="home-panel">
          {events.length ? events.map(e => (
            <button key={e.id} className="event-row" onClick={() => (e.pageId ? navigate(e.pageId) : useStore.getState().openCalendar())}>
              <span className="event-day">{relativeDay(dayOf(e))}{!e.allDay && <small> · {timeOf(e)}</small>}</span>
              <span className="event-bar" style={e.color && !e.pageId ? { background: e.color } : undefined} />
              <span className="event-title">{e.title}</span>
              <EventSource e={e} />
            </button>
          )) : (
            <div className="empty-state"><CalendarDays size={28} strokeWidth={1.4} />
              <div>Nenhum evento nos próximos 30 dias. <button className="link" onClick={() => useStore.getState().openCalendar()}>Conecte sua agenda</button> ou use datas nos bancos de dados.</div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="home-label"><LayoutTemplate {...I} /> Modelos em destaque</div>
        <div className="template-row">
          {TEMPLATES.map(t => (
            <button key={t.id} className="template-card" onClick={() => createFromTemplate(t.id)}>
              <div className="template-cover" style={{ background: t.cover }}><span className="template-icon"><IconView value={t.icon} size={24} /></span></div>
              <div className="template-body"><strong>{t.name}</strong><span>{t.description}</span></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
