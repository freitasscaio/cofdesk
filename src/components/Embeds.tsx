import { useEffect, useState } from 'react'
import { ExternalLink, Globe, Link2, Loader, MapPin, MonitorPlay, RefreshCw } from 'lucide-react'
import { api } from '../auth'
import { useReadOnly } from '../readonly'
import { useConsent } from '../consent'
import { EmbedGate } from './Consent'
import type { Block, LinkMeta } from '../types'

export const isUrl = (s: string) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s.trim())
/** Links come from collaborators too, so anything that isn't http(s) is never rendered. */
const safe = (url: string) => (/^https?:\/\//i.test(url) ? url : 'about:blank')

/** Turns a link into something that can be shown in an iframe (or a <video>). */
export function embedSrc(raw: string): { src: string; kind: 'iframe' | 'video'; ratio: number; label: string } {
  let u: URL
  try { u = new URL(safe(raw)) } catch { u = new URL('about:blank') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { src: 'about:blank', kind: 'iframe', ratio: 56.25, label: raw }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  const path = u.pathname
  const label = host
  let m: RegExpMatchArray | null

  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? path.slice(1) : u.searchParams.get('v') ?? path.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
    if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}`, kind: 'iframe', ratio: 56.25, label: 'YouTube' }
  }
  if (host === 'vimeo.com' && (m = path.match(/^\/(\d+)/))) return { src: `https://player.vimeo.com/video/${m[1]}`, kind: 'iframe', ratio: 56.25, label: 'Vimeo' }
  if (host === 'loom.com' && (m = path.match(/\/share\/(\w+)/))) return { src: `https://www.loom.com/embed/${m[1]}`, kind: 'iframe', ratio: 56.25, label: 'Loom' }
  if (host === 'open.spotify.com' && !path.startsWith('/embed')) return { src: `https://open.spotify.com/embed${path}`, kind: 'iframe', ratio: 0, label: 'Spotify' }
  if (host.endsWith('figma.com')) return { src: `https://www.figma.com/embed?embed_host=cofdesk&url=${encodeURIComponent(raw)}`, kind: 'iframe', ratio: 62.5, label: 'Figma' }
  if (host === 'codepen.io' && (m = path.match(/^\/([\w-]+)\/pen\/(\w+)/))) return { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, kind: 'iframe', ratio: 62.5, label: 'CodePen' }
  if (host === 'docs.google.com') return { src: raw.replace(/\/(edit|view)([?#].*)?$/, '/preview'), kind: 'iframe', ratio: 75, label: 'Google Docs' }
  if (host.includes('google.') && path.startsWith('/maps')) {
    const at = path.match(/@(-?[\d.]+),(-?[\d.]+)/)
    const place = path.match(/\/place\/([^/]+)/)?.[1]
    const q = u.searchParams.get('q') ?? (place ? decodeURIComponent(place.replace(/\+/g, ' ')) : at ? `${at[1]},${at[2]}` : '')
    return { src: mapSrc(q), kind: 'iframe', ratio: 56.25, label: 'Google Maps' }
  }
  if (/\.(mp4|webm|ogg|mov)$/i.test(path)) return { src: raw, kind: 'video', ratio: 56.25, label }
  return { src: raw, kind: 'iframe', ratio: 62.5, label }
}

const hostOf = (src: string) => { try { return new URL(src).hostname.replace(/^www\./, '') } catch { return 'o site' } }

const mapSrc = (q: string) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`

const ASK = {
  any: { icon: Globe, text: 'Incorporar', hint: 'Cole um link (YouTube, Figma, Google Docs, Spotify, CodePen…)' },
  video: { icon: MonitorPlay, text: 'Vídeo', hint: 'Cole o link de um vídeo do YouTube, Vimeo, Loom ou de um arquivo .mp4' },
  map: { icon: MapPin, text: 'Google Maps', hint: 'Digite um endereço ou cole um link do Google Maps' },
}

function AskUrl({ icon: Icon, text, hint, onSubmit }: { icon: typeof Globe; text: string; hint: string; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(true)
  const readOnly = useReadOnly()
  if (readOnly) return null
  return (
    <div className="media-empty">
      <button className="media-empty-head" onClick={() => setOpen(!open)}><Icon size={18} strokeWidth={1.7} /> {text}</button>
      {open && (
        <form className="media-ask" onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}>
          <input className="input" autoFocus placeholder={hint} value={value} onChange={e => setValue(e.target.value)} />
          <button className="btn primary">{text === 'Google Maps' ? 'Mostrar mapa' : 'Incorporar link'}</button>
        </form>
      )}
    </div>
  )
}

export function EmbedBlock({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const ask = ASK[block.embed ?? 'any']
  // content from other sites loads only with consent (see Consent.tsx)
  const allowed = useConsent(s => s.embeds)
  const [loadOnce, setLoadOnce] = useState(false)
  if (!block.url) {
    return <AskUrl {...ask} onSubmit={v => {
      if (block.embed === 'map' && !isUrl(v)) onChange({ url: `https://www.google.com/maps?q=${encodeURIComponent(v)}`, html: v })
      else onChange({ url: isUrl(v) ? v : `https://${v}` })
    }} />
  }
  const e = embedSrc(block.url)
  const caption = block.embed === 'map' && block.html ? block.html : e.label
  return (
    <figure className="embed">
      {!allowed && !loadOnce ? <EmbedGate label={e.label} host={hostOf(e.src)} onLoad={() => setLoadOnce(true)} /> :
      <div className="embed-frame" style={e.ratio ? { paddingTop: `${e.ratio}%` } : { height: 152 }}>
        {e.kind === 'video'
          ? <video src={e.src} controls />
          : <iframe src={e.src} title={caption} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms" />}
      </div>}
      <figcaption>
        <a href={safe(block.url)} target="_blank" rel="noreferrer noopener"><ExternalLink size={12} /> {caption}</a>
        <span className="embed-hint">Não aparece? Alguns sites bloqueiam incorporação — abra o link.</span>
      </figcaption>
    </figure>
  )
}

export async function fetchMeta(url: string): Promise<LinkMeta> {
  return api(`/unfurl?url=${encodeURIComponent(url)}`)
}

export function BookmarkBlock({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const readOnly = useReadOnly()

  const load = (url: string) => {
    setBusy(true)
    setError('')
    fetchMeta(url)
      .then(meta => onChange({ url, meta }))
      .catch(e => { setError((e as Error).message); onChange({ url, meta: { title: url } }) })
      .finally(() => setBusy(false))
  }
  // a bookmark created from a pasted link has a url but no preview yet
  useEffect(() => { if (block.url && !block.meta && !readOnly) load(block.url) }, [])

  if (!block.url) return <AskUrl icon={Link2} text="Marcador web" hint="Cole um link para criar um marcador visual" onSubmit={v => load(isUrl(v) ? v : `https://${v}`)} />
  if (busy && !block.meta) return <div className="bookmark loading"><Loader size={16} className="spin" /> Carregando prévia…</div>
  const m = block.meta ?? {}
  return (
    <div className="bookmark">
      <div className="bookmark-text">
        <a className="bookmark-title" href={safe(block.url)} target="_blank" rel="noreferrer noopener">{m.title || block.url}</a>
        {m.description && <div className="bookmark-desc">{m.description}</div>}
        <div className="bookmark-url">
          {m.icon && <img src={m.icon} alt="" />}<span>{block.url}</span>
          {!readOnly && <button type="button" title="Atualizar prévia" aria-label="Atualizar prévia" onClick={() => load(block.url!)}><RefreshCw size={12} aria-hidden /></button>}
        </div>
        {error && <div className="bookmark-error">{error}</div>}
      </div>
      {m.image && <div className="bookmark-img" style={{ backgroundImage: `url("${m.image.replace(/"/g, '%22')}")` }} />}
    </div>
  )
}
