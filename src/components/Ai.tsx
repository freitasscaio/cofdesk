import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import {
  ArrowUp, Check, CornerDownLeft, FileText, Languages, Lightbulb, ListChecks, ListPlus, Loader, PenLine, RefreshCw, Replace,
  ScrollText, Sparkles, SpellCheck, Square, Text, Trash2, Wand2, X, type LucideIcon,
} from 'lucide-react'
import { useDialog } from '../a11y'
import { CLIENT_ID, useAuth } from '../auth'
import { useStore } from '../store'
import { markdownToBlocks, inline, toMarkdown } from '../markdown'
import { blockText } from '../blocks'
import type { Block } from '../types'
import { PageIcon } from './icons'
import { apiUrl } from '../config'

// ---------- talking to the server ----------

/** Streams an AI answer from the server, calling onText with the text so far. */
export async function streamAi(path: 'ai' | 'ask', body: object, onText: (all: string) => void, signal: AbortSignal) {
  const { token, workspaceId } = useAuth.getState()
  const res = await fetch(apiUrl(`/workspaces/${workspaceId}/${path}`), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Não foi possível falar com a IA')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let all = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    all += decoder.decode(value, { stream: true })
    onText(all)
  }
  return all
}

type Run = { text: string; busy: boolean; error: string }

function useAiRun() {
  const [run, setRun] = useState<Run>({ text: '', busy: false, error: '' })
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const start = (path: 'ai' | 'ask', body: object) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setRun({ text: '', busy: true, error: '' })
    streamAi(path, body, text => setRun(r => ({ ...r, text })), c.signal)
      .then(() => setRun(r => ({ ...r, busy: false })))
      .catch(e => { if (!c.signal.aborted) setRun(r => ({ ...r, busy: false, error: (e as Error).message })) })
  }
  const stop = () => { ctrl.current?.abort(); setRun(r => ({ ...r, busy: false })) }
  return { run, start, stop, reset: () => { stop(); setRun({ text: '', busy: false, error: '' }) } }
}

// ---------- rendering an answer ----------

const CITE = /\[\[page:([\w-]+)\]\]/g

/** Read-only rendering of Markdown written by the AI; [[page:id]] citations become page links. */
export function AiMarkdown({ md }: { md: string }) {
  const pages = useStore(s => s.pages)
  const cites: string[] = []
  const blocks = markdownToBlocks(md.replace(CITE, (_, id) => { cites.push(id); return `@@cite${cites.length - 1}@@` }))
  const withCites = (html: string) => html.replace(/@@cite(\d+)@@/g, (_, i) => {
    const p = pages[cites[Number(i)]]
    return p ? `<a class="cite" data-page="${p.id}">${inline(p.title || 'Sem título')}</a>` : ''
  })
  return (
    <div className="ai-md" onClick={e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a.cite')
      if (a?.dataset.page) { useStore.getState().navigate(a.dataset.page); useAiUI.getState().setAsk(false) }
    }}>
      {blocks.map(b => <StaticBlock key={b.id} block={b} html={withCites(b.html)} />)}
    </div>
  )
}

/** A block rendered without editing; used by AI answers and the version history preview. */
export function StaticBlock({ block: b, html = b.html }: { block: Block; html?: string }) {
  const h = { dangerouslySetInnerHTML: { __html: html } }
  const pad = { marginLeft: (b.indent ?? 0) * 26 }
  switch (b.type) {
    case 'h1': return <h1 className="s-h1" style={pad} {...h} />
    case 'h2': return <h2 className="s-h2" style={pad} {...h} />
    case 'h3': return <h3 className="s-h3" style={pad} {...h} />
    case 'bullet': return <div className="s-li" style={pad}><span>•</span><div {...h} /></div>
    case 'numbered': return <div className="s-li" style={pad}><span>–</span><div {...h} /></div>
    case 'todo': return <div className="s-li" style={pad}>{b.checked ? <Check size={14} /> : <Square size={14} />}<div {...h} /></div>
    case 'toggle': return <div className="s-li" style={pad}><span>▸</span><div {...h} /></div>
    case 'quote': return <blockquote className="s-quote" style={pad} {...h} />
    case 'callout': return <div className="s-callout" style={pad} {...h} />
    case 'code': return <pre className="s-code" style={pad}>{b.html}</pre>
    case 'divider': return <hr className="divider" />
    case 'image': return b.url ? <img className="s-img" src={b.url} alt="" /> : null
    case 'columns': return <div className="s-cols">{(b.cols ?? []).map((c, i) => <div key={i}>{c.map(x => <StaticBlock key={x.id} block={x} />)}</div>)}</div>
    case 'table': return <table className="stable"><tbody>{(b.rows ?? []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} dangerouslySetInnerHTML={{ __html: c }} />)}</tr>)}</tbody></table>
    case 'page': case 'database': case 'embed': case 'bookmark': {
      const label = b.type === 'page' ? 'Subpágina' : b.type === 'database' ? 'Banco de dados' : b.meta?.title || b.url || 'Link'
      return <div className="s-ref" style={pad}><FileText size={14} /> {label}</div>
    }
    default: return <p className="s-p" style={pad} {...h} />
  }
}

