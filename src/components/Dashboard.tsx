import { ArrowLeft, ArrowRight, ChartColumn, Hash, Maximize2, Minimize2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { rowsOf, uid, useStore } from '../store'
import type { Page, View, Widget } from '../types'
import { TITLE, isNumeric } from '../dbcalc'
import { AGGS, ChartConfig, ChartView, ValueConfig, aggregate, yValue } from './Charts'
import { Pop } from './Pop'
import { PageIcon } from './icons'
import { useReadOnly } from '../readonly'

// A dashboard is a database view made of tiles. Each tile is a chart or a single number and can
// read from any database in the workspace, so one dashboard can follow several databases.

export function defaultWidgets(db: Page): Widget[] {
  const schema = db.schema ?? []
  const group = schema.find(p => p.type === 'status' || p.type === 'select')
  const date = schema.find(p => p.type === 'date')
  const number = schema.find(isNumeric)
  const out: Widget[] = [{ id: uid(), title: 'Total de itens', kind: 'number', agg: 'count' }]
  if (number) out.push({ id: uid(), title: `Soma de ${number.name}`, kind: 'number', agg: 'sum', yProp: number.id })
  if (group) out.push({ id: uid(), title: `Por ${group.name}`, kind: 'chart', chartType: 'donut', xProp: group.id, agg: 'count' })
  if (date) out.push({ id: uid(), title: `Por mês (${date.name})`, kind: 'chart', chartType: number ? 'area' : 'bar', xProp: date.id, agg: number ? 'sum' : 'count', yProp: number?.id })
  if (out.length < 4) out.push({ id: uid(), title: 'Itens', kind: 'chart', chartType: 'bar', xProp: TITLE, agg: number ? 'sum' : 'count', yProp: number?.id, span: 2 })
  return out
}

export function DashboardView({ db, view, setView }: { db: Page; view: View; setView: (p: Partial<View>) => void }) {
  const pages = useStore(s => s.pages)
  const readOnly = useReadOnly()
  const widgets = view.widgets ?? []
  const save = (next: Widget[]) => setView({ widgets: next })
  const patch = (id: string, p: Partial<Widget>) => save(widgets.map(w => (w.id === id ? { ...w, ...p } : w)))
  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= widgets.length) return
    const next = [...widgets]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  const add = (kind: Widget['kind']) =>
    save([...widgets, kind === 'number'
      ? { id: uid(), title: 'Novo número', kind, agg: 'count' }
      : { id: uid(), title: 'Novo gráfico', kind, chartType: 'bar', xProp: TITLE, agg: 'count' }])

  return (
    <div className="dashboard">
      {widgets.map((w, i) => {
        const source = pages[w.source ?? db.id]
        const gone = !source || source.trashed || source.kind !== 'database'
        const schema = source?.schema ?? []
        const rows = gone ? [] : rowsOf(pages, source.id)
        return (
          <section key={w.id} className={`widget ${w.kind} ${w.span === 2 ? 'wide' : ''}`}>
            <header>
              <strong>{w.title || 'Sem título'}</strong>
              {source && source.id !== db.id && <span className="widget-src"><PageIcon page={source} size={12} /> {source.title}</span>}
              {!readOnly && (
                <Pop width={300} trigger={open => <button className="icon-btn widget-menu" onClick={open} title="Configurar"><MoreHorizontal size={16} /></button>}>
                  {close => (
                    <div className="stack widget-config">
                      <input className="input" value={w.title} placeholder="Título" onChange={e => patch(w.id, { title: e.target.value })} />
                      <label>Fonte
                        <select value={w.source ?? db.id} onChange={e => patch(w.id, { source: e.target.value, xProp: TITLE, yProp: undefined, agg: 'count' })}>
                          {Object.values(pages).filter(p => p.kind === 'database' && !p.trashed).map(d => <option key={d.id} value={d.id}>{d.title || 'Sem título'}</option>)}
                        </select>
                      </label>
                      <div className="seg">
                        <button className={w.kind === 'chart' ? 'on' : ''} onClick={() => patch(w.id, { kind: 'chart', chartType: w.chartType ?? 'bar', xProp: w.xProp ?? TITLE })}><ChartColumn size={14} /> Gráfico</button>
                        <button className={w.kind === 'number' ? 'on' : ''} onClick={() => patch(w.id, { kind: 'number' })}><Hash size={14} /> Número</button>
                      </div>
                      {w.kind === 'chart'
                        ? <ChartConfig schema={schema} view={w} setView={p => patch(w.id, p)} />
                        : <div className="chart-config"><ValueConfig numbers={schema.filter(isNumeric)} view={w} setView={p => patch(w.id, p)} /></div>}
                      <div className="menu-sep" />
                      <button className="menu-item" onClick={() => patch(w.id, { span: w.span === 2 ? 1 : 2 })}>
                        {w.span === 2 ? <><Minimize2 size={16} /> Meia largura</> : <><Maximize2 size={16} /> Largura inteira</>}
                      </button>
                      {i > 0 && <button className="menu-item" onClick={() => move(i, -1)}><ArrowLeft size={16} /> Mover para trás</button>}
                      {i < widgets.length - 1 && <button className="menu-item" onClick={() => move(i, 1)}><ArrowRight size={16} /> Mover para frente</button>}
                      <button className="menu-item danger" onClick={() => { save(widgets.filter(x => x.id !== w.id)); close() }}><Trash2 size={16} /> Excluir</button>
                    </div>
                  )}
                </Pop>
              )}
            </header>
            {gone ? <div className="muted pad">A fonte deste bloco foi removida.</div>
              : w.kind === 'number' ? <NumberTile schema={schema} rows={rows} w={w} />
              : <ChartView schema={schema} rows={rows} view={w} height={w.span === 2 ? 260 : 220} compact />}
          </section>
        )
      })}
      {!readOnly && (
        <div className="widget add">
          <button onClick={() => add('chart')}><Plus size={16} /> Adicionar gráfico</button>
          <button onClick={() => add('number')}><Plus size={16} /> Adicionar número</button>
        </div>
      )}
    </div>
  )
}

function NumberTile({ schema, rows, w }: { schema: Page['schema'] & {}; rows: Page[]; w: Widget }) {
  const values = rows.map(r => yValue(schema, r, w)).filter(v => !Number.isNaN(v))
  const value = aggregate(values, w.agg)
  const prop = schema.find(p => p.id === w.yProp)
  return (
    <div className="number-tile">
      <div className="big">{value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</div>
      <div className="muted">{AGGS.find(a => a.agg === (w.agg ?? 'count'))?.label}{w.agg && w.agg !== 'count' && prop ? ` de ${prop.name}` : ' de itens'}</div>
    </div>
  )
}
