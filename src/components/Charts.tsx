import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import { useStore } from '../store'
import type { Agg, ChartType, Page, Property, View } from '../types'
import { TITLE, isNumeric, linkedRows, numericValue } from '../dbcalc'
import { displayText, isSelect } from './PropertyCell'

export const HEX: Record<string, string> = {
  gray: '#9b9a97', brown: '#a27763', orange: '#e9a23b', yellow: '#dfab01', green: '#4f9768',
  blue: '#3e7cc2', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47',
}
const PALETTE = Object.values(HEX)

export const CHART_TYPES: { type: ChartType; label: string }[] = [
  { type: 'bar', label: 'Barras verticais' }, { type: 'horizontal_bar', label: 'Barras horizontais' },
  { type: 'line', label: 'Linha' }, { type: 'area', label: 'Área' }, { type: 'pie', label: 'Pizza' }, { type: 'donut', label: 'Rosca' },
]
export const AGGS: { agg: Agg; label: string }[] = [
  { agg: 'count', label: 'Contagem' }, { agg: 'sum', label: 'Soma' }, { agg: 'avg', label: 'Média' },
  { agg: 'min', label: 'Mínimo' }, { agg: 'max', label: 'Máximo' },
]

/** What a chart shows; both chart views and dashboard tiles have these fields. */
export type ChartSpec = Pick<View, 'chartType' | 'xProp' | 'yProp' | 'agg'>

export function aggregate(values: number[], agg: Agg = 'count') {
  if (agg === 'count') return values.length
  if (!values.length) return 0
  if (agg === 'sum') return values.reduce((a, c) => a + c, 0)
  if (agg === 'avg') return Math.round((values.reduce((a, c) => a + c, 0) / values.length) * 100) / 100
  return agg === 'min' ? Math.min(...values) : Math.max(...values)
}

/** The numbers a chart adds up for each row: 1 per row for counts, else the chosen numeric property. */
export function yValue(schema: Property[], row: Page, spec: ChartSpec) {
  if (!spec.agg || spec.agg === 'count' || !spec.yProp) return 1
  const p = schema.find(x => x.id === spec.yProp)
  return p ? numericValue(useStore.getState().pages, p, row) : NaN
}

