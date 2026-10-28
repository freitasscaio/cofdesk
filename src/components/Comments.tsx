import { allBlocks, blockText as plainText } from '../blocks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { api, useAuth } from '../auth'
import { useStore } from '../store'
import { useLive } from '../sync'
import { Pop } from './Pop'
import { Check, Inbox, RotateCcw, Trash2, X } from 'lucide-react'

export interface Comment {
  id: string; pageId: string; blockId: string | null; threadId: string; body: string; mentions: string[]
  resolved: boolean; createdAt: number; editedAt: number | null; userId: string; userName: string; read?: boolean
}
interface Member { id: string; name: string; email: string }

/** Which page's comment panel is open, and which block a new thread should attach to. */
export const useCommentsUI = create<{ open: boolean; blockId: string | null; toggle: () => void; openFor: (blockId: string | null) => void }>(set => ({
  open: false, blockId: null,
  toggle: () => set(s => ({ open: !s.open, blockId: null })),
  openFor: blockId => set({ open: true, blockId }),
}))

const ws = () => useAuth.getState().workspaceId

export function useMembers() {
  const workspaceId = useAuth(s => s.workspaceId)
  const [members, setMembers] = useState<Member[]>([])
  useEffect(() => { if (workspaceId) api(`/workspaces/${workspaceId}/members`).then(setMembers).catch(() => {}) }, [workspaceId])
  return members
}

/** Open comment count per "pageId:blockId" (blockId empty for page-level threads). */
export function useCommentCounts() {
  const version = useLive(s => s.commentsVersion)
  const workspaceId = useAuth(s => s.workspaceId)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (!workspaceId) return
    api<{ pageId: string; blockId: string | null; n: number }[]>(`/workspaces/${workspaceId}/comment-counts`)
      .then(rows => setCounts(new Map(rows.map(r => [`${r.pageId}:${r.blockId ?? ''}`, r.n])))).catch(() => {})
  }, [workspaceId, version])
  return counts
}

const timeAgo = (t: number) => {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/** Renders "@Name" mentions as highlighted chips. */
function Body({ text, members }: { text: string; members: Member[] }) {
  const names = members.map(m => m.name).sort((a, b) => b.length - a.length)
  if (!names.length) return <>{text}</>
  const re = new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  const parts = text.split(re)
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="mention">@{p}</span> : p))}</>
}

function Composer({ placeholder, onSend, autoFocus }: { placeholder: string; onSend: (body: string, mentions: string[]) => Promise<void>; autoFocus?: boolean }) {
  const members = useMembers()
  const me = useAuth(s => s.user)
  const [text, setText] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const matches = query == null ? [] : members.filter(m => m.id !== me?.id && m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5)

  const onChange = (v: string) => {
    setText(v)
    const m = v.slice(0, ref.current?.selectionStart ?? v.length).match(/@([^\s@]*)$/)
    setQuery(m ? m[1] : null)
  }
  const pick = (m: Member) => {
    setText(text.replace(/@([^\s@]*)$/, `@${m.name} `))
    setQuery(null)
    ref.current?.focus()
  }
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    const mentions = members.filter(m => text.includes(`@${m.name}`)).map(m => m.id)
    try { await onSend(text, mentions); setText('') } finally { setBusy(false) }
  }
  return (
    <div className="composer">
      <textarea ref={ref} rows={2} autoFocus={autoFocus} placeholder={placeholder} value={text}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (matches.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pick(matches[0]); return }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
        }} />
      {matches.length > 0 && (
        <div className="mention-list">
          {matches.map(m => <button key={m.id} className="menu-item" onMouseDown={e => { e.preventDefault(); pick(m) }}><span className="avatar">{m.name[0]}</span>{m.name}</button>)}
        </div>
      )}
      <button className="btn primary" disabled={!text.trim() || busy} onClick={send}>Enviar</button>
    </div>
  )
}

