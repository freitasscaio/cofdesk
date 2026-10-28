import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Block, Page, Property, View } from './types'

export const uid = () => crypto.randomUUID().slice(0, 12)
export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
export const newBlock = (type: Block['type'] = 'text', html = ''): Block => ({ id: uid(), type, html })

interface State {
  pages: Record<string, Page>
  currentId: string | null
  theme: 'light' | 'dark'
  sidebarOpen: boolean
  searchOpen: boolean
  /** what the main area shows when it isn't a page: the calendar */
  calendarOpen: boolean
  openCalendar: () => void
  navigate: (id: string | null) => void
  createPage: (parentId: string | null, kind?: Page['kind'], extra?: Partial<Page>) => string
  updatePage: (id: string, patch: Partial<Page>) => void
  setBlocks: (id: string, blocks: Block[]) => void
  trashPage: (id: string) => void
  restorePage: (id: string) => void
  deleteForever: (id: string) => void
  duplicatePage: (id: string) => string
  movePage: (id: string, parentId: string | null) => void
  addRow: (dbId: string, props?: Record<string, any>) => string
  setProp: (rowId: string, propId: string, value: any) => void
  /** sets a relation and keeps the other side of a two-way relation in step */
  setRelation: (rowId: string, propId: string, ids: string[]) => void
  setTwoWay: (dbId: string, propId: string, on: boolean) => void
  addProperty: (dbId: string, prop: Omit<Property, 'id'>) => string
  updateProperty: (dbId: string, propId: string, patch: Partial<Property>) => void
  deleteProperty: (dbId: string, propId: string) => void
  addView: (dbId: string, view: Omit<View, 'id'>) => string
  updateView: (dbId: string, viewId: string, patch: Partial<View>) => void
  deleteView: (dbId: string, viewId: string) => void
  setTheme: (t: 'light' | 'dark') => void
  toggleSidebar: () => void
  setSearchOpen: (v: boolean) => void
  importData: (pages: Record<string, Page>) => void
}

const descendants = (pages: Record<string, Page>, id: string): string[] => {
  const out: string[] = []
  const walk = (pid: string) => {
    for (const p of Object.values(pages)) if (p.parentId === pid) { out.push(p.id); walk(p.id) }
  }
  walk(id)
  return out
}

export const childrenOf = (pages: Record<string, Page>, parentId: string | null) =>
  Object.values(pages)
    .filter(p => p.parentId === parentId && !p.trashed)
    .sort((a, b) => a.order - b.order)

export const rowsOf = (pages: Record<string, Page>, dbId: string) => childrenOf(pages, dbId)

