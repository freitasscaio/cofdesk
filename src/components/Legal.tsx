import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LEGAL, legalPending } from '../legal'
import { useConsent } from '../consent'
import { useStore } from '../store'
import { go } from '../nav'
import { Logo } from './Login'

export type LegalDoc = 'privacidade' | 'termos' | 'cookies' | 'licencas'

export const LEGAL_PATHS: Record<LegalDoc, string> = {
  privacidade: 'Política de Privacidade',
  termos: 'Termos de Uso',
  cookies: 'Cookies e armazenamento',
  licencas: 'Licenças de código aberto',
}

export const legalDocOf = (path: string) => {
  const doc = path.replace(/^\/|\/$/g, '') as LegalDoc
  return doc in LEGAL_PATHS ? doc : null
}

/** Links to the legal pages, for footers. */
export function LegalLinks({ className = 'legal-links' }: { className?: string }) {
  const setOpen = useConsent(s => s.setOpen)
  return (
    <nav className={className} aria-label="Informações legais">
      <a href="/privacidade" onClick={e => { e.preventDefault(); go('/privacidade') }}>Privacidade</a>
      <a href="/termos" onClick={e => { e.preventDefault(); go('/termos') }}>Termos de Uso</a>
      <a href="/cookies" onClick={e => { e.preventDefault(); go('/cookies') }}>Cookies</a>
      <button type="button" onClick={() => setOpen(true)}>Preferências de cookies</button>
      <a href="/licencas" onClick={e => { e.preventDefault(); go('/licencas') }}>Licenças</a>
    </nav>
  )
}

const L = LEGAL
const Mail = () => <a href={`mailto:${L.privacyEmail}`}>{L.privacyEmail}</a>
const Link = ({ to, children }: { to: LegalDoc; children: React.ReactNode }) =>
  <a href={`/${to}`} onClick={e => { e.preventDefault(); go(`/${to}`) }}>{children}</a>

export function Legal({ doc }: { doc: LegalDoc }) {
  const theme = useStore(s => s.theme)
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    document.title = `${LEGAL_PATHS[doc]} · CofDesk`
    window.scrollTo(0, 0)
    return () => { document.title = 'CofDesk' }
  }, [doc])
  const pending = legalPending()

  return (
    <div className="legal">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="legal-head">
        <a className="legal-brand" href="/" onClick={e => { e.preventDefault(); go('/') }}><Logo size={24} /> CofDesk</a>
        <a className="legal-back" href="/" onClick={e => { e.preventDefault(); history.length > 1 ? history.back() : go('/') }}>
          <ArrowLeft size={16} aria-hidden /> Voltar
        </a>
      </header>
      <main id="conteudo" className="legal-body" tabIndex={-1}>
        {pending.length > 0 && doc !== 'licencas' && (
          <div className="legal-warn" role="note">
            <strong>Rascunho:</strong> antes de publicar, preencha os dados do responsável em <code>src/legal.ts</code> ({pending.join(', ')}).
          </div>
        )}
        {doc === 'privacidade' && <Privacy />}
        {doc === 'termos' && <Terms />}
        {doc === 'cookies' && <Cookies />}
        {doc === 'licencas' && <Licenses />}
      </main>
      <footer className="legal-foot">
        <LegalLinks />
        <small>© {new Date().getFullYear()} {L.controller.startsWith('[') ? 'CofDesk' : L.controller}</small>
      </footer>
    </div>
  )
}

function Updated() {
  return <p className="legal-updated">Última atualização: {L.updatedAt}</p>
}

