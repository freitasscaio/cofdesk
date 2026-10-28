import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { api, useAuth } from '../auth'
import { go } from '../nav'
import { apiUrl, desktop } from '../config'

type Step = 'email' | 'password' | 'register' | 'verify' | 'social'

/** Google's own mark, as its sign-in button guidelines ask. */
const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="logo" aria-hidden focusable="false">
      <rect x="3" y="3" width="26" height="26" rx="6" fill="var(--bg)" stroke="currentColor" strokeWidth="2.4" />
      <path d="M20.6 11.4a6.5 6.5 0 1 0 0 9.2" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Faint, blurred app skeleton shown behind the sign-up card. */
function Backdrop() {
  return (
    <div className="auth-backdrop" aria-hidden>
      <div className="bd-side">{Array.from({ length: 10 }, (_, i) => <div key={i} className="bd-line" style={{ width: `${50 + ((i * 37) % 40)}%` }} />)}</div>
      <div className="bd-main">
        <div className="bd-title" />
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="bd-line" style={{ width: `${60 + ((i * 23) % 35)}%` }} />)}
      </div>
    </div>
  )
}

export function Login() {
  const [signup, setSignup] = useState(() => location.pathname.startsWith('/signup'))
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [devConsole, setDevConsole] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  useEffect(() => {
    api('/auth/providers').then(r => setGoogle(r.google)).catch(() => setGoogle(false))
    // coming back from Google: trade the one-time code for a session
    const q = new URLSearchParams(location.search)
    if (q.get('oauth')) run(async () => enter(await api('/auth/finish', { body: { code: q.get('oauth') } })))
    if (q.get('oauth_error')) { setError(q.get('oauth_error')!); history.replaceState(null, '', location.pathname) }
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setError('')
    setBusy(true)
    try { await fn() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const enter = (r: any) => {
    history.replaceState(null, '', '/')
    useAuth.getState().set({ token: r.token, user: r.user, workspaces: r.workspaces, workspaceId: r.workspaces[0]?.id ?? null })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'email') run(async () => {
      const r = await api('/auth/check', { body: { email } })
      setStep(!r.exists ? 'register' : r.password ? 'password' : 'social')
    })
    else if (step === 'password') run(async () => enter(await api('/auth/login', { body: { email, password } })))
    else if (step === 'register') run(async () => {
      const r = await api('/auth/register', { body: { name, email, password } })
      setDevConsole(!!r.devConsole)
      setCode('')
      setResendIn(60)
      setStep('verify')
    })
    else if (step === 'verify') run(async () => enter(await api('/auth/verify', { body: { email, code } })))
  }

  const resend = () => run(async () => {
    await api('/auth/resend', { body: { email } })
    setResendIn(60)
  })

  const switchMode = () => {
    setSignup(!signup)
    setStep('email')
    setError('')
    history.replaceState(null, '', signup ? '/login' : '/signup')
  }

  const heading = signup ? 'CofDesk: seu espaço para pensar e criar.' : 'Pense, escreva e organize.'
  const sub = step === 'password' ? 'Digite sua senha para continuar'
    : step === 'register' ? 'Crie sua conta gratuita'
    : step === 'verify' ? 'Confirme seu e-mail'
    : step === 'social' ? 'Continue com a conta vinculada'
    : signup ? 'Inscreva-se com seu e-mail' : 'Faça login na sua conta do CofDesk'

  // in development the buttons always show (and explain when a provider isn't configured); in production only configured ones
  const showGoogle = google === true || (google === false && import.meta.env.DEV)
  // the desktop app signs in through the system browser, which hands the result back via cofdesk://
  const googleStart = apiUrl(`/auth/google/start${desktop ? '?client=desktop' : ''}`)
  const googleButton = <a className="btn auth-provider" href={googleStart}
    onClick={e => { if (desktop) { e.preventDefault(); desktop.openExternal(googleStart); setError('') } }}><GoogleMark /> Continuar com Google</a>

  const card = (
    <form className={`auth-card ${signup ? 'floating' : ''}`} onSubmit={submit}>
      <button type="button" className="auth-logo" onClick={() => go('/')} aria-label="Voltar à página inicial" title="Voltar à página inicial"><Logo /></button>
      <h1>{heading}<span>{sub}</span></h1>

      {step === 'email' && showGoogle && <>
        {googleButton}
        <div className="auth-or"><span>ou</span></div>
      </>}

      {step !== 'email' && (
        <button type="button" className="auth-email" onClick={() => { setStep('email'); setPassword(''); setError('') }}>
          <ArrowLeft size={14} /> {email}
        </button>
      )}

      {step === 'email' && (
        <label className="auth-field">
          {signup ? 'E-mail de trabalho' : 'E-mail'}
          <input className="input" type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
            placeholder={signup ? 'nome@empresa.com' : 'Insira seu endereço de e-mail…'} autoComplete="email" />
          {signup
            ? <span className="auth-tip"><b>Dica:</b> use seu e-mail de trabalho para facilitar a entrada da sua equipe no CofDesk</span>
            : <span className="auth-hint">Use o e-mail da sua equipe para colaborar com colegas</span>}
        </label>
      )}

      {step === 'register' && (
        <label className="auth-field">
          Como devemos chamar você? <span className="auth-optional">(opcional)</span>
          <input className="input" autoFocus value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Seu nome" autoComplete="name" />
          <span className="auth-hint">Aparece para as pessoas dos workspaces que você compartilhar.</span>
        </label>
      )}

      {step === 'social' && <>
        <p className="auth-hint center">Esta conta entra com o Google.</p>
        {googleButton}
      </>}

      {(step === 'password' || step === 'register') && (
        <label className="auth-field">
          {step === 'register' ? 'Crie uma senha' : 'Senha'}
          <input className="input" type="password" required autoFocus={step === 'password'} minLength={step === 'register' ? 8 : undefined}
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder={step === 'register' ? 'Mínimo de 8 caracteres' : 'Insira sua senha…'}
            autoComplete={step === 'register' ? 'new-password' : 'current-password'} />
        </label>
      )}

      {step === 'verify' && <>
        <p className="auth-hint center">
          Enviamos um código de 6 dígitos para <b>{email}</b>.
          {devConsole && <><br />(Desenvolvimento: o código aparece no terminal do servidor.)</>}
        </p>
        <label className="auth-field">
          Código de confirmação
          <input className="input auth-code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            pattern="\d{6}" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
        </label>
        <button type="button" className="auth-resend" disabled={resendIn > 0 || busy} onClick={resend}>
          {resendIn > 0 ? `Reenviar código em ${resendIn} s` : 'Reenviar código'}
        </button>
      </>}

      <div className="auth-error" role="alert" hidden={!error}>{error}</div>

      {step !== 'social' && <button className="btn primary auth-submit" disabled={busy}>
        {busy ? 'Aguarde…' : step === 'password' ? 'Entrar' : step === 'register' ? 'Criar conta' : step === 'verify' ? 'Confirmar e entrar' : 'Continuar'}
      </button>}

      <div className="auth-switch">
        {signup ? 'Usuário existente? ' : 'Novo usuário? '}
        <button type="button" onClick={switchMode}>{signup ? 'Fazer login' : 'Cadastre-se'}</button>
      </div>
      <p className="auth-legal">
        Ao continuar, você declara ter 18 anos ou mais, concorda com os <a href="/termos" target="_blank">Termos de Uso</a> e
        confirma que leu a <a href="/privacidade" target="_blank">Política de Privacidade</a> do CofDesk.
      </p>
    </form>
  )

  return signup
    ? <main className="auth auth-signup"><Backdrop />{card}</main>
    : <main className="auth">{card}</main>
}
