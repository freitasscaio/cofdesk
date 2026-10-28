import { useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronsLeft, ChevronsUpDown, Copy, House, LayoutTemplate, LogOut, Moon, MoreHorizontal, PenLine, Plus,
  RotateCcw, Search, Settings, ShieldCheck, SquarePen, Star, Sun, Table2, Trash2, UserPlus, X, Sparkles, CalendarDays,
} from 'lucide-react'
import { childrenOf, useStore } from '../store'
import type { Page } from '../types'
import { TEMPLATES } from '../templates'
import { Pop } from './Pop'
import { Members, SyncBadge, WorkspaceMenu } from './WorkspaceMenu'
import { InboxButton } from './Comments'
import { useAiUI } from './Ai'
import { IconView, PageIcon } from './icons'
import { Avatar } from './Settings'
import { useSettingsUI } from '../settingsUI'
import { useAuth } from '../auth'
import { logout } from '../sync'

const I = { size: 18, strokeWidth: 1.8 }

export function createFromTemplate(id: string, parentId: string | null = null) {
  const t = TEMPLATES.find(x => x.id === id)!
  const s = useStore.getState()
  const pageId = s.createPage(parentId, 'page', { title: t.name, icon: t.icon, cover: t.cover, blocks: t.blocks() })
  s.navigate(pageId)
}

