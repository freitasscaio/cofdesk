import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { ReadOnly } from '../readonly'
import { PageView } from './PageView'
import { Logo } from './Login'
import { LEGAL } from '../legal'
import { go } from '../nav'

/**
 * A published page for visitors without an account. The shared pages are loaded into the
 * local store only (no sync is started), and everything renders read-only.
 */
export function PublicPage({ token }: { token: string }) {
  const [error, setError] = useState('')
  const [rootId, setRootId] = useState<string | null>(null)
  const currentId = useStore(s => s.currentId)

  // shared pages are reachable by link only: ask search engines not to list them
  useEffect(() => {
    const meta = Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex, nofollow' })
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    // never let the visitor's view overwrite a logged-in user's cached workspace
    useStore.persist.setOptions({ name: 'cofdesk-public-view' })
    fetch(`/api/public/${token}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => {
        useStore.setState({ pages: Object.fromEntries(d.pages.map((p: any) => [p.id, p])), currentId: d.rootId })
        setRootId(d.rootId)
        document.title = d.pages.find((p: any) => p.id === d.rootId)?.title || 'CofDesk'
      })
      .catch(e => setError(e.message))
  }, [token])

  if (error) return <div className="loading">{error}</div>
  if (!rootId || !currentId) return <div className="loading">Carregando…</div>
  return (
    <ReadOnly.Provider value={true}>
      <div className="public">
        <main className="main readonly">
          <PageView id={currentId} />
        </main>
        <a className="public-badge" href="/"><Logo size={18} /> Feito com CofDesk</a>
        <nav className="public-legal" aria-label="Informações legais">
          <a href={`mailto:${LEGAL.privacyEmail}?subject=${encodeURIComponent('Denúncia de página publicada')}&body=${encodeURIComponent(`Link: ${location.href}
Motivo: `)}`}>Denunciar página</a>
          <a href="/privacidade" onClick={e => { e.preventDefault(); go('/privacidade') }}>Privacidade</a>
          <a href="/termos" onClick={e => { e.preventDefault(); go('/termos') }}>Termos</a>
        </nav>
      </div>
    </ReadOnly.Provider>
  )
}
