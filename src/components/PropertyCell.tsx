import { useState } from 'react'
import { COLORS, rowsOf, uid, useStore } from '../store'
import type { Page, Property, PropType, RollupFn, SelectOption } from '../types'
import { Pop } from './Pop'
import { PageIcon } from './icons'
import { ROLLUP_FNS, TITLE, computed, computedText, isPercent, linkedRows } from '../dbcalc'
import { FORMULA_HELP, checkFormula, formatValue } from '../formula'
import {
  AlignLeft, ArrowUpRight, AtSign, Calendar, Check, CircleChevronDown, Clock, Hash, Link2, List, Loader, Phone, Plus, ScanSearch,
  SquareCheck, SquareFunction, Trash2, type LucideIcon,
} from 'lucide-react'
import { clickable } from '../a11y'

export const PROP_TYPES: { type: PropType; label: string; icon: LucideIcon }[] = [
  { type: 'text', label: 'Texto', icon: AlignLeft },
  { type: 'number', label: 'Número', icon: Hash },
  { type: 'select', label: 'Seleção', icon: CircleChevronDown },
  { type: 'multi_select', label: 'Seleção múltipla', icon: List },
  { type: 'status', label: 'Status', icon: Loader },
  { type: 'date', label: 'Data', icon: Calendar },
  { type: 'checkbox', label: 'Caixa de seleção', icon: SquareCheck },
  { type: 'url', label: 'URL', icon: Link2 },
  { type: 'email', label: 'E-mail', icon: AtSign },
  { type: 'phone', label: 'Telefone', icon: Phone },
  { type: 'created_time', label: 'Criado em', icon: Clock },
  { type: 'relation', label: 'Relação', icon: ArrowUpRight },
  { type: 'rollup', label: 'Rollup', icon: ScanSearch },
  { type: 'formula', label: 'Fórmula', icon: SquareFunction },
]
/** Properties whose value is calculated, never typed in. */
export const COMPUTED: PropType[] = ['rollup', 'formula', 'created_time']
export function PropTypeIcon({ type, size = 16 }: { type: PropType; size?: number }) {
  const C = PROP_TYPES.find(p => p.type === type)?.icon ?? AlignLeft
  return <C size={size} strokeWidth={1.8} className="ico-muted" />
}
export const isSelect = (p?: Property) => !!p && ['select', 'status', 'multi_select'].includes(p.type)

