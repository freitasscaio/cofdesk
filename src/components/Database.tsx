import { allBlocks, blockText } from '../blocks'
import { useMemo, useState } from 'react'
import { rowsOf, useStore } from '../store'
import type { FilterOp, Page, Property, View, ViewType } from '../types'
import { Pop } from './Pop'
import { PROP_TYPES, PropTypeIcon, PropertyCell, PropertyEditor, Tag, defaultsFor, displayText, isSelect } from './PropertyCell'
import { PageIcon } from './icons'
import { TITLE, isNumeric, numericValue } from '../dbcalc'
import { ChartConfig, ChartView } from './Charts'
import { TimelineView } from './Timeline'
import { DashboardView, defaultWidgets } from './Dashboard'
import {
  CalendarDays, ChartColumn, ChartGantt, LayoutDashboard, LayoutGrid, List, PanelRightOpen, Plus, Search, SquareKanban, Table, Trash2,
  type LucideIcon,
} from 'lucide-react'
import { clickable } from '../a11y'

const ViewIcon = ({ type }: { type: ViewType }) => {
  const C = VIEW_TYPES.find(t => t.type === type)?.icon ?? Table
  return <C size={16} strokeWidth={1.8} />
}

const VIEW_TYPES: { type: ViewType; label: string; icon: LucideIcon }[] = [
  { type: 'table', label: 'Tabela', icon: Table },
  { type: 'board', label: 'Quadro', icon: SquareKanban },
  { type: 'calendar', label: 'Calendário', icon: CalendarDays },
  { type: 'chart', label: 'Gráfico', icon: ChartColumn },
  { type: 'gallery', label: 'Galeria', icon: LayoutGrid },
  { type: 'list', label: 'Lista', icon: List },
  { type: 'timeline', label: 'Linha do tempo', icon: ChartGantt },
  { type: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
]
const OPS: { op: FilterOp; label: string }[] = [
  { op: 'contains', label: 'contém' }, { op: 'equals', label: 'é igual a' }, { op: 'gt', label: 'maior que' },
  { op: 'lt', label: 'menor que' }, { op: 'not_empty', label: 'não está vazio' }, { op: 'empty', label: 'está vazio' },
  { op: 'checked', label: 'marcado' }, { op: 'unchecked', label: 'desmarcado' },
]

function valueFor(schema: Property[], row: Page, propId: string): string {
  if (propId === TITLE) return row.title
  const p = schema.find(x => x.id === propId)
  return p ? displayText(p, row) : ''
}

function applyView(rows: Page[], schema: Property[], view: View, search: string) {
  let out = rows
  if (search) out = out.filter(r => r.title.toLowerCase().includes(search.toLowerCase()))
  const f = view.filter
  if (f?.prop) {
    out = out.filter(r => {
      const raw = f.prop === TITLE ? r.title : r.props[f.prop]
      const text = valueFor(schema, r, f.prop).toLowerCase()
      const empty = raw == null || raw === '' || (Array.isArray(raw) && !raw.length)
      switch (f.op) {
        case 'contains': return text.includes((f.value ?? '').toLowerCase())
        case 'equals': return text === (f.value ?? '').toLowerCase()
        case 'gt': return Number(raw) > Number(f.value)
        case 'lt': return Number(raw) < Number(f.value)
        case 'empty': return empty
        case 'not_empty': return !empty
        case 'checked': return !!raw
        case 'unchecked': return !raw
      }
    })
  }
  const s = view.sort
  if (s?.prop) {
    const prop = schema.find(p => p.id === s.prop)
    out = [...out].sort((a, b) => {
      let x: any, y: any
      if (prop && isNumeric(prop)) {
        const pages = useStore.getState().pages
        const n = (r: Page) => { const v = numericValue(pages, prop, r); return Number.isNaN(v) ? -Infinity : v }
        x = n(a); y = n(b)
      }
      else if (prop?.type === 'date') { x = a.props[s.prop] ?? ''; y = b.props[s.prop] ?? '' }
      else if (isSelect(prop) && prop!.type !== 'multi_select') {
        const idx = (r: Page) => prop!.options!.findIndex(o => o.id === r.props[s.prop])
        x = idx(a); y = idx(b)
      } else { x = valueFor(schema, a, s.prop).toLowerCase(); y = valueFor(schema, b, s.prop).toLowerCase() }
      const c = x < y ? -1 : x > y ? 1 : 0
      return s.dir === 'asc' ? c : -c
    })
  }
  return out
}

export function Database({ dbId, inline }: { dbId: string; inline?: boolean }) {
  const db = useStore(s => s.pages[dbId])
  const pages = useStore(s => s.pages)
  const { updatePage, addView, updateView, deleteView, navigate } = useStore.getState()
  const [viewId, setViewId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const schema = db.schema ?? []
  const views = db.views ?? []
  const view = views.find(v => v.id === viewId) ?? views[0]
  const allRows = useMemo(() => rowsOf(pages, dbId), [pages, dbId])
  const rows = useMemo(() => (view ? applyView(allRows, schema, view, search) : allRows), [allRows, schema, view, search])
  const setView = (patch: Partial<View>) => updateView(dbId, view.id, patch)

  const createView = (type: ViewType) => {
    const firstSelect = schema.find(p => p.type === 'status' || p.type === 'select')
    const dates = schema.filter(p => p.type === 'date')
    const firstNumber = schema.find(isNumeric)
    const label = VIEW_TYPES.find(v => v.type === type)!.label
    const id = addView(dbId, {
      name: label, type,
      groupBy: firstSelect?.id, dateProp: dates[0]?.id,
      chartType: 'bar', xProp: firstSelect?.id ?? TITLE, agg: firstNumber ? 'sum' : 'count', yProp: firstNumber?.id,
      ...(type === 'timeline' ? { endProp: dates[1]?.id, zoom: 'day' as const } : {}),
      ...(type === 'dashboard' ? { widgets: defaultWidgets(db) } : {}),
    })
    setViewId(id)
  }

  return (
    <div className={`database ${inline ? 'inline' : ''}`}>
      {inline && (
        <div className="db-title">
          <button className="icon-btn" onClick={() => navigate(dbId)} title="Abrir como página"><PageIcon page={db} size={22} /></button>
          <input value={db.title} placeholder="Sem título" onChange={e => updatePage(dbId, { title: e.target.value })} />
        </div>
      )}
      <div className="db-toolbar">
        <div className="tabs">
          {views.map(v => (
            <Pop key={v.id} width={220} trigger={open => (
              <button className={`tab ${v.id === view?.id ? 'active' : ''}`}
                onClick={() => setViewId(v.id)} onContextMenu={e => { e.preventDefault(); open(e) }}
                onDoubleClick={open}>
                <ViewIcon type={v.type} /> {v.name}
              </button>
            )}>
              {close => (
                <div>
                  <input className="input" defaultValue={v.name} autoFocus onChange={e => updateView(dbId, v.id, { name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') close() }} />
                  <div className="popover-title">Layout</div>
                  {VIEW_TYPES.map(t => (
                    <button key={t.type} className={`menu-item ${t.type === v.type ? 'active' : ''}`} onClick={() => updateView(dbId, v.id, { type: t.type, ...(t.type === 'dashboard' && !v.widgets ? { widgets: defaultWidgets(db) } : {}) })}>
                      <t.icon size={16} strokeWidth={1.8} /> {t.label}
                    </button>
                  ))}
                  {views.length > 1 && <button className="menu-item danger" onClick={() => { deleteView(dbId, v.id); setViewId(null); close() }}><Trash2 size={16} /> Excluir visualização</button>}
                </div>
              )}
            </Pop>
          ))}
          <Pop width={200} trigger={open => <button className="tab add" onClick={open} title="Nova visualização"><Plus size={16} /></button>}>
            {close => VIEW_TYPES.map(t => (
              <button key={t.type} className="menu-item" onClick={() => { createView(t.type); close() }}><t.icon size={16} strokeWidth={1.8} /> {t.label}</button>
            ))}
          </Pop>
        </div>
        {view && view.type !== 'dashboard' && (
          <div className="db-actions">
            <Search size={16} className="ico-muted" /><input className="db-search" placeholder="Buscar" value={search} onChange={e => setSearch(e.target.value)} />
            <FilterPop schema={schema} view={view} setView={setView} />
            <SortPop schema={schema} view={view} setView={setView} />
            {view.type === 'timeline' && <>
              <select className="pill" value={view.dateProp ?? ''} onChange={e => setView({ dateProp: e.target.value })} title="Início" aria-label="Data de início">
                <option value="">Início…</option>
                {schema.filter(p => p.type === 'date').map(p => <option key={p.id} value={p.id}>Início: {p.name}</option>)}
              </select>
              <select className="pill" value={view.endProp ?? ''} onChange={e => setView({ endProp: e.target.value || undefined })} title="Fim" aria-label="Data de fim">
                <option value="">Sem data de fim</option>
                {schema.filter(p => p.type === 'date' && p.id !== view.dateProp).map(p => <option key={p.id} value={p.id}>Fim: {p.name}</option>)}
              </select>
            </>}
            {view.type === 'board' && (
              <select className="pill" value={view.groupBy ?? ''} onChange={e => setView({ groupBy: e.target.value })} title="Agrupar por" aria-label="Agrupar por">
                <option value="">Agrupar por…</option>
                {schema.filter(isSelect).filter(p => p.type !== 'multi_select').map(p => <option key={p.id} value={p.id}>Agrupar: {p.name}</option>)}
              </select>
            )}
            {view.type === 'calendar' && (
              <select className="pill" value={view.dateProp ?? ''} onChange={e => setView({ dateProp: e.target.value })} aria-label="Propriedade de data">
                <option value="">Propriedade de data…</option>
                {schema.filter(p => p.type === 'date').map(p => <option key={p.id} value={p.id}>Data: {p.name}</option>)}
              </select>
            )}
            <button className="btn primary" onClick={() => {
              const props: Record<string, any> = {}
              if (view.type === 'board' && view.groupBy) props[view.groupBy] = schema.find(p => p.id === view.groupBy)?.options?.[0]?.id
              navigate(useStore.getState().addRow(dbId, props))
            }}>Novo</button>
          </div>
        )}
      </div>
      {view?.type === 'chart' && <ChartConfig schema={schema} view={view} setView={setView} />}
      {!view ? <div className="muted">Sem visualizações</div>
        : view.type === 'table' ? <TableView db={db} rows={rows} />
        : view.type === 'board' ? <BoardView db={db} rows={rows} view={view} />
        : view.type === 'calendar' ? <CalendarView db={db} rows={rows} view={view} />
        : view.type === 'chart' ? <ChartView schema={schema} rows={rows} view={view} />
        : view.type === 'gallery' ? <GalleryView db={db} rows={rows} />
        : view.type === 'timeline' ? <TimelineView db={db} rows={rows} view={view} setView={setView} />
        : view.type === 'dashboard' ? <DashboardView db={db} view={view} setView={setView} />
        : <ListView db={db} rows={rows} />}
    </div>
  )
}

function FilterPop({ schema, view, setView }: { schema: Property[]; view: View; setView: (p: Partial<View>) => void }) {
  const f = view.filter
  return (
    <Pop width={300} trigger={open => <button className={`pill ${f?.prop ? 'on' : ''}`} onClick={open}>Filtro</button>}>
      {() => (
        <div className="stack">
          <select aria-label="Filtrar por" value={f?.prop ?? ''} onChange={e => setView({ filter: e.target.value ? { prop: e.target.value, op: f?.op ?? 'contains', value: f?.value ?? '' } : undefined })}>
            <option value="">Sem filtro</option>
            <option value={TITLE}>Nome</option>
            {schema.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {f?.prop && <>
            <select aria-label="Condição do filtro" value={f.op} onChange={e => setView({ filter: { ...f, op: e.target.value as FilterOp } })}>
              {OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {!['empty', 'not_empty', 'checked', 'unchecked'].includes(f.op) &&
              <input className="input" placeholder="Valor" value={f.value} onChange={e => setView({ filter: { ...f, value: e.target.value } })} />}
          </>}
        </div>
      )}
    </Pop>
  )
}

function SortPop({ schema, view, setView }: { schema: Property[]; view: View; setView: (p: Partial<View>) => void }) {
  const s = view.sort
  return (
    <Pop width={260} trigger={open => <button className={`pill ${s?.prop ? 'on' : ''}`} onClick={open}>Ordenar</button>}>
      {() => (
        <div className="stack">
          <select aria-label="Ordenar por" value={s?.prop ?? ''} onChange={e => setView({ sort: e.target.value ? { prop: e.target.value, dir: s?.dir ?? 'asc' } : undefined })}>
            <option value="">Sem ordenação</option>
            <option value={TITLE}>Nome</option>
            {schema.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {s?.prop && (
            <select aria-label="Direção da ordenação" value={s.dir} onChange={e => setView({ sort: { ...s, dir: e.target.value as 'asc' | 'desc' } })}>
              <option value="asc">Crescente</option><option value="desc">Decrescente</option>
            </select>
          )}
        </div>
      )}
    </Pop>
  )
}

function RowTitle({ row }: { row: Page }) {
  const { updatePage, navigate, trashPage } = useStore.getState()
  return (
    <div className="row-title">
      <PageIcon page={row} size={16} />
      <input value={row.title} placeholder="Sem título" onChange={e => updatePage(row.id, { title: e.target.value })} />
      <button className="open-btn" onClick={() => navigate(row.id)}><PanelRightOpen size={13} /> ABRIR</button>
      <button className="open-btn" title="Excluir" onClick={() => trashPage(row.id)}><Trash2 size={13} /></button>
    </div>
  )
}

function TableView({ db, rows }: { db: Page; rows: Page[] }) {
  const { addProperty, addRow } = useStore.getState()
  const schema = db.schema ?? []
  return (
    <div className="table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            <th className="title-col">Aa Nome</th>
            {schema.map(p => (
              <th key={p.id}>
                <Pop width={260} trigger={open => <button className="th-btn" onClick={open}><PropTypeIcon type={p.type} /> {p.name}</button>}>
                  {close => <PropertyEditor dbId={db.id} prop={p} close={close} />}
                </Pop>
              </th>
            ))}
            <th className="add-col">
              <Pop width={220} trigger={open => <button className="th-btn" onClick={open} title="Nova propriedade"><Plus size={16} /></button>}>
                {close => PROP_TYPES.map(t => (
                  <button key={t.type} className="menu-item" onClick={() => {
                    addProperty(db.id, { name: t.label, type: t.type, options: [], ...defaultsFor(db.id, t.type) }); close()
                  }}><t.icon size={16} strokeWidth={1.8} /> {t.label}</button>
                ))}
              </Pop>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="title-col"><RowTitle row={r} /></td>
              {schema.map(p => <td key={p.id}><PropertyCell dbId={db.id} prop={p} row={r} /></td>)}
              <td />
            </tr>
          ))}
          <tr><td colSpan={schema.length + 2}><button className="ghost-row" onClick={() => addRow(db.id)}><Plus size={16} /> Novo</button></td></tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="calc">Contagem {rows.length}</td>
            {schema.map(p => {
              if (!isNumeric(p)) return <td key={p.id} />
              const pages = useStore.getState().pages
              const nums = rows.map(r => numericValue(pages, p, r)).filter(x => !Number.isNaN(x))
              // formulas that produce text have nothing to add up
              if (!nums.length) return <td key={p.id} />
              const sum = nums.reduce((a, b) => a + b, 0)
              return <td key={p.id} className="calc">Soma {sum.toLocaleString('pt-BR')}</td>
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CardProps({ db, row }: { db: Page; row: Page }) {
  return (
    <div className="card-props">
      {(db.schema ?? []).map(p => {
        if (isSelect(p)) {
          const v = row.props[p.id]
          const ids: string[] = p.type === 'multi_select' ? (v ?? []) : v ? [v] : []
          return ids.map(id => <Tag key={p.id + id} opt={p.options?.find(o => o.id === id)} />)
        }
        const t = p.type === 'checkbox' ? (row.props[p.id] ? `✓ ${p.name}` : '') : displayText(p, row)
        return t && p.type !== 'created_time' ? <span key={p.id} className="card-prop">{t}</span> : null
      })}
    </div>
  )
}

function BoardView({ db, rows, view }: { db: Page; rows: Page[]; view: View }) {
  const { setProp, addRow, navigate } = useStore.getState()
  const [drag, setDrag] = useState<string | null>(null)
  const group = db.schema?.find(p => p.id === view.groupBy)
  if (!group) return <div className="muted pad">Escolha uma propriedade de seleção ou status em “Agrupar por”.</div>
  const columns = [{ id: '', name: `Sem ${group.name}`, color: 'gray' }, ...(group.options ?? [])]
  return (
    <div className="board">
      {columns.map(col => {
        const items = rows.filter(r => (r.props[group.id] ?? '') === col.id)
        return (
          <div key={col.id} className="board-col" onDragOver={e => e.preventDefault()}
            onDrop={() => { if (drag) setProp(drag, group.id, col.id || null); setDrag(null) }}>
            <div className="board-head"><Tag opt={col} /> <span className="muted">{items.length}</span></div>
            {items.map(r => (
              <div key={r.id} className="card" draggable onDragStart={() => setDrag(r.id)} onClick={() => navigate(r.id)} {...clickable}>
                <div className="card-title">{r.icon && <PageIcon page={r} size={16} />}{r.title || 'Sem título'}</div>
                <CardProps db={{ ...db, schema: db.schema!.filter(p => p.id !== group.id) }} row={r} />
              </div>
            ))}
            <button className="ghost-row" onClick={() => addRow(db.id, { [group.id]: col.id || null })}><Plus size={16} /> Novo</button>
          </div>
        )
      })}
    </div>
  )
}

function CalendarView({ db, rows, view }: { db: Page; rows: Page[]; view: View }) {
  const { setProp, addRow, navigate } = useStore.getState()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [drag, setDrag] = useState<string | null>(null)
  const dateProp = db.schema?.find(p => p.id === view.dateProp)
  if (!dateProp) return <div className="muted pad">Escolha uma propriedade de data.</div>
  const start = new Date(cursor)
  start.setDate(1 - cursor.getDay())
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = iso(new Date())
  return (
    <div className="calendar">
      <div className="cal-head">
        <strong>{cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
        <div>
          <button className="pill" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
          <button className="pill" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoje</button>
          <button className="pill" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        </div>
      </div>
      <div className="cal-grid">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="cal-dow">{d}</div>)}
        {days.map(d => {
          const key = iso(d)
          const items = rows.filter(r => r.props[dateProp.id] === key)
          return (
            <div key={key} className={`cal-day ${d.getMonth() !== cursor.getMonth() ? 'out' : ''}`}
              onDragOver={e => e.preventDefault()} onDrop={() => { if (drag) setProp(drag, dateProp.id, key); setDrag(null) }}>
              <div className="cal-num">
                <span className={key === today ? 'today' : ''}>{d.getDate()}</span>
                <button className="cal-add" aria-label={`Novo item em ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`} onClick={() => addRow(db.id, { [dateProp.id]: key })}><Plus size={14} aria-hidden /></button>
              </div>
              {items.map(r => (
                <div key={r.id} className="cal-item" draggable onDragStart={() => setDrag(r.id)} onClick={() => navigate(r.id)} {...clickable}>
                  {r.title || 'Sem título'}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GalleryView({ db, rows }: { db: Page; rows: Page[] }) {
  const { addRow, navigate } = useStore.getState()
  return (
    <div className="gallery">
      {rows.map(r => {
        const img = r.blocks.find(b => b.type === 'image' && b.url)?.url
        const text = allBlocks(r.blocks).filter(b => b.type !== 'columns').map(blockText).filter(Boolean).slice(0, 3).join(' · ')
        return (
          <div key={r.id} className="g-card" onClick={() => navigate(r.id)} {...clickable}>
            <div className="g-cover" style={img ? { backgroundImage: `url(${img})` } : r.cover ? { background: r.cover } : {}}>
              {!img && !r.cover && <span className="g-preview">{text}</span>}
            </div>
            <div className="g-body">
              <div className="card-title">{r.icon && <PageIcon page={r} size={16} />}{r.title || 'Sem título'}</div>
              <CardProps db={db} row={r} />
            </div>
          </div>
        )
      })}
      <button className="g-card g-new" onClick={() => addRow(db.id)}><Plus size={16} /> Novo</button>
    </div>
  )
}

function ListView({ db, rows }: { db: Page; rows: Page[] }) {
  const { addRow, navigate } = useStore.getState()
  return (
    <div className="list-view">
      {rows.map(r => (
        <div key={r.id} className="list-row" onClick={() => navigate(r.id)} {...clickable}>
          <span className="list-title"><PageIcon page={r} size={16} /> {r.title || 'Sem título'}</span>
          <CardProps db={db} row={r} />
        </div>
      ))}
      <button className="ghost-row" onClick={() => addRow(db.id)}><Plus size={16} /> Novo</button>
    </div>
  )
}

