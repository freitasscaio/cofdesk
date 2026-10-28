import { useEffect, useState } from 'react'
import { api, useAuth } from '../auth'
import { Pop } from './Pop'
import { ArrowUpRight, Check, Globe, Link2 } from 'lucide-react'
import { WEB_URL } from '../config'

export function ShareMenu({ pageId }: { pageId: string }) {
  const workspaceId = useAuth(s => s.workspaceId)
  const role = useAuth(s => s.workspaces.find(w => w.id === s.workspaceId)?.role)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState('')
  const base = `/workspaces/${workspaceId}/pages/${pageId}/share`

  useEffect(() => { api(base).then(r => setToken(r.token)).catch(() => {}) }, [base])

  const publicUrl = token ? `${WEB_URL}/p/${token}` : ''
  const internalUrl = `${WEB_URL}/#/${pageId}`
  const copy = (text: string, what: string) => { navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500) }

  return (
    <Pop width={360} trigger={open => <button className="pill share-btn" onClick={open}>{token && <Globe size={14} />}Compartilhar</button>}>
      {() => (
        <div className="share">
          <div className="popover-title">Membros do workspace</div>
          <p className="small muted">Todos os membros do workspace já veem esta página. Convide pessoas pelo menu do workspace.</p>
          <button className="btn" onClick={() => copy(internalUrl, 'interno')}>{copied === 'interno' ? <><Check size={15} /> Copiado</> : <><Link2 size={15} /> Copiar link da página</>}</button>

          <div className="popover-title">Publicar na web</div>
          {token ? (
            <>
              <p className="small muted">Qualquer pessoa com o link pode ver esta página e suas subpáginas (somente leitura).</p>
              <div className="share-link">
                <input className="input sm" readOnly value={publicUrl} onFocus={e => e.target.select()} />
                <button className="btn" onClick={() => copy(publicUrl, 'publico')}>{copied === 'publico' ? <Check size={15} /> : 'Copiar'}</button>
              </div>
              <div className="share-actions">
                <a className="link small" href={publicUrl} target="_blank" rel="noreferrer">Abrir página pública <ArrowUpRight size={13} /></a>
                {role !== 'viewer' && <button className="link small danger" onClick={() => api(base, { method: 'DELETE' }).then(r => setToken(r.token))}>Despublicar</button>}
              </div>
            </>
          ) : role === 'viewer' ? (
            <p className="small muted">Leitores não podem publicar páginas.</p>
          ) : (
            <>
              <p className="small muted">Crie um link público, sem login, para mostrar esta página a qualquer pessoa.</p>
              <button className="btn primary" onClick={() => api(base, { method: 'POST' }).then(r => setToken(r.token))}><Globe size={15} /> Publicar</button>
            </>
          )}
        </div>
      )}
    </Pop>
  )
}
