import { useEffect, useState } from 'react'
import { History as HistoryIcon, Loader, RotateCcw, X } from 'lucide-react'
import { useDialog } from '../a11y'
import { api, useAuth } from '../auth'
import { useStore } from '../store'
import type { Page } from '../types'
import { StaticBlock } from './Ai'
import { PageIcon } from './icons'

type Version = { id: number; startedAt: number; createdAt: number; author: string; title: string; blocks: number }

const when = (t: number) => {
  const d = new Date(t)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return today ? `Hoje, ${time}` : `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`
}

/** Page history: every editing session is kept on the server and can be previewed and restored. */
export function VersionHistory({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const dialog = useDialog(true, onClose)
  const ws = useAuth(s => s.workspaceId)
  const [list, setList] = useState<Version[] | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<Page | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api<Version[]>(`/workspaces/${ws}/pages/${pageId}/versions`)
      .then(v => { setList(v); if (v[0]) setSelected(v[0].id) })
      .catch(e => setError(e.message))
  }, [pageId])

  useEffect(() => {
    if (selected == null) return
    setLoading(true)
    api<Page>(`/workspaces/${ws}/versions/${selected}`).then(setPreview).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [selected])

  const restore = () => {
    if (!preview) return
    const { title, icon, cover, blocks, props, schema, views, fullWidth } = preview
    // restoring is itself a new edit, so the version being replaced stays in the history
    useStore.getState().updatePage(pageId, { title, icon, cover, blocks, props, schema, views, fullWidth })
    onClose()
  }

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div ref={dialog} className="modal history-modal" role="dialog" aria-modal="true" aria-label="Histórico de versões" onMouseDown={e => e.stopPropagation()}>
        <div className="history-preview">
          {loading && !preview ? <div className="ai-thinking"><Loader size={14} className="spin" /> Carregando…</div>
            : preview ? (
              <div className="history-page">
                {preview.icon && <div className="history-icon"><PageIcon page={preview} size={40} /></div>}
                <h1>{preview.title || 'Sem título'}</h1>
                {preview.kind === 'database'
                  ? <p className="muted">Banco de dados: {preview.schema?.length ?? 0} propriedades, {preview.views?.length ?? 0} visualizações.</p>
                  : preview.blocks.map(b => <StaticBlock key={b.id} block={b} />)}
              </div>
            ) : <div className="muted pad">{error || (list && !list.length ? 'Ainda não há versões salvas desta página. Elas aparecem conforme você edita.' : '')}</div>}
        </div>
        <aside className="history-list">
          <header><HistoryIcon size={16} /> Histórico de versões <button className="icon-btn" onClick={onClose}><X size={16} /></button></header>
          <div className="history-items">
            {!list && !error && <div className="ai-thinking"><Loader size={14} className="spin" /> Carregando…</div>}
            {list?.map((v, i) => (
              <button key={v.id} className={`history-item ${v.id === selected ? 'active' : ''}`} onClick={() => setSelected(v.id)}>
                <strong>{when(v.createdAt)}{i === 0 && <span className="history-now">atual</span>}</strong>
                <span>{v.author}</span>
              </button>
            ))}
          </div>
          <footer>
            <p className="muted small">O histórico é ilimitado. Restaurar não apaga nada: a versão de agora continua salva aqui.</p>
            <button className="btn primary" disabled={!preview || selected === list?.[0]?.id} onClick={restore}><RotateCcw size={14} /> Restaurar esta versão</button>
          </footer>
        </aside>
      </div>
    </div>
  )
}