function TreeItem({ page, depth }: { page: Page; depth: number }) {
  const pages = useStore(s => s.pages)
  const currentId = useStore(s => s.currentId)
  const { navigate, createPage, updatePage, trashPage, duplicatePage } = useStore.getState()
  const [open, setOpen] = useState(false)
  const kids = page.kind === 'database' ? [] : childrenOf(pages, page.id)
  return (
    <div>
      <div className={`tree-item ${currentId === page.id ? 'active' : ''}`} style={{ paddingLeft: 8 + depth * 12 }} onClick={() => navigate(page.id)}>
        <span className="tree-icon">
          <PageIcon page={page} size={18} className="tree-page-icon" />
          {page.kind === 'page' && (
            <button className="tree-caret" onClick={e => { e.stopPropagation(); setOpen(!open) }} aria-label={open ? 'Recolher' : 'Expandir'}>
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </span>
        {/* the row is clickable with the mouse; this button makes it reachable by keyboard (its click bubbles to the row) */}
        <button type="button" className="tree-title" aria-current={currentId === page.id ? 'page' : undefined}>{page.title || 'Sem título'}</button>
        <span className="tree-actions" onClick={e => e.stopPropagation()}>
          <Pop width={240} trigger={o => <button onClick={o} title="Excluir, duplicar e mais…" aria-label={`Mais opções de ${page.title || 'Sem título'}`}><MoreHorizontal size={16} aria-hidden /></button>}>
            {close => <>
              <button className="menu-item" onClick={() => { updatePage(page.id, { favorite: !page.favorite }); close() }}>
                <Star {...I} /> {page.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              </button>
              <button className="menu-item" onClick={() => { navigate(duplicatePage(page.id)); close() }}><Copy {...I} /> Duplicar</button>
              <button className="menu-item" onClick={() => {
                const t = prompt('Renomear', page.title); if (t != null) updatePage(page.id, { title: t }); close()
              }}><PenLine {...I} /> Renomear</button>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={() => { trashPage(page.id); close() }}><Trash2 {...I} /> Mover para a lixeira</button>
            </>}
          </Pop>
          {page.kind === 'page' && (
            <button title="Adicionar uma página dentro" aria-label={`Adicionar uma página dentro de ${page.title || 'Sem título'}`} onClick={() => { setOpen(true); navigate(createPage(page.id)) }}><Plus size={16} /></button>
          )}
        </span>
      </div>
      {open && page.kind === 'page' && (
        kids.length
          ? kids.map(k => <TreeItem key={k.id} page={k} depth={depth + 1} />)
          : <div className="tree-empty" style={{ paddingLeft: 38 + depth * 12 }}>Nenhuma página dentro</div>
      )}
    </div>
  )
}

export function Sidebar() {
  const pages = useStore(s => s.pages)
  const currentId = useStore(s => s.currentId)
  const calendarOpen = useStore(s => s.calendarOpen)
  const { navigate, createPage, toggleSidebar, setSearchOpen, restorePage, deleteForever } = useStore.getState()
  const roots = childrenOf(pages, null)
  const favorites = Object.values(pages).filter(p => p.favorite && !p.trashed)
  const trash = Object.values(pages).filter(p => p.trashed)
  const [trashQuery, setTrashQuery] = useState('')

  return (
    <aside className="sidebar" aria-label="Navegação do workspace">
      <div className="ws-head">
        <WorkspaceMenu />
        <div className="ws-head-actions">
          <button className="icon-btn" title="Recolher barra lateral (Ctrl+\)" onClick={toggleSidebar}><ChevronsLeft {...I} /></button>
          <button className="icon-btn" title="Nova página" onClick={() => navigate(createPage(null))}><SquarePen {...I} /></button>
        </div>
      </div>

      <nav className="side-nav">
        <button className="side-btn" onClick={() => setSearchOpen(true)}><Search {...I} /> Buscar</button>
        <button className={`side-btn ${currentId === null && !calendarOpen ? 'active' : ''}`} onClick={() => navigate(null)}><House {...I} /> Página inicial</button>
        <button className="side-btn" onClick={() => useAiUI.getState().setAsk(true)} title="Ctrl+J"><Sparkles {...I} /> Perguntar à IA</button>
        <button className={`side-btn ${calendarOpen ? 'active' : ''}`} onClick={() => useStore.getState().openCalendar()}><CalendarDays {...I} /> Calendário</button>
        <InboxButton />
      </nav>

      <div className="side-scroll">
        {favorites.length > 0 && <>
          <div className="side-section"><span>Favoritos</span></div>
          {favorites.map(p => <TreeItem key={'f' + p.id} page={p} depth={0} />)}
        </>}

        <div className="side-section">
          <span>Privado</span>
          <span className="side-section-actions">
            <button className="icon-btn" title="Adicionar uma página" onClick={() => navigate(createPage(null))}><Plus size={16} /></button>
          </span>
        </div>
        <div className="tree">{roots.map(p => <TreeItem key={p.id} page={p} depth={0} />)}</div>
        <button className="side-btn muted-btn" onClick={() => navigate(createPage(null))}><Plus {...I} /> Adicionar nova</button>
        <button className="side-btn muted-btn" onClick={() => navigate(createPage(null, 'database'))}><Table2 {...I} /> Novo banco de dados</button>

        <div className="side-section"><span>&nbsp;</span></div>
        <button className="side-btn" onClick={() => useSettingsUI.getState().open('preferencias')}><Settings {...I} /> Configurações</button>
        <Pop width={300} trigger={o => <button className="side-btn" onClick={o}><LayoutTemplate {...I} /> Modelos</button>}>
          {close => <>
            <div className="popover-title">Criar a partir de um modelo</div>
            {TEMPLATES.map(t => (
              <button key={t.id} className="menu-item two-line" onClick={() => { createFromTemplate(t.id); close() }}>
                <IconView value={t.icon} size={20} />
                <span><div>{t.name}</div><small>{t.description}</small></span>
              </button>
            ))}
          </>}
        </Pop>
        <Pop width={360} trigger={o => <button className="side-btn" onClick={o}><Trash2 {...I} /> Lixeira</button>}>
          {() => <>
            <input className="input sm" placeholder="Filtrar páginas na lixeira" value={trashQuery} onChange={e => setTrashQuery(e.target.value)} autoFocus />
            <div className="trash-list">
              {trash.filter(p => (p.title || 'Sem título').toLowerCase().includes(trashQuery.toLowerCase())).map(p => (
                <div key={p.id} className="trash-row" onClick={() => navigate(p.id)}>
                  <PageIcon page={p} size={18} />
                  <button type="button" className="trash-title">{p.title || 'Sem título'}</button>
                  <button className="icon-btn" title="Restaurar" aria-label={`Restaurar ${p.title || 'Sem título'}`} onClick={e => { e.stopPropagation(); restorePage(p.id) }}><RotateCcw size={16} /></button>
                  <button className="icon-btn" title="Excluir permanentemente" aria-label={`Excluir ${p.title || 'Sem título'} permanentemente`} onClick={e => { e.stopPropagation(); if (confirm('Excluir permanentemente?')) deleteForever(p.id) }}><X size={16} /></button>
                </div>
              ))}
              {!trash.length && <div className="empty-state"><Trash2 size={28} strokeWidth={1.4} /><div>Nenhuma página na lixeira</div></div>}
            </div>
          </>}
        </Pop>
      </div>

      <div className="side-footer">
        <Pop width={340} trigger={o => <button className="side-btn" onClick={o}><UserPlus {...I} /> Convidar membros</button>}>
          {() => <Members />}
        </Pop>
        <SyncBadge />
        <AccountButton />
      </div>
    </aside>
  )
}

/** The signed-in person, at the bottom left: profile, settings, theme and sign out. */
function AccountButton() {
  const user = useAuth(s => s.user)
  const theme = useStore(s => s.theme)
  if (!user) return null
  const open = useSettingsUI.getState().open
  return (
    <Pop width={260} trigger={o => (
      <button className="account-btn" onClick={o} aria-label={`Conta: ${user.name}`}>
        <Avatar name={user.name} size={24} />
        <span className="account-btn-text"><strong>{user.name}</strong><small>{user.email}</small></span>
        <ChevronsUpDown size={14} className="ico-muted" aria-hidden />
      </button>
    )}>
      {close => <>
        <div className="popover-title">{user.email}</div>
        <button className="menu-item" onClick={() => { close(); open('perfil') }}><Avatar name={user.name} size={18} /> Perfil</button>
        <button className="menu-item" onClick={() => { close(); open('preferencias') }}><Settings {...I} /> Configurações</button>
        <button className="menu-item" onClick={() => { close(); open('privacidade') }}><ShieldCheck {...I} /> Privacidade e dados</button>
        <button className="menu-item" onClick={() => useStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <><Sun {...I} /> Modo claro</> : <><Moon {...I} /> Modo escuro</>}
        </button>
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => { close(); logout() }}><LogOut {...I} /> Sair</button>
      </>}
    </Pop>
  )
}
