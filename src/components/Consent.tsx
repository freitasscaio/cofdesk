import { useEffect, useState } from 'react'
import { useDialog } from '../a11y'
import { useConsent } from '../consent'
import { go } from '../nav'

/**
 * Asks once about the only optional category (content embedded from other sites), with "accept" and
 * "only necessary" equally easy, and reopens from "Preferências de cookies" in the footers.
 */
export function ConsentBanner() {
  const { embeds, open, choose, setOpen } = useConsent()
  const [allow, setAllow] = useState(!!embeds)
  useEffect(() => { if (open) setAllow(!!embeds) }, [open])
  const dialog = useDialog(open, () => setOpen(false))

  if (open) {
    return (
      <div className="consent-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
        <div ref={dialog} className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
          <h2 id="consent-title">Preferências de cookies</h2>
          <p>O CofDesk não usa cookies de análise, publicidade ou rastreamento.</p>
          <fieldset>
            <legend className="sr-only">Categorias</legend>
            <label className="consent-option">
              <input type="checkbox" checked disabled />
              <span><strong>Necessários</strong> (sempre ativos)<small>Sessão, cópia offline e preferências guardadas no seu navegador. Sem eles o CofDesk não funciona.</small></span>
            </label>
            <label className="consent-option">
              <input type="checkbox" checked={allow} onChange={e => setAllow(e.target.checked)} />
              <span><strong>Conteúdo de terceiros</strong><small>Vídeos, mapas e documentos de outros sites incorporados em páginas (YouTube, Google Maps, Figma…). Esses sites recebem seu IP e podem usar cookies próprios.</small></span>
            </label>
          </fieldset>
          <div className="consent-actions">
            <button type="button" className="btn" onClick={() => choose(false)}>Somente necessários</button>
            <button type="button" className="btn" onClick={() => choose(true)}>Aceitar todos</button>
            <button type="button" className="btn primary" onClick={() => choose(allow)}>Salvar escolha</button>
          </div>
          <a className="consent-more" href="/cookies" onClick={e => { e.preventDefault(); setOpen(false); go('/cookies') }}>Saiba mais sobre cookies</a>
        </div>
      </div>
    )
  }
  if (embeds !== null) return null
  return (
    <section className="consent-bar" aria-label="Aviso de cookies">
      <p>
        O CofDesk não usa cookies de rastreamento. Guardamos no navegador só o necessário para o serviço funcionar. Vídeos, mapas e outros
        conteúdos de terceiros incorporados em páginas só carregam se você permitir.{' '}
        <a href="/privacidade" onClick={e => { e.preventDefault(); go('/privacidade') }}>Política de Privacidade</a>
      </p>
      <div className="consent-actions">
        <button type="button" className="btn" onClick={() => setOpen(true)}>Personalizar</button>
        <button type="button" className="btn" onClick={() => choose(false)}>Somente necessários</button>
        <button type="button" className="btn" onClick={() => choose(true)}>Aceitar todos</button>
      </div>
    </section>
  )
}

/** Placeholder for an embed from another site until the visitor allows it. */
export function EmbedGate({ label, host, onLoad }: { label: string; host: string; onLoad: () => void }) {
  const choose = useConsent(s => s.choose)
  return (
    <div className="embed-gate">
      <p><strong>Conteúdo de {label}</strong><br />Ao carregar, {host} recebe seu endereço IP e pode usar cookies próprios.</p>
      <div className="consent-actions">
        <button type="button" className="btn primary" onClick={onLoad}>Carregar este conteúdo</button>
        <button type="button" className="btn" onClick={() => choose(true)}>Permitir sempre</button>
      </div>
    </div>
  )
}