export function seed(): Record<string, Page> {
  const now = Date.now()
  const pages: Record<string, Page> = {}
  const welcome: Page = {
    id: uid(), title: 'Bem-vindo ao CofDesk', icon: 'lucide:Hand:yellow', parentId: null, kind: 'page', props: {},
    cover: 'linear-gradient(120deg,#f6d365,#fda085)', createdAt: now, updatedAt: now, order: 0,
    blocks: [
      newBlock('callout', 'Tudo aqui é gratuito: gráficos, bancos de dados ilimitados, histórico e muito mais.'),
      newBlock('h2', 'Primeiros passos'),
      { ...newBlock('todo', 'Digite <b>/</b> em qualquer linha para ver todos os blocos'), checked: false },
      { ...newBlock('todo', 'Use <code>#</code>, <code>-</code>, <code>[]</code> e <code>&gt;</code> como atalhos de Markdown'), checked: false },
      { ...newBlock('todo', 'Pressione <b>Ctrl+K</b> para buscar páginas'), checked: true },
      newBlock('h2', 'Recursos'),
      newBlock('bullet', 'Páginas aninhadas ilimitadas com ícones e capas'),
      newBlock('bullet', 'Bancos de dados com visualizações: tabela, quadro, calendário, galeria, lista e <b>gráficos</b>'),
      newBlock('bullet', 'Modo escuro, favoritos, lixeira, exportação em Markdown e backup JSON'),
      { ...newBlock('toggle', 'Clique para abrir'), open: false },
      { ...newBlock('text', 'Blocos de alternância guardam conteúdo aninhado. Use <b>Tab</b> para aninhar qualquer bloco.'), indent: 1 },
      newBlock('quote', 'Simplicidade é o último grau de sofisticação.'),
      newBlock('divider'),
    ],
  }
  pages[welcome.id] = welcome

  const opts = (names: string[]) => names.map((n, i) => ({ id: uid(), name: n, color: COLORS[(i * 2 + 3) % COLORS.length] }))
  const status: Property = { id: uid(), name: 'Status', type: 'status', options: opts(['A fazer', 'Em andamento', 'Concluído']) }
  const prio: Property = { id: uid(), name: 'Prioridade', type: 'select', options: opts(['Baixa', 'Média', 'Alta']) }
  const date: Property = { id: uid(), name: 'Data', type: 'date' }
  const hours: Property = { id: uid(), name: 'Horas', type: 'number' }
  const done: Property = { id: uid(), name: 'Revisado', type: 'checkbox' }
  const db: Page = {
    id: uid(), title: 'Tarefas', icon: 'lucide:CircleCheckBig:green', parentId: null, kind: 'database', blocks: [], props: {},
    schema: [status, prio, date, hours, done], createdAt: now, updatedAt: now, order: 1,
    views: [
      { id: uid(), name: 'Tabela', type: 'table' },
      { id: uid(), name: 'Quadro', type: 'board', groupBy: status.id },
      { id: uid(), name: 'Calendário', type: 'calendar', dateProp: date.id },
      { id: uid(), name: 'Gráfico', type: 'chart', chartType: 'bar', xProp: status.id, agg: 'sum', yProp: hours.id },
      { id: uid(), name: 'Pizza', type: 'chart', chartType: 'donut', xProp: prio.id, agg: 'count' },
    ],
  }
  pages[db.id] = db
  const d = new Date()
  const iso = (off: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + off).toISOString().slice(0, 10)
  const rows: [string, number, number, string, number, boolean][] = [
    ['Planejar o lançamento', 2, 2, iso(-3), 5, true],
    ['Criar o editor de blocos', 1, 2, iso(0), 12, false],
    ['Gráficos gratuitos', 1, 1, iso(2), 8, false],
    ['App desktop', 0, 1, iso(6), 6, false],
    ['App iOS e Android', 0, 0, iso(10), 20, false],
    ['Sincronização em nuvem', 0, 2, iso(4), 10, false],
  ]
  rows.forEach(([t, s, p, dt, h, r], i) => {
    const row: Page = {
      id: uid(), title: t, parentId: db.id, kind: 'page', blocks: [newBlock()], createdAt: now, updatedAt: now, order: i,
      props: { [status.id]: status.options![s].id, [prio.id]: prio.options![p].id, [date.id]: dt, [hours.id]: h, [done.id]: r },
    }
    pages[row.id] = row
  })
  return pages
}