export function ChartConfig({ schema, view, setView }: { schema: Property[]; view: ChartSpec; setView: (p: Partial<ChartSpec>) => void }) {
  const numbers = schema.filter(isNumeric)
  return (
    <div className="chart-config">
      <label>Tipo
        <select value={view.chartType ?? 'bar'} onChange={e => setView({ chartType: e.target.value as ChartType })}>
          {CHART_TYPES.map(c => <option key={c.type} value={c.type}>{c.label}</option>)}
        </select>
      </label>
      <label>Eixo X / grupos
        <select value={view.xProp ?? TITLE} onChange={e => setView({ xProp: e.target.value })}>
          <option value={TITLE}>Nome</option>
          {schema.filter(p => p.type !== 'formula' && p.type !== 'rollup').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <ValueConfig numbers={numbers} view={view} setView={setView} />
    </div>
  )
}

export function ValueConfig({ numbers, view, setView }: { numbers: Property[]; view: ChartSpec; setView: (p: Partial<ChartSpec>) => void }) {
  return <>
    <label>Valor
      <select value={view.agg ?? 'count'} onChange={e => setView({ agg: e.target.value as Agg, yProp: e.target.value === 'count' ? undefined : view.yProp ?? numbers[0]?.id })}>
        {AGGS.filter(a => a.agg === 'count' || numbers.length).map(a => <option key={a.agg} value={a.agg}>{a.label}</option>)}
      </select>
    </label>
    {view.agg && view.agg !== 'count' && (
      <label>de
        <select value={view.yProp ?? ''} onChange={e => setView({ yProp: e.target.value })}>
          {numbers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    )}
  </>
}

export function chartData(schema: Property[], rows: Page[], view: ChartSpec) {
  const pages = useStore.getState().pages
  const x = schema.find(p => p.id === view.xProp)
  const buckets = new Map<string, { name: string; color?: string; values: number[] }>()
  const bucket = (key: string, name: string, color?: string) => {
    if (!buckets.has(key)) buckets.set(key, { name, color, values: [] })
    return buckets.get(key)!
  }
  if (x && isSelect(x)) x.options!.forEach(o => bucket(o.id, o.name, HEX[o.color]))
  for (const r of rows) {
    const y = yValue(schema, r, view)
    let keys: [string, string][]
    if (!x) keys = [[r.id, r.title || 'Sem título']]
    else if (x.type === 'multi_select') keys = ((r.props[x.id] as string[]) ?? []).map(id => [id, x.options?.find(o => o.id === id)?.name ?? '?'])
    else if (x.type === 'relation') {
      const linked = linkedRows(pages, r.props[x.id])
      keys = linked.length ? linked.map(l => [l.id, l.title || 'Sem título']) : [['', 'Vazio']]
    } else if (x.type === 'select' || x.type === 'status') {
      const id = r.props[x.id]
      keys = [[id ?? '', x.options?.find(o => o.id === id)?.name ?? 'Vazio']]
    } else if (x.type === 'date') {
      const v: string | undefined = r.props[x.id]
      keys = [[v ? v.slice(0, 7) : '', v ? new Date(v + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : 'Sem data']]
    } else {
      const t = displayText(x, r) || 'Vazio'
      keys = [[t, t]]
    }
    for (const [k, n] of keys) if (!Number.isNaN(y)) bucket(k, n).values.push(y)
  }
  const entries = [...buckets.entries()]
  if (x?.type === 'date') entries.sort(([a], [b]) => (a < b ? -1 : 1))
  return entries.map(([, b], i) => ({ name: b.name, value: aggregate(b.values, view.agg), color: b.color ?? PALETTE[i % PALETTE.length] }))
}

export function ChartView({ schema, rows, view, height = 320, compact }: { schema: Property[]; rows: Page[]; view: ChartSpec; height?: number; compact?: boolean }) {
  const data = chartData(schema, rows, view)
  const total = data.reduce((a, d) => a + d.value, 0)
  const t = view.chartType ?? 'bar'
  if (!data.length) return <div className="muted pad">Sem dados para exibir.</div>
  const axisColor = 'var(--muted)'
  const tooltip = <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }} cursor={{ fill: 'var(--hover)' }} />
  const radius = Math.min(120, height / 2.6)
  return (
    <div className="chart">
      {!compact && <div className="chart-total">{total.toLocaleString('pt-BR')}<small>{AGGS.find(a => a.agg === (view.agg ?? 'count'))?.label}</small></div>}
      <ResponsiveContainer width="100%" height={height}>
        {t === 'pie' || t === 'donut' ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={t === 'donut' ? radius * 0.6 : 0} outerRadius={radius} paddingAngle={t === 'donut' ? 2 : 0} label={!compact}>
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            {tooltip}<Legend />
          </PieChart>
        ) : t === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke={axisColor} /><YAxis stroke={axisColor} />{tooltip}
            <Line type="monotone" dataKey="value" stroke={HEX.blue} strokeWidth={2} />
          </LineChart>
        ) : t === 'area' ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke={axisColor} /><YAxis stroke={axisColor} />{tooltip}
            <Area type="monotone" dataKey="value" stroke={HEX.blue} fill={HEX.blue} fillOpacity={0.2} />
          </AreaChart>
        ) : (
          <BarChart data={data} layout={t === 'horizontal_bar' ? 'vertical' : 'horizontal'}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            {t === 'horizontal_bar'
              ? <><XAxis type="number" stroke={axisColor} /><YAxis type="category" dataKey="name" width={120} stroke={axisColor} /></>
              : <><XAxis dataKey="name" stroke={axisColor} /><YAxis stroke={axisColor} /></>}
            {tooltip}
            <Bar dataKey="value" radius={4}>{data.map(d => <Cell key={d.name} fill={d.color} />)}</Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
