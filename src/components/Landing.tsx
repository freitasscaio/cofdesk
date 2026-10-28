import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis } from 'recharts'
import {
  ArrowRight, AtSign, BookOpen, CalendarDays, ChartColumn, ChartGantt, Check, ChevronRight, CircleCheckBig, FileText, Globe,
  History, LayoutDashboard, LayoutTemplate, Lightbulb, Link2, ListChecks, Lock, MessageSquare, Monitor, Moon, Rocket,
  Search, Smartphone, SquareKanban, Sun, Table2, Users, Zap, type LucideIcon,
} from 'lucide-react'
import { LegalLinks } from './Legal'
import { Logo } from './Login'
import { TEMPLATES } from '../templates'
import { IconView } from './icons'
import { go } from '../nav'
import { useStore } from '../store'
import { HEX } from './Charts'
import '../landing.css'

// The logged-out home: what CofDesk is and why to use it, with sign-in and sign-up in the top right.
// Every picture of the app on this page is drawn with HTML, so it always matches the real interface.

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const scrollTo = (id: string) => {
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  // move keyboard focus with the scroll
  el?.focus({ preventScroll: true })
}

export function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.title = 'CofDesk — seu espaço para pensar, escrever e organizar'
    const onScroll = () => setScrolled(scrollY > 8)
    addEventListener('scroll', onScroll, { passive: true })
    return () => { removeEventListener('scroll', onScroll); document.title = 'CofDesk' }
  }, [theme])

  return (
    <div className="lp">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <button className="lp-brand" onClick={() => scrollTo('topo')} aria-label="CofDesk, voltar ao topo"><Logo size={26} /> CofDesk</button>
        <nav className="lp-links" aria-label="Seções">
          <button onClick={() => scrollTo('produto')}>Produto</button>
          <button onClick={() => scrollTo('recursos')}>Recursos</button>
          <button onClick={() => scrollTo('equipes')}>Equipes</button>
          <button onClick={() => scrollTo('modelos')}>Modelos</button>
          <button onClick={() => scrollTo('precos')}>Preços</button>
        </nav>
        <div className="lp-actions">
          <button className="lp-icon" title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="lp-login" onClick={() => go('/login')}>Entrar</button>
          <button className="lp-cta sm" onClick={() => go('/signup')}>Comece grátis</button>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section className="lp-hero" id="topo" tabIndex={-1}>
          <div className="lp-badge"><Zap size={14} aria-hidden /> Gráficos, dashboards e histórico de versões — tudo grátis</div>
          <h1>Pense, escreva e organize.<br /><span>Tudo em um só lugar.</span></h1>
          <p className="lp-lead">
            CofDesk junta documentos, wikis, projetos e bancos de dados num espaço que se adapta ao seu jeito de trabalhar —
            sozinho ou com toda a equipe, em tempo real.
          </p>
          <div className="lp-hero-actions">
            <button className="lp-cta" onClick={() => go('/signup')}>Comece grátis <ArrowRight size={16} /></button>
            <button className="lp-ghost" onClick={() => scrollTo('produto')}>Ver como funciona</button>
          </div>
          <p className="lp-note">Sem cartão de crédito. Sem plano pago. Sem limite de páginas.</p>
          <HeroMock />
        </section>

        <section className="lp-strip">
          {([[FileText, 'Documentos'], [BookOpen, 'Wikis'], [SquareKanban, 'Projetos'], [Table2, 'Bancos de dados'], [ChartColumn, 'Gráficos'], [CalendarDays, 'Calendário']] as const)
            .map(([I, t]) => <span key={t}><I size={18} strokeWidth={1.7} /> {t}</span>)}
        </section>

        <ProductTabs />

        <section className="lp-section" id="recursos">
          <div className="lp-head">
            <h2>Tudo o que você precisa.<br /><span>Nada atrás de um plano pago.</span></h2>
            <p>Recursos que costumam custar caro em outras ferramentas vêm incluídos desde o primeiro dia.</p>
          </div>
          <div className="lp-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-card">
                <span className="lp-card-icon" style={{ color: f.color }}><f.icon size={22} strokeWidth={1.7} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section lp-split" id="equipes">
          <div className="lp-head left">
            <span className="lp-eyebrow"><Users size={16} /> Para equipes</span>
            <h2>Trabalhe junto, ao mesmo tempo.</h2>
            <p>Veja quem está editando cada bloco, deixe comentários, marque colegas com @ e publique páginas na web com um clique.</p>
            <ul className="lp-checks">
              {['Edição em tempo real com presença', 'Comentários, respostas e menções', 'Caixa de entrada com o que é seu', 'Convidados como editores ou leitores', 'Páginas públicas com um link'].map(x => <li key={x}><Check size={16} /> {x}</li>)}
            </ul>
          </div>
          <CollabMock />
        </section>

        <section className="lp-section" id="modelos">
          <div className="lp-head">
            <h2>Comece com um modelo.</h2>
            <p>Estruturas prontas para o dia a dia. Use como estão ou mude tudo.</p>
          </div>
          <div className="lp-templates">
            {TEMPLATES.map(t => (
              <button key={t.id} className="lp-template" onClick={() => go('/signup')}>
                <div className="lp-template-cover" style={{ background: t.cover }}><span><IconView value={t.icon} size={26} /></span></div>
                <strong>{t.name}</strong>
                <small>{t.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="lp-section" id="precos">
          <div className="lp-head">
            <h2>Um preço: zero.</h2>
            <p>O CofDesk é gratuito, sem cartão de crédito. Seus dados continuam seus: exporte ou exclua quando quiser.</p>
          </div>
          <div className="lp-price">
            <div className="lp-price-card">
              <div className="lp-price-top"><strong>CofDesk</strong><span className="lp-price-tag">R$ 0</span><small>sem cartão de crédito</small></div>
              <ul className="lp-checks">
                {['Páginas e blocos ilimitados', 'Membros ilimitados no workspace', 'Bancos de dados com relações, rollups e fórmulas', 'Gráficos, dashboards e linha do tempo', 'Histórico de versões', 'Publicação na web', 'Exportação e exclusão dos seus dados'].map(x => <li key={x}><Check size={16} /> {x}</li>)}
              </ul>
              <button className="lp-cta wide" onClick={() => go('/signup')}>Criar minha conta</button>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-head">
            <h2>Onde você estiver.</h2>
            <p>Comece agora pelo navegador. Os aplicativos usam o mesmo código e estão a caminho.</p>
          </div>
          <div className="lp-platforms">
            {([[Globe, 'Web', 'Disponível agora', true], [Monitor, 'Windows, macOS e Linux', 'Em breve', false], [Smartphone, 'iPhone e Android', 'Em breve', false]] as const).map(([I, t, s, ok]) => (
              <div key={t} className="lp-platform"><I size={26} strokeWidth={1.5} /><strong>{t}</strong><span className={ok ? 'ok' : ''}>{s}</span></div>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <Logo size={44} />
          <h2>Experimente o CofDesk hoje.</h2>
          <p>Crie sua conta em segundos e organize o que importa.</p>
          <div className="lp-hero-actions">
            <button className="lp-cta" onClick={() => go('/signup')}>Comece grátis <ArrowRight size={16} /></button>
            <button className="lp-ghost" onClick={() => go('/login')}>Já tenho conta</button>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-brand"><Logo size={22} /> CofDesk</div>
        <div className="lp-footer-cols">
          <div><strong>Produto</strong><button onClick={() => scrollTo('produto')}>Documentos</button><button onClick={() => scrollTo('produto')}>Projetos</button><button onClick={() => scrollTo('produto')}>Gráficos</button></div>
          <div><strong>Recursos</strong><button onClick={() => scrollTo('recursos')}>Tudo incluído</button><button onClick={() => scrollTo('modelos')}>Modelos</button><button onClick={() => scrollTo('equipes')}>Equipes</button></div>
          <div><strong>Conta</strong><button onClick={() => go('/login')}>Entrar</button><button onClick={() => go('/signup')}>Criar conta</button></div>
        </div>
        <div className="lp-footer-legal">
          <LegalLinks />
          <small>© {new Date().getFullYear()} CofDesk</small>
        </div>
      </footer>
    </div>
  )
}

const FEATURES: { icon: LucideIcon; title: string; text: string; color: string }[] = [
  { icon: FileText, title: 'Páginas com blocos', text: 'Títulos, listas, tarefas, alternâncias, colunas, tabelas, código, imagens e vídeos. Digite / para tudo.', color: HEX.blue },
  { icon: Table2, title: 'Bancos de dados', text: 'Tabela, quadro, calendário, galeria, lista e linha do tempo sobre os mesmos dados.', color: HEX.orange },
  { icon: ChartColumn, title: 'Gráficos e dashboards', text: 'Barras, linhas, áreas, pizza e rosca. Monte dashboards com dados de vários bancos.', color: HEX.green },
  { icon: Link2, title: 'Relações e fórmulas', text: 'Ligue bancos entre si, some com rollups e calcule o que quiser com fórmulas.', color: HEX.purple },
  { icon: ChartGantt, title: 'Linha do tempo', text: 'Planeje projetos arrastando barras. Veja prazos, atrasos e o que vem depois.', color: HEX.red },
  { icon: History, title: 'Histórico de versões', text: 'Cada edição fica guardada. Volte a qualquer versão quando precisar.', color: HEX.brown },
  { icon: Globe, title: 'Publique na web', text: 'Transforme qualquer página num site público com um link — e tire do ar quando quiser.', color: HEX.pink },
  { icon: Lock, title: 'Seus dados são seus', text: 'Sem anúncios e sem rastreamento. Exporte em Markdown ou JSON e exclua sua conta quando quiser.', color: HEX.gray },
]

// ---------- drawings of the app ----------

function MockWindow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    // an illustration: screen readers skip it, the text around it says the same
    <div className={`lp-window ${className}`} aria-hidden="true">
      <div className="lp-window-bar"><i /><i /><i /><span>CofDesk</span></div>
      <div className="lp-window-body">{children}</div>
    </div>
  )
}

function MockSidebar({ active }: { active: string }) {
  const items: [LucideIcon, string, string][] = [
    [Rocket, 'Lançamento', HEX.red], [ListChecks, 'Tarefas', HEX.green], [BookOpen, 'Wiki da equipe', HEX.blue],
    [Lightbulb, 'Ideias', HEX.yellow], [LayoutDashboard, 'Métricas', HEX.purple],
  ]
  return (
    <aside className="lp-mside">
      <div className="lp-mws"><span>E</span> Equipe CofDesk</div>
      <div className="lp-mitem muted"><Search size={14} /> Buscar</div>
      <div className="lp-mlabel">Privado</div>
      {items.map(([I, t, c]) => <div key={t} className={`lp-mitem ${t === active ? 'on' : ''}`}><I size={14} color={c} /> {t}</div>)}
    </aside>
  )
}

function HeroMock() {
  return (
    <MockWindow className="hero">
      <MockSidebar active="Lançamento" />
      <div className="lp-mpage">
        <span className="lp-cursor c1"><i />Ana</span>
        <span className="lp-cursor c2"><i />Bruno</span>
        <div className="lp-mcover" />
        <Rocket size={34} color={HEX.red} className="lp-micon" />
        <h3>Lançamento do produto</h3>
        <div className="lp-mcallout"><Lightbulb size={16} color={HEX.yellow} /> Meta: publicar a versão 1.0 até o fim do mês.</div>
        <div className="lp-mcols">
          <div>
            <h4>Checklist</h4>
            {[['Revisar textos do site', true], ['Gravar o vídeo de demonstração', true], ['Testar no celular', false], ['Enviar para os primeiros usuários', false]].map(([t, ok]) => (
              <div key={t as string} className={`lp-mtodo ${ok ? 'done' : ''}`}><span>{ok && <Check size={11} strokeWidth={3} />}</span>{t}</div>
            ))}
            <div className="lp-mtyping">Próximo passo: combinar a data do anúncio<b /></div>
          </div>
          <div>
            <h4>Progresso por área</h4>
            <div className="lp-mchart">
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={[{ n: 'Design', v: 8 }, { n: 'Código', v: 12 }, { n: 'Textos', v: 5 }, { n: 'Testes', v: 7 }]}>
                  <XAxis dataKey="n" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <Bar dataKey="v" radius={4}>{[HEX.blue, HEX.purple, HEX.orange, HEX.green].map(c => <Cell key={c} fill={c} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </MockWindow>
  )
}

const TABS: { id: string; icon: LucideIcon; label: string; title: string; text: string }[] = [
  { id: 'docs', icon: FileText, label: 'Documentos', title: 'Escreva do jeito que você pensa', text: 'Blocos que viram o que você precisa: listas, tarefas, colunas, tabelas, vídeos e mapas. Arraste para reorganizar.' },
  { id: 'projects', icon: SquareKanban, label: 'Projetos', title: 'Acompanhe tudo num quadro', text: 'Arraste cartões entre colunas, filtre por responsável e veja o mesmo projeto como tabela, lista ou calendário.' },
  { id: 'charts', icon: ChartColumn, label: 'Gráficos', title: 'Transforme dados em gráficos', text: 'Qualquer banco de dados vira gráfico ou dashboard em segundos — sem exportar para planilha e sem pagar a mais.' },
  { id: 'timeline', icon: ChartGantt, label: 'Linha do tempo', title: 'Planeje no tempo', text: 'Veja cada tarefa como uma barra. Arraste para mudar datas e entenda o que vem antes do quê.' },
  { id: 'wiki', icon: BookOpen, label: 'Wiki', title: 'O conhecimento da equipe, num lugar só', text: 'Páginas dentro de páginas, busca instantânea e links entre tudo. Ninguém mais procura aquele documento perdido.' },
]

function ProductTabs() {
  const [tab, setTab] = useState(TABS[0].id)
  const t = TABS.find(x => x.id === tab)!
  // move through the tabs on its own until someone picks one, pauses it, or prefers less motion
  const [auto, setAuto] = useState(() => !reducedMotion())
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setTab(cur => TABS[(TABS.findIndex(x => x.id === cur) + 1) % TABS.length].id), 6000)
    return () => clearInterval(id)
  }, [auto])

  return (
    <section className="lp-section" id="produto">
      <div className="lp-head">
        <h2>Um espaço. Infinitas formas de usar.</h2>
        <p>Os mesmos blocos e os mesmos dados, vistos do jeito que faz sentido para cada trabalho.</p>
      </div>
      <div className="lp-tabs" role="tablist" aria-label="Formas de usar o CofDesk"
        onKeyDown={e => {
          const i = TABS.findIndex(x => x.id === tab)
          const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null
          if (next === null) return
          e.preventDefault()
          const id = TABS[(next + TABS.length) % TABS.length].id
          setTab(id); setAuto(false)
          document.getElementById(`lp-tab-${id}`)?.focus()
        }}>
        {TABS.map(x => (
          <button key={x.id} id={`lp-tab-${x.id}`} role="tab" aria-selected={x.id === tab} aria-controls="lp-tabpanel" tabIndex={x.id === tab ? 0 : -1}
            className={x.id === tab ? 'on' : ''} onClick={() => { setTab(x.id); setAuto(false) }}>
            <x.icon size={16} aria-hidden /> {x.label}
          </button>
        ))}
      </div>
      <div className="lp-pause-row">
        <button type="button" className="lp-pause" onClick={() => setAuto(!auto)}>
          {auto ? 'Pausar troca automática' : 'Retomar troca automática'}
        </button>
      </div>
      <div className="lp-tab-body" id="lp-tabpanel" role="tabpanel" aria-labelledby={`lp-tab-${tab}`}>
        <div className="lp-tab-text">
          <h3>{t.title}</h3>
          <p>{t.text}</p>
          <button className="lp-link" onClick={() => go('/signup')}>Experimentar <ChevronRight size={16} /></button>
        </div>
        <MockWindow className="tabwin">
          {tab === 'docs' && <DocsMock />}
          {tab === 'projects' && <BoardMock />}
          {tab === 'charts' && <ChartsMock />}
          {tab === 'timeline' && <TimelineMock />}
          {tab === 'wiki' && <WikiMock />}
        </MockWindow>
      </div>
    </section>
  )
}

const Tag = ({ c, children }: { c: string; children: React.ReactNode }) => <span className={`tag c-${c}`}>{children}</span>

function DocsMock() {
  return (
    <div className="lp-mpage pad">
      <h3>Reunião semanal</h3>
      <div className="lp-mprops"><CalendarDays size={13} /> Data <span>27 de outubro</span><Users size={13} /> Pessoas <span>Ana, Bruno</span></div>
      <h4>Pauta</h4>
      <div className="lp-mli">• Resultado da última sprint</div>
      <div className="lp-mli sub">◦ 12 tarefas entregues, 2 ficaram para a próxima</div>
      <div className="lp-mli">• Prioridades da semana</div>
      <div className="lp-mtoggle"><ChevronRight size={14} /> Decisões anteriores</div>
      <div className="lp-mcols">
        <div className="lp-mquote">“Primeiro o celular, depois o desktop.”</div>
        <div className="lp-mcallout small"><MessageSquare size={14} color={HEX.blue} /> 3 comentários nesta página</div>
      </div>
    </div>
  )
}

function BoardMock() {
  const cols: [string, string, [string, string, string][]][] = [
    ['A fazer', 'gray', [['Pesquisa com usuários', 'Média', 'yellow'], ['Novo onboarding', 'Alta', 'red']]],
    ['Em andamento', 'blue', [['Editor de blocos', 'Alta', 'red'], ['Modo escuro', 'Baixa', 'green']]],
    ['Concluído', 'green', [['Login por e-mail', 'Média', 'yellow']]],
  ]
  return (
    <div className="lp-board">
      {cols.map(([name, c, cards]) => (
        <div key={name} className="lp-bcol">
          <div className="lp-bhead"><Tag c={c}>{name}</Tag> <small>{cards.length}</small></div>
          {cards.map(([t, p, pc]) => <div key={t} className="lp-bcard"><strong>{t}</strong><Tag c={pc}>{p}</Tag></div>)}
        </div>
      ))}
    </div>
  )
}

function ChartsMock() {
  const status = [{ n: 'A fazer', v: 6, c: HEX.gray }, { n: 'Em andamento', v: 9, c: HEX.blue }, { n: 'Concluído', v: 14, c: HEX.green }]
  return (
    <div className="lp-dash">
      <div className="lp-dcard"><small>Tarefas</small><b>29</b><span className="up">+8 nesta semana</span></div>
      <div className="lp-dcard"><small>Horas registradas</small><b>164</b><span className="up">+12%</span></div>
      <div className="lp-dcard wide">
        <small>Por status</small>
        <ResponsiveContainer width="100%" height={130}>
          <PieChart><Pie data={status} dataKey="v" nameKey="n" innerRadius={34} outerRadius={56} paddingAngle={2}>{status.map(s => <Cell key={s.n} fill={s.c} />)}</Pie></PieChart>
        </ResponsiveContainer>
      </div>
      <div className="lp-dcard wide">
        <small>Entregas por mês</small>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={[{ n: 'jun', v: 7 }, { n: 'jul', v: 11 }, { n: 'ago', v: 9 }, { n: 'set', v: 15 }, { n: 'out', v: 18 }]}>
            <XAxis dataKey="n" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <Bar dataKey="v" fill={HEX.blue} radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TimelineMock() {
  const rows: [string, number, number, string][] = [
    ['Pesquisa', 0, 3, HEX.purple], ['Design', 2, 4, HEX.blue], ['Desenvolvimento', 4, 6, HEX.orange], ['Testes', 8, 3, HEX.green], ['Lançamento', 10, 2, HEX.red],
  ]
  return (
    <div className="lp-tl">
      <div className="lp-tl-head">{Array.from({ length: 12 }, (_, i) => <span key={i} className={i === 6 ? 'today' : ''}>{i + 20}</span>)}</div>
      {rows.map(([t, s, w, c]) => (
        <div key={t} className="lp-tl-row">
          <span className="lp-tl-name">{t}</span>
          <div className="lp-tl-track"><i style={{ left: `${(s / 12) * 100}%`, width: `${(w / 12) * 100}%`, background: c }}>{t}</i></div>
        </div>
      ))}
    </div>
  )
}

function WikiMock() {
  return (
    <>
      <MockSidebar active="Wiki da equipe" />
      <div className="lp-mpage pad">
        <h3>Wiki da equipe</h3>
        <div className="lp-mcols">
          {([[Rocket, 'Como trabalhamos'], [Users, 'Pessoas e times'], [CircleCheckBig, 'Processos'], [LayoutTemplate, 'Modelos']] as const).map(([I, t]) => (
            <div key={t} className="lp-mlink"><I size={15} /> <u>{t}</u></div>
          ))}
        </div>
        <h4>Recém-atualizado</h4>
        <div className="lp-mli">Guia de boas-vindas · <small>editado há 5 min</small></div>
        <div className="lp-mli">Política de férias · <small>editado ontem</small></div>
      </div>
    </>
  )
}

function CollabMock() {
  return (
    <MockWindow className="collab">
      <div className="lp-mpage pad">
        <h3>Roteiro do trimestre</h3>
        <div className="lp-mblock peer" style={{ ['--peer' as any]: HEX.purple }}><span className="lp-plabel">Bruno</span>Lançar o aplicativo para celular em dezembro.</div>
        <div className="lp-mblock">Melhorar a busca e os modelos.</div>
        <div className="lp-mcomment">
          <div className="lp-mavatar" style={{ background: HEX.blue }}>A</div>
          <div><strong>Ana</strong> <small>agora</small><p><span className="lp-mention"><AtSign size={11} />Bruno</span> consegue revisar a data até sexta?</p></div>
        </div>
        <div className="lp-mcomment reply">
          <div className="lp-mavatar" style={{ background: HEX.purple }}>B</div>
          <div><strong>Bruno</strong> <small>agora</small><p>Claro! Já marquei no calendário.</p></div>
        </div>
      </div>
    </MockWindow>
  )
}
