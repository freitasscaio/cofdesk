import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Page, View } from '../types'
import { PageIcon } from './icons'

// Gantt-style timeline: one bar per row from the start date property to the (optional) end date.
// Bars can be dragged to move, and their edges dragged to change start or end.

const PX = { day: 40, week: 18, month: 5 } as const
const DAY = 864e5
const toDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY }
const toIso = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)
const todayDay = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY }
const utc = (day: number) => new Date(day * DAY)

type DragState = { id: string; mode: 'move' | 'start' | 'end'; x0: number; delta: number }

export function TimelineView({ db, rows, view, setView }: { db: Page; rows: Page[]; view: View; setView: (p: Partial<View>) => void }) {
  const { setProp, navigate } = useStore.getState()
  const start = db.schema?.find(p => p.id === view.dateProp && p.type === 'date')
  const end = db.schema?.find(p => p.id === view.endProp && p.type === 'date' && p.id !== view.dateProp)
  const zoom = view.zoom ?? 'day'
  const px = PX[zoom]
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  // a drag ends with a click on the bar; this keeps that click from opening the page
  const moved = useRef(false)

  // span of a row in whole days, before any drag in progress
  const spanOf = (r: Page): [number, number] | null => {
    const s = start && r.props[start.id]
    if (!s) return null
    const e = end && r.props[end.id]
    const a = toDay(s)
    return [a, e ? Math.max(a, toDay(e)) : a]
  }

  const today = todayDay()
  const spans = rows.map(spanOf).filter((x): x is [number, number] => !!x)
  const pad = zoom === 'month' ? 60 : zoom === 'week' ? 21 : 10
  const min = Math.min(today, ...spans.map(s => s[0])) - pad
  const max = Math.max(today + (zoom === 'month' ? 180 : zoom === 'week' ? 60 : 30), ...spans.map(s => s[1])) + pad
  const days = max - min + 1
  const width = days * px

  const scrollToToday = () => {
    const el = scroller.current
    if (el) el.scrollLeft = (today - min) * px - el.clientWidth / 3
  }
  useLayoutEffect(scrollToToday, [zoom, !!start])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => setDrag(d => d && { ...d, delta: Math.round((e.clientX - d.x0) / px) })
    const onUp = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d || !d.delta || !start) return
      moved.current = true
      setTimeout(() => { moved.current = false })
      const row = rows.find(r => r.id === d.id)
      const span = row && spanOf(row)
      if (!span) return
      const [a, b] = span
      if (d.mode !== 'end') setProp(d.id, start.id, toIso(d.mode === 'start' ? Math.min(a + d.delta, b) : a + d.delta))
      if (end && d.mode !== 'start') setProp(d.id, end.id, toIso(d.mode === 'end' ? Math.max(b + d.delta, a) : b + d.delta))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [!!drag, px])

  if (!start) return <div className="muted pad">Escolha a propriedade de data de início para montar a linha do tempo.</div>

  // header: months on top, then days (or week starts) below
  const months: { label: string; left: number; width: number }[] = []
  const ticks: { label: string; left: number; today?: boolean; weekend?: boolean }[] = []
  for (let d = min; d <= max; d++) {
    const date = utc(d)
    if (d === min || date.getUTCDate() === 1) {
      const label = date.toLocaleDateString('pt-BR', { month: zoom === 'month' ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' })
      months.push({ label: label[0].toUpperCase() + label.slice(1), left: (d - min) * px, width: 0 })
    }
    const dow = date.getUTCDay()
    if (zoom === 'day') ticks.push({ label: String(date.getUTCDate()), left: (d - min) * px, today: d === today, weekend: dow === 0 || dow === 6 })
    else if (zoom === 'week' && dow === 1) ticks.push({ label: String(date.getUTCDate()), left: (d - min) * px, today: today >= d && today < d + 7 })
  }
  months.forEach((m, i) => { m.width = (months[i + 1]?.left ?? width) - m.left })

  const live = (r: Page): [number, number] | null => {
    const span = spanOf(r)
    if (!span || drag?.id !== r.id) return span
    const [a, b] = span
    if (drag.mode === 'move') return [a + drag.delta, b + drag.delta]
    if (drag.mode === 'start') return [Math.min(a + drag.delta, b), b]
    return [a, Math.max(b + drag.delta, a)]
  }

  const grab = (e: React.PointerEvent, id: string, mode: DragState['mode']) => {
    e.preventDefault(); e.stopPropagation()
    setDrag({ id, mode, x0: e.clientX, delta: 0 })
  }

  return (
    <div className="timeline">
      <div className="tl-bar">
        <select className="pill" aria-label="Escala" value={zoom} onChange={e => setView({ zoom: e.target.value as View['zoom'] })}>
          <option value="day">Dias</option><option value="week">Semanas</option><option value="month">Meses</option>
        </select>
        <button className="pill" onClick={scrollToToday}>Hoje</button>
      </div>
      <div className="tl-scroll" ref={scroller}>
        <div className="tl-inner" style={{ width: width + 240 }}>
          <div className="tl-head">
            <div className="tl-corner">Nome</div>
            <div className="tl-scale" style={{ width }}>
              <div className="tl-months">{months.map(m => <span key={m.left} style={{ left: m.left, width: m.width }}><b>{m.label}</b></span>)}</div>
              <div className="tl-days">
                {ticks.map(t => <span key={t.left} className={`${t.today ? 'today' : ''} ${t.weekend ? 'weekend' : ''}`} style={{ left: t.left, width: zoom === 'day' ? px : px * 7 }}>{t.label}</span>)}
              </div>
            </div>
          </div>
          {rows.map(r => {
            const span = live(r)
            return (
              <div key={r.id} className="tl-row">
                <button className="tl-name" onClick={() => navigate(r.id)}><PageIcon page={r} size={14} /> <span>{r.title || 'Sem título'}</span></button>
                <div className="tl-track" style={{ width, backgroundSize: `${zoom === 'day' ? px : px * 7}px 100%`, backgroundPositionX: zoom === 'week' ? `${((8 - utc(min).getUTCDay()) % 7) * px}px` : 0 }}
                  onDoubleClick={e => {
                    if (span) return
                    const day = min + Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / px)
                    setProp(r.id, start.id, toIso(day))
                    if (end) setProp(r.id, end.id, toIso(day + (zoom === 'day' ? 2 : 6)))
                  }}>
                  {span ? (
                    <div className={`tl-item ${drag?.id === r.id ? 'dragging' : ''}`} style={{ left: (span[0] - min) * px, width: Math.max(px, (span[1] - span[0] + 1) * px) }}
                      onPointerDown={e => grab(e, r.id, 'move')}
                      onClick={() => { if (!moved.current) navigate(r.id) }}
                      title={`${utc(span[0]).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}${span[1] !== span[0] ? ' → ' + utc(span[1]).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}`}>
                      {end && <span className="tl-grip left" onPointerDown={e => grab(e, r.id, 'start')} />}
                      <span className="tl-label">{r.title || 'Sem título'}</span>
                      {end && <span className="tl-grip right" onPointerDown={e => grab(e, r.id, 'end')} />}
                    </div>
                  ) : <span className="tl-hint" style={{ left: (today - min) * px }}>Clique duas vezes para definir as datas</span>}
                </div>
              </div>
            )
          })}
          <div className="tl-today" style={{ left: 240 + (today - min) * px + (zoom === 'day' ? px / 2 : 0) }} />
        </div>
      </div>
    </div>
  )
}