export function CommentsPanel({ pageId }: { pageId: string }) {
  const { blockId, toggle, openFor } = useCommentsUI()
  const version = useLive(s => s.commentsVersion)
  const page = useStore(s => s.pages[pageId])
  const me = useAuth(s => s.user)
  const role = useAuth(s => s.workspaces.find(w => w.id === s.workspaceId)?.role)
  const members = useMembers()
  const [comments, setComments] = useState<Comment[]>([])
  const [showResolved, setShowResolved] = useState(false)

  const load = () => api<Comment[]>(`/workspaces/${ws()}/pages/${pageId}/comments`).then(setComments).catch(() => {})
  useEffect(() => { load() }, [pageId, version])
  useEffect(() => () => document.querySelectorAll('.block.highlight').forEach(e => e.classList.remove('highlight')), [])

  const threads = useMemo(() => {
    const map = new Map<string, Comment[]>()
    for (const c of comments) map.set(c.threadId, [...(map.get(c.threadId) ?? []), c])
    return [...map.values()].filter(t => showResolved || !t[0].resolved)
  }, [comments, showResolved])

  const post = async (body: string, mentions: string[], extra: { blockId?: string | null; threadId?: string }) => {
    await api(`/workspaces/${ws()}/pages/${pageId}/comments`, { body: { body, mentions, ...extra } })
    load()
  }
  const blockText = (id: string | null) => {
    const b = id ? allBlocks(page?.blocks ?? []).find(x => x.id === id) : null
    if (!id) return null
    return b ? plainText(b).slice(0, 80) || '(bloco vazio)' : '(bloco removido)'
  }

  return (
    <aside className="comments-panel">
      <div className="comments-head">
        <strong>Comentários</strong>
        <label className="small muted"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Resolvidos</label>
        <button className="icon-btn" onClick={toggle} title="Fechar"><X size={16} /></button>
      </div>

      <div className="new-thread">
        {blockId && <div className="quote-line">“{blockText(blockId)}” <button className="icon-btn" onClick={() => openFor(null)}><X size={14} /></button></div>}
        <Composer key={blockId ?? 'page'} autoFocus placeholder={blockId ? 'Comentar neste bloco… use @ para mencionar' : 'Comentar na página… use @ para mencionar'}
          onSend={(b, m) => post(b, m, { blockId }).then(() => openFor(null))} />
      </div>

      {!threads.length && <div className="muted pad small">Nenhum comentário ainda.</div>}
      {threads.map(thread => {
        const first = thread[0]
        return (
          <div key={first.threadId} className={`thread ${first.resolved ? 'resolved' : ''}`}
            onMouseEnter={() => first.blockId && document.querySelector(`[data-block-wrap="${first.blockId}"]`)?.classList.add('highlight')}
            onMouseLeave={() => document.querySelectorAll('.block.highlight').forEach(e => e.classList.remove('highlight'))}>
            {first.blockId && <div className="quote-line">“{blockText(first.blockId)}”</div>}
            {thread.map(c => (
              <div key={c.id} className="comment">
                <div className="comment-meta">
                  <span className="avatar">{c.userName[0]}</span>
                  <strong>{c.userName}</strong>
                  <span className="muted small">{timeAgo(c.createdAt)}{c.editedAt ? ' (editado)' : ''}</span>
                  {(c.userId === me?.id || role === 'owner') && (
                    <button className="icon-btn small" title="Excluir" onClick={() => api(`/workspaces/${ws()}/comments/${c.id}`, { method: 'DELETE' }).then(load)}><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="comment-body"><Body text={c.body} members={members} /></div>
              </div>
            ))}
            <div className="thread-actions">
              <button className="link small" onClick={() => api(`/workspaces/${ws()}/comments/${first.id}`, { method: 'PATCH', body: { resolved: !first.resolved } }).then(load)}>
                {first.resolved ? <><RotateCcw size={13} /> Reabrir</> : <><Check size={13} /> Resolver</>}
              </button>
            </div>
            {!first.resolved && <Composer placeholder="Responder…" onSend={(b, m) => post(b, m, { threadId: first.threadId })} />}
          </div>
        )
      })}
    </aside>
  )
}

/** Sidebar button listing comments that mention the current user. */
export function InboxButton() {
  const version = useLive(s => s.inboxVersion)
  const workspaceId = useAuth(s => s.workspaceId)
  const pages = useStore(s => s.pages)
  const members = useMembers()
  const [items, setItems] = useState<Comment[]>([])
  const load = () => { if (workspaceId) api<Comment[]>(`/workspaces/${workspaceId}/inbox`).then(setItems).catch(() => {}) }
  useEffect(load, [workspaceId, version])
  const unread = items.filter(i => !i.read)

  const markRead = (ids: string[]) => api(`/workspaces/${workspaceId}/inbox/read`, { body: { ids } }).then(load)

  return (
    <Pop width={340} trigger={open => (
      <button className="side-btn" onClick={open}><Inbox size={18} strokeWidth={1.8} /> Caixa de entrada {unread.length > 0 && <span className="badge">{unread.length}</span>}</button>
    )}>
      {close => (
        <div>
          <div className="comments-head">
            <strong>Menções</strong>
            {unread.length > 0 && <button className="link small" onClick={() => markRead(unread.map(i => i.id))}>Marcar tudo como lido</button>}
          </div>
          {!items.length && <div className="muted pad small">Quando alguém mencionar você com @, aparece aqui.</div>}
          {items.map(c => (
            <button key={c.id} className={`inbox-item ${c.read ? '' : 'unread'}`} onClick={async () => {
              await markRead([c.id])
              useStore.getState().navigate(c.pageId)
              useCommentsUI.getState().openFor(null)
              close()
            }}>
              <div className="small"><strong>{c.userName}</strong> mencionou você em <strong>{pages[c.pageId]?.title || 'Sem título'}</strong> · <span className="muted">{timeAgo(c.createdAt)}</span></div>
              <div className="inbox-body"><Body text={c.body} members={members} /></div>
            </button>
          ))}
        </div>
      )}
    </Pop>
  )
}
