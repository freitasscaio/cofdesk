import { useEffect, useState } from 'react'
import {
  ClipboardCopy, Copy, Download, Image as ImageIcon, MessageSquare, MoreHorizontal, MoveHorizontal, RotateCcw, Smile,
  Star, Trash2, History as HistoryIcon,
} from 'lucide-react'
import { useStore } from '../store'
import type { Block, Page } from '../types'
import { useReadOnly } from '../readonly'
import { setPresence, useLive } from '../sync'
import { CommentsPanel, useCommentCounts, useCommentsUI } from './Comments'
import { Database } from './Database'
import { Editor } from './Editor'
import { IconPicker } from './IconPicker'
import { PageIcon } from './icons'
import { Pop } from './Pop'
import { PropertyCell, PropTypeIcon } from './PropertyCell'
import { ShareMenu } from './ShareMenu'
import { toMarkdown } from '../markdown'
import { VersionHistory } from './History'

const I = { size: 16, strokeWidth: 1.8 }
export const COVERS = [
  'linear-gradient(120deg,#f6d365,#fda085)', 'linear-gradient(120deg,#84fab0,#8fd3f4)',
  'linear-gradient(120deg,#a18cd1,#fbc2eb)', 'linear-gradient(120deg,#fccb90,#d57eeb)',
  'linear-gradient(120deg,#e0c3fc,#8ec5fc)', 'linear-gradient(120deg,#43e97b,#38f9d7)',
  'linear-gradient(120deg,#30cfd0,#330867)', 'linear-gradient(120deg,#434343,#000000)',
  '#e3e2e0', '#fadec9', '#dbeddb', '#d3e5ef',
]

function breadcrumbs(pages: Record<string, Page>, id: string) {
  const out: Page[] = []
  let p: Page | undefined = pages[id]
  while (p) { out.unshift(p); p = p.parentId ? pages[p.parentId] : undefined }
  return out
}

export { toMarkdown }

