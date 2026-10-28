import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { PageView } from './components/PageView'
import { Login } from './components/Login'
import { Landing } from './components/Landing'
import { PublicPage } from './components/PublicPage'
import { Legal, legalDocOf } from './components/Legal'
import { ConsentBanner } from './components/Consent'
import { SettingsDialog } from './components/Settings'
import { useSettingsUI } from './settingsUI'
import { Home } from './components/Home'
import { CalendarHome, useCalendarNotice } from './components/CalendarHome'
import { Search } from './components/Search'
import { AskAi, useAiUI } from './components/Ai'
import { ApiError, api, useAuth } from './auth'
import { logout, startSync } from './sync'

const publicToken = location.pathname.match(/^\/p\/([\w-]+)/)?.[1]
const pageFromHash = () => location.hash.match(/^#\/([\w-]+)/)?.[1] ?? null

function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  return path
}

export default function App() {
  const path = usePath()
  const doc = legalDocOf(path)
  return (
    <>
      {doc ? <Legal doc={doc} /> : publicToken ? <PublicPage token={publicToken} /> : <PrivateApp />}
      <ConsentBanner />
    </>
  )
}

function PrivateApp() {
  const token = useAuth(s => s.token)
  const workspaceId = useAuth(s => s.workspaceId)
  const [ready, setReady] = useState(false)
  const path = usePath()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setReady(false)
    api('/me')
      .then(async r => {
        const ids = r.workspaces.map((w: { id: string }) => w.id)
        const ws = ids.includes(workspaceId) ? workspaceId : ids[0]
        useAuth.getState().set({ user: r.user, workspaces: r.workspaces, workspaceId: ws })
        await startSync(ws)
        const fromLink = pageFromHash()
        if (fromLink && useStore.getState().pages[fromLink]) useStore.getState().navigate(fromLink)
      })
      .catch(e => { if (e instanceof ApiError && e.status === 401) logout(); else useAuth.getState().set({ sync: 'offline' }) })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [token])

  // logged out: the product presentation, with sign-in and sign-up on their own paths
  if (!token) return path.startsWith('/login') || path.startsWith('/signup') ? <Login key={path} /> : <Landing />
  if (!ready) return <div className="loading">Carregando seu workspace…</div>
  return <Workspace />
}

function Workspace() {
  const currentId = useStore(s => s.currentId)
  const theme = useStore(s => s.theme)
  const sidebarOpen = useStore(s => s.sidebarOpen)
  const searchOpen = useStore(s => s.searchOpen)
  const calendarOpen = useStore(s => s.calendarOpen)
  const askOpen = useAiUI(s => s.ask)
  const settingsOpen = useSettingsUI(s => s.section !== null)
  const { setSearchOpen, toggleSidebar } = useStore.getState()

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  // back from connecting a calendar (Google sends the browser to /?calendar=…)
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (!q.has('calendar') && !q.has('calendar_error')) return
    useCalendarNotice.getState().set(q.get('calendar_error') ? { error: q.get('calendar_error')! } : { ok: 'Google Agenda conectada.' })
    useStore.getState().openCalendar()
    history.replaceState(null, '', '/')
  }, [])

  // keep the URL in step with the open page so links can be shared and Back works
  useEffect(() => {
    const target = currentId ? `#/${currentId}` : ''
    if (location.hash !== target) history.pushState(null, '', target || location.pathname)
  }, [currentId])
  useEffect(() => {
    const onPop = () => {
      const id = pageFromHash()
      useStore.getState().navigate(id && useStore.getState().pages[id] ? id : null)
    }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); toggleSidebar() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); useAiUI.getState().setAsk(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${sidebarOpen ? '' : 'collapsed'}`}>
      {sidebarOpen && <Sidebar />}
      <main className="main">
        {!sidebarOpen && <button className="icon-btn open-side" onClick={toggleSidebar} aria-label="Abrir barra lateral" title="Abrir barra lateral (Ctrl+\)"><Menu size={18} aria-hidden /></button>}
        {calendarOpen ? <CalendarHome /> : currentId ? <PageView id={currentId} /> : <Home />}
      </main>
      {searchOpen && <Search />}
      {askOpen && <AskAi />}
      {settingsOpen && <SettingsDialog />}
    </div>
  )
}
