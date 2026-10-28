import { useEffect, useState } from 'react'
import { Check, ChevronDown, Cloud, CloudOff, Eye, LoaderCircle, LogOut, PenLine, Plus, ShieldCheck, X } from 'lucide-react'
import { api, useAuth } from '../auth'
import { logout, switchWorkspace } from '../sync'
import { Pop } from './Pop'
import { useAccountUI } from './Account'

const ROLE = { owner: 'Proprietário', editor: 'Editor', viewer: 'Leitor' }
const I = { size: 16, strokeWidth: 1.8 }

export function SyncBadge() {
  const sync = useAuth(s => s.sync)
  const view = {
    idle: null,
    saving: <><LoaderCircle {...I} className="spin" /> Salvando…</>,
    saved: <><Cloud {...I} /> Salvo na nuvem</>,
    offline: <><CloudOff {...I} /> Offline — tentando novamente</>,
    readonly: <><Eye {...I} /> Somente leitura</>,
  }[sync]
  return <div className={`sync sync-${sync}`}>{view}</div>
}

const WsAvatar = ({ name, size = 22 }: { name: string; size?: number }) => (
  <span className="ws-avatar" style={{ width: size, height: size, fontSize: size * 0.55 }}>{(name || 'C')[0].toUpperCase()}</span>
)

export function WorkspaceMenu() {
  const { user, workspaces, workspaceId } = useAuth()
  const ws = workspaces.find(w => w.id === workspaceId)
  return (
    <Pop width={320} trigger={open => (
      <button className="ws-switch" onClick={open}>
        <WsAvatar name={ws?.name ?? 'CofDesk'} />
        <strong>{ws?.name ?? 'CofDesk'}</strong>
        <ChevronDown size={14} className="ico-muted" />
      </button>
    )}>
      {close => (
        <div>
          <div className="ws-card">
            <WsAvatar name={ws?.name ?? 'C'} size={36} />
            <div><strong>{ws?.name}</strong><div className="small muted">{ws ? ROLE[ws.role] : ''} · {user?.email}</div></div>
          </div>
          {ws?.role === 'owner' && (
            <button className="menu-item" onClick={async () => {
              const name = prompt('Renomear workspace', ws.name)
              if (!name) return
              const r = await api(`/workspaces/${ws.id}`, { method: 'PATCH', body: { name } })
              useAuth.getState().set({ workspaces: r.workspaces })
            }}><PenLine {...I} /> Renomear workspace</button>
          )}
          <div className="menu-sep" />
          <div className="popover-title">{user?.email}</div>
          {workspaces.map(w => (
            <button key={w.id} className="menu-item" onClick={() => { if (w.id !== workspaceId) switchWorkspace(w.id); close() }}>
              <WsAvatar name={w.name} size={20} />
              <span className="grow">{w.name}</span>
              {w.id === workspaceId && <Check {...I} />}
            </button>
          ))}
          <button className="menu-item muted-btn" onClick={async () => {
            const name = prompt('Nome do novo workspace')
            if (!name) return
            const r = await api('/workspaces', { body: { name } })
            useAuth.getState().set({ workspaces: r.workspaces })
            switchWorkspace(r.id)
            close()
          }}><Plus {...I} /> Novo espaço de trabalho</button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { close(); useAccountUI.getState().setOpen(true) }}><ShieldCheck {...I} /> Minha conta e privacidade</button>
          <button className="menu-item muted-btn" onClick={() => { close(); logout() }}><LogOut {...I} /> Sair</button>
        </div>
      )}
    </Pop>
  )
}

/** Members of the current workspace, with invite and remove for the owner. */
export function Members() {
  const workspaceId = useAuth(s => s.workspaceId)!
  const isOwner = useAuth(s => s.workspaces.find(w => w.id === s.workspaceId)?.role === 'owner')
  const [members, setMembers] = useState<{ id: string; name: string; email: string; role: keyof typeof ROLE }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [msg, setMsg] = useState('')
  const me = useAuth(s => s.user)
  const load = () => api(`/workspaces/${workspaceId}/members`).then(setMembers).catch(() => {})
  useEffect(() => { load() }, [workspaceId])

  return (
    <div className="members">
      {isOwner && (
        <form className="invite" onSubmit={async e => {
          e.preventDefault()
          setMsg('')
          try {
            await api(`/workspaces/${workspaceId}/members`, { body: { email, role } })
            setEmail(''); setMsg('Membro adicionado'); load()
          } catch (err) { setMsg((err as Error).message) }
        }}>
          <input className="input sm" type="email" required placeholder="E-mail, separado por vírgulas" value={email} onChange={e => setEmail(e.target.value)} />
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="editor">Editor</option><option value="viewer">Leitor</option>
          </select>
          <button className="btn primary">Convidar</button>
        </form>
      )}
      {msg && <div className="muted small pad-x">{msg}</div>}
      <div className="popover-title">Membros</div>
      {members.map(m => (
        <div key={m.id} className="member-row">
          <span className="avatar">{m.name[0]?.toUpperCase()}</span>
          <span className="member-info"><div>{m.name}{m.id === me?.id ? ' (você)' : ''}</div><small className="muted">{m.email}</small></span>
          <small className="muted">{ROLE[m.role]}</small>
          {isOwner && m.role !== 'owner' && (
            <button className="icon-btn" title="Remover" aria-label={`Remover ${m.name}`} onClick={() => api(`/workspaces/${workspaceId}/members/${m.id}`, { method: 'DELETE' }).then(load)}><X size={14} /></button>
          )}
        </div>
      ))}
    </div>
  )
}
