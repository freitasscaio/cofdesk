import { useEffect, useState } from 'react'
import {
  CalendarDays, Download, Globe, Info, LogOut, Search, Settings as Gear, ShieldCheck, SlidersHorizontal, Trash2, Upload, Users, X,
  type LucideIcon,
} from 'lucide-react'
import { api, useAuth } from '../auth'
import { useConsent } from '../consent'
import { useStore } from '../store'
import { logout } from '../sync'
import { useDialog } from '../a11y'
import { go } from '../nav'
import { useSettingsUI, type SettingsSection } from '../settingsUI'
import { Members } from './WorkspaceMenu'
import { PageIcon } from './icons'
import { WEB_URL } from '../config'

const I = { size: 16, strokeWidth: 1.8 }

export const Avatar = ({ name, size = 22 }: { name: string; size?: number }) => (
  <span className="user-avatar" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>{(name || 'C')[0].toUpperCase()}</span>
)

/** Settings: a dialog with the sections on the left and the chosen one on the right. */
export function SettingsDialog() {
  const { section, open, close } = useSettingsUI()
  const ref = useDialog(true, close)
  const user = useAuth(s => s.user)!
  const ws = useAuth(s => s.workspaces.find(w => w.id === s.workspaceId))
  const [query, setQuery] = useState('')

  const groups: { title: string; items: { id: SettingsSection; label: string; icon: LucideIcon | null }[] }[] = [
    { title: 'Conta', items: [
      { id: 'perfil', label: user.name, icon: null },
      { id: 'preferencias', label: 'Preferências', icon: SlidersHorizontal },
      { id: 'agendas', label: 'Agendas conectadas', icon: CalendarDays },
      { id: 'privacidade', label: 'Privacidade e dados', icon: ShieldCheck },
    ] },
    { title: 'Espaço de trabalho', items: [
      { id: 'geral', label: 'Geral', icon: Gear },
      { id: 'pessoas', label: 'Pessoas', icon: Users },
      { id: 'dados', label: 'Importar e exportar', icon: Download },
      { id: 'publicas', label: 'Páginas públicas', icon: Globe },
    ] },
    { title: 'CofDesk', items: [{ id: 'sobre', label: 'Sobre e documentos legais', icon: Info }] },
  ]
  const q = query.trim().toLowerCase()

  return (
    <div className="modal-bg settings-bg" onMouseDown={close}>
      <div ref={ref} className="settings" role="dialog" aria-modal="true" aria-label="Configurações" onMouseDown={e => e.stopPropagation()}>
        <nav className="settings-nav" aria-label="Seções das configurações">
          <label className="settings-search">
            <Search size={14} aria-hidden />
            <input type="search" placeholder="Buscar configurações" aria-label="Buscar configurações" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          {groups.map(g => {
            const items = g.items.filter(x => !q || x.label.toLowerCase().includes(q) || g.title.toLowerCase().includes(q))
            if (!items.length) return null
            return (
              <div key={g.title}>
                <div className="settings-group">{g.title}</div>
                {items.map(x => (
                  <button key={x.id} type="button" className={`settings-item ${section === x.id ? 'on' : ''}`} aria-current={section === x.id ? 'page' : undefined} onClick={() => open(x.id)}>
                    {x.icon ? <x.icon {...I} aria-hidden /> : <Avatar name={user.name} size={18} />}
                    <span>{x.label}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="settings-body">
          <button type="button" className="icon-btn settings-close" onClick={close} aria-label="Fechar configurações"><X size={18} aria-hidden /></button>
          <div className="settings-content">
            {section === 'perfil' && <Profile />}
            {section === 'preferencias' && <Preferences />}
            {section === 'agendas' && <Calendars />}
            {section === 'privacidade' && <Privacy />}
            {section === 'geral' && <General />}
            {section === 'pessoas' && <><Head title="Pessoas" sub={`Quem tem acesso a ${ws?.name ?? 'este espaço de trabalho'}.`} /><Members /></>}
            {section === 'dados' && <ImportExport />}
            {section === 'publicas' && <PublicPages />}
            {section === 'sobre' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}

const Head = ({ title, sub }: { title: string; sub?: string }) => (
  <header className="settings-head"><h2>{title}</h2>{sub && <p>{sub}</p>}</header>
)

/** One setting: name and explanation on the left, the control on the right. */
const Row = ({ title, desc, children, id }: { title: string; desc?: React.ReactNode; children?: React.ReactNode; id?: string }) => (
  <div className="set-row">
    <div className="set-text"><div className="set-title" id={id}>{title}</div>{desc && <div className="set-desc">{desc}</div>}</div>
    {children && <div className="set-control">{children}</div>}
  </div>
)

function useNotice() {
  const [msg, setMsg] = useState('')
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t) } }, [msg])
  return [<div key="n" className="settings-status" role="status">{msg}</div>, setMsg] as const
}

function Profile() {
  const user = useAuth(s => s.user)!
  const [name, setName] = useState(user.name)
  const [notice, say] = useNotice()
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const r = await api('/me', { method: 'PATCH', body: { name } })
      useAuth.getState().set({ user: r.user })
      say('Nome atualizado.')
    } catch (err) { say((err as Error).message) }
  }
  return (
    <>
      <Head title="Perfil" />
      <div className="profile-card">
        <Avatar name={user.name} size={56} />
        <form className="profile-name" onSubmit={save}>
          <label htmlFor="set-name">Nome preferido</label>
          <div className="inline-form">
            <input id="set-name" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoComplete="name" />
            <button className="btn" disabled={!name.trim() || name.trim() === user.name}>Salvar</button>
          </div>
        </form>
      </div>
      <h3 className="settings-sub">Segurança da conta</h3>
      <Row title="E-mail" desc={user.email} />
      <Row title="Sair" desc="Encerra a sessão neste navegador.">
        <button type="button" className="btn" onClick={() => { useSettingsUI.getState().close(); logout() }}><LogOut {...I} aria-hidden /> Sair</button>
      </Row>
      {notice}
    </>
  )
}

function Preferences() {
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  return (
    <>
      <Head title="Preferências" />
      <h3 className="settings-sub">Aparência</h3>
      <Row title="Tema" desc="Escolha a aparência do CofDesk neste dispositivo." id="pref-theme">
        <select value={theme} onChange={e => setTheme(e.target.value as typeof theme)} aria-labelledby="pref-theme">
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </Row>
      <h3 className="settings-sub">Cookies</h3>
      <Row title="Preferências de cookies" desc="Escolha se vídeos, mapas e outros conteúdos de terceiros podem carregar.">
        <button type="button" className="btn" onClick={() => useConsent.getState().setOpen(true)}>Personalizar</button>
      </Row>
    </>
  )
}

type Connection = { id: string; provider: 'google' | 'icloud'; account: string; createdAt: number }

function Calendars() {
  const [list, setList] = useState<Connection[] | null>(null)
  const [notice, say] = useNotice()
  useEffect(() => { api('/calendar/connections').then(r => setList(r.connections)).catch(e => say(e.message)) }, [])
  return (
    <>
      <Head title="Agendas conectadas" sub="Eventos do Google Agenda e do iCloud aparecem no calendário do CofDesk. O acesso é somente leitura." />
      {list && !list.length && <p className="set-desc">Nenhuma agenda conectada.</p>}
      {list?.map(c => (
        <Row key={c.id} title={c.provider === 'google' ? 'Google Agenda' : 'iCloud'} desc={`${c.account} · conectada em ${new Date(c.createdAt).toLocaleDateString('pt-BR')}`}>
          <button type="button" className="btn" aria-label={`Desconectar ${c.account}`} onClick={() =>
            api(`/calendar/connections/${c.id}`, { method: 'DELETE' }).then(r => { setList(r.connections); say('Agenda desconectada.') }).catch(e => say(e.message))
          }>Desconectar</button>
        </Row>
      ))}
      <Row title="Conectar uma agenda" desc="Abra o calendário para conectar o Google Agenda ou o iCloud.">
        <button type="button" className="btn" onClick={() => { useSettingsUI.getState().close(); useStore.getState().openCalendar() }}>Abrir calendário</button>
      </Row>
      {notice}
    </>
  )
}

type Preview = { workspaces: { id: string; name: string; heir: { id: string; name: string } | null }[]; password: boolean }

/** Correct, download and delete your data (LGPD art. 18). */
function Privacy() {
  const user = useAuth(s => s.user)!
  const [notice, say] = useNotice()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const download = async () => {
    setBusy(true)
    try {
      const data = await api('/me/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      Object.assign(document.createElement('a'), { href: url, download: `cofdesk-meus-dados-${new Date().toISOString().slice(0, 10)}.json` }).click()
      URL.revokeObjectURL(url)
      say('Download iniciado.')
    } catch (e) { say((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/me/delete', { body: { email: confirmEmail, password } })
      useSettingsUI.getState().close()
      useStore.setState({ pages: {}, currentId: null })
      await logout()
      go('/')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <Head title="Privacidade e dados" sub="Seus direitos pela LGPD: acessar, corrigir, levar e excluir seus dados." />
      <Row title="Baixar meus dados" desc="Um arquivo JSON com sua conta, logins vinculados, agendas conectadas, workspaces e páginas, comentários e registros de acesso.">
        <button type="button" className="btn" onClick={download} disabled={busy}><Download {...I} aria-hidden /> Baixar</button>
      </Row>
      <Row title="Preferências de cookies" desc="O CofDesk não usa cookies de rastreamento. Escolha se conteúdos de terceiros podem carregar.">
        <button type="button" className="btn" onClick={() => useConsent.getState().setOpen(true)}>Personalizar</button>
      </Row>
      <Row title="Política de Privacidade" desc="Como tratamos seus dados.">
        <a className="btn" href="/privacidade" target="_blank">Abrir</a>
      </Row>

      <h3 className="settings-sub danger-title">Zona de perigo</h3>
      <Row title="Excluir minha conta" desc="Apaga sua conta, suas sessões, seus comentários e as agendas conectadas. Não dá para desfazer.">
        {!preview && (
          <button type="button" className="btn danger" onClick={() => api('/me/deletion').then(setPreview).catch(e => setError(e.message))}>
            <Trash2 {...I} aria-hidden /> Excluir conta
          </button>
        )}
      </Row>
      {preview && (
        <form className="delete-form" onSubmit={remove}>
          {preview.workspaces.length > 0 && (
            <ul className="account-list">
              {preview.workspaces.map(w => (
                <li key={w.id}><strong>{w.name}</strong>: {w.heir ? `passa para ${w.heir.name}, que continua com acesso ao conteúdo` : 'será excluído com todas as páginas'}</li>
              ))}
            </ul>
          )}
          <p className="set-desc">Os registros de acesso (IP, data e hora) ficam guardados por 6 meses por exigência do Marco Civil da Internet e depois são apagados.</p>
          <label className="auth-field">
            Digite seu e-mail para confirmar
            <input className="input" type="email" required value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} autoComplete="off" />
          </label>
          {preview.password && (
            <label className="auth-field">
              Senha
              <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          )}
          <div className="account-links">
            <button type="button" className="btn" onClick={() => { setPreview(null); setError('') }}>Cancelar</button>
            <button className="btn danger-solid" disabled={busy || confirmEmail.trim().toLowerCase() !== user.email}>Excluir minha conta definitivamente</button>
          </div>
        </form>
      )}
      <div className="auth-error" role="alert" hidden={!error}>{error}</div>
      {notice}
    </>
  )
}

function General() {
  const ws = useAuth(s => s.workspaces.find(w => w.id === s.workspaceId))!
  const [name, setName] = useState(ws.name)
  const [notice, say] = useNotice()
  const owner = ws.role === 'owner'
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const r = await api(`/workspaces/${ws.id}`, { method: 'PATCH', body: { name } })
      useAuth.getState().set({ workspaces: r.workspaces })
      say('Nome do espaço de trabalho atualizado.')
    } catch (err) { say((err as Error).message) }
  }
  const ROLE = { owner: 'Proprietário', editor: 'Editor', viewer: 'Leitor' }
  return (
    <>
      <Head title="Geral" />
      <form onSubmit={save}>
        <Row title="Nome" desc={owner ? 'O nome do seu espaço de trabalho.' : 'Apenas o proprietário pode mudar o nome.'} id="ws-name">
          <div className="inline-form">
            <input className="input" aria-labelledby="ws-name" value={name} maxLength={80} disabled={!owner} onChange={e => setName(e.target.value)} />
            {owner && <button className="btn" disabled={!name.trim() || name.trim() === ws.name}>Salvar</button>}
          </div>
        </Row>
      </form>
      <Row title="Seu papel" desc={ROLE[ws.role]} />
      {notice}
    </>
  )
}

function ImportExport() {
  const pages = useStore(s => s.pages)
  const [notice, say] = useNotice()
  const exportAll = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(pages, null, 2)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `cofdesk-backup-${new Date().toISOString().slice(0, 10)}.json` }).click()
    URL.revokeObjectURL(url)
  }
  const importAll = (file: File) => file.text().then(t => {
    try {
      if (confirm('Substituir todo o espaço de trabalho pelo backup?')) { useStore.getState().importData(JSON.parse(t)); say('Backup importado.') }
    } catch { say('Arquivo inválido.') }
  })
  return (
    <>
      <Head title="Importar e exportar" sub="Faça cópias do seu espaço de trabalho ou restaure uma cópia." />
      <Row title="Exportar backup" desc="Todas as páginas e bancos de dados deste espaço de trabalho em um arquivo JSON.">
        <button type="button" className="btn" onClick={exportAll}><Download {...I} aria-hidden /> Exportar</button>
      </Row>
      <Row title="Importar backup" desc="Substitui o conteúdo deste espaço de trabalho pelo de um arquivo exportado pelo CofDesk.">
        <label className="btn file-btn"><Upload {...I} aria-hidden /> Importar
          <input type="file" accept=".json" className="sr-only" onChange={e => e.target.files?.[0] && importAll(e.target.files[0])} />
        </label>
      </Row>
      {notice}
    </>
  )
}

type Share = { token: string; pageId: string; createdAt: number; createdBy: string }

function PublicPages() {
  const ws = useAuth(s => s.workspaceId)!
  const canEdit = useAuth(s => s.workspaces.find(w => w.id === s.workspaceId)?.role !== 'viewer')
  const pages = useStore(s => s.pages)
  const [list, setList] = useState<Share[] | null>(null)
  const [notice, say] = useNotice()
  const load = () => api(`/workspaces/${ws}/shares`).then(setList).catch(e => say(e.message))
  useEffect(() => { load() }, [ws])
  return (
    <>
      <Head title="Páginas públicas" sub="Páginas deste espaço de trabalho que qualquer pessoa com o link pode ver." />
      {list && !list.length && <p className="set-desc">Nenhuma página publicada.</p>}
      {list?.map(s => {
        const page = pages[s.pageId]
        const title = page?.title || 'Sem título'
        return (
          <div key={s.token} className="set-row">
            <div className="set-text">
              <div className="set-title public-title">{page && <PageIcon page={page} size={16} />} {title}</div>
              <div className="set-desc">Publicada por {s.createdBy} em {new Date(s.createdAt).toLocaleDateString('pt-BR')}</div>
            </div>
            <div className="set-control">
              <a className="btn" href={`${WEB_URL}/p/${s.token}`} target="_blank" rel="noopener">Abrir</a>
              {canEdit && (
                <button type="button" className="btn" aria-label={`Tirar ${title} do ar`} onClick={() =>
                  api(`/workspaces/${ws}/pages/${s.pageId}/share`, { method: 'DELETE' }).then(() => { load(); say('Página tirada do ar.') }).catch(e => say(e.message))
                }>Tirar do ar</button>
              )}
            </div>
          </div>
        )
      })}
      {notice}
    </>
  )
}

function About() {
  return (
    <>
      <Head title="Sobre e documentos legais" />
      <Row title="CofDesk" desc="Versão 0.1.0" />
      {([['Política de Privacidade', '/privacidade'], ['Termos de Uso', '/termos'], ['Cookies e armazenamento', '/cookies'], ['Licenças de código aberto', '/licencas']] as const).map(([t, href]) => (
        <Row key={href} title={t}><a className="btn" href={href} target="_blank">Abrir</a></Row>
      ))}
    </>
  )
}