export const fmtDate = (v?: string) => (v ? new Date(v + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

export function Tag({ opt, onRemove }: { opt?: SelectOption; onRemove?: () => void }) {
  if (!opt) return null
  return (
    <span className={`tag c-${opt.color}`}>
      {opt.name}
      {onRemove && <button onClick={e => { e.stopPropagation(); onRemove() }}>×</button>}
    </span>
  )
}

export function displayText(prop: Property, row: Page): string {
  const v = row.props[prop.id]
  switch (prop.type) {
    case 'select': case 'status': return prop.options?.find(o => o.id === v)?.name ?? ''
    case 'multi_select': return ((v as string[]) ?? []).map(id => prop.options?.find(o => o.id === id)?.name).filter(Boolean).join(', ')
    case 'checkbox': return v ? 'Sim' : 'Não'
    case 'date': return fmtDate(v)
    case 'created_time': return new Date(row.createdAt).toLocaleString('pt-BR')
    case 'relation': return linkedRows(useStore.getState().pages, v).map(r => r.title || 'Sem título').join(', ')
    case 'rollup': case 'formula': return computedText(useStore.getState().pages, prop, row)
    default: return v == null ? '' : String(v)
  }
}

function OptionPicker({ dbId, prop, row, close }: { dbId: string; prop: Property; row: Page; close: () => void }) {
  const [q, setQ] = useState('')
  const { setProp, updateProperty } = useStore.getState()
  const multi = prop.type === 'multi_select'
  const current: string[] = multi ? (row.props[prop.id] ?? []) : row.props[prop.id] ? [row.props[prop.id]] : []
  const options = prop.options ?? []
  const shown = options.filter(o => o.name.toLowerCase().includes(q.toLowerCase()))
  const choose = (id: string) => {
    if (multi) setProp(row.id, prop.id, current.includes(id) ? current.filter(x => x !== id) : [...current, id])
    else { setProp(row.id, prop.id, current[0] === id ? null : id); close() }
  }
  const create = () => {
    const name = q.trim()
    if (!name) return
    const existing = options.find(o => o.name.toLowerCase() === name.toLowerCase())
    if (existing) { choose(existing.id); return }
    const opt = { id: uid(), name, color: COLORS[options.length % COLORS.length] }
    updateProperty(dbId, prop.id, { options: [...options, opt] })
    choose(opt.id)
    setQ('')
  }
  return (
    <div>
      <div className="tags-input">
        {current.map(id => <Tag key={id} opt={options.find(o => o.id === id)} onRemove={() => choose(id)} />)}
        <input autoFocus placeholder="Buscar ou criar opção" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') create() }} />
      </div>
      {shown.map(o => (
        <button key={o.id} className="menu-item" onClick={() => choose(o.id)}>
          <Tag opt={o} />{current.includes(o.id) && <span className="check">✓</span>}
        </button>
      ))}
      {q.trim() && !options.some(o => o.name.toLowerCase() === q.trim().toLowerCase()) && (
        <button className="menu-item" onClick={create}>Criar <Tag opt={{ id: '', name: q.trim(), color: COLORS[options.length % COLORS.length] }} /></button>
      )}
    </div>
  )
}

function RelationPicker({ prop, row }: { prop: Property; row: Page }) {
  const [q, setQ] = useState('')
  const pages = useStore(s => s.pages)
  const { setRelation, addRow, updatePage } = useStore.getState()
  const target = pages[prop.relation?.dbId ?? '']
  if (!target || target.trashed) return <div className="muted pad">Escolha o banco de dados desta relação nas opções da propriedade.</div>
  const current: string[] = row.props[prop.id] ?? []
  const toggle = (id: string) => setRelation(row.id, prop.id, current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  const shown = rowsOf(pages, target.id).filter(r => r.id !== row.id && (r.title || 'Sem título').toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="rel-head"><PageIcon page={target} size={14} /> {target.title || 'Sem título'}</div>
      <input className="input" autoFocus placeholder="Buscar ou criar uma página" value={q} onChange={e => setQ(e.target.value)} />
      <div className="rel-list">
        {shown.map(r => (
          <button key={r.id} className="menu-item" onClick={() => toggle(r.id)}>
            <PageIcon page={r} size={16} /> <span className="grow">{r.title || 'Sem título'}</span>
            {current.includes(r.id) && <Check size={14} className="check" />}
          </button>
        ))}
        {q.trim() && (
          <button className="menu-item" onClick={() => {
            const id = addRow(target.id)
            updatePage(id, { title: q.trim() })
            setRelation(row.id, prop.id, [...current, id])
            setQ('')
          }}><Plus size={16} /> Criar “{q.trim()}”</button>
        )}
      </div>
    </div>
  )
}

/** Read-only value of a rollup or formula. */
function ComputedCell({ prop, row }: { prop: Property; row: Page }) {
  const pages = useStore(s => s.pages)
  const c = computed(pages, prop, row)
  if (c.error) return <span className="cell-error" title={c.error}>Erro</span>
  if (typeof c.value === 'boolean') return <span className={`cell-bool ${c.value ? 'on' : ''}`}>{c.value && <Check size={12} strokeWidth={3} />}</span>
  if (prop.rollup?.fn === 'show' && Array.isArray(c.value)) {
    return <div className="cell-tags ro">{c.value.map((v, i) => <span key={i} className="chip">{formatValue(v)}</span>)}</div>
  }
  const text = isPercent(prop) && typeof c.value === 'number' ? `${formatValue(c.value)}%` : formatValue(c.value)
  return <span className={`cell-ro ${typeof c.value === 'number' ? 'num' : ''}`}>{text}</span>
}

export function PropertyCell({ dbId, prop, row }: { dbId: string; prop: Property; row: Page }) {
  const setProp = useStore(s => s.setProp)
  const pages = useStore(s => s.pages)
  const v = row.props[prop.id]
  const label = `${prop.name}: ${row.title || 'Sem título'}`
  switch (prop.type) {
    case 'relation': {
      const linked = linkedRows(pages, v)
      return (
        <Pop width={300} trigger={open => (
          <div className="cell-tags" onClick={open} {...clickable} aria-label={label}>
            {linked.map(r => (
              <span key={r.id} className="rel-chip" onClick={e => { e.stopPropagation(); useStore.getState().navigate(r.id) }}>
                <PageIcon page={r} size={14} /><u>{r.title || 'Sem título'}</u>
              </span>
            ))}
            {!linked.length && <span className="cell-empty">Vazio</span>}
          </div>
        )}>
          {() => <RelationPicker prop={prop} row={row} />}
        </Pop>
      )
    }
    case 'rollup': case 'formula':
      return <ComputedCell prop={prop} row={row} />
    case 'checkbox':
      return <input type="checkbox" className="cell-check" aria-label={label} checked={!!v} onChange={e => setProp(row.id, prop.id, e.target.checked)} />
    case 'number':
      return <input className="cell-input num" type="number" aria-label={label} value={v ?? ''} onChange={e => setProp(row.id, prop.id, e.target.value === '' ? null : Number(e.target.value))} />
    case 'date':
      return <input className="cell-input" type="date" aria-label={label} value={v ?? ''} onChange={e => setProp(row.id, prop.id, e.target.value || null)} />
    case 'created_time':
      return <span className="cell-ro">{displayText(prop, row)}</span>
    case 'select': case 'status': case 'multi_select': {
      const ids: string[] = prop.type === 'multi_select' ? (v ?? []) : v ? [v] : []
      return (
        <Pop width={260} trigger={open => (
          <div className="cell-tags" onClick={open} {...clickable} aria-label={label}>
            {ids.map(id => <Tag key={id} opt={prop.options?.find(o => o.id === id)} />)}
            {!ids.length && <span className="cell-empty">Vazio</span>}
          </div>
        )}>
          {close => <OptionPicker dbId={dbId} prop={prop} row={row} close={close} />}
        </Pop>
      )
    }
    default: {
      const link = prop.type === 'url' ? v : prop.type === 'email' ? `mailto:${v}` : prop.type === 'phone' ? `tel:${v}` : null
      return (
        <div className="cell-text">
          <input className="cell-input" aria-label={label} value={v ?? ''} onChange={e => setProp(row.id, prop.id, e.target.value)} />
          {link && v && <a href={link} target="_blank" rel="noreferrer" title="Abrir"><ArrowUpRight size={14} /></a>}
        </div>
      )
    }
  }
}

function RelationConfig({ dbId, prop }: { dbId: string; prop: Property }) {
  const pages = useStore(s => s.pages)
  const { updateProperty, setTwoWay } = useStore.getState()
  const dbs = Object.values(pages).filter(p => p.kind === 'database' && !p.trashed)
  const target = prop.relation?.dbId ?? ''
  return (
    <>
      <label className="field">Relacionado a
        <select value={target} onChange={e => {
          if (prop.relation?.twoWay) setTwoWay(dbId, prop.id, false)
          updateProperty(dbId, prop.id, { relation: { dbId: e.target.value } })
        }}>
          <option value="" disabled>Escolha um banco de dados…</option>
          {dbs.map(d => <option key={d.id} value={d.id}>{d.title || 'Sem título'}{d.id === dbId ? ' (este)' : ''}</option>)}
        </select>
      </label>
      {target && (
        <label className="field row-field">
          <span>Mostrar também em <b>{pages[target]?.title || 'Sem título'}</b></span>
          <input type="checkbox" checked={!!prop.relation?.twoWay} onChange={e => setTwoWay(dbId, prop.id, e.target.checked)} />
        </label>
      )}
    </>
  )
}

function RollupConfig({ dbId, prop }: { dbId: string; prop: Property }) {
  const pages = useStore(s => s.pages)
  const { updateProperty } = useStore.getState()
  const relations = (pages[dbId]?.schema ?? []).filter(p => p.type === 'relation')
  const cfg = prop.rollup ?? { relation: relations[0]?.id ?? '', target: TITLE, fn: 'count' as RollupFn }
  const rel = relations.find(r => r.id === cfg.relation)
  const targets = (pages[rel?.relation?.dbId ?? '']?.schema ?? []).filter(p => p.id !== prop.id)
  const set = (patch: Partial<typeof cfg>) => updateProperty(dbId, prop.id, { rollup: { ...cfg, ...patch } })
  if (!relations.length) return <p className="muted small">Crie primeiro uma propriedade de Relação neste banco.</p>
  return (
    <>
      <label className="field">Relação
        <select value={rel ? cfg.relation : ''} onChange={e => set({ relation: e.target.value, target: TITLE })}>
          {!rel && <option value="">Escolha…</option>}
          {relations.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="field">Propriedade
        <select value={cfg.target} onChange={e => set({ target: e.target.value })}>
          <option value={TITLE}>Nome</option>
          {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="field">Calcular
        <select value={cfg.fn} onChange={e => set({ fn: e.target.value as RollupFn })}>
          {ROLLUP_FNS.map(f => <option key={f.fn} value={f.fn}>{f.label}</option>)}
        </select>
      </label>
    </>
  )
}

function FormulaConfig({ dbId, prop }: { dbId: string; prop: Property }) {
  const pages = useStore(s => s.pages)
  const { updateProperty } = useStore.getState()
  const [src, setSrc] = useState(prop.formula ?? '')
  const schema = pages[dbId]?.schema ?? []
  const error = checkFormula(src)
  const sample = rowsOf(pages, dbId)[0]
  const preview = !error && sample ? computed(pages, { ...prop, formula: src }, sample) : null
  const change = (next: string) => { setSrc(next); if (!checkFormula(next)) updateProperty(dbId, prop.id, { formula: next }) }
  return (
    <div className="formula-editor">
      <textarea className="input mono" rows={3} value={src} spellCheck={false} autoFocus placeholder='Ex.: prop("Horas") * 2'
        onChange={e => change(e.target.value)} />
      {error ? <div className="formula-status err">{error}</div>
        : preview ? <div className={`formula-status ${preview.error ? 'err' : ''}`}>
            {preview.error ?? <>Em “{sample.title || 'Sem título'}”: <b>{formatValue(preview.value) || '(vazio)'}</b></>}
          </div> : null}
      <div className="popover-title">Propriedades</div>
      <div className="formula-chips">
        <button onClick={() => change(src + 'prop("Nome")')}>Nome</button>
        {schema.filter(p => p.id !== prop.id).map(p => <button key={p.id} onClick={() => change(src + `prop("${p.name}")`)}>{p.name}</button>)}
      </div>
      <details className="formula-help">
        <summary>Funções disponíveis</summary>
        {FORMULA_HELP.map(([code, what]) => <div key={code}><code>{code}</code><span>{what}</span></div>)}
      </details>
    </div>
  )
}

/** Sensible starting configuration when a property becomes a relation, rollup or formula. */
export function defaultsFor(dbId: string, type: PropType, prop?: Property): Partial<Property> {
  const pages = useStore.getState().pages
  if (type === 'relation' && !prop?.relation) {
    const other = Object.values(pages).find(p => p.kind === 'database' && !p.trashed && p.id !== dbId)
    return { relation: { dbId: other?.id ?? dbId } }
  }
  if (type === 'rollup' && !prop?.rollup) {
    const rel = pages[dbId]?.schema?.find(p => p.type === 'relation')
    return { rollup: { relation: rel?.id ?? '', target: TITLE, fn: 'count' } }
  }
  if (type === 'formula' && prop?.formula == null) return { formula: '' }
  return {}
}

export function PropertyEditor({ dbId, prop, close }: { dbId: string; prop: Property; close: () => void }) {
  const { updateProperty, deleteProperty } = useStore.getState()
  return (
    <div className="prop-editor">
      <input className="input" defaultValue={prop.name} autoFocus
        onChange={e => updateProperty(dbId, prop.id, { name: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') close() }} />
      <label className="field">Tipo
        <select value={prop.type} onChange={e => {
          const type = e.target.value as PropType
          updateProperty(dbId, prop.id, { type, options: prop.options ?? [], ...defaultsFor(dbId, type, prop) })
        }}>
          {PROP_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </label>
      {prop.type === 'relation' && <RelationConfig dbId={dbId} prop={prop} />}
      {prop.type === 'rollup' && <RollupConfig dbId={dbId} prop={prop} />}
      {prop.type === 'formula' && <FormulaConfig key={prop.id} dbId={dbId} prop={prop} />}
      {isSelect(prop) && (
        <div>
          <div className="popover-title">Opções</div>
          {(prop.options ?? []).map(o => (
            <div key={o.id} className="opt-row">
              <input className="input sm" value={o.name}
                onChange={e => updateProperty(dbId, prop.id, { options: prop.options!.map(x => x.id === o.id ? { ...x, name: e.target.value } : x) })} />
              <select className={`c-${o.color}`} value={o.color}
                onChange={e => updateProperty(dbId, prop.id, { options: prop.options!.map(x => x.id === o.id ? { ...x, color: e.target.value } : x) })}>
                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="icon-btn" onClick={() => updateProperty(dbId, prop.id, { options: prop.options!.filter(x => x.id !== o.id) })}>×</button>
            </div>
          ))}
        </div>
      )}
      <button className="menu-item danger" onClick={() => { deleteProperty(dbId, prop.id); close() }}><Trash2 size={16} /> Excluir propriedade</button>
    </div>
  )
}