function Privacy() {
  return (
    <article>
      <h1>Política de Privacidade</h1>
      <Updated />
      <p>
        Esta política explica quais dados pessoais o CofDesk trata, por que, por quanto tempo e quais são os seus direitos, conforme a
        Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018, “LGPD”) e o Marco Civil da Internet (Lei nº 12.965/2014).
        Em resumo: coletamos só o necessário para a sua conta funcionar, <strong>não vendemos dados</strong>, <strong>não usamos
        publicidade</strong> e <strong>não usamos ferramentas de análise ou rastreamento</strong>.
      </p>

      <h2 id="controlador">1. Quem é o responsável</h2>
      <p>
        O controlador dos dados é <strong>{L.controller}</strong>, {L.document}, com endereço em {L.address}.
        O encarregado pelo tratamento de dados pessoais é <strong>{L.dpo}</strong>, que pode ser contatado pelo e-mail <Mail />.
      </p>

      <h2 id="dados">2. Quais dados tratamos e para quê</h2>
      <div className="legal-table" role="region" aria-label="Dados tratados" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Dados</th><th scope="col">Finalidade</th><th scope="col">Base legal (LGPD)</th></tr></thead>
          <tbody>
            <tr><td>Nome (opcional), e-mail e senha (guardamos apenas um resumo criptográfico da senha, nunca a senha em si)</td><td>Criar e manter sua conta, permitir o login e identificar você para os colegas do seu workspace</td><td>Execução de contrato (art. 7º, V)</td></tr>
            <tr><td>Código de confirmação do cadastro (guardado apenas como resumo criptográfico)</td><td>Confirmar que o e-mail é seu</td><td>Execução de contrato (art. 7º, V)</td></tr>
            <tr><td>Se você entrar com o Google: identificador da conta Google, e-mail e nome</td><td>Login com o Google, a seu pedido</td><td>Execução de contrato (art. 7º, V)</td></tr>
            <tr><td>Conteúdo que você cria: páginas, bancos de dados, imagens enviadas, comentários, menções e histórico de versões</td><td>Prestar o serviço: guardar, sincronizar, compartilhar e restaurar o seu conteúdo</td><td>Execução de contrato (art. 7º, V)</td></tr>
            <tr><td>Token de sessão (código aleatório)</td><td>Manter você conectado com segurança</td><td>Execução de contrato (art. 7º, V)</td></tr>
            <tr><td>Registros de acesso: endereço IP, porta, data e hora de login e cadastro</td><td>Guarda obrigatória por 6 meses (Marco Civil da Internet, art. 15) e segurança da conta</td><td>Cumprimento de obrigação legal (art. 7º, II)</td></tr>
            <tr><td>Agendas conectadas: e-mail da conta, autorização de acesso do Google ou Apple ID e senha de app do iCloud (guardados criptografados)</td><td>Mostrar seus eventos no calendário do CofDesk, a seu pedido. Os eventos são lidos na hora e não ficam guardados</td><td>Execução de contrato (art. 7º, V)</td></tr>
            <tr><td>Links que você cola em marcadores</td><td>O servidor do CofDesk acessa o link para gerar a prévia (título, descrição e imagem)</td><td>Execução de contrato (art. 7º, V)</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Não pedimos CPF, telefone, endereço, data de nascimento nem dados pessoais sensíveis. Não fazemos perfis, não tomamos
        decisões automatizadas sobre você e não usamos seus dados para publicidade.
      </p>
      <p>
        <strong>Dados de outras pessoas no seu conteúdo.</strong> Se você incluir dados pessoais de terceiros nas suas páginas, você
        (ou a organização dona do workspace) é o controlador desses dados e o CofDesk atua como operador, tratando-os apenas para
        guardar e exibir o conteúdo conforme as suas instruções.
      </p>

      <h2 id="compartilhamento">3. Com quem compartilhamos</h2>
      <p>Seus dados só são compartilhados com quem é necessário para o serviço funcionar:</p>
      <ul>
        <li><strong>Pessoas do seu workspace</strong>: veem seu nome, e-mail, o conteúdo do workspace e seus comentários.</li>
        <li><strong>Qualquer pessoa com o link</strong>, se você publicar uma página na web. Páginas publicadas pedem aos buscadores que não as indexem, mas quem tiver o link pode vê-las e copiá-las. Você pode tirar a página do ar quando quiser.</li>
        <li><strong>Hospedagem</strong>: {L.hosting}, onde ficam o servidor e o banco de dados.</li>
        <li><strong>Envio de e-mails</strong>: {L.emailProvider}, que recebe seu e-mail e nome para enviar o código de confirmação.</li>
        <li><strong>Google</strong> (Google LLC, EUA), se você entrar com o Google ou conectar o Google Agenda.</li>
        <li><strong>Apple</strong> (Apple Inc., EUA), se você conectar uma agenda do iCloud.</li>
        <li><strong>Sites incorporados</strong> (YouTube, Vimeo, Google Maps, Figma e outros): só são carregados com o seu consentimento. Veja a página de <Link to="cookies">cookies</Link>.</li>
        <li><strong>Recursos de inteligência artificial</strong>, quando estiverem disponíveis e você os usar: o texto enviado e o trecho de conteúdo necessário para a resposta são processados pela Anthropic, PBC (EUA), que não os usa para treinar modelos.</li>
        <li><strong>Autoridades</strong>, quando houver ordem judicial ou obrigação legal.</li>
      </ul>
      <p>
        <strong>Transferência internacional.</strong> Alguns desses fornecedores processam dados fora do Brasil (principalmente nos
        Estados Unidos). Essas transferências ocorrem nas hipóteses do art. 33 da LGPD, como a execução de contrato a seu pedido e o uso de
        cláusulas contratuais com garantias de proteção (Resolução CD/ANPD nº 19/2024).
      </p>
      <p>
        <strong>Dados do Google.</strong> O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do
        Google pelo CofDesk seguem a <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">Política
        de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado. O CofDesk só lê a sua agenda
        (acesso somente leitura) para exibi-la a você; não transfere esses dados a terceiros, não os usa para publicidade e
        não permite que pessoas os leiam, exceto com o seu consentimento, por segurança ou por obrigação legal.
      </p>

      <h2 id="retencao">4. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Conta e conteúdo</strong>: enquanto a conta existir. Ao excluir a conta, apagamos os dados na hora (cópias de segurança, se houver, são sobrescritas em até 30 dias).</li>
        <li><strong>Cadastro não confirmado</strong>: 15 minutos.</li>
        <li><strong>Sessões</strong>: até 30 dias ou até você sair.</li>
        <li><strong>Registros de acesso</strong>: 6 meses, mesmo depois de excluída a conta, por obrigação legal (LGPD, art. 16, I). Depois são apagados automaticamente.</li>
        <li><strong>Páginas na lixeira</strong>: até você excluí-las definitivamente ou excluir a conta.</li>
        <li><strong>Eventos de agendas conectadas</strong>: não são guardados (ficam no máximo 1 minuto em memória).</li>
      </ul>

      <h2 id="direitos">5. Seus direitos</h2>
      <p>Pela LGPD (art. 18), você pode, a qualquer momento e sem custo:</p>
      <ul>
        <li>confirmar se tratamos seus dados e acessá-los;</li>
        <li>corrigir dados incompletos ou desatualizados;</li>
        <li>pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários ou tratados em desconformidade com a lei;</li>
        <li>receber seus dados em formato estruturado (portabilidade);</li>
        <li>excluir seus dados e a sua conta;</li>
        <li>saber com quem compartilhamos seus dados;</li>
        <li>revogar o consentimento, quando ele for a base do tratamento (por exemplo, conteúdo de terceiros incorporado);</li>
        <li>se opor a um tratamento e pedir a revisão de decisões automatizadas.</li>
      </ul>
      <p>
        <strong>Como exercer:</strong> dentro do CofDesk, no menu do workspace › <em>Minha conta e privacidade</em>, você pode corrigir seu nome,
        baixar todos os seus dados e excluir sua conta. Para os demais pedidos, escreva para <Mail />. Respondemos em até 15 dias.
        Você também pode reclamar à Autoridade Nacional de Proteção de Dados (<a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer noopener">ANPD</a>).
      </p>

      <h2 id="seguranca">6. Segurança</h2>
      <p>
        Usamos conexão criptografada (HTTPS), senhas guardadas com <em>scrypt</em> e sal, códigos e tokens aleatórios, criptografia AES-256
        para autorizações de agendas, controle de acesso por workspace e limite de tentativas na confirmação de e-mail. Nenhum sistema é
        totalmente imune a falhas; se ocorrer um incidente de segurança que possa causar risco ou dano relevante, avisaremos você e a ANPD,
        como exige o art. 48 da LGPD.
      </p>

      <h2 id="cookies">7. Cookies e armazenamento no navegador</h2>
      <p>
        O CofDesk não usa cookies próprios nem cookies de rastreamento. Guardamos no seu navegador apenas o necessário para o serviço
        funcionar (sessão, cópia local para uso offline e preferências). Conteúdo de outros sites só é carregado com o seu consentimento.
        Detalhes na página de <Link to="cookies">cookies e armazenamento</Link>.
      </p>

      <h2 id="criancas">8. Crianças e adolescentes</h2>
      <p>
        O CofDesk é destinado a maiores de 18 anos. Não coletamos conscientemente dados de crianças e adolescentes. Se você souber de uma conta
        criada por menor de idade, escreva para <Mail /> e a excluiremos.
      </p>

      <h2 id="mudancas">9. Mudanças nesta política</h2>
      <p>
        Se mudarmos esta política de forma relevante, avisaremos por e-mail ou dentro do CofDesk antes de a mudança valer. A data da última
        atualização fica no topo desta página.
      </p>
    </article>
  )
}

