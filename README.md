# CofDesk — workspace de páginas e bancos de dados

Nome provisório. Frontend React + TypeScript + Vite; backend próprio em Node.js com SQLite embutido (sem serviços pagos).

```bash
npm install
npm run dev      # app em http://localhost:5173 + API em http://localhost:3001
npm run build    # compila o frontend em dist/
npm start        # produção: API + frontend compilado em http://localhost:3001
```

Requer Node.js 22.13+ (usa `node:sqlite` e roda TypeScript direto). O banco fica em `data/cofdesk.db`
(mude com `COFDESK_DB`; porta da API com `COFDESK_API_PORT`). Contas de teste locais: `server/test-users.example.json`.

**IA:** copie `.env.example` para `.env` e preencha `ANTHROPIC_API_KEY` (crie a chave em platform.claude.com).
O servidor lê o `.env` ao iniciar; sem a chave, tudo funciona menos a IA, que mostra um aviso.

### Backend (fase 1 — pronto)

- Contas: cadastro, login, logout, sessões de 30 dias, senhas com scrypt
- Workspaces: vários por usuário, renomear, convidar membros por e-mail (Editor ou Leitor), remover
- Sincronização: edições enviadas ao servidor em ~0,7 s, outras pessoas/dispositivos recebem em até 4 s
  (última gravação vence por página), cache local para abrir rápido, reenvio automático ao voltar a ficar online

| Rota | O que faz |
|---|---|
| `POST /api/auth/register` · `login` · `logout` | contas e sessões |
| `GET/PATCH /api/me` | usuário e workspaces |
| `POST /api/workspaces` · `PATCH /api/workspaces/:id` | criar / renomear |
| `GET/POST /api/workspaces/:id/members` · `DELETE …/members/:userId` | membros |
| `GET /api/workspaces/:id/pages?since=` | baixar alterações |
| `POST /api/workspaces/:id/sync` | enviar alterações e exclusões |

## O que já existe (v0.1)