const touch = (p: Page, patch: Partial<Page>): Page => ({ ...p, ...patch, updatedAt: Date.now() })

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const patchPage = (id: string, fn: (p: Page) => Partial<Page>) =>
        set(s => s.pages[id] ? { pages: { ...s.pages, [id]: touch(s.pages[id], fn(s.pages[id])) } } : s)
      return {
        pages: {},
        currentId: null,
        theme: 'light',
        sidebarOpen: true,
        searchOpen: false,
        calendarOpen: false,
        navigate: id => set({ currentId: id, searchOpen: false, calendarOpen: false }),
        openCalendar: () => set({ calendarOpen: true, currentId: null, searchOpen: false }),
        createPage: (parentId, kind = 'page', extra = {}) => {
          const id = uid()
          const now = Date.now()
          const siblings = childrenOf(get().pages, parentId)
          const page: Page = {
            id, title: '', parentId, kind, props: {}, createdAt: now, updatedAt: now,
            order: siblings.length ? siblings[siblings.length - 1].order + 1 : 0,
            blocks: kind === 'page' ? [newBlock()] : [],
            ...(kind === 'database' ? {
              title: 'Sem título',
              schema: [{ id: uid(), name: 'Tags', type: 'multi_select', options: [] } as Property],
              views: [{ id: uid(), name: 'Tabela', type: 'table' } as View],
            } : {}),
            ...extra,
          }
          set(s => ({ pages: { ...s.pages, [id]: page } }))
          return id
        },
        updatePage: (id, patch) => patchPage(id, () => patch),
        setBlocks: (id, blocks) => patchPage(id, () => ({ blocks })),
        trashPage: id => {
          set(s => ({ pages: { ...s.pages, [id]: { ...s.pages[id], trashed: true } } }))
          if (get().currentId === id) set({ currentId: null })
        },
        restorePage: id => set(s => {
          const p = s.pages[id]
          const parentGone = p.parentId && (!s.pages[p.parentId] || s.pages[p.parentId].trashed)
          return { pages: { ...s.pages, [id]: { ...p, trashed: false, parentId: parentGone ? null : p.parentId } } }
        }),
        deleteForever: id => set(s => {
          const pages = { ...s.pages }
          for (const d of [id, ...descendants(pages, id)]) delete pages[d]
          return { pages, currentId: pages[s.currentId ?? ''] ? s.currentId : null }
        }),
        duplicatePage: id => {
          const pages = get().pages
          const map = new Map<string, string>()
          const all = [id, ...descendants(pages, id)]
          all.forEach(x => map.set(x, uid()))
          const copies: Record<string, Page> = {}
          for (const x of all) {
            const p = pages[x]
            copies[map.get(x)!] = {
              ...structuredClone(p), id: map.get(x)!,
              parentId: x === id ? p.parentId : map.get(p.parentId!)!,
              title: x === id ? `${p.title} (cópia)` : p.title,
              order: x === id ? p.order + 0.5 : p.order,
              blocks: p.blocks.map(b => ({ ...b, id: uid(), pageId: b.pageId && map.get(b.pageId) || b.pageId })),
            }
          }
          set(s => ({ pages: { ...s.pages, ...copies } }))
          return map.get(id)!
        },
        movePage: (id, parentId) => patchPage(id, () => ({ parentId })),
        addRow: (dbId, props = {}) => get().createPage(dbId, 'page', { props }),
        setProp: (rowId, propId, value) => patchPage(rowId, p => ({ props: { ...p.props, [propId]: value } })),
        setRelation: (rowId, propId, ids) => {
          const { pages } = get()
          const row = pages[rowId]
          const prop = pages[row?.parentId ?? '']?.schema?.find(p => p.id === propId)
          if (!row || !prop) return
          const before: string[] = row.props[propId] ?? []
          patchPage(rowId, p => ({ props: { ...p.props, [propId]: ids } }))
          const back = prop.relation?.twoWay
          if (!back) return
          for (const id of new Set([...before, ...ids])) {
            const linked = ids.includes(id)
            if (linked === before.includes(id)) continue
            patchPage(id, p => {
              const cur: string[] = p.props[back] ?? []
              return { props: { ...p.props, [back]: linked ? [...new Set([...cur, rowId])] : cur.filter(x => x !== rowId) } }
            })
          }
        },
        setTwoWay: (dbId, propId, on) => {
          const { pages, addProperty, updateProperty } = get()
          const db = pages[dbId]
          const prop = db?.schema?.find(p => p.id === propId)
          if (!prop?.relation) return
          const { dbId: target, twoWay } = prop.relation
          if (!on) {
            if (twoWay) get().deleteProperty(target, twoWay)
            updateProperty(dbId, propId, { relation: { dbId: target } })
            return
          }
          if (twoWay || !pages[target]) return
          const back = addProperty(target, { name: db.title || 'Relação', type: 'relation', relation: { dbId, twoWay: propId } })
          updateProperty(dbId, propId, { relation: { dbId: target, twoWay: back } })
          // mirror the links that already exist
          const reverse = new Map<string, string[]>()
          for (const row of rowsOf(get().pages, dbId))
            for (const id of (row.props[propId] ?? []) as string[]) reverse.set(id, [...(reverse.get(id) ?? []), row.id])
          for (const [id, rows] of reverse) if (get().pages[id]) patchPage(id, p => ({ props: { ...p.props, [back]: rows } }))
        },
        addProperty: (dbId, prop) => {
          const id = uid()
          patchPage(dbId, p => ({ schema: [...(p.schema ?? []), { ...prop, id }] }))
          return id
        },
        updateProperty: (dbId, propId, patch) =>
          patchPage(dbId, p => ({ schema: p.schema!.map(x => x.id === propId ? { ...x, ...patch } : x) })),
        deleteProperty: (dbId, propId) => {
          // the other side of a two-way relation stays, as a one-way relation
          const rel = get().pages[dbId]?.schema?.find(x => x.id === propId)?.relation
          if (rel?.twoWay) patchPage(rel.dbId, p => ({ schema: (p.schema ?? []).map(x => (x.id === rel.twoWay ? { ...x, relation: { dbId } } : x)) }))
          patchPage(dbId, p => ({ schema: p.schema!.filter(x => x.id !== propId) }))
        },
        addView: (dbId, view) => {
          const id = uid()
          patchPage(dbId, p => ({ views: [...(p.views ?? []), { ...view, id }] }))
          return id
        },
        updateView: (dbId, viewId, patch) =>
          patchPage(dbId, p => ({ views: p.views!.map(v => v.id === viewId ? { ...v, ...patch } : v) })),
        deleteView: (dbId, viewId) =>
          patchPage(dbId, p => ({ views: p.views!.filter(v => v.id !== viewId) })),
        setTheme: theme => set({ theme }),
        toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
        setSearchOpen: searchOpen => set({ searchOpen }),
        importData: pages => set({ pages, currentId: null }),
      }
    },
    { name: 'cofdesk-workspace', partialize: s => ({ pages: s.pages, currentId: s.currentId, theme: s.theme, sidebarOpen: s.sidebarOpen }) },
  ),
)

// handy for debugging in the browser console during development
if (import.meta.env.DEV) (window as any).cofdesk = useStore
