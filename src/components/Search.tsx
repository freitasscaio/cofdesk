import { useState } from 'react'
import { CornerDownLeft, Search as SearchIcon } from 'lucide-react'
import { useDialog } from '../a11y'
import { useStore } from '../store'
import type { Page } from '../types'
import { allBlocks, blockText } from '../blocks'
import { PageIcon } from './icons'

const plain = (p: Page) => (p.title + ' ' + allBlocks(p.blocks).map(blockText).join(' ')).toLowerCase()

export function Search() {
  const pages = useStore(s => s.pages)
  const { navigate, setSearchOpen } = useStore.getState()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const dialog = useDialog(true, () => setSearchOpen(false))
  const results = Object.values(pages)
    .filter(p => !p.trashed && (!q || plain(p).includes(q.toLowerCase())))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12)
  return (
    <div className="modal-bg" onMouseDown={() => setSearchOpen(false)}>
      <div ref={dialog} className="modal search-modal" role="dialog" aria-modal="true" aria-label="Pesquisar páginas" onMouseDown={e => e.stopPropagation()}>
        <div className="search-bar">
          <SearchIcon size={20} strokeWidth={1.8} className="ico-muted" aria-hidden />
          <input autoFocus className="search-input" aria-label="Pesquisar páginas" placeholder="Pesquise ou faça uma pergunta…" value={q}
            onChange={e => { setQ(e.target.value); setI(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(i - 1, 0)) }
              if (e.key === 'Enter' && results[i]) navigate(results[i].id)
              if (e.key === 'Escape') setSearchOpen(false)
            }} />
        </div>
        <div className="popover-title">{q ? 'Resultados' : 'Recentes'}</div>
        {results.map((p, k) => (
          <button key={p.id} className={`menu-item search-item ${k === i ? 'active' : ''}`} onMouseEnter={() => setI(k)} onClick={() => navigate(p.id)}>
            <PageIcon page={p} size={18} />
            <span className="grow">{p.title || 'Sem título'}{p.parentId && pages[p.parentId] && <small className="muted"> — {pages[p.parentId].title}</small>}</span>
            {k === i && <CornerDownLeft size={14} className="ico-muted" />}
          </button>
        ))}
        {!results.length && <div className="empty-state"><SearchIcon size={28} strokeWidth={1.4} /><div>Nenhum resultado</div></div>}
        <div className="search-foot"><kbd>↑↓</kbd> navegar <kbd>Enter</kbd> abrir <kbd>Esc</kbd> fechar</div>
      </div>
    </div>
  )
}
