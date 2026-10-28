import type { Page, Property, RollupFn } from './types.ts'
import { FormulaError, evaluate, formatValue, isEmpty, type Value } from './formula.ts'

// Values of database properties, including the computed ones (relations, rollups, formulas).

export const TITLE = '__title'
const TITLE_NAMES = ['nome', 'name', 'título', 'titulo', 'title']

export const ROLLUP_FNS: { fn: RollupFn; label: string }[] = [
  { fn: 'show', label: 'Mostrar original' },
  { fn: 'count', label: 'Contar tudo' },
  { fn: 'count_values', label: 'Contar valores' },
  { fn: 'count_unique', label: 'Contar valores únicos' },
  { fn: 'sum', label: 'Soma' },
  { fn: 'avg', label: 'Média' },
  { fn: 'min', label: 'Mínimo' },
  { fn: 'max', label: 'Máximo' },
  { fn: 'range', label: 'Intervalo (máx − mín)' },
  { fn: 'earliest', label: 'Data mais antiga' },
  { fn: 'latest', label: 'Data mais recente' },
  { fn: 'percent_checked', label: '% marcadas' },
  { fn: 'percent_empty', label: '% vazias' },
]

const asDate = (v?: string | null) => (v ? new Date(v + 'T00:00') : null)
export const schemaOf = (pages: Record<string, Page>, row: Page) => pages[row.parentId ?? '']?.schema ?? []
export const linkedRows = (pages: Record<string, Page>, ids: unknown) =>
  (Array.isArray(ids) ? ids : []).map(id => pages[id as string]).filter((p): p is Page => !!p && !p.trashed)

/** The value of a property as the formula language sees it. */
export function rawValue(pages: Record<string, Page>, prop: Property, row: Page, depth = 0): Value {
  if (depth > 12) throw new FormulaError('Referência circular')
  const v = row.props[prop.id]
  switch (prop.type) {
    case 'number': return typeof v === 'number' ? v : null
    case 'checkbox': return !!v
    case 'date': return asDate(v)
    case 'created_time': return new Date(row.createdAt)
    case 'select': case 'status': return prop.options?.find(o => o.id === v)?.name ?? null
    case 'multi_select': return ((v as string[]) ?? []).map(id => prop.options?.find(o => o.id === id)?.name ?? '').filter(Boolean)
    case 'relation': return linkedRows(pages, v).map(r => r.title || 'Sem título')
    case 'rollup': return rollupValue(pages, prop, row, depth)
    case 'formula': return evaluate(prop.formula ?? '', envFor(pages, row, depth))
    default: return v == null ? '' : String(v)
  }
}

function envFor(pages: Record<string, Page>, row: Page, depth: number) {
  const schema = schemaOf(pages, row)
  return {
    prop: (name: string) => {
      const key = name.trim().toLowerCase()
      const p = schema.find(x => x.name.trim().toLowerCase() === key)
      if (p) return rawValue(pages, p, row, depth + 1)
      if (TITLE_NAMES.includes(key)) return row.title
      throw new FormulaError(`Propriedade não encontrada: "${name}"`)
    },
  }
}

function rollupValue(pages: Record<string, Page>, prop: Property, row: Page, depth: number): Value {
  const cfg = prop.rollup
  const rel = cfg && schemaOf(pages, row).find(p => p.id === cfg.relation && p.type === 'relation')
  if (!cfg || !rel) return null
  const linked = linkedRows(pages, row.props[rel.id])
  const target = pages[rel.relation?.dbId ?? '']?.schema?.find(p => p.id === cfg.target)
  const values: Value[] = linked.map(r => (cfg.target === TITLE || !target ? r.title : rawValue(pages, target, r, depth + 1)))
  const flat = values.flatMap(v => (Array.isArray(v) ? v : [v]))
  const filled = flat.filter(v => !isEmpty(v) && v !== false)
  const nums = flat.filter((v): v is number => typeof v === 'number')
  const dates = flat.filter((v): v is Date => v instanceof Date).map(d => d.getTime())
  const pct = (n: number) => (linked.length ? Math.round((n / linked.length) * 1000) / 10 : 0)
  switch (cfg.fn) {
    case 'show': return flat
    case 'count': return linked.length
    case 'count_values': return filled.length
    case 'count_unique': return new Set(filled.map(formatValue)).size
    case 'sum': return nums.reduce((a, b) => a + b, 0)
    case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
    case 'min': return nums.length ? Math.min(...nums) : null
    case 'max': return nums.length ? Math.max(...nums) : null
    case 'range': return nums.length ? Math.max(...nums) - Math.min(...nums) : null
    case 'earliest': return dates.length ? new Date(Math.min(...dates)) : null
    case 'latest': return dates.length ? new Date(Math.max(...dates)) : null
    case 'percent_checked': return pct(values.filter(v => v === true).length)
    case 'percent_empty': return pct(values.filter(v => isEmpty(v) || v === false).length)
  }
}

export type Computed = { value: Value; error?: string }

/** Safe evaluation for display: errors become a message instead of an exception. */
export function computed(pages: Record<string, Page>, prop: Property, row: Page): Computed {
  try { return { value: rawValue(pages, prop, row) } } catch (e) { return { value: null, error: (e as Error).message } }
}

export const isPercent = (prop: Property) => prop.type === 'rollup' && (prop.rollup?.fn === 'percent_checked' || prop.rollup?.fn === 'percent_empty')

export function computedText(pages: Record<string, Page>, prop: Property, row: Page) {
  const c = computed(pages, prop, row)
  if (c.error) return ''
  return isPercent(prop) && typeof c.value === 'number' ? `${formatValue(c.value)}%` : formatValue(c.value)
}

/** A number for charts and sorting, or NaN. */
export function numericValue(pages: Record<string, Page>, prop: Property, row: Page): number {
  if (prop.type === 'number') return typeof row.props[prop.id] === 'number' ? row.props[prop.id] : NaN
  const v = computed(pages, prop, row).value
  return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : NaN
}

/** Properties that can be summed, averaged and charted. */
export const isNumeric = (p: Property) => p.type === 'number' || p.type === 'formula' || p.type === 'rollup'