// ---------- AI box inside the editor ----------

type Action = { id: string; label: string; icon: LucideIcon; needsText?: boolean; lang?: string }
const WRITE_ACTIONS: Action[] = [
  { id: 'continue', label: 'Continuar escrevendo', icon: PenLine },
  { id: 'summarize', label: 'Resumir a página', icon: ScrollText },
  { id: 'actions', label: 'Encontrar tarefas', icon: ListChecks },
  { id: 'brainstorm', label: 'Ter ideias sobre…', icon: Lightbulb },
  { id: 'translate', label: 'Traduzir a página para inglês', icon: Languages, lang: 'English' },
]
const EDIT_ACTIONS: Action[] = [
  { id: 'improve', label: 'Melhorar a escrita', icon: Wand2 },
  { id: 'fix', label: 'Corrigir ortografia e gramática', icon: SpellCheck },
  { id: 'shorter', label: 'Deixar mais curto', icon: Text },
  { id: 'longer', label: 'Deixar mais longo', icon: ListPlus },
  { id: 'simplify', label: 'Simplificar a linguagem', icon: Sparkles },
  { id: 'explain', label: 'Explicar', icon: Lightbulb },
  { id: 'translate', label: 'Traduzir para inglês', icon: Languages, lang: 'English' },
  { id: 'translate', label: 'Traduzir para espanhol', icon: Languages, lang: 'Spanish' },
]

/**
 * The "Ask AI" box that opens under a block (space on an empty line, /ia, or the block menu).
 * Without a selected block it writes new content; on a block with text it edits that text.
 */
export function AiBox({ pageId, block, onInsert, onReplace, onClose }: {
  pageId: string
  block: Block
  onInsert: (blocks: Block[]) => void
  onReplace: (blocks: Block[]) => void
  onClose: () => void
}) {
  const text = blockText(block).trim()
  const editing = !!text && block.type !== 'code'
  const [prompt, setPrompt] = useState('')
  const [last, setLast] = useState<object | null>(null)
  const { run, start, stop, reset } = useAiRun()
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { input.current?.focus(); box.current?.scrollIntoView({ block: 'nearest' }) }, [])
  useEffect(() => { if (!run.busy) input.current?.focus() }, [run.busy])

  const pageMd = () => {
    const { pages } = useStore.getState()
    return pages[pageId] ? toMarkdown(pages[pageId], pages) : ''
  }
  const go = (body: object) => { setLast(body); setPrompt(''); start('ai', body) }
  const act = (a: Action) => {
    if (a.id === 'brainstorm' && !prompt.trim()) { setPrompt('Ideias sobre '); input.current?.focus(); return }
    go({ action: a.id, lang: a.lang, page: pageMd(), text: editing ? text : undefined, prompt: prompt || undefined })
  }
  const submit = () => {
    const q = prompt.trim()
    if (!q) return
    // a follow-up ("make it more formal") refines the previous answer
    if (run.text) go({ action: 'custom', prompt: q, text: run.text, page: pageMd() })
    else go({ action: 'custom', prompt: q, page: pageMd(), text: editing ? text : undefined })
  }

  const actions = editing ? EDIT_ACTIONS : WRITE_ACTIONS
  const blocks = run.text ? markdownToBlocks(run.text) : []
  const done = !run.busy && !!run.text

  return (
    <div className="ai-box" ref={box} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      {(run.text || run.busy) && (
        <div className="ai-answer">
          {run.text ? <AiMarkdown md={run.text} /> : <div className="ai-thinking"><Loader size={14} className="spin" /> A IA está escrevendo…</div>}
        </div>
      )}
      {run.error && <div className="ai-error">{run.error}</div>}
      <form className="ai-input" onSubmit={e => { e.preventDefault(); submit() }}>
        <Sparkles size={16} className="ai-spark" />
        <input ref={input} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={run.busy}
          placeholder={run.busy ? 'A IA está escrevendo…' : done ? 'Diga à IA o que mudar…' : editing ? 'Peça à IA para editar este bloco…' : 'Peça à IA para escrever qualquer coisa…'} />
        {run.busy
          ? <button type="button" className="ai-send stop" onClick={stop} title="Parar"><Square size={12} fill="currentColor" /></button>
          : <button className="ai-send" disabled={!prompt.trim()} title="Enviar"><ArrowUp size={16} /></button>}
      </form>
      {!run.busy && (
        <div className="popover ai-menu">
          {done ? <>
            <button className="menu-item" onClick={() => onInsert(blocks)}><CornerDownLeft size={16} /> Inserir abaixo</button>
            {(editing || !block.html) && <button className="menu-item" onClick={() => onReplace(blocks)}><Replace size={16} /> {editing ? 'Substituir o bloco' : 'Usar este texto'}</button>}
            <button className="menu-item" onClick={() => last && start('ai', last)}><RefreshCw size={16} /> Tentar de novo</button>
            <button className="menu-item" onClick={() => { reset(); onClose() }}><Trash2 size={16} /> Descartar</button>
          </> : <>
            <div className="popover-title">{editing ? 'Editar ou revisar' : 'Escrever com IA'}</div>
            {actions.map(a => <button key={a.label} className="menu-item" onClick={() => act(a)}><a.icon size={16} className="ai-ico" /> {a.label}</button>)}
          </>}
        </div>
      )}
    </div>
  )
}