export function editedAgo(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'Editado agora'
  if (s < 3600) return `Editado há ${Math.floor(s / 60)} min`
  if (s < 86400) return `Editado há ${Math.floor(s / 3600)} h`
  return `Editado em ${new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
}

export function PageView({ id }: { id: string }) {
  const page = useStore(s => s.pages[id])
  const pages = useStore(s => s.pages)
  const { updatePage, navigate, trashPage, duplicatePage, restorePage, deleteForever } = useStore.getState()
  const readOnly = useReadOnly()
  const peers = useLive(s => s.peers)
  const counts = useCommentCounts()
  const commentsOpen = useCommentsUI(s => s.open)
  const toggleComments = useCommentsUI(s => s.toggle)
  useEffect(() => { if (!readOnly) setPresence(id) }, [id, readOnly])
  if (!page) return <div className="muted pad">Página não encontrada.</div>
  const parent = page.parentId ? pages[page.parentId] : undefined
  const isRow = parent?.kind === 'database'
  const here = peers.filter(p => p.pageId === id).filter((p, i, a) => a.findIndex(x => x.userId === p.userId) === i)
  const pageComments = [...counts.entries()].filter(([k]) => k.startsWith(id + ':')).reduce((n, [, v]) => n + v, 0)

  const download = () => {
    const blob = new Blob([toMarkdown(page, pages)], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${page.title || 'pagina'}.md`
    a.click()
  }
  const pickIcon = (icon: string) => updatePage(id, { icon: icon || undefined })

  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <div className="page-layout">
    <div className="page-wrap">
      <header className="topbar">
        <div className="crumbs">
          {breadcrumbs(pages, id).map((p, i, arr) => (
            <span key={p.id} className="crumb">
              <button onClick={() => navigate(p.id)}><PageIcon page={p} size={16} /><span>{p.title || 'Sem título'}</span></button>
              {i < arr.length - 1 && <span className="sep">/</span>}
            </span>
          ))}
        </div>
        {!readOnly && <div className="top-actions">
          <div className="peers">
            {here.map(p => <span key={p.clientId} className="avatar peer-avatar" style={{ background: p.color }} title={`${p.name} está nesta página`}>{p.name[0]}</span>)}
          </div>
          <span className="edited">{editedAgo(page.updatedAt)}</span>
          <ShareMenu pageId={id} />
          <button className={`icon-btn ${commentsOpen ? 'on' : ''}`} title="Ver todos os comentários" onClick={toggleComments}>
            <MessageSquare {...I} size={18} />{pageComments > 0 && <span className="count">{pageComments}</span>}
          </button>
          <button className="icon-btn" title={page.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onClick={() => updatePage(id, { favorite: !page.favorite })}>
            <Star {...I} size={18} fill={page.favorite ? '#e9b200' : 'none'} color={page.favorite ? '#e9b200' : 'currentColor'} />
          </button>
          <Pop width={260} trigger={o => <button className="icon-btn" onClick={o} title="Estilo, exportação e mais…"><MoreHorizontal {...I} size={18} /></button>}>
            {close => <>
              <button className="menu-item" onClick={() => { updatePage(id, { fullWidth: page.fullWidth === false }); close() }}>
                <MoveHorizontal {...I} /> <span className="grow">Largura total</span><span className={`switch ${page.fullWidth !== false ? 'on' : ''}`} />
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { navigator.clipboard.writeText(toMarkdown(page, pages)); close() }}><ClipboardCopy {...I} /> Copiar como Markdown</button>
              <button className="menu-item" onClick={() => { download(); close() }}><Download {...I} /> Exportar Markdown</button>
              <button className="menu-item" onClick={() => { navigate(duplicatePage(id)); close() }}><Copy {...I} /> Duplicar</button>
              <button className="menu-item" onClick={() => { setHistoryOpen(true); close() }}><HistoryIcon {...I} /> Histórico de versões</button>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={() => { trashPage(id); close() }}><Trash2 {...I} /> Mover para a lixeira</button>
              <div className="menu-foot">Última edição: {new Date(page.updatedAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </>}
          </Pop>
        </div>}
      </header>

      {page.trashed && (
        <div className="trash-banner">
          Esta página está na lixeira.
          <button onClick={() => restorePage(id)}><RotateCcw size={14} /> Restaurar página</button>
          <button onClick={() => { deleteForever(id); navigate(null) }}><Trash2 size={14} /> Excluir permanentemente</button>
        </div>
      )}

      {page.cover && (
        <div className="cover" style={{ background: page.cover }}>
          <Pop width={300} trigger={o => <button className="cover-btn" onClick={o}>Alterar capa</button>}>
            {close => <div className="cover-grid">
              {COVERS.map(c => <button key={c} style={{ background: c }} onClick={() => { updatePage(id, { cover: c }); close() }} />)}
              <button className="remove" onClick={() => { updatePage(id, { cover: undefined }); close() }}>Remover</button>
            </div>}
          </Pop>
        </div>
      )}

      <div className={`page ${page.fullWidth === false && page.kind !== 'database' ? 'narrow' : ''} ${page.cover ? 'has-cover' : ''} ${page.icon ? 'has-icon' : ''}`}>
        <div className="page-head">
          {page.icon && (
            <Pop width={380} trigger={o => <button className="page-icon" onClick={o} aria-label="Mudar ícone da página"><PageIcon page={page} size={72} /></button>}>
              {close => <IconPicker onPick={v => { pickIcon(v); close() }} />}
            </Pop>
          )}
          <div className="head-buttons">
            {!page.icon && (
              <Pop width={380} trigger={o => <button onClick={o}><Smile {...I} /> Adicionar ícone</button>}>
                {close => <IconPicker onPick={v => { pickIcon(v); close() }} />}
              </Pop>
            )}
            {!page.cover && <button onClick={() => updatePage(id, { cover: COVERS[Math.floor(Math.random() * 8)] })}><ImageIcon {...I} /> Adicionar capa</button>}
            {!readOnly && <button onClick={() => useCommentsUI.getState().openFor(null)}><MessageSquare {...I} /> Adicionar comentário</button>}
          </div>
          {/* the title field isn't a heading, so screen readers get one here */}
          <h1 className="sr-only">{page.title || 'Sem título'}</h1>
          <input
            className="page-title" aria-label="Título da página" value={page.title} placeholder="Sem título" autoFocus={!page.title && !readOnly} readOnly={readOnly}
            onChange={e => updatePage(id, { title: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter' && page.kind === 'page') {
                e.preventDefault()
                document.querySelector<HTMLElement>('.editor .editable')?.focus()
              }
            }}
          />
        </div>

        {isRow && parent && (
          <div className="props-panel">
            {(parent.schema ?? []).map(p => (
              <div key={p.id} className="prop-row">
                <span className="prop-name"><PropTypeIcon type={p.type} /> {p.name}</span>
                <div className="prop-value"><PropertyCell dbId={parent.id} prop={p} row={page} /></div>
              </div>
            ))}
          </div>
        )}

        {page.kind === 'database' ? <Database dbId={id} /> : <Editor key={id} pageId={id} />}
      </div>
    </div>
    {commentsOpen && !readOnly && <CommentsPanel pageId={id} />}
    {historyOpen && <VersionHistory pageId={id} onClose={() => setHistoryOpen(false)} />}
    </div>
  )
}