function Terms() {
  return (
    <article>
      <h1>Termos de Uso</h1>
      <Updated />
      <p>
        Estes termos regem o uso do CofDesk, oferecido por <strong>{L.controller}</strong>, {L.document} (“nós”). Ao criar uma conta ou usar
        o CofDesk, você concorda com eles e com a <Link to="privacidade">Política de Privacidade</Link>. Se não concordar, não use o serviço.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O CofDesk é um espaço de trabalho on-line para criar documentos, bancos de dados, calendários e páginas, sozinho ou em equipe.
        O uso é gratuito. Podemos mudar, melhorar ou descontinuar funções; quando uma mudança afetar de forma relevante o que você usa,
        avisaremos com pelo menos 30 dias de antecedência e você poderá exportar seus dados.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você precisa ter 18 anos ou mais e informar um e-mail válido que seja seu.</li>
        <li>Você é responsável por manter sua senha em segurança e pelo que for feito na sua conta. Avise-nos em <Mail /> se suspeitar de uso indevido.</li>
        <li>Você pode excluir sua conta quando quiser, em <em>Minha conta e privacidade</em>.</li>
      </ul>

      <h2>3. Seu conteúdo</h2>
      <ul>
        <li>O conteúdo que você cria é seu. Você nos concede apenas a licença necessária para guardar, copiar, exibir e transmitir esse conteúdo com o único fim de prestar o serviço a você e às pessoas com quem você o compartilha.</li>
        <li>Você declara ter os direitos sobre o que publica, incluindo textos, imagens e dados pessoais de terceiros.</li>
        <li>Ao publicar uma página na web, você a torna visível a qualquer pessoa com o link e é responsável por esse conteúdo.</li>
        <li>Em workspaces compartilhados, o proprietário controla quem tem acesso. Se você excluir sua conta, um workspace seu com outros membros passa para outro membro; sem outros membros, ele é excluído.</li>
      </ul>

      <h2>4. Uso aceitável</h2>
      <p>Você não pode usar o CofDesk para:</p>
      <ul>
        <li>violar a lei ou direitos de terceiros, incluindo direitos autorais, marcas, imagem, honra e privacidade;</li>
        <li>publicar conteúdo de abuso ou exploração sexual de crianças e adolescentes, nudez não consentida, discurso de ódio, ameaças ou incitação à violência;</li>
        <li>praticar fraude, golpes, <em>phishing</em> ou distribuir programas maliciosos;</li>
        <li>enviar spam, coletar dados de outras pessoas sem base legal ou burlar limites técnicos e de segurança;</li>
        <li>sobrecarregar, invadir ou tentar acessar contas e dados que não são seus.</li>
      </ul>
      <p>
        Podemos remover conteúdo ou suspender contas que violem estes termos, avisando você e explicando o motivo, salvo quando a lei ou uma
        investigação impedir. Você pode contestar a decisão pelo e-mail <Mail />.
      </p>

      <h2>5. Denúncias</h2>
      <p>
        Para denunciar uma página publicada que viole a lei ou estes termos, incluindo violação de direitos autorais ou divulgação de
        imagens íntimas sem consentimento, escreva para <Mail /> com o link da página e o motivo. Analisaremos e, quando for o caso,
        tiraremos o conteúdo do ar.
      </p>

      <h2>6. Serviços de terceiros</h2>
      <p>
        O login com o Google, as agendas conectadas e os conteúdos incorporados (vídeos, mapas, documentos) dependem de serviços de
        terceiros, que têm seus próprios termos e políticas. Não respondemos por indisponibilidade ou mudanças nesses serviços.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        O nome, a marca e o logotipo do CofDesk, e o software do serviço, pertencem a {L.controller}, exceto os componentes de código aberto,
        que seguem suas próprias <Link to="licencas">licenças</Link>. Nomes de outros produtos e empresas citados pertencem aos seus donos.
      </p>

      <h2>8. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o CofDesk disponível e seguro, mas o serviço pode passar por interrupções, manutenções ou falhas.
        Recomendamos que você exporte com frequência o conteúdo importante. Respondemos pelos danos que causarmos nos termos da lei,
        incluindo o Código de Defesa do Consumidor; nada nestes termos limita direitos que a lei garante a você.
      </p>

      <h2>9. Encerramento</h2>
      <p>
        Você pode parar de usar o CofDesk e excluir sua conta a qualquer momento. Se precisarmos encerrar o serviço, avisaremos com pelo
        menos 30 dias de antecedência para você exportar seus dados.
      </p>

      <h2>10. Mudanças nestes termos</h2>
      <p>
        Podemos atualizar estes termos. Mudanças relevantes serão avisadas por e-mail ou dentro do CofDesk com pelo menos 30 dias de
        antecedência. Se não concordar, você pode excluir sua conta antes que elas passem a valer.
      </p>

      <h2>11. Lei e foro</h2>
      <p>
        Estes termos seguem as leis do Brasil. Fica eleito o foro do domicílio do usuário para resolver qualquer controvérsia.
        Antes de recorrer à Justiça, fale conosco em <Mail />: tentaremos resolver de forma amigável.
      </p>
    </article>
  )
}

