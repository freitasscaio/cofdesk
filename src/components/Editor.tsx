import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { newBlock, uid, useStore } from '../store'
import type { Block, BlockType } from '../types'
import { type ColRef, depth, listAt, normalize, subtreeEnd, withList } from '../blocks'
import { Editable, caretAtEnd, caretAtStart, placeCaret, splitAtCaret } from './Editable'
import { Database } from './Database'
import { IconView, PageIcon } from './icons'
import {
  ChevronRight, Code, Columns2, Columns3, Columns4, Copy, FileText, Globe, GripVertical, Heading1, Heading2, Heading3, Image,
  Image as ImageIcon, Link, Link2, List, ListCollapse, ListOrdered, MapPin, MessageSquare, MessageSquareText, Minus, MonitorPlay,
  Plus, Quote, Rows3, Sparkles, SquareCheck, Table, Table2, Trash2, Type, Ungroup, type LucideIcon,
} from 'lucide-react'
import { useCommentCounts, useCommentsUI } from './Comments'
import { useReadOnly } from '../readonly'
import { setPresence, useLive } from '../sync'
import { BookmarkBlock, EmbedBlock, isUrl } from './Embeds'
import { TableBlock, emptyTable } from './TableBlock'
import { AiBox } from './Ai'

type MenuItem = {
  id: string; type: BlockType; label: string; hint: string; icon: LucideIcon; keys: string; group: string
  cols?: number; embed?: Block['embed']
}

export const BLOCK_MENU: MenuItem[] = [
  { id: 'ai', type: 'text', label: 'Pedir à IA', hint: 'Escreva, resuma, traduza ou edite com IA', icon: Sparkles, keys: 'ia ai inteligencia artificial claude escrever resumir', group: 'IA' },
  { id: 'text', type: 'text', label: 'Texto', hint: 'Comece a escrever com texto simples', icon: Type, keys: 'texto text paragrafo', group: 'Blocos básicos' },
  { id: 'h1', type: 'h1', label: 'Título 1', hint: 'Título de seção grande', icon: Heading1, keys: 'titulo heading h1', group: 'Blocos básicos' },
  { id: 'h2', type: 'h2', label: 'Título 2', hint: 'Título de seção médio', icon: Heading2, keys: 'titulo heading h2', group: 'Blocos básicos' },
  { id: 'h3', type: 'h3', label: 'Título 3', hint: 'Título de seção pequeno', icon: Heading3, keys: 'titulo heading h3', group: 'Blocos básicos' },
  { id: 'bullet', type: 'bullet', label: 'Lista com marcadores', hint: 'Lista simples', icon: List, keys: 'lista bullet marcadores', group: 'Blocos básicos' },
  { id: 'numbered', type: 'numbered', label: 'Lista numerada', hint: 'Lista com números', icon: ListOrdered, keys: 'lista numerada numbered', group: 'Blocos básicos' },
  { id: 'todo', type: 'todo', label: 'Lista de tarefas', hint: 'Acompanhe tarefas com caixas', icon: SquareCheck, keys: 'tarefa todo checkbox', group: 'Blocos básicos' },
  { id: 'toggle', type: 'toggle', label: 'Lista de alternância', hint: 'Mostre ou esconda conteúdo aninhado', icon: ListCollapse, keys: 'toggle alternancia', group: 'Blocos básicos' },
  { id: 'table', type: 'table', label: 'Tabela simples', hint: 'Grade de células para dados simples', icon: Table, keys: 'tabela simples table grade', group: 'Blocos básicos' },
  { id: 'quote', type: 'quote', label: 'Citação', hint: 'Destaque uma citação', icon: Quote, keys: 'citacao quote', group: 'Blocos básicos' },
  { id: 'callout', type: 'callout', label: 'Destaque', hint: 'Faça o texto se sobressair', icon: MessageSquareText, keys: 'callout destaque aviso', group: 'Blocos básicos' },
  { id: 'divider', type: 'divider', label: 'Divisor', hint: 'Separe blocos visualmente', icon: Minus, keys: 'divisor divider linha', group: 'Blocos básicos' },
  { id: 'page', type: 'page', label: 'Página', hint: 'Insira uma subpágina', icon: FileText, keys: 'pagina page subpagina', group: 'Blocos básicos' },
  { id: 'image', type: 'image', label: 'Imagem', hint: 'Envie ou cole uma URL', icon: Image, keys: 'imagem image foto', group: 'Mídia' },
  { id: 'video', type: 'embed', embed: 'video', label: 'Vídeo', hint: 'YouTube, Vimeo, Loom ou arquivo de vídeo', icon: MonitorPlay, keys: 'video youtube vimeo loom', group: 'Mídia' },
  { id: 'bookmark', type: 'bookmark', label: 'Marcador web', hint: 'Prévia visual de um link', icon: Link2, keys: 'marcador bookmark link web', group: 'Mídia' },
  { id: 'code', type: 'code', label: 'Código', hint: 'Bloco de código', icon: Code, keys: 'codigo code', group: 'Mídia' },
  { id: 'embed', type: 'embed', embed: 'any', label: 'Incorporar', hint: 'Figma, Google Docs, Spotify, CodePen…', icon: Globe, keys: 'incorporar embed iframe figma spotify codepen docs', group: 'Incorporações' },
  { id: 'map', type: 'embed', embed: 'map', label: 'Google Maps', hint: 'Mostre um mapa de um endereço', icon: MapPin, keys: 'mapa map google maps endereco', group: 'Incorporações' },
  { id: 'database', type: 'database', label: 'Banco de dados', hint: 'Tabela, quadro, calendário, gráfico…', icon: Table2, keys: 'banco database tabela table grafico chart', group: 'Avançado' },
  { id: 'cols2', type: 'columns', cols: 2, label: '2 colunas', hint: 'Divida em duas colunas', icon: Columns2, keys: 'colunas columns 2 layout', group: 'Layout' },
  { id: 'cols3', type: 'columns', cols: 3, label: '3 colunas', hint: 'Divida em três colunas', icon: Columns3, keys: 'colunas columns 3 layout', group: 'Layout' },
  { id: 'cols4', type: 'columns', cols: 4, label: '4 colunas', hint: 'Divida em quatro colunas', icon: Columns4, keys: 'colunas columns 4 layout', group: 'Layout' },
]

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  text: "Digite '/' para comandos", h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', bullet: 'Lista',
  numbered: 'Lista', todo: 'Tarefa', toggle: 'Alternância', quote: 'Citação', callout: 'Escreva algo…', code: 'Código',
}
/** Opens the slash menu above the line when there is no room below. */
const MENU_H = 380
const menuY = (r: DOMRect) => (r.bottom + MENU_H + 8 > innerHeight ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4)
const CONTINUES: BlockType[] = ['bullet', 'numbered', 'todo']
const CALLOUT_ICONS = ['Lightbulb:yellow', 'Info:blue', 'AlertTriangle:orange', 'CheckCircle2:green', 'Flame:red', 'Pin:purple'].map(x => 'lucide:' + x)
const NON_TEXT: BlockType[] = ['divider', 'image', 'page', 'database', 'columns', 'table', 'embed', 'bookmark']
const TEXTUAL = (b: Block) => !NON_TEXT.includes(b.type)
const INDENT = 26
const BULLETS = ['•', '◦', '▪']
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
const listNumber = (n: number, d: number) =>
  d % 3 === 1 ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : d % 3 === 2 ? ROMAN[(n - 1) % ROMAN.length] : String(n)

