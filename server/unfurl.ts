import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Link previews for bookmark blocks. The server fetches the page because browsers can't read
// other sites' HTML (CORS). Only public http(s) addresses are allowed so this can't be used to
// reach the machine's own network.

const MAX_BYTES = 512_000
const TIMEOUT_MS = 6000

function privateAddress(ip: string) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase()
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7))
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

async function assertPublic(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Somente links http(s)')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address)
  if (!addrs.length || addrs.some(privateAddress)) throw new Error('Endereço não permitido')
}

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim()

function meta(html: string, ...keys: string[]) {
  for (const key of keys) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i'))?.[0]
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1]
    if (content) return decode(content)
  }
}

export async function unfurl(raw: string) {
  let url = new URL(raw)
  let res: Response | undefined
  // follow redirects by hand so every hop is checked
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; CofDeskBot/1.0; link preview)', accept: 'text/html' },
    })
    const next = res.status >= 300 && res.status < 400 && res.headers.get('location')
    if (!next) break
    url = new URL(next, url)
  }
  const site = url.hostname.replace(/^www\./, '')
  const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`
  if (!res?.ok || !res.body || !/html/i.test(res.headers.get('content-type') ?? '')) return { site, icon, title: site }

  // read only the head of the document
  const reader = res.body.getReader()
  let html = ''
  const text = new TextDecoder()
  while (html.length < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    html += text.decode(value, { stream: true })
    if (/<\/head>/i.test(html)) break
  }
  reader.cancel().catch(() => {})

  const image = meta(html, 'og:image', 'twitter:image')
  return {
    site: meta(html, 'og:site_name') ?? site,
    title: (meta(html, 'og:title', 'twitter:title') ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')) || site,
    description: meta(html, 'og:description', 'twitter:description', 'description'),
    image: image ? new URL(image, url).href : undefined,
    icon,
  }
}