// ---------- "Ask the workspace" ----------

export const useAiUI = create<{ ask: boolean; setAsk: (v: boolean) => void }>(set => ({ ask: false, setAsk: ask => set({ ask }) }))

export function AskAi() {
  const setAsk = useAiUI(s => s.setAsk)
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const { run, start, stop } = useAiRun()
  const pages = useStore(s => s.pages)
  const cited = [...new Set([...run.text.matchAll(CITE)].map(m => m[1]))].map(id => pages[id]).filter(Boolean)
  const ask = (question: string) => { setAsked(question); setQ(''); start('ask', { question }) }
  const dialog = useDialog(true, () => setAsk(false))
  const examples = ['Quais tarefas estão em andamento?', 'Resuma o que mudou nos projetos', 'O que está atrasado?']

  return (
    <div className="modal-bg" onMouseDown={() => setAsk(false)}>
      <div ref={dialog} className="modal ask-modal" role="dialog" aria-modal="true" aria-label="Perguntar ao workspace" onMouseDown={e => e.stopPropagation()}>
        <header><Sparkles size={18} className="ai-spark" aria-hidden /> Perguntar ao workspace <button className="icon-btn" onClick={() => setAsk(false)} aria-label="Fechar"><X size={16} aria-hidden /></button></header>
        <div className="ask-body">
          {!asked && (
            <div className="ask-empty">
              <p>A IA lê suas páginas e bancos de dados para responder, citando de onde tirou cada informação.</p>
              {examples.map(x => <button key={x} className="menu-item" onClick={() => ask(x)}><Sparkles size={14} className="ai-ico" /> {x}</button>)}
            </div>
          )}
          {asked && <div className="ask-q">{asked}</div>}
          {asked && (run.text ? <AiMarkdown md={run.text} /> : run.busy && <div className="ai-thinking"><Loader size={14} className="spin" /> Procurando nas suas páginas…</div>)}
          {run.error && <div className="ai-error">{run.error}</div>}
          {!run.busy && cited.length > 0 && (
            <div className="ask-sources">
              <div className="popover-title">Fontes</div>
              {cited.map(p => <button key={p.id} className="menu-item" onClick={() => { useStore.getState().navigate(p.id); setAsk(false) }}><PageIcon page={p} size={16} /> {p.title || 'Sem título'}</button>)}
            </div>
          )}
        </div>
        <form className="ai-input" onSubmit={e => { e.preventDefault(); if (q.trim()) ask(q.trim()) }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={asked ? 'Pergunte outra coisa…' : 'Pergunte qualquer coisa sobre o seu workspace…'} disabled={run.busy} />
          {run.busy
            ? <button type="button" className="ai-send stop" onClick={stop} title="Parar"><Square size={12} fill="currentColor" /></button>
            : <button className="ai-send" disabled={!q.trim()} title="Perguntar"><ArrowUp size={16} /></button>}
        </form>
      </div>
    </div>
  )
}