type FocusReq = { id: string; at: 'start' | 'end' | number } | null
type Menu = { blockId: string; query: string; index: number; x: number; y: number } | null
type Side = 'below' | 'left' | 'right'

// Drags can cross editors (page ↔ columns), so the dragged block lives outside any one of them.
let drag: { pageId: string; col?: ColRef; id: string } | null = null
const sameCol = (a?: ColRef, b?: ColRef) => a?.blockId === b?.blockId && a?.index === b?.index

/** Copies blocks with fresh ids, including the contents of columns. */
const cloneBlocks = (list: Block[]): Block[] => list.map(b => ({ ...b, id: uid(), cols: b.cols?.map(cloneBlocks) }))

/** Where a block created "after" list[i] goes: as first child when it has children (or is an open toggle). */
function slotAfter(list: Block[], i: number) {
  const t = list[i]
  const d = depth(t)
  const hasKids = i + 1 < list.length && depth(list[i + 1]) > d
  if (t.type === 'toggle') return t.open ? { at: i + 1, indent: d + 1 } : { at: subtreeEnd(list, i), indent: d }
  return hasKids ? { at: i + 1, indent: d + 1 } : { at: i + 1, indent: d }
}

function placeAtOffset(node: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let left = offset
  let t: Node | null
  while ((t = walker.nextNode())) {
    const len = t.textContent!.length
    if (left <= len) {
      node.focus()
      const r = document.createRange()
      r.setStart(t, left)
      r.collapse(true)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)
      return
    }
    left -= len
  }
  placeCaret(node, 'end')
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Edits one block list: the page's own, or (with `col`) one column of a columns block. */
export function Editor({ pageId, col }: { pageId: string; col?: ColRef }) {
  const blocks = useStore(s => listAt(s.pages[pageId]?.blocks ?? [], col))
  const readOnly = useReadOnly()
  const peers = useLive(s => s.peers).filter(p => p.pageId === pageId && p.blockId)
  const counts = useCommentCounts()
  const openComments = useCommentsUI(s => s.openFor)
  const pages = useStore(s => s.pages)
  const { setBlocks, createPage, navigate, trashPage } = useStore.getState()
  const [focus, setFocus] = useState<FocusReq>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [handleMenu, setHandleMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [pasteMenu, setPasteMenu] = useState<{ id: string; url: string; x: number; y: number } | null>(null)
  const [ai, setAi] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; side: Side } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const visible = useRef(new Set<string>())

  // always read the freshest blocks inside event handlers
  const top = () => useStore.getState().pages[pageId]?.blocks ?? []
  const get = () => listAt(top(), col)
  const commit = (next: Block[]) => {
    const out = normalize(next)
    setBlocks(pageId, out.length ? out : [newBlock()])
  }
  const save = (next: Block[]) => commit(withList(top(), col, col || next.length ? next : [newBlock()]))
  const update = (id: string, patch: Partial<Block>) => save(get().map(b => (b.id === id ? { ...b, ...patch } : b)))
  const insertAt = (at: number, ...items: Block[]) => { const list = get(); save([...list.slice(0, at), ...items, ...list.slice(at)]) }
  const nodeOf = (id: string) => root.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
  const visibleTextual = (list: Block[]) => list.filter(b => TEXTUAL(b) && visible.current.has(b.id))

  useLayoutEffect(() => {
    if (!focus) return
    const node = nodeOf(focus.id)
    if (node) typeof focus.at === 'number' ? placeAtOffset(node, focus.at) : placeCaret(node, focus.at)
    setFocus(null)
  }, [focus, blocks])

  useEffect(() => {
    const close = () => { setHandleMenu(null); setPasteMenu(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const filtered = menu
    ? BLOCK_MENU.filter(m => {
        if (col && m.type === 'columns') return false // no columns inside columns
        const q = menu.query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const hay = (m.label + ' ' + m.keys).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        return hay.includes(q)
      })
    : []

  /** Replaces a block with a non-text block and opens an empty line after it. */
  function replaceWith(block: Block, patch: Partial<Block>, focusNext = true) {
    const list = get()
    const i = list.findIndex(b => b.id === block.id)
    const next = { ...newBlock(), indent: depth(block) }
    save([...list.slice(0, i), { ...block, html: '', ...patch }, next, ...list.slice(i + 1)])
    if (focusNext) setFocus({ id: next.id, at: 'start' })
  }

  function turnInto(block: Block, type: BlockType, html = block.html, item?: MenuItem) {
    switch (type) {
      case 'divider': return replaceWith(block, { type })
      case 'embed': return replaceWith(block, { type, embed: item?.embed ?? 'any', url: undefined }, false)
      case 'bookmark': return replaceWith(block, { type, url: undefined, meta: undefined }, false)
      case 'image': return replaceWith(block, { type, url: undefined }, false)
      case 'table': {
        replaceWith(block, { type, rows: emptyTable(), header: true }, false)
        setTimeout(() => { const n = root.current?.querySelector<HTMLElement>(`[data-block-wrap="${block.id}"] [data-cell="0:0"] .editable`); if (n) placeCaret(n, 'end') })
        return
      }
      case 'columns': {
        const n = item?.cols ?? 2
        const first = { ...block, html, indent: 0 }
        const cols = [[TEXTUAL(block) && html ? first : { ...newBlock(), id: block.id }], ...Array.from({ length: n - 1 }, () => [newBlock()])]
        const list = get()
        const i = list.findIndex(b => b.id === block.id)
        save([...list.slice(0, i), { id: uid(), type: 'columns', html: '', cols, indent: depth(block) }, ...list.slice(i + 1)])
        setFocus({ id: block.id, at: 'end' })
        return
      }
      case 'page':
      case 'database': {
        const child = createPage(pageId, type, type === 'database' ? { inline: true } : {})
        replaceWith(block, { type, pageId: child }, type === 'database')
        if (type === 'page') navigate(child)
        return
      }
    }
    update(block.id, { type, html, checked: false, icon: type === 'callout' ? CALLOUT_ICONS[0] : block.icon, open: type === 'toggle' ? true : block.open })
    const node = nodeOf(block.id)
    if (node) node.innerHTML = html
    setFocus({ id: block.id, at: 'end' })
  }

  function pickMenu(item: MenuItem) {
    if (!menu) return
    const block = get().find(b => b.id === menu.blockId)
    setMenu(null)
    if (!block) return
    const cut = block.html.lastIndexOf('/' + menu.query)
    const html = cut >= 0 ? block.html.slice(0, cut) + block.html.slice(cut + 1 + menu.query.length) : block.html
    if (item.id === 'ai') {
      const clean = html.replace(/(&nbsp;|\s)+$/, '')
      update(block.id, { html: clean })
      const node = nodeOf(block.id)
      if (node) node.innerHTML = clean
      setAi(block.id)
      return
    }
    turnInto(block, item.type, html.replace(/(&nbsp;|\s)+$/, ''), item)
  }

  function onInput(block: Block, html: string, node: HTMLElement) {
    const text = node.innerText.replace(/ /g, ' ')
    // Markdown shortcuts at the beginning of a text block
    if (block.type === 'text') {
      const shortcuts: [RegExp, BlockType][] = [
        [/^# /, 'h1'], [/^## /, 'h2'], [/^### /, 'h3'], [/^[-*] /, 'bullet'], [/^1\. /, 'numbered'],
        [/^\[\] ?/, 'todo'], [/^> /, 'toggle'], [/^" /, 'quote'], [/^```/, 'code'], [/^---$/, 'divider'],
      ]
      for (const [re, type] of shortcuts) {
        const m = text.match(re)
        if (m) {
          const rest = text.slice(m[0].length)
          node.innerText = rest
          turnInto(block, type, rest)
          return
        }
      }
    }
    update(block.id, { html })
    // the query may contain spaces ("/2 col"); the menu simply hides when nothing matches
    const m = text.match(/(?:^|\s)\/([^/\n]{0,24})$/)
    if (m && block.type !== 'code') {
      const rect = node.getBoundingClientRect()
      setMenu({ blockId: block.id, query: m[1], index: menu?.blockId === block.id ? menu.index : 0, x: rect.left, y: menuY(rect) })
    } else if (menu) setMenu(null)
  }

  /** Tab / Shift+Tab: moves a block together with its children one level in or out. */
  function shift(id: string, delta: 1 | -1) {
    const list = get()
    const i = list.findIndex(b => b.id === id)
    const d = depth(list[i])
    if (delta > 0 && (i === 0 || d + 1 > depth(list[i - 1]) + 1)) return false
    if (delta < 0 && d === 0) return false
    const end = subtreeEnd(list, i)
    save(list.map((b, k) => (k >= i && k < end ? { ...b, indent: depth(b) + delta } : b)))
    return true
  }

  function onPaste(block: Block, text: string) {
    const url = text.trim()
    if (!isUrl(url)) return false
    const empty = !(nodeOf(block.id)?.innerText.trim())
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`)
    if (empty && block.type === 'text') {
      const r = nodeOf(block.id)!.getBoundingClientRect()
      setPasteMenu({ id: block.id, url, x: r.left, y: r.bottom + 4 })
    }
    return true
  }

  function onKeyDown(block: Block, e: React.KeyboardEvent<HTMLDivElement>) {
    const node = e.currentTarget
    if (menu && menu.blockId === block.id && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenu({ ...menu, index: (menu.index + 1) % filtered.length }); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMenu({ ...menu, index: (menu.index - 1 + filtered.length) % filtered.length }); return }
      if (e.key === 'Enter') { e.preventDefault(); pickMenu(filtered[Math.min(menu.index, filtered.length - 1)]); return }
    }
    if (e.key === 'Escape') { setMenu(null); setPasteMenu(null); return }
    if (pasteMenu) setPasteMenu(null)
    const list = get()
    const i = list.findIndex(b => b.id === block.id)

    if (block.type === 'code') {
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  ') }
      if (e.key === 'ArrowUp' && caretAtStart(node) && i > 0) {
        const prev = visibleTextual(list.slice(0, i)).pop()
        if (prev) { e.preventDefault(); setFocus({ id: prev.id, at: 'end' }) }
      }
      return
    }

    if (e.key === 'Tab') { e.preventDefault(); shift(block.id, e.shiftKey ? -1 : 1); return }
    // like Notion: space on an empty line asks the AI
    if (e.key === ' ' && block.type === 'text' && !node.innerText.trim()) { e.preventDefault(); setAi(block.id); return }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (CONTINUES.includes(block.type) && !node.innerText.trim()) {
        if (!shift(block.id, -1)) turnInto(block, 'text', '')
        return
      }
      const afterHtml = splitAtCaret(node)
      const before = node.innerHTML === '<br>' ? '' : node.innerHTML
      const nextType: BlockType = CONTINUES.includes(block.type) ? block.type : 'text'
      const { at, indent } = slotAfter(list, i)
      const next = { ...newBlock(nextType, afterHtml), indent }
      const updated = list.map(b => (b.id === block.id ? { ...b, html: before } : b))
      save([...updated.slice(0, at), next, ...updated.slice(at)])
      setFocus({ id: next.id, at: 'start' })
      return
    }

    if (e.key === 'Backspace' && caretAtStart(node)) {
      if (block.type !== 'text') { e.preventDefault(); turnInto(block, 'text'); setFocus({ id: block.id, at: 'start' }); return }
      if (depth(block) > 0) { e.preventDefault(); shift(block.id, -1); return }
      const prev = visibleTextual(list.slice(0, i)).pop()
      if (!prev) return
      e.preventDefault()
      const joinAt = (nodeOf(prev.id)?.innerText ?? '').replace(/\n$/, '').length
      save(list.filter(b => b.id !== block.id).map(b => (b.id === prev.id ? { ...b, html: b.html + node.innerHTML } : b)))
      setFocus({ id: prev.id, at: joinAt })
      return
    }

    if (e.key === 'ArrowUp' && caretAtStart(node)) {
      const prev = visibleTextual(list.slice(0, i)).pop()
      if (prev) { e.preventDefault(); setFocus({ id: prev.id, at: 'end' }) }
    }
    if (e.key === 'ArrowDown' && caretAtEnd(node)) {
      const next = visibleTextual(list.slice(i + 1))[0]
      if (next) { e.preventDefault(); setFocus({ id: next.id, at: 'start' }) }
    }
  }

  function addBelow(id: string) {
    const list = get()
    const { at, indent } = slotAfter(list, list.findIndex(b => b.id === id))
    const b = { ...newBlock('text', '/'), indent }
    insertAt(at, b)
    setTimeout(() => {
      const node = nodeOf(b.id)
      if (!node) return
      placeCaret(node, 'end')
      const rect = node.getBoundingClientRect()
      setMenu({ blockId: b.id, query: '', index: 0, x: rect.left, y: menuY(rect) })
    })
  }

  /** Puts AI-written blocks under `block`, or in its place. */
  function placeAi(block: Block, items: Block[], replace: boolean) {
    if (!items.length) return
    const list = get()
    const i = list.findIndex(b => b.id === block.id)
    if (i < 0) return
    const d = depth(block)
    const placed = items.map(b => ({ ...b, indent: d + depth(b) }))
    if (replace) save([...list.slice(0, i), ...placed, ...list.slice(i + 1)])
    else { const end = subtreeEnd(list, i); save([...list.slice(0, end), ...placed, ...list.slice(end)]) }
    setFocus({ id: placed[placed.length - 1].id, at: 'end' })
  }

  function addChild(toggle: Block) {
    const list = get()
    const b = { ...newBlock(), indent: depth(toggle) + 1 }
    insertAt(list.findIndex(x => x.id === toggle.id) + 1, b)
    setFocus({ id: b.id, at: 'start' })
  }

  function removeBlock(block: Block) {
    const list = get()
    const i = list.findIndex(b => b.id === block.id)
    const gone = list.slice(i, subtreeEnd(list, i))
    for (const b of gone.flatMap(x => [x, ...(x.cols ?? []).flat()])) if (b.pageId && (b.type === 'page' || b.type === 'database')) trashPage(b.pageId)
    save([...list.slice(0, i), ...list.slice(i + gone.length)])
  }

  function sideFor(e: React.DragEvent, block: Block): Side {
    const r = e.currentTarget.getBoundingClientRect()
    // columns only on the page itself, and never a columns block inside another
    const movingCols = drag && listAt(top(), drag.col).find(b => b.id === drag!.id)?.type === 'columns'
    if (col || movingCols || drag?.id === block.id) return 'below'
    if (e.clientX > r.right - 56) return 'right'
    if (e.clientX < r.left + 40) return 'left'
    return 'below'
  }

  function dropOn(targetId: string, side: Side) {
    const d = drag
    if (!d || d.pageId !== pageId || d.id === targetId) return
    let page = top()
    const src = listAt(page, d.col)
    const si = src.findIndex(b => b.id === d.id)
    if (si < 0) return
    const end = subtreeEnd(src, si)
    const moving = src.slice(si, end)
    if (sameCol(d.col, col) && moving.some(b => b.id === targetId)) return
    if (col && moving[0].type === 'columns') return
    if (moving[0].type === 'columns' && moving[0].cols?.some(c => c.some(b => b.id === targetId))) return
    page = withList(page, d.col, [...src.slice(0, si), ...src.slice(end)])
    const base = depth(moving[0])
    const list = listAt(page, col)
    const ti = list.findIndex(b => b.id === targetId)
    if (ti < 0) return
    const t = list[ti]
    const reindent = (items: Block[], from: number, to: number) => items.map(b => ({ ...b, indent: depth(b) - from + to }))

    if (side === 'below') {
      const { at, indent } = slotAfter(list, ti)
      page = withList(page, col, [...list.slice(0, at), ...reindent(moving, base, indent), ...list.slice(at)])
    } else {
      const mv = reindent(moving, base, 0)
      if (t.type === 'columns') {
        const cols = t.cols ?? []
        page = page.map(b => (b.id === t.id ? { ...b, cols: side === 'right' ? [...cols, mv] : [mv, ...cols] } : b))
      } else {
        const tEnd = subtreeEnd(list, ti)
        const group = reindent(list.slice(ti, tEnd), depth(t), 0)
        const columns: Block = { id: uid(), type: 'columns', html: '', indent: depth(t), cols: side === 'right' ? [group, mv] : [mv, group] }
        page = [...list.slice(0, ti), columns, ...list.slice(tEnd)]
      }
    }
    commit(page)
  }

  // numbering restarts per nesting level; children of a closed toggle are hidden
  const nums: number[] = []
  const lastType: (BlockType | undefined)[] = []
  let hideDeeperThan = Infinity
  const shown = new Set<string>()
  visible.current = shown

  return (
    <div className={`editor ${col ? 'in-column' : ''}`} ref={root}>
      {blocks.map((block, idx) => {
        const d = depth(block)
        nums.length = lastType.length = d + 1
        nums[d] = block.type === 'numbered' ? (lastType[d] === 'numbered' ? nums[d] + 1 : 1) : 0
        lastType[d] = block.type
        if (d > hideDeeperThan) return null
        hideDeeperThan = block.type === 'toggle' && !block.open ? d : Infinity
        shown.add(block.id)

        const editable = (cls = '') => (
          <Editable
            blockId={block.id}
            html={block.html}
            className={`b-${block.type} ${cls}`}
            plain={block.type === 'code'}
            placeholder={PLACEHOLDER[block.type]}
            onChange={html => onInput(block, html, nodeOf(block.id)!)}
            onKeyDown={e => onKeyDown(block, e)}
            onPasteText={text => onPaste(block, text)}
            onFocus={() => setPresence(pageId, block.id)}
            onBlur={() => setPresence(pageId, null)}
          />
        )
        // Textual blocks share one element tree so switching type never remounts the editable (keeps focus & typed text)
        const prefix =
          block.type === 'todo' ? <input type="checkbox" aria-label="Tarefa concluída" disabled={readOnly} checked={!!block.checked} onChange={e => update(block.id, { checked: e.target.checked })} />
          : block.type === 'bullet' ? <span className="marker">{BULLETS[d % 3]}</span>
          : block.type === 'numbered' ? <span className="marker num">{listNumber(nums[d], d)}.</span>
          : block.type === 'toggle' ? <button className={`toggle-btn ${block.open ? 'open' : ''}`} aria-expanded={!!block.open} aria-label={block.open ? 'Recolher' : 'Expandir'} onClick={() => update(block.id, { open: !block.open })}><ChevronRight size={16} aria-hidden /></button>
          : block.type === 'callout' ? (
            <button className="callout-icon" title="Trocar ícone"
              onClick={() => update(block.id, { icon: CALLOUT_ICONS[(CALLOUT_ICONS.indexOf(block.icon ?? CALLOUT_ICONS[0]) + 1) % CALLOUT_ICONS.length] })}>
              <IconView value={block.icon ?? CALLOUT_ICONS[0]} size={20} />
            </button>
          ) : null
        const hasKids = idx + 1 < blocks.length && depth(blocks[idx + 1]) > d
        let body: React.ReactNode
        switch (block.type) {
          case 'divider':
            body = <hr className="divider" />
            break
          case 'image':
            body = <ImageBlock block={block} onChange={url => update(block.id, { url })} />
            break
          case 'page': {
            const p = block.pageId ? pages[block.pageId] : undefined
            body = p && !p.trashed
              ? <button className="page-link" onClick={() => navigate(p.id)}><PageIcon page={p} size={20} /><u>{p.title || 'Sem título'}</u></button>
              : <div className="muted">Página removida</div>
            break
          }
          case 'database':
            body = block.pageId && pages[block.pageId] && !pages[block.pageId].trashed
              ? <Database dbId={block.pageId} inline />
              : <div className="muted">Banco de dados removido</div>
            break
          case 'columns':
            body = (
              <div className="columns">
                {(block.cols ?? []).map((_, i) => (
                  <div className="column" key={i}><Editor pageId={pageId} col={{ blockId: block.id, index: i }} /></div>
                ))}
              </div>
            )
            break
          case 'table':
            body = <TableBlock block={block} onChange={rows => update(block.id, { rows })} />
            break
          case 'embed':
            body = <EmbedBlock block={block} onChange={patch => update(block.id, patch)} />
            break
          case 'bookmark':
            body = <BookmarkBlock block={block} onChange={patch => update(block.id, patch)} />
            break
          default:
            body = (
              <div>
                <div className={`row t-${block.type} ${block.checked ? 'checked' : ''}`}>
                  {prefix}
                  {editable()}
                </div>
                {block.type === 'toggle' && block.open && !hasKids ? (
                  block.body
                    ? <div className="toggle-body"><Editable html={block.body} placeholder="Bloco vazio. Escreva aqui." onChange={h => update(block.id, { body: h })} /></div>
                    : !readOnly && <button className="toggle-empty" onClick={() => addChild(block)}>Alternância vazia. Clique para adicionar um bloco.</button>
                ) : null}
              </div>
            )
        }
        const editor = peers.find(p => p.blockId === block.id)
        const comments = counts.get(`${pageId}:${block.id}`)
        const dropHere = drop?.id === block.id ? drop.side : null
        return (
          <div
            key={block.id}
            data-block-wrap={block.id}
            className={`block b-wrap-${block.type} ${dropHere ? 'drop-' + dropHere : ''} ${block.type === 'database' ? 'wide' : ''} ${editor ? 'peer' : ''}`}
            style={{ marginLeft: d * INDENT, ...(editor ? { ['--peer' as any]: editor.color } : {}) }}
            onDragOver={e => { if (!drag) return; e.preventDefault(); e.stopPropagation(); setDrop({ id: block.id, side: sideFor(e, block) }) }}
            onDragLeave={() => setDrop(null)}
            onDrop={e => {
              if (!drag) return
              e.preventDefault(); e.stopPropagation()
              dropOn(block.id, sideFor(e, block)); drag = null; setDrop(null)
            }}
          >
            {editor && <span className="peer-label">{editor.name}</span>}
            {!!comments && !readOnly && (
              <button className="comment-badge" title="Ver comentários" onClick={() => openComments(block.id)}><MessageSquare size={14} /> {comments}</button>
            )}
            {!readOnly && <div className="block-handle">
              <button title="Adicionar bloco abaixo" onClick={() => addBelow(block.id)}><Plus size={18} strokeWidth={1.8} /></button>
              <button
                title="Arraste para mover · clique para opções"
                draggable
                onDragStart={e => { drag = { pageId, col, id: block.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.id) }}
                onDragEnd={() => { drag = null; setDrop(null) }}
                onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setHandleMenu({ id: block.id, x: r.left, y: r.bottom }) }}
              ><GripVertical size={18} strokeWidth={1.8} /></button>
            </div>}
            <div className="block-body">
              {body}
              {ai === block.id && !readOnly && (
                <AiBox pageId={pageId} block={block} onClose={() => setAi(null)}
                  onInsert={items => { placeAi(block, items, false); setAi(null) }}
                  onReplace={items => { placeAi(block, items, true); setAi(null) }} />
              )}
            </div>
          </div>
        )
      })}
      <div className="editor-tail" onClick={() => {
        if (readOnly) return
        const list = get()
        const last = list[list.length - 1]
        if (last && last.type === 'text' && !last.html && !depth(last)) { setFocus({ id: last.id, at: 'end' }); return }
        const b = newBlock()
        save([...list, b])
        setFocus({ id: b.id, at: 'start' })
      }} />

      {menu && filtered.length > 0 && (
        <div className="popover slash-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.preventDefault()}>
          {filtered.map((m, i) => (
            <div key={m.id}>
              {(i === 0 || filtered[i - 1].group !== m.group) && <div className="popover-title">{m.group}</div>}
              <button className={`menu-item ${i === menu.index ? 'active' : ''}`}
                ref={el => { if (el && i === menu.index) el.scrollIntoView({ block: 'nearest' }) }}
                onMouseEnter={() => setMenu({ ...menu, index: i })} onClick={() => pickMenu(m)}>
                <span className="menu-icon"><m.icon size={20} strokeWidth={1.6} /></span>
                <span><div>{m.label}</div><small>{m.hint}</small></span>
              </button>
            </div>
          ))}
        </div>
      )}

      {pasteMenu && (
        <div className="popover paste-menu" style={{ left: pasteMenu.x, top: pasteMenu.y }} onMouseDown={e => e.preventDefault()} onClick={e => e.stopPropagation()}>
          {([
            [Link, 'Manter como link', null],
            [Link2, 'Criar marcador', 'bookmark'],
            [Globe, 'Incorporar', 'embed'],
          ] as const).map(([Icon, label, type]) => (
            <button key={label} className="menu-item" onClick={() => {
              const block = get().find(b => b.id === pasteMenu.id)
              setPasteMenu(null)
              if (!block || !type) return
              replaceWith(block, { type, url: pasteMenu.url, embed: type === 'embed' ? 'any' : undefined, meta: undefined })
            }}><Icon size={16} /> {label}</button>
          ))}
        </div>
      )}

      {handleMenu && (() => {
        const block = get().find(b => b.id === handleMenu.id)
        if (!block) return null
        const close = () => setHandleMenu(null)
        return (
          <div className="popover" style={{ left: handleMenu.x, top: handleMenu.y }} onClick={e => e.stopPropagation()}>
            <button className="menu-item" onClick={() => { removeBlock(block); close() }}><Trash2 size={16} /> Excluir</button>
            <button className="menu-item" onClick={() => {
              const list = get()
              const i = list.findIndex(b => b.id === block.id)
              const end = subtreeEnd(list, i)
              insertAt(end, ...cloneBlocks(list.slice(i, end)))
              close()
            }}><Copy size={16} /> Duplicar</button>
            <button className="menu-item" onClick={() => { openComments(block.id); close() }}><MessageSquare size={16} /> Comentar</button>
            {TEXTUAL(block) && <button className="menu-item" onClick={() => { setAi(block.id); close() }}><Sparkles size={16} /> Pedir à IA</button>}
            {block.type === 'columns' && (
              <button className="menu-item" onClick={() => {
                const list = get()
                save(list.flatMap(b => (b.id === block.id ? (b.cols ?? []).flat().map(x => ({ ...x, indent: depth(x) + depth(b) })) : [b])))
                close()
              }}><Ungroup size={16} /> Desfazer colunas</button>
            )}
            {block.type === 'table' && (
              <button className="menu-item" onClick={() => { update(block.id, { header: !block.header }); close() }}>
                <Rows3 size={16} /> {block.header ? 'Remover linha de cabeçalho' : 'Linha de cabeçalho'}
              </button>
            )}
            {(block.type === 'embed' || block.type === 'bookmark' || block.type === 'image') && block.url && (
              <button className="menu-item" onClick={() => { update(block.id, { url: undefined, meta: undefined }); close() }}><Link2 size={16} /> Trocar link</button>
            )}
            {depth(block) > 0 && <button className="menu-item" onClick={() => { shift(block.id, -1); close() }}><ChevronRight size={16} style={{ transform: 'scaleX(-1)' }} /> Diminuir recuo</button>}
            {TEXTUAL(block) && <>
              <div className="popover-title">Transformar em</div>
              {BLOCK_MENU.filter(m => m.id !== 'ai' && TEXTUAL({ type: m.type } as Block)).map(m => (
                <button key={m.id} className="menu-item" onClick={() => { turnInto(block, m.type); close() }}>
                  <span className="menu-icon small"><m.icon size={16} strokeWidth={1.7} /></span>{m.label}
                </button>
              ))}
            </>}
          </div>
        )
      })()}
    </div>
  )
}

function ImageBlock({ block, onChange }: { block: Block; onChange: (url: string) => void }) {
  const [url, setUrl] = useState('')
  if (block.url) return <figure className="image"><img src={block.url} alt="" /></figure>
  return (
    <div className="image-empty">
      <ImageIcon size={18} className="ico-muted" />
      <input placeholder="Cole a URL de uma imagem e pressione Enter" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && url.trim()) onChange(url.trim()) }} />
      <label className="btn">
        Enviar
        <input type="file" accept="image/*" hidden onChange={e => {
          const f = e.target.files?.[0]
          if (!f) return
          const reader = new FileReader()
          reader.onload = () => onChange(reader.result as string)
          reader.readAsDataURL(f)
        }} />
      </label>
    </div>
  )
}