- **Editor de blocos**: texto, títulos 1–3, listas (marcadores, numerada, tarefas), alternância, citação, destaque, divisor, código, imagem (URL ou upload), subpágina, banco de dados inline
- Menu `/` com busca, atalhos Markdown (`#`, `##`, `-`, `1.`, `[]`, `>`, `"`, ```` ``` ````, `---`), negrito/itálico com Ctrl+B/I
- Arrastar e soltar blocos, duplicar, excluir, “transformar em”
- **Páginas** aninhadas, ícone, capa, largura total, favoritos, lixeira (restaurar/excluir), duplicar
- **Bancos de dados**: propriedades texto, número, seleção, seleção múltipla, status, data, caixa, URL, e-mail, telefone, criado em
- **Visualizações**: tabela (com soma), quadro (kanban com arrastar), calendário (com arrastar), galeria, lista e **gráficos** (barras, barras horizontais, linha, área, pizza, rosca — contagem/soma/média/mín/máx) — tudo gratuito
- Filtro, ordenação e busca por visualização
- Busca global (Ctrl+K), modo escuro, exportar Markdown, backup/importação JSON

### Colaboração (fase 2 — pronto)

- **Tempo real** via WebSocket (`/ws`): alterações chegam aos outros em menos de 1 s
- **Mesclagem por bloco** no navegador e no servidor: duas pessoas editando blocos diferentes da mesma página não se sobrescrevem
  (no mesmo bloco, vale a última gravação)
- **Presença**: avatares de quem está na página e marcador colorido no bloco que cada pessoa está editando
- **Comentários** na página ou em um bloco (menu ⋮⋮ → Comentar), respostas, resolver/reabrir, excluir
- **Menções** com `@` (autocompletar entre os membros) e **Caixa de entrada** com contador de não lidas
- **Compartilhar**: link interno da página (`/#/id`) e **publicar na web** (`/p/token`, somente leitura, inclui subpáginas), despublicar

### Interface (redesenho no padrão Notion)

- Login e cadastro em etapas (e-mail → senha ou criar conta); cadastro em cartão sobre o app desfocado
- Barra lateral: seletor de workspace, Buscar, Página inicial, Caixa de entrada, Favoritos, Privado, Configurações, Modelos, Lixeira, Convidar membros
- Página inicial: saudação, Visitados recentemente, Próximos eventos (datas dos bancos de dados) e Modelos em destaque
- Ícones de linha (Lucide, licença ISC) em toda a interface; páginas aceitam ícones de linha coloridos ou emoji
- Barra superior com "Editado há…", Compartilhar, comentários, favorito e menu ⋯; tipografia, cores e sombras no padrão Notion, claro e escuro
- Identidade própria (nome, logo e textos do CofDesk) — não usa marca, logo nem ilustrações do Notion

### Login: Google ou e-mail e senha

- **Continuar com Google** (OpenID Connect com `state`, `nonce` e PKCE). Conta nova é criada no primeiro login; se já
  existe uma conta com o mesmo e-mail, as duas são ligadas
- **E-mail e senha** com confirmação: o cadastro envia um código de 6 dígitos (vale 15 min, reenvio após 60 s,
  5 tentativas) e a conta só é criada depois do código. Isso impede cadastrar o e-mail de outra pessoa
- A volta do Google traz só um código de uso único (2 min) que o app troca pela sessão; o token nunca aparece na URL
- Contas criadas pelo Google não têm senha; o login por e-mail avisa para usar o botão do Google
- Configuração em `.env` (veja `.env.example`):
  - **Google**: Google Cloud Console → *Google Auth Platform* → *Clientes* → aplicativo da Web, com o redirecionamento
    `{PUBLIC_URL}/api/auth/google/callback`. Para a Agenda, ative a *Google Calendar API* e o escopo `calendar.readonly`.
    Para qualquer pessoa usar, publique o app e passe pela verificação do Google (exigida por causa da Agenda)
  - **E-mail**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. Sem SMTP, em desenvolvimento o código
    aparece no terminal do servidor
- Login com Apple ficou de fora por decisão: exige a conta paga do Apple Developer. Quem usa iPhone entra com Google ou
  e-mail e conecta o calendário do iCloud de graça

### Calendários conectados

- Item **Calendário** na barra lateral: mês com eventos do Google Agenda, do iCloud e dos itens com data dos bancos de dados
- **Google Agenda**: autorização OAuth só de leitura; o token de renovação fica criptografado e é revogado ao desconectar
- **iCloud**: a Apple não tem API OAuth de calendário. A conexão usa CalDAV (o padrão usado por outros apps) com uma
  *senha de app* criada em account.apple.com — nunca a senha do Apple ID. Fica criptografada; as credenciais só são
  enviadas a `*.icloud.com`
- Os próximos 30 dias aparecem também em *Próximos eventos* na página inicial
- Rotas: `GET /api/calendar/connections`, `POST /api/calendar/google`, `POST /api/calendar/icloud`,
  `DELETE /api/calendar/connections/:id`, `GET /api/calendar/events?from=&to=`
- Segredos guardados com AES-256-GCM. Em produção defina `COFDESK_SECRET`; em desenvolvimento uma chave é criada em `data/secret.key`

### Página de apresentação

- Quem não está logado vê em `/` uma apresentação do produto: cabeçalho com Produto, Recursos, Equipes, Modelos e Preços,
  e **Entrar** / **Comece grátis** no canto superior direito; destaque com o app em ação (pessoas editando ao vivo),
  abas com documentos, projetos, gráficos, linha do tempo e wiki, recursos incluídos, colaboração, modelos, preço, plataformas
- Login em `/login` e cadastro em `/signup` (o logo volta para a apresentação); funciona no tema claro e escuro e no celular
- As imagens do app são desenhadas em HTML (`src/components/Landing.tsx`, estilos em `src/landing.css`)

### Editor avançado (fase 3 — pronto)

- **Blocos aninhados**: `Tab` / `Shift+Tab` aninham qualquer bloco junto com os filhos; listas mudam de marcador (• ◦ ▪) e de numeração (1. a. i.) por nível; alternâncias guardam blocos filhos e escondem tudo quando fechadas; `Enter` numa lista vazia diminui o recuo
- **Colunas**: `/2 colunas`, `/3 colunas`, `/4 colunas`, ou arraste um bloco pela alça ⋮⋮ até a borda esquerda/direita de outro; arrastar entre colunas e página funciona, e uma coluna vazia some sozinha ("Desfazer colunas" no menu da alça)
- **Tabela simples**: `/tabela simples`; `Tab` anda entre células (e cria linha no fim), `Enter` desce; botões + para linha/coluna; clique direito numa célula para inserir/excluir; linha de cabeçalho no menu da alça
- **Embeds**: `/vídeo` (YouTube, Vimeo, Loom, .mp4), `/incorporar` (Figma, Google Docs, Spotify, CodePen ou qualquer site que permita), `/google maps` (endereço ou link), `/marcador web` (cartão com título, descrição e imagem). Colar um link numa linha vazia oferece manter como link, criar marcador ou incorporar
- Prévias de link vêm de `GET /api/unfurl?url=` (só usuários logados; endereços da rede local são bloqueados)
- Exportação Markdown inclui recuo, colunas, tabelas e links

### Bancos de dados avançados (fase 4 — pronto)

- **Relação**: liga linhas de um banco a páginas de outro (ou do mesmo). "Mostrar também em…" cria a propriedade espelho no outro banco, e os dois lados ficam sempre iguais. Na célula, busque, marque ou crie páginas
- **Rollup**: a partir de uma relação, calcula sobre uma propriedade das páginas ligadas: mostrar original, contar (tudo/valores/únicos), soma, média, mínimo, máximo, intervalo, data mais antiga/recente, % marcadas, % vazias
- **Fórmula**: linguagem própria parecida com a do Notion (`prop("Horas") * 120`, `if(...)`, `ifs(...)`, `dateBetween(prop("Data"), today(), "days")`, `formatDate`, `round`, `concat`, `contains`…), com validação e prévia do resultado enquanto você digita e lista de funções no editor
- Fórmulas e rollups entram em ordenação, soma do rodapé da tabela e gráficos
- **Linha do tempo** (Gantt): início e fim a partir de propriedades de data; zoom em dias/semanas/meses; arraste a barra para mover, as bordas para mudar início/fim; clique duas vezes numa linha sem data para criar a barra; linha vermelha de hoje
- **Dashboard**: visualização com vários blocos (gráficos e números), cada um de qualquer banco do workspace; meia largura ou largura inteira, reordenar, excluir. Um dashboard novo já vem com blocos sugeridos a partir das propriedades

### Histórico de versões e IA (fase 5 — pronto)

- **Histórico de versões**: toda gravação vira uma versão no servidor (edições seguidas da mesma pessoa em até 10 min
  formam uma versão só). Menu ⋯ da página → *Histórico de versões*: lista com autor e horário, pré-visualização e
  *Restaurar*. Restaurar não apaga nada: a versão de antes continua no histórico
- **IA no editor** (Claude, modelo `claude-opus-5-5`): aperte **espaço** numa linha vazia, digite `/ia`, ou use *Pedir à IA*
  no menu da alça ⋮⋮
  - linha vazia: continuar escrevendo, resumir a página, encontrar tarefas, ter ideias, traduzir, ou um pedido livre
  - bloco com texto: melhorar a escrita, corrigir ortografia, encurtar, alongar, simplificar, explicar, traduzir
  - a resposta aparece enquanto é escrita; depois: *Inserir abaixo*, *Substituir*, *Tentar de novo*, *Descartar*, ou
    um pedido de ajuste ("deixe mais formal")
- **Perguntar ao workspace** (barra lateral ou **Ctrl+J**): a IA lê as páginas e bancos de dados mais relacionados à
  pergunta (incluindo fórmulas e rollups) e responde citando as páginas, com links para abri-las
- Rotas: `GET /api/workspaces/:id/pages/:pageId/versions`, `GET …/versions/:versionId`, `POST …/ai` e `POST …/ask`
  (respostas em streaming de texto). A chave da API fica só no servidor
- Recusas de segurança do modelo caem automaticamente num modelo reserva (`fallbacks: "default"`)

### Privacidade (LGPD), termos e acessibilidade

- **Documentos legais**: `/privacidade` (Política de Privacidade), `/termos` (Termos de Uso), `/cookies` e `/licencas`
  (licenças de código aberto, gerada por `npm run licenses` antes de cada build). Os dados do responsável ficam em
  [src/legal.ts](src/legal.ts) e precisam ser preenchidos antes de publicar (a página mostra um aviso de rascunho enquanto não)
- **Sem rastreamento**: nenhum cookie próprio, nenhuma ferramenta de análise ou publicidade. O navegador guarda só o necessário
  (`cofdesk-auth`, `cofdesk-workspace`, `cofdesk-public-view`, `cofdesk-consent`)
- **Consentimento**: aviso na primeira visita com *Aceitar todos*, *Somente necessários* e *Personalizar*, todos com o mesmo
  destaque; reabre em *Preferências de cookies* nos rodapés. Vídeos, mapas e outros conteúdos de terceiros só carregam com
  consentimento (ou um por vez, em *Carregar este conteúdo*)
- **Direitos do titular** (menu do workspace → *Minha conta e privacidade*): corrigir o nome, **baixar todos os dados** em JSON
  (`GET /api/me/export`) e **excluir a conta** (`POST /api/me/delete`, com e-mail e senha). Um workspace com outros membros
  passa para um deles; sem membros, é apagado. As agendas conectadas são desconectadas e o acesso no Google é revogado
- **Registros de acesso** (Marco Civil, art. 15): IP, porta, data e hora de login e cadastro, guardados por 6 meses e apagados
  automaticamente. Atrás de um proxy (Nginx, Cloudflare…), defina `TRUST_PROXY=1` para registrar o IP real
- **Limpeza automática** a cada hora: sessões vencidas, cadastros não confirmados e registros com mais de 6 meses
- **Segurança**: cabeçalhos `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e
  `Strict-Transport-Security` (com HTTPS); bloqueio de 15 min após 10 senhas erradas; páginas publicadas com `noindex`
  e link *Denunciar página*
- **Acessibilidade** (WCAG 2.2 AA, verificada com axe-core em todas as telas, nos temas claro e escuro): contraste corrigido,
  contorno de foco visível, *Pular para o conteúdo*, diálogos com foco preso e Esc, menus que recebem o foco pelo teclado,
  cartões e linhas acessíveis por Tab/Enter, rótulos em todos os campos, respeito a "reduzir movimento"

**Antes de publicar**: preencha [src/legal.ts](src/legal.ts); crie o e-mail de privacidade; no Google Cloud Console
(*Branding* da tela de consentimento OAuth) informe `{PUBLIC_URL}/privacidade` e `{PUBLIC_URL}/termos`; confirme que o
provedor de hospedagem apaga backups em até 30 dias (prazo citado na política).

## Roteiro

| Fase | Entregas |
|---|---|
| ~~1. Backend e contas~~ | ✅ Feito (servidor próprio). Pendente: recuperar senha por e-mail, upload de arquivos no servidor, hospedagem na nuvem |
| ~~2. Colaboração~~ | ✅ Feito. Pendente: edição simultânea do mesmo bloco letra a letra (CRDT), permissões por página, convidados externos, notificações por e-mail |
| ~~3. Editor avançado~~ | ✅ Feito: blocos aninhados, colunas, tabelas simples, embeds, marcadores web, modelos. Pendente: equações, blocos sincronizados, largura ajustável das colunas, upload de PDF/arquivos |
| ~~4. Bancos avançados~~ | ✅ Feito: relações (de mão dupla), rollups, fórmulas, linha do tempo, dashboards. Pendente: propriedades Pessoa e Arquivos, agrupamento na tabela, vários filtros combinados, filtros por bloco do dashboard |
| ~~5. Histórico e IA~~ | ✅ Feito: histórico ilimitado com restauração, IA no editor, perguntas ao workspace. Pendente: comparar versões lado a lado, IA dentro de bancos de dados (preencher propriedades), limite de uso por workspace |
| **6. Desktop** | Tauri (Windows/macOS/Linux) reutilizando este mesmo código |
| **7. Mobile** | Capacitor (iOS App Store / Google Play) reutilizando este mesmo código, com ajustes de toque |
