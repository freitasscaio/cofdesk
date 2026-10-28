import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Download, Trash2, X } from 'lucide-react'
import { api, useAuth } from '../auth'
import { useConsent } from '../consent'
import { useStore } from '../store'
import { logout } from '../sync'
import { useDialog } from '../a11y'
import { go } from '../nav'

export const useAccountUI = create<{ open: boolean; setOpen: (open: boolean) => void }>(set => ({ open: false, setOpen: open => set({ open }) }))

type Preview = { workspaces: { id: string; name: string; heir: { id: string; name: string } | null }[]; password: boolean }

/** "Minha conta e privacidade": correct, download and delete your data (LGPD art. 18). */
export function AccountDialog() {
  const setOpen = useAccountUI(s => s.setOpen)
  const close = () => setOpen(false)
  const ref = useDialog(true, close)
  const user = useAuth(s => s.user)!
  const [name, setName] = useState(user.name)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await api('/me', { method: 'PATCH', body: { name } })
    useAuth.getState().set({ user: r.user })
    setMsg('Nome atualizado.')
  }

  const download = async () => {
    setBusy(true)
    try {
      const data = await api('/me/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: `cofdesk-meus-dados-${new Date().toISOString().slice(0, 10)}.json` })
      a.click()
      URL.revokeObjectURL(url)
      setMsg('Download iniciado.')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/me/delete', { body: { email: confirmEmail, password } })
      close()
      useStore.setState({ pages: {}, currentId: null })
      await logout()
      go('/')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t) } }, [msg])

  return (
    <div className="modal-bg" onMouseDown={close}>
      <div ref={ref} className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={e => e.stopPropagation()}>
        <div className="account-head">
          <h2 id="account-title">Minha conta e privacidade</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Fechar"><X size={16} aria-hidden /></button>
        </div>

        <section aria-labelledby="acc-profile">
          <h3 id="acc-profile">Seus dados</h3>
          <form className="account-row" onSubmit={saveName}>
            <label htmlFor="acc-name">Nome</label>
            <input id="acc-name" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoComplete="name" />
            <button className="btn" disabled={!name.trim() || name.trim() === user.name}>Salvar</button>
          </form>
          <div className="account-row">
            <span className="account-label">E-mail</span>
            <span>{user.email}</span>
          </div>
        </section>

        <section aria-labelledby="acc-export">
          <h3 id="acc-export">Baixar meus dados</h3>
          <p className="muted">Um arquivo JSON com sua conta, logins vinculados, agendas conectadas, workspaces e páginas, comentários e registros de acesso.</p>
          <button type="button" className="btn" onClick={download} disabled={busy}><Download size={14} aria-hidden /> Baixar meus dados</button>
        </section>

        <section aria-labelledby="acc-cookies">
          <h3 id="acc-cookies">Cookies e documentos</h3>
          <div className="account-links">
            <button type="button" className="btn" onClick={() => { close(); useConsent.getState().setOpen(true) }}>Preferências de cookies</button>
            <a className="btn" href="/privacidade" target="_blank">Política de Privacidade</a>
            <a className="btn" href="/termos" target="_blank">Termos de Uso</a>
          </div>
        </section>

        <section aria-labelledby="acc-delete" className="account-danger">
          <h3 id="acc-delete">Excluir conta</h3>
          {!preview ? <>
            <p className="muted">Apaga sua conta, suas sessões, seus comentários e as agendas conectadas. Não dá para desfazer.</p>
            <button type="button" className="btn danger" onClick={() => api('/me/deletion').then(setPreview).catch(e => setError(e.message))}>
              <Trash2 size={14} aria-hidden /> Quero excluir minha conta
            </button>
          </> : (
            <form onSubmit={remove}>
              {preview.workspaces.length > 0 && (
                <ul className="account-list">
                  {preview.workspaces.map(w => (
                    <li key={w.id}><strong>{w.name}</strong>: {w.heir ? `passa para ${w.heir.name}, que continua com acesso ao conteúdo` : 'será excluído com todas as páginas'}</li>
                  ))}
                </ul>
              )}
              <p className="muted">Os registros de acesso (IP, data e hora) ficam guardados por 6 meses por exigência do Marco Civil da Internet e depois são apagados.</p>
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
        </section>
        <div className="account-status" role="status">{msg}</div>
      </div>
    </div>
  )
}