function Cookies() {
  const { embeds, decidedAt, setOpen } = useConsent()
  return (
    <article>
      <h1>Cookies e armazenamento no navegador</h1>
      <Updated />
      <p>
        O CofDesk <strong>não usa cookies próprios</strong>, nem ferramentas de análise (como Google Analytics), publicidade ou
        rastreamento. Guardamos no armazenamento local do seu navegador (<em>localStorage</em>) apenas o que é necessário para o
        serviço funcionar. Esses itens não exigem consentimento, porque sem eles o CofDesk não funciona, e você pode apagá-los nas
        configurações do navegador (isso desconecta você).
      </p>

      <h2>Itens necessários</h2>
      <div className="legal-table" role="region" aria-label="Itens necessários" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Nome</th><th scope="col">Para que serve</th><th scope="col">Duração</th></tr></thead>
          <tbody>
            <tr><td><code>cofdesk-auth</code></td><td>Mantém você conectado: token de sessão, nome, e-mail e workspaces</td><td>Até você sair (a sessão vence em 30 dias)</td></tr>
            <tr><td><code>cofdesk-workspace</code></td><td>Cópia local das páginas para uso offline e preferências (tema, barra lateral)</td><td>Até você sair ou limpar o navegador</td></tr>
            <tr><td><code>cofdesk-public-view</code></td><td>Cópia temporária de uma página publicada que você está vendo</td><td>Até limpar o navegador</td></tr>
            <tr><td><code>cofdesk-consent</code></td><td>Lembra a sua escolha sobre conteúdo de terceiros</td><td>Até você mudar a escolha ou limpar o navegador</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Conteúdo de terceiros (opcional)</h2>
      <p>
        Páginas podem incorporar conteúdo de outros sites, como YouTube (no modo de privacidade avançada), Vimeo, Loom, Spotify, Figma,
        CodePen, Google Docs e Google Maps. Ao carregar esse conteúdo, o site de origem recebe seu endereço IP e pode usar cookies próprios,
        conforme a política de privacidade dele. Por isso, esse conteúdo só é carregado com o seu consentimento: você pode permitir sempre
        ou carregar um item por vez.
      </p>
      <p>
        Imagens e ícones de prévias de links também podem vir dos sites de origem, que recebem seu endereço IP ao exibi-los.
      </p>
      <p className="legal-choice">
        Sua escolha atual: <strong>{embeds === null ? 'ainda não escolhida' : embeds ? 'conteúdo de terceiros permitido' : 'somente itens necessários'}</strong>
        {decidedAt && <> (desde {new Date(decidedAt).toLocaleDateString('pt-BR')})</>}.{' '}
        <button type="button" className="btn" onClick={() => setOpen(true)}>Mudar preferências</button>
      </p>
    </article>
  )
}

type License = { name: string; version: string; license: string; repository?: string; text?: string }

function Licenses() {
  const [list, setList] = useState<License[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    fetch('/licenses.json').then(r => (r.ok ? r.json() : Promise.reject())).then(setList).catch(() => setError(true))
  }, [])
  return (
    <article>
      <h1>Licenças de código aberto</h1>
      <p>
        O CofDesk usa os componentes de código aberto abaixo, que pertencem aos seus autores e são distribuídos sob as licenças indicadas.
        Os ícones são do projeto <a href="https://lucide.dev" target="_blank" rel="noreferrer noopener">Lucide</a> (licença ISC).
        O CofDesk não usa imagens, fotos, ilustrações ou fontes de terceiros: os desenhos da página inicial são feitos em código e o texto
        usa as fontes do seu próprio sistema.
      </p>
      {error && <p>Não foi possível carregar a lista. Rode <code>npm run licenses</code> para gerá-la.</p>}
      {!list && !error && <p>Carregando…</p>}
      {list && (
        <ul className="legal-licenses">
          {list.map(p => (
            <li key={p.name}>
              <details>
                <summary><strong>{p.name}</strong> {p.version} · {p.license}</summary>
                {p.repository && <p><a href={p.repository} target="_blank" rel="noreferrer noopener">{p.repository}</a></p>}
                {p.text ? <pre>{p.text}</pre> : <p>Texto da licença: {p.license}.</p>}
              </details>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
