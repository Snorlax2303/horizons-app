# Horizons — memória operacional do projeto

> Este arquivo é o handoff permanente entre conversas, máquinas e agentes.
> Atualize-o ao fim de cada rodada relevante; não armazene segredos.

## Última revisão

- Data/hora: 2026-09-10 — correção do catálogo de apps e descoberta do catálogo de instalação do painel
- **Erro corrigido**: `WWPANEL_APPS`/`WWPANEL_XSTREAM_APPS` em `server/wplayCatalog.js` tinham
  uma lista **inventada** (`Wapp`, `WTV Player`, ...). A lista real (extraída do bundle oficial
  do painel + spec) tem 15 apps, com a rota decidida pelo nome: **WTV Player/Wapp, XCloud e
  Kplay** → `/lines/active/app/xstream`; os outros 12 (BrasilIPTV, EasyPlayer, IPTVPlus,
  IPTVNextPlayer, IPTVPlayerio, IPTVProPlayer, IPTVStarPlayer, IPlayer, OttPlayer, TVVision,
  TiviPlayerIPTV, IPTV4K) → `/lines/active/app`. Não inferir nomes: só valem esses.
- **Ativação por MAC confirmada**: `POST /lines/active/app` exige `nameApp`, `mac`,
  `namePlaylist` e `id_user` (número = id da linha). MAC sozinho não basta; como a linha é
  nossa, o `id_user` já existe → o cliente só precisa mandar o MAC (ou o código do app).
- **Descoberta importante**: o painel já mantém o catálogo de instalação em `GET /panel-links`
  (15 itens) — código Downloader, códigos da Play Store (M7 Download / XS Control / Loja SSH e
  ntDown), link direto, loja, e canal por plataforma (ex.: `Roku Store: busque Krator+`,
  `LG Store: busque Krator+`, Android TV via TV Bro + loja). Os templates por produto já vêm
  com `{{usuário}}`/`{{senha}}`. Portanto **não** precisamos escrever a orientação do zero:
  o fluxo pode consumir isso do painel.
- **Fluxo desenhado com o dono**: cliente informa a marca/aparelho → bot mostra os apps padrão
  daquela TV → se o cliente achar, ele instala e manda o MAC (ou o código do app); se não achar,
  o bot mostra o resto da lista, o cliente escolhe e manda o MAC → bot ativa no painel com
  `{ nameApp, mac, namePlaylist: <nome do usuário>, id_user }`.
- **Matriz de produtos confirmada na fonte** (`GET /products`, 8 itens): Essencial 2 IPTV + 1 P2P
  (id 2), Premium 1 IPTV + 2 Nexus (id 5), Ultra 1 Krator+ (id 11, streamings **WHOT + KRATOR**),
  Whot (id 10); adicionais Nexus (7), IPTV e P2P (8), Whot (9), Krator+ (12). Registrada em
  `docs/wplay-produtos-e-instalacao.md`, junto da compatibilidade por produto e do fluxo guiado.
  **Ponto de atenção**: o Ultra 1 Krator+ já carrega WHOT nos streamings — decidir se o adulto
  fica à parte. **Nexus**: o catálogo só oferece canais Android (Downloader/Play Store), sem
  Roku/LG/Samsung — indício forte de Android-only, confirmar.
- **Orientação de instalação implementada** (somente leitura): `server/wplayInstall.js` lê o
  catálogo `GET /panel-links` do painel (com cache de 10 min), normaliza marca/aparelho e resolve
  o template certo por produto — nada de orientação escrita à mão, o painel segue mandando.
  Nova rota `GET /wplay/install?product=&brand=&username=&password=` devolve o texto pronto
  (com `{{usuário}}`/`{{senha}}` preenchidos quando informados) + lista de sugestões. Regra
  embutida: **Nexus fora de Android devolve `found:false` (`nexus_android_only`)**.
  `server/wplayInstall.test.js` cobre normalização, placeholders, Nexus e cache.
- **Fluxo de teste→app aprovado pelo dono (2026-09-11)**: o bot cria o **teste** e já **ativa o
  app no próprio teste** — ativar app em teste **não consome crédito**, então o cliente assiste
  durante o trial. A linha de produção só é criada/ativada **depois do pagamento**.
- **Vínculo cliente ↔ linha implementado**: migração `20260911120000_wplay_customer_lines.sql`
  (não aplicada) adiciona a `customer_panel_targets` as colunas `external_line_id`,
  `external_line_kind` (`test`/`production`) e `external_test_line_id`; e a
  `customer_access_credentials` o `mac_address` e `app_activated_at`. É o `id_user` que amarra a
  ativação do app — o MAC sozinho não identifica a linha.
- **Rota `/wplay/tests` corrigida**: `testDuration` agora é **horas** (número; `'4h'` é aceito e
  convertido), e a rota **roteia por produto** — `krator` → `POST /lines/krator/test` (exige
  `package_krator` + `serviceId`), `nexus` → `POST /lines/nexus/test` (exige `package_nexus`),
  `iptv`/`p2p` → `POST /lines/test`. Nova leitura `GET /wplay/services` entrega o `serviceId`.
- **Fluxo do bot (n8n) alterado com autorização do dono (2026-09-11)**: o teste passou a ser
  **WPlay** (substitui o CineHub), com entrega da instalação vinda do painel e ativação do app
  pelo MAC. O bot fala com rotas novas da ponte: `GET /typebot/wplay/status`,
  `POST /typebot/wplay/install` (leitura), `POST /typebot/wplay/trials` e
  `POST /typebot/wplay/app` (escrita, atrás do gate). Implementado em `server/wplayBotFlow.js`
  (com casamento do nome do app dito pelo cliente contra a lista real do painel e extração de MAC)
  e ligado em `server/api.js`.
- **Migração `20260911120000_wplay_customer_lines.sql` aplicada** no Supabase via Management API
  e conferida por leitura: `customer_panel_targets.external_line_id`,
  `external_line_kind`, `external_test_line_id` e `customer_access_credentials.mac_address`,
  `app_activated_at` existem.
- **Workflow do n8n atualizado** (36 → 44 nós, backup em `/root/n8n/.horizons-whatsapp-completo-backup-*.json`):
  novos nós `Checar WPlay`, `WPlay pronto?`, `Criar teste WPlay`, `Buscar instalação WPlay`,
  `Montar entrega WPlay`, `É ativar app?`, `Ativar app WPlay`, `Confirmar ativação WPlay`; o passo
  `wplay_mac` foi adicionado ao `Decidir etapa` (aparelho → marca → pacote → teste → MAC).
- **Importante — o fluxo novo está seguro, mas ainda não ativo**: `WPlay pronto?` só desvia para o
  WPlay quando `GET /typebot/wplay/status` devolve `enabled:true`, o que depende de
  `WWPANEL_WRITES_ENABLED=true`. Com o gate desligado o bot **segue no caminho antigo (CineHub)**,
  verificado ponta a ponta (teste e ativação respondem `503 writes_disabled`, **sem consumir crédito**).
  O menu de pacotes hoje só oferece **IPTV/P2P (4/8/24h)**; Krator+/Nexus/Ultra ainda não entram.
- **`api` reconstruído e recriado** (`docker compose -f docker-compose.vps.yml build api` + `up -d api`):
  o container rodava imagem antiga, anterior às rotas WPlay. Health 200 após 2s; rotas conferidas
  (`401` sem token). O `frontend` **não** foi reconstruído (a página `/wplay` segue pendente).
- Verificação: lint limpo, **87 testes** aprovados, `git diff --check` limpo. Nenhuma operação de
  escrita no painel nesta rodada.
- **Decidido pelo dono (2026-09-11)**: o fluxo guiado roda no **bot do cliente (WhatsApp)**, que
  hoje está **no n8n** — não é mais Typebot. O Telegram do dono é assistente pessoal. Nexus
  confirmado **Android-only**; **Whot não terá plano próprio** (só embutido no Ultra 1 Krator+).
- **Pendente**: a rota `/wplay/tests` ainda usa `testDuration` como string (`'4h'`) quando o
  painel espera número (horas), e falta `krator_package`/`serviceId` para teste Krator+; também
  falta o vínculo cliente ↔ `id_user` da linha WPlay para a ativação por MAC.
- Data/hora: 2026-09-10 — primeiro teste **real** no painel WPlay (Krator+) e esquema exato confirmado
- **Feito com autorização explícita do dono** ("crie o teste no krator+"). Uma única
  operação real foi executada; ela consome crédito.
- **Teste Krator+ criado com sucesso** (`HTTP 201`, id `105393227`, username `pg89992`,
  validade 1h, `krator_package "1"`, P2P e IPTV `1. Brasil`). As credenciais do teste
  foram entregues apenas ao dono no chat e **não** foram gravadas aqui.
- **Esquema real confirmado** (spec público em `https://mcapi.knewcms.com:2087/api-json`):
  o teste comum é `POST /lines/test` e o Krator+ é `POST /lines/krator/test` (este último
  **não** aparece no OpenAPI, mas é o que o painel usa). Campos do Krator+:
  `krator_package:"1"`, `package_p2p`, `package_iptv`, `testDuration` (**horas**; padrão 1h
  no Krator+, 4h no Wplay, 24h no Nexus), `serviceId` (obrigatório, vindo de
  `GET /lines/wapp/services`) e `custom_package` opcional. **Não existe campo de nome**
  para teste no painel.
- **Correção aplicada (2026-09-11)**: a rota `/wplay/tests` agora envia `testDuration` em
  **horas** e roteia Krator+ para `POST /lines/krator/test` com `krator_package` + `serviceId`
  (lido de `GET /wplay/services`), e Nexus para `POST /lines/nexus/test`. Falta apenas
  aplicar a migração de vínculo e ligar as escritas quando o dono autorizar.
- **Limpeza concluída**: o teste Nexus não intencional (id `105393213`) foi excluído
  com autorização do dono (`DELETE /lines/{id}` → `{"msg":"Line deletada"}`). O teste
  Krator+ `105393227` permanece. Lição registrada: nesse painel, corpo vazio **não**
  garante ausência de efeito colateral — nunca sondar endpoint de escrita sem
  confirmar isso antes.
- A operação foi feita pelo cliente verificado (`server/wplayPanel.js`) direto no painel;
  a rota HTTP do Horizons continua atrás do gate `WWPANEL_WRITES_ENABLED=false` e o
  container `api` **não** foi reiniciado.
- Data/hora: 2026-09-12 — vínculo cliente ↔ linha WPlay (`id_user`) + Opção B
- **Vínculo** (`server/wplayLink.js`): toda escrita que conhece o cliente grava a
  linha do painel em `customer_panel_targets` — `external_line_id`/`external_customer_id`
  (kind `production`) ou `external_test_line_id` (kind `test`). A ativação de app por
  MAC agora resolve o `id_user` pelo vínculo (rota e ponte do bot) e registra
  `mac_address`/`app_activated_at` em `customer_access_credentials`. Trial via bot
  (`/typebot/wplay/trials`) aceita `customerId` e vincula sozinho.
- **Opção B (decisão do dono: SEMPRE validar pagamento antes de criar/renovar)**:
  `paymentGate` nas rotas de criação de cliente pago, extend, +48h, plano e activate.
  Prova de pagamento = `customers.paid` OU `payment_events` status `paid` na janela
  `WWPANEL_PAYMENT_WINDOW_DAYS` (padrão 14). Sem cliente vinculado → 400
  `customer_missing`; sem pagamento → 402 `payment_unconfirmed`. Trials seguem livres
  (pré-venda, sem crédito de plano).
- **Ponte do bot** também agora respeita as flags granulares (trials exige
  `WWPANEL_TESTS_ENABLED`, app exige `WWPANEL_APP_ACTIVATION_ENABLED`).
- **Testes**: 100/100 (novos: gates de pagamento, vínculo de produção/teste, resolução
  de `id_user`, registro de MAC).
- Data/hora: 2026-09-11 — gate granular por operação WPlay implementado e publicado (Opção A)
- **Entregue**: `WWPANEL_WRITES_ENABLED` segue como chave-mestra e cada operação ganhou
  flag própria em `server/config.js` — `WWPANEL_TESTS_ENABLED`, `WWPANEL_CUSTOMERS_ENABLED`,
  `WWPANEL_RENEWALS_ENABLED` e `WWPANEL_APP_ACTIVATION_ENABLED` (todas `false` por padrão).
  `operationDisabled()` em `server/routes/wplay.js` responde 403 nomeando a operação, e
  `GET /wplay/status` expõe `operations.{test,customer,renewal,app_activation}`.
- **Testes**: 92/92 verdes, incluindo 5 novos que cobrem cada flag (bloqueio e liberação).
- **Deploy**: container `api` reconstruído e recriado via `docker compose -f docker-compose.vps.yml`;
  saúde 200, `/wplay/*` devolve 401 sem token, as quatro flags presentes no container. As
  escritas seguem globalmente desligadas (`writes_disabled`), sem consumo de crédito.
- **Correção de infra**: o `.env` estava corrompido com linhas `***` (caracteres inválidos
  que quebravam o `docker compose`); removidas e substituídas pelas 4 flags corretas.
  Backup em `.env.bak.<ts>`.
- **Incidente de modelo**: a sessão do assistente estava fixada em `deepseek/deepseek-v4-flash`,
  referência inexistente no provider `deepseek` (que só tem `deepseek-chat`/`deepseek-reasoner`)
  — provável causa das respostas degradadas. Sessão re-apontada para `qwen/qwen3.7-plus`
  (válido e na allowlist).
- Data/hora: 2026-09-10 — integração WPlay (fluxos 1–3) pronta, sem operações reais
- **Escopo autorizado**: fluxos de teste (trial) + app, cliente + renovação e app
  licenciado, expostos em página nova, nas telas existentes e no bot/n8n. O
  proprietário pediu explicitamente **nenhuma** operação real que consuma
  crédito nesta rodada; tudo ficou atrás de gate desligado.
- **Backend**: `server/routes/wplay.js` registra `/wplay/status`,
  `/wplay/catalog`, `/wplay/tests`, `/wplay/apps/activate`,
  `/wplay/apps/activate-xstream`, `/wplay/customers`, `/wplay/customers/:id/extend`,
  `/wplay/customers/:id/add-48h`, `/wplay/customers/:id/plan` e
  `/wplay/customers/:id/activate`. Todas autenticadas; as de escrita passam por
  `WWPANEL_WRITES_ENABLED` (403 quando desligado) e chave ausente vira 503.
  Cada tentativa é auditada: log estruturado sanitizado + inserção opcional em
  `wplay_operations` (tolerante à ausência da tabela).
- **Migration** `supabase/migrations/20260910120000_wplay_operations.sql` criada
  e **não aplicada**; sem ela a auditoria cai no log estruturado.
- **Frontend**: nova página `src/pages/WplayPanel.jsx` na rota `/wplay` (com
  item no Sidebar e dry-run quando as escritas estão desligadas) e atalhos para
  o painel em `/testes`, `/clientes` e `/renovacoes`.
- **Bot/n8n**: comando `/wplay` somente leitura no bot administrativo e o
  contrato `docs/n8n-wplay.md` (o n8n fala com o Horizons, nunca com o painel
  direto, e nada foi criado/publicado no n8n).
- **Configuração**: `WWPANEL_API_URL`, `WWPANEL_API_KEY` (no `.env` protegido) e
  `WWPANEL_WRITES_ENABLED=false`, documentados no `.env.local.example`.
- Verificação: lint sem erros, **58 testes** aprovados (eram 50), build e
  `git diff --check` limpos. Nenhum cliente, teste, renovação, app ou crédito
  foi criado no painel; nenhum serviço foi reiniciado.
- Pendente do operador: (1) aplicar a migration de auditoria no Supabase;
  (2) recriar `api` e `frontend` para publicar rota e tela; (3) ligar
  `WWPANEL_WRITES_ENABLED=true` só quando for executar operações reais. Como a
  chave foi enviada no chat, recomenda-se rotacioná-la após a homologação.
- Data/hora: 2026-09-10 — base da integração WPlay (wwpanel) preparada sem operações reais
- O proprietário apresentou o painel **WPlay** (`wwpanel.link`), novo e fora da
  lista atual, que expõe API HTTP própria (docs em `https://docs.wplay.com.br`)
  na base `https://mcapi.knewcms.com:2087`, com autenticação por API key no
  header de autorização. A chave fornecida foi validada por chamadas sem efeito
  colateral: payload vazio → `400` de validação, id inexistente → `404`, token
  inválido → `401`.
- Criada a base da integração, sem publicar nem executar nada no painel:
  `server/wplayCatalog.js` com os IDs oficiais (planos, add-ons, pacotes
  IPTV/P2P, Krator/Nexus, apps, países) e `server/wplayPanel.js` com o cliente
  HTTP (timeout, retry limitado para `429`/`5xx` respeitando `Retry-After`,
  erro com `statusCode` e métodos de teste/cliente/renovação/app/revendedor).
  `server/wplayPanel.test.js` cobre 7 casos com fetch simulado.
- Configuração: `WWPANEL_API_URL` e `WWPANEL_API_KEY` foram adicionadas ao
  `server/config.js`, ao `.env.local.example` (sem valor) e ao `.env` protegido
  (`0600`). A chave não entrou em código, Git, logs nem nesta memória.
- Verificação: lint sem erros, **50 testes** aprovados (eram 43),
  `git diff --check` limpo. Nenhum cliente, teste, renovação, app ou crédito foi
  criado no painel; nenhum serviço foi reiniciado.
- Pendência registrada no catálogo: o pacote P2P `5. Brasil + Portugal` veio na
  documentação com 23 caracteres (ObjectIds têm 24); confirmar com o painel
  antes de usar essa variante.
- Próximo passo: definir o escopo de exposição dos fluxos (teste, cliente,
  renovação, app, revendedor) e, quando autorizado, recriar o container `api`
  para carregar a variável nova. Toda escrita real no painel consome créditos e
  exige confirmação explícita do operador.
- Data/hora: 2026-09-04 — contrato do catálogo corrigido e coberto
- As rotas de catálogo e lista de renovação foram normalizadas para o contrato
  usado por `horizonsApi`: o navegador chama `/api/operations/...` e a API
  registra `/operations/...`. Foram removidos os prefixos duplicados nos
  consumidores de `/procedimentos`, `/novo-acesso`, Gerenciar acesso e `/baixa`.
- Os POSTs de delivery profiles e tutorial slots foram consolidados em
  `server/routes/catalog.js` e removidos de `server/routes/operations.js`. O
  cadastro agora usa validação Zod e grava `changed_by`; as rotas do catálogo
  ficaram reunidas no mesmo módulo.
- A leitura de delivery profiles agora devolve também os servidores CineHub
  ativos. O formulário de `/procedimentos` usa essa lista real e exige a seleção
  de servidor, em vez de oferecer somente `legacy`.
- Criado `server/catalog.test.js`, cobrindo o registro de GET/POST/PUT/DELETE e
  clone sem `/api` duplicado, a validação do cadastro, auditoria de criação e
  edição e remoção restritas ao proprietário. Lint, 13 suítes/43 testes,
  build e `git diff --check` passaram.
- Nenhum deploy, reinício, mensagem, cobrança, cliente ou painel externo foi
  alterado. Próximo passo: reconstruir API/frontend e fazer smoke autenticado
  de `/procedimentos`, `/novo-acesso` e `/baixa`; depois separar commits por
  domínio antes das demais homologações.
- Data/hora: 2026-09-04 — retomada e reconfirmação dos bloqueadores
- Retomada feita sem mensagens, cobranças, alterações de clientes, deploy ou
  operações em painéis externos. `frontend`, `api`, `worker` e `redis` estão
  ativos; Redis está saudável, a API respondeu `status=ok` e o frontend HTTP
  `200`. Nenhum serviço foi reiniciado.
- Lint, as 12 suítes/40 testes do backend, build e `git diff --check` passaram.
  O bundle principal continua grande (~1,36 MB; ~395 KB gzip).
- Confirmado o bloqueador de prefixo: `horizonsApi` já prefixa toda rota com
  `/api`, mas as leituras/edições/remoções, clone e refresh do catálogo em
  `ProcedimentosPaineis`, `NovoAcessoWizard` e
  `CustomerServerAccessModal` passam novamente `/api/operations/...`, gerando
  `/api/api/operations/...`. Os POSTs de criação usam `/operations/...` e por
  isso seguem outro contrato.
- Confirmado o bloqueador do formulário em `/procedimentos`: o seletor de
  servidor para cadastrar app oferece somente `legacy`, sem carregar os
  servidores CineHub. Também há um contêiner visual duplicado na seção de
  clone, embora o JSX compile.
- A suposta duplicidade ativa de POSTs do catálogo não se confirmou: os POSTs
  antigos em `server/api.js` permanecem ativos, enquanto o trecho adjacente que
  foi movido está dentro de comentário; `server/routes/catalog.js` ainda não
  implementa POST de delivery profile/tutorial. A correção deve primeiro
  uniformizar o contrato e adicionar testes, sem remover rotas no escuro.
- Próximo passo recomendado: corrigir os prefixos em todos os consumidores,
  carregar a lista real de servidores no formulário, remover o contêiner
  duplicado e cobrir GET/POST/PUT/DELETE/clone com testes focados. Depois fazer
  smoke autenticado de `/procedimentos`, `/novo-acesso`, Dashboard e financeiro;
  somente então separar o worktree grande em commits por domínio.
- Data/hora: 2026-09-02 16:08 BRT — diagnóstico consolidado das pendências atuais
- O estado técnico foi revisado sem executar mensagens, cobranças, alterações de
  clientes ou operações em painéis externos. API (`status=ok`), frontend (HTTP
  200), n8n e smoke operacional passaram; lint, 40 testes, build e
  `git diff --check` também passaram.
- **Bloqueadores identificados antes de consolidar/publicar**: chamadas novas de
  catálogo no frontend usam `/api/operations/...` embora `horizonsApi` já
  acrescente `/api`, gerando provável `/api/api/...`; há POSTs duplicados de
  delivery profiles/tutorial slots em `server/api.js` e no módulo extraído; e o
  formulário de app em `/procedimentos` aparentemente só permite o servidor
  `legacy`. Corrigir e cobrir esses contratos primeiro.
- O worktree continua propositalmente grande e não consolidado: dezenas de
  arquivos alterados/novos misturam navegação, dependências, modularização,
  migrations, financeiro, catálogo, Telegram e worker. Não fazer um commit ou
  publicação monolítica; separar em blocos revisáveis após corrigir os
  bloqueadores e executar validações focadas.
- A auditoria de produção atual encontrou **1 vulnerabilidade moderada** na
  dependência transitiva `qs`, com correção indicada pelo npm; nenhuma correção
  automática foi aplicada. O bundle principal está grande (~1,36 MB; ~395 KB
  gzip) e merece code splitting depois dos bloqueadores funcionais.
- **Ordem recomendada imediata**: (1) corrigir prefixos, duplicidade de handlers
  e seletor de servidor; (2) adicionar testes do catálogo/cliente HTTP e dos
  jobs; (3) validar migrations/RLS em ambiente descartável e fazer smoke
  autenticado do wizard, Dashboard e páginas financeiras; (4) organizar commits
  por domínio; (5) só depois tratar `qs`, bundle e homologações externas.
- Pendências manuais atuais: validar Dashboard/gráfico, `/saude`, `/novo-acesso`,
  catálogo e paginação; testar comandos Telegram informativos e o fluxo de
  confirmação dos comandos de escrita; recalcular e revisar pendências
  cadastrais; homologar o fluxo financeiro com comprovante controlado. Qualquer
  envio real, ativação de flag, teste Elite/P2P ou operação em painel segue
  exigindo confirmação explícita do proprietário.
- Data/hora: 2026-08-25 — tendências no Dashboard, mais comandos Telegram, auditoria e paginação
- **Tendências no Dashboard**: novo painel "Pagamentos confirmados
  (30 dias)" com `LineChart` do recharts consumindo
  `GET /api/billing/trends?days=30`. Mostra total recebido no período e
  a série diária de pagamentos.
- **Novos comandos Telegram**: `/semcheckout` (clientes ativos sem
  checkout) e `/hoje` (resumo do dia — lembretes, baixa, renovações e
  recuperação).
- **Auditoria `changed_by`**: migration
  `20260825140000_audit_change_columns.sql` aplicada em
  `server_delivery_profiles` e `tutorial_media_slots`. A API passa a
  gravar quem alterou em cada inserção/edição.
- **Paginação**: `/recovery/queue` e `/payments/overview` agora aceitam
  `?limit` e `?offset` e retornam `count`, `limit`, `offset`, `has_more`.
  `/billing/reminders/sendable` também paginado.
- Lint, 40 testes, build, diff-check, API `status=ok`, frontend 200 e
  smoke operacional passaram. Nenhuma mensagem, cobrança, cliente ou
  painel externo foi alterado.
- Próximo passo: testar `/hoje`, `/semcheckout` e abrir o Dashboard
  para ver o gráfico.
- Data/hora: 2026-08-25 — bot assistente (escrita + info), alerta Telegram, tendências e stale jobs
- **Comandos de escrita no Telegram**: novos atalhos `/aprovar <id>`
  e `/rejeitar <id>` para decidir lembretes de cobrança, e
  `/recuperar <id>` para marcar um cliente como recuperado. Todos
  passam pelo fluxo padrão de confirmação do bot (botões ✅/❌ com
  expiração de 10 minutos).
- **Comandos de informação**: novos atalhos `/semacesso`
  (clientes ativos sem acesso principal) e `/semcredenciais`
  (acessos com usuário/senha faltando).
- **Alerta financeiro no Telegram**: ao entrar em
  `awaiting_bank_review`, o sistema envia um resumo do comprovante
  para o Telegram do administrador, gated por
  `HORIZONS_TELEGRAM_FINANCIAL_ALERTS_ENABLED`.
- **Tendências financeiras**: novo endpoint
  `GET /api/billing/trends?days=30` retornando a série diária de
  pagamentos confirmados (`payment_events`) para gráficos e análises.
- **Worker de catálogo vencido**: job BullMQ recorrente
  `stale-delivery-profiles` (cron padrão semanal, segunda 03:00)
  desativa `server_delivery_profiles` com `valid_until` no passado.
  Gate: `HORIZONS_STALE_CATALOG_CHECK_ENABLED`.
- Lint, 40 testes, build, diff-check, API `status=ok`, frontend 200 e
  smoke operacional passaram. Nenhuma mensagem, cobrança, cliente ou
  painel externo foi alterado.
- Próximo passo: você testar `/semacesso`, `/semcredenciais`, `/aprovar`,
  `/rejeitar`, `/recuperar` no Telegram e ver o retorno.
- Data/hora: 2026-08-25 — bot assistente, wizard, clone, refresh e auditoria
- **Bot assistente Telegram (comandos financeiros)**: novo módulo
  `server/telegramCommands.js` com atalhos `/baixa`,
  `/recuperacao`, `/renovacoes`, `/digest` e `/lembretes`.
  O handler Telegram do bot administrativo identifica comandos diretos
  e responde sem passar pelo MiniMax. Cada execução é auditada em
  `admin_assistant_audit`.
- **Wizard de novo acesso** (`/novo-acesso`): nova página
  `src/pages/NovoAcessoWizard.jsx` com passos Cliente → Servidor →
  Plano → Apps → Concluir. Cria a migração, gera os apps do catálogo
  automaticamente e mostra o resumo.
- **Clone de catálogo entre servidores**: novo endpoint
  `POST /api/operations/delivery-profiles/clone` que copia os apps de
  um servidor para outro (idempotente). Botão “Clonar” em
  `/procedimentos`.
- **Atualização do catálogo Elite IPTV**: novo módulo
  `server/refreshEliteCatalog.js` e endpoint
  `POST /api/operations/delivery-profiles/refresh-elite`. Cada clique
  cria um teste no painel Elite e atualiza códigos/URLs/instruções
  dos delivery_profiles já existentes. Botão “Atualizar catálogo Elite”
  em `/procedimentos`.
- **Auditoria de credenciais**: nova migration
  `20260825130000_customer_access_credentials_audit.sql` adiciona
  `changed_by`. A API grava quem alterou e a UI mostra “Atualizado em”
  em cada app do Gerenciar acesso.
- Lint, 40 testes, build, diff-check, API `status=ok`, frontend 200 e
  smoke operacional passaram. Nenhuma mensagem, cobrança, cliente ou
  painel externo foi alterado.
- Próximo passo: você pode testar `/novo-acesso` com um cliente real;
  o botão “Atualizar catálogo Elite” deve ser usado uma vez por mês
  para manter os códigos em dia.
- Data/hora: 2026-08-25 — catálogo Elite IPTV pré-cadastrado e geração automática
- **Catálogo Elite IPTV**: dois scripts idempotentes cadastraram 18 apps
  (`server_delivery_profiles`) e 3 procedimentos padrão
  (`tutorial_media_slots`) para o servidor Elite IPTV a partir da
  devolutiva do painel. WEBPLAYER, Ultramix, Lótus, XCIPTV, Elite TV e os
  5 apps parceiros (Vizzion Play, Blessed Player, Epic Play, Play Sim,
  Assist+) já estão prontos no `/procedimentos` para uso pelo operador.
- **Geração automática de credenciais**: novo endpoint
  `POST /customers/:id/server-accesses/credentials/from-catalog/:targetId`
  copia os apps do catálogo para um acesso de cliente, idempotente. O
  modal **Gerenciar acesso** chama esse endpoint automaticamente após
  cada migração, criando os apps pré-preenchidos; o operador só digita
  usuário e senha de cada um.
- Lint, 40 testes, build, diff-check, API `status=ok`, frontend 200 e
  smoke operacional passaram. Nenhuma mensagem, cobrança, cliente ou
  painel externo foi alterado.
- Próximo passo: ao migrar ou vincular um cliente para Elite IPTV pelo
  Gerenciar acesso, os apps já aparecerão pré-preenchidos.
- Data/hora: 2026-08-25 — catálogo de apps e procedimentos por servidor
- **Catálogo reutilizável**: nova migration
  `20260825110000_link_tutorials_to_delivery_profiles.sql` adiciona
  `display_order` em `server_delivery_profiles` e vincula
  `tutorial_media_slots` ao app correspondente via
  `server_delivery_profile_id`.
- **API do catálogo**: novo módulo `server/routes/catalog.js` com
  `GET /api/operations/delivery-profiles` (filtros por servidor/categoria),
  `PUT/DELETE` dos delivery profiles e dos tutorial slots.
- **Página /procedimentos reescrita**: agora CRUD dinâmico. Lista os
  apps cadastrados por servidor e os procedimentos de instalação por
  categoria de aparelho, com formulários de cadastro/edição/remoção. Os
  procedimentos podem ser vinculados a um app específico do catálogo.
- **Gerenciar acesso**: o modal de cadastro de app passou a oferecer um
  campo “Selecionar app do catálogo” que preenche automaticamente nome,
  URL, código e notas a partir de `server_delivery_profiles` filtrado
  pelo servidor e categoria do cliente. O operador digita apenas
  usuário e senha do cliente.
- Lint, 40 testes, build, diff-check, API `status=ok`, frontend 200 e
  smoke operacional passaram. Nenhuma mensagem, cobrança, cliente ou
  painel externo foi alterado.
- Próximo passo: você cadastrar os apps do servidor Elite no
  /procedimentos e depois usar o catálogo para preencher os acessos dos
  clientes rapidamente.
- Data/hora: 2026-08-25 — credenciais por app e lista via WhatsApp
- **Credenciais por app**: nova migration
  `20260825100000_customer_access_credentials.sql` cria a tabela
  `customer_access_credentials` (sem DNS) com categoria, app, URL de
  instalação, código, usuário, senha cifrada e notas. Endpoints novos:
  `POST/GET/PUT/DELETE /api/customers/:id/server-accesses/credentials`.
  O modal **Gerenciar acesso** lista os apps do acesso principal e permite
  cadastrar, editar e remover por categoria (Smart TV, Android/Google TV,
  Fire TV, TV Box, Celular, iPhone/iPad, Computador, Console, Outro).
- **Lista de renovação bonitinha**: `GET /api/operations/renewal-list` agora
  devolve os apps decriptados de cada cliente; `POST .../renewal-list/send`
  envia a lista por WhatsApp a partir do número financeiro
  (`EVOLUTION_FINANCE_INSTANCE`) para `HORIZONS_WHATSAPP_RENEWAL_NUMBER`.
- **Job agendado `whatsapp-renewal-list`** (gated por
  `HORIZONS_WHATSAPP_RENEWAL_ENABLED`, desligado por padrão). O envio pelo
  Telegram dessa lista foi removido; o digest diário segue pelo Telegram.
- Lint, 40 testes, build, diff-check, API `status=ok`, frontend 200 e
  smoke operacional passaram. Nenhuma mensagem, cobrança, cliente ou painel
  externo foi alterado.
- Pendente: você me enviar o número de WhatsApp que receberá a lista de
  renovação e ligar `HORIZONS_WHATSAPP_RENEWAL_ENABLED=true`.
- Data/hora: 2026-08-25 — lista de renovação e validação cruzada com Telegram
- **Validação cruzada**: `loadReceiptContext` agora devolve um objeto
  `validation` explícito (valor/data/cliente/E2E/confiança) exibido na
  `/baixa` para apoiar a decisão humana de baixa.
- **Lista de renovação no painel**: novos endpoints
  `GET /api/operations/renewal-list` e
  `POST /api/operations/renewal-list/send`. Retornam clientes com baixa
  confirmada e credenciais decriptadas (usuário, senha, DNS, checkout,
  telas, validade, plano). A página `/baixa` ganhou um painel
  “Renovação no painel” com botões para copiar credenciais e enviar a
  lista bonitinha ao Telegram administrativo.
- **Job agendado de Telegram** para a lista de renovação (gatilhos
  `HORIZONS_TELEGRAM_RENEWAL_LIST_ENABLED` e
  `HORIZONS_TELEGRAM_RENEWAL_LIST_CRON`, desligado por padrão). Nenhum
  envio ocorre sem você ligar a flag.
- O cadastro de usuário e senha por servidor já existe em
  `customer_panel_targets`; o operador pode editar em Clientes →
  Gerenciar acesso, e a lista de renovação lê diretamente esses campos
  decriptados para que ele entre no painel e renove.
- Lint, 40 testes, build, diff-check, API `status=ok` e frontend 200
  passaram. Nenhuma mensagem, cobrança, cliente ou painel externo foi
  alterado.
- Próximo passo: validar ponta a ponta quando você tiver um comprovante
  real chegando no número financeiro/vendas.
- Data/hora: 2026-08-25 — baixa de pagamentos, validação cruzada e digest
- **Baixa de Pagamentos**: nova página `/baixa` (`src/pages/BaixaPagamentos.jsx`)
  consumindo `/api/payments/overview`. Mostra cada renovação com
  `awaiting_bank_review`, contexto completo do cliente (servidor, telas,
  checkout, credenciais, recuperação) e botões para confirmar, rejeitar
  ou solicitar novo comprovante.
- **Validação cruzada**: novo `GET /api/renewals/:renewalId/receipts/:receiptId`
  retorna o recibo com renovação, cliente, acesso principal e status de
  recuperação. O `POST /renewals/:renewalId/receipts/:receiptId/review` foi
  alinhado para também devolver contexto quando o operador decide a baixa.
- **Digest diário Telegram** (preparado, desligado): novo módulo
  `server/telegramDigest.js` com composição do digest e `sendTelegramMessage`;
  o worker registra um job BullMQ recorrente quando
  `HORIZONS_TELEGRAM_DAILY_DIGEST_ENABLED=true` (cron
  `HORIZONS_TELEGRAM_DAILY_DIGEST_CRON`, padrão `0 8 * * *`). Nenhum envio
  ocorre até o operador ligar a flag.
- Validação completa: sintaxe, lint, 40 testes, build, diff-check, API
  `status=ok`, frontend 200 e smoke operacional. Nenhuma mensagem,
  cobrança, cliente ou painel externo foi alterado. O `.env.local.example`
  documenta as duas variáveis novas.
- Pendente do operador: (1) configurar instâncias Evolution financeiro/vendas,
  (2) habilitar `HORIZONS_TELEGRAM_DAILY_DIGEST_ENABLED` quando quiser o
  digest, (3) homologar o bot Elite no QA, (4) revisar a fila de baixa e
  aprovar manualmente os comprovantes Pix.
- Data/hora: 2026-08-25 — fronts 1 a 5 concluídos (smoke, auditoria de
  recuperação, workflow de cobrança ativo, bot para Elite, router 7)
- **Front 1**: criado `tools/smoke.mjs` validando frontend, API, n8n e
  checklist (5 checks). Resultado atual: ok.
- **Front 2**: migration `20260825090000_customer_recovery_audit.sql`
  aplicada; criados endpoints `/recovery/:id/notes`, `/recovery/:id/history`
  e o histórico aparece na Central Operacional. 40 testes aprovados.
- **Front 3**: `react-router-dom` atualizado para major 7
  (`^7.18.0`). Auditoria de produção: 0 vulnerabilidades. Build, lint e
  testes passaram; frontend republicado e smoke revalidou todas as rotas.
- **Front 4**: workflow de cobrança `tRtpDjTu1GNkL8Za` (`Horizons | Envio de
  lembretes financeiros | v1`) foi ativado. Cron a cada 30 min consulta
  `/api/billing/reminders/sendable`. Atualmente 0 itens aprovados — nenhum
  envio ocorre.
- **Front 5**: bot (`Horizons | Atendimento WhatsApp completo | v1`,
  id `9kEnUBMXxMvywDWn`) republicado com servidor Elite como padrão:
  nova etapa `server_select` (Elite 4h/8h/12h e KYROS 6h/12h),
  `server`/`duration_hours` lidos do estado da sessão, idempotency_key
  específico por servidor.
- Validações: lint, 40 testes, build, diff-check, API `status=ok`,
  frontend 200 e smoke operacional. Nenhuma mensagem, cobrança, cliente
  ou painel externo foi alterado.
- Data/hora: 2026-08-25 — contrato n8n preparado e mark-sent publicado
- A API passou a expor `POST /billing/reminders/:id/sent` (marca status=sent,
  sent_at e updated_at; não envia nada). Foi criado o script local
  `tools/create-horizons-billing-workflow.mjs` que gera
  `Horizons | Envio de lembretes financeiros | v1` no n8n; ele foi preparado
  e validado localmente em modo não publicado (gate por `PUBLISH=true`).
- A análise do fluxo atual do bot (`create-horizons-full-workflow.mjs`)
  confirmou o uso fixo de `server:'kyros'` na criação de teste. Foi escrito
  o documento `docs/n8n-ajustes-elite.md` com as edições exatas para tornar
  o Elite o servidor padrão e aceitar seleção de duração (4h/8h/12h), sem
  publicar nada.
- Documentação de contrato atualizada em `docs/operacao-financeira.md`
  incluindo o novo endpoint `POST /billing/reminders/:id/sent`. Testes
  cresceram para **40**. API publicada; lint, testes, build, diff-check, API
  `status=ok` e frontend 200 passaram. Nenhuma mensagem, cobrança, cliente ou
  painel externo foi alterado.
- Pendente do operador: vincular instâncias Evolution financeiro/vendas e
  autorizar publicação do workflow de cobrança com `PUBLISH=true`.
- Data/hora: 2026-08-25 — auditoria de webhooks aplicada e Dashboard financeiro
- A migration `20260825060000_webhook_audit.sql` foi aplicada no Supabase; a
  tela `/logs` passa a consultar a tabela real. O Dashboard ganhou o painel
  **Resumo Financeiro**: clientes com checkout, Pix por comprovante, manual,
  em recuperação, credenciais incompletas e mensalidade esperada.
- A fila de recuperação ganhou **notas internas** (`POST /recovery/:id/notes` e
  campo na Central Operacional), e foi preparado o contrato de envio do n8n:
  `GET /billing/reminders/sendable` lista lembretes aprovados com texto, método
  e checkout, sem disparar nada. Documentação atualizada em
  `docs/operacao-financeira.md`.
- Testes cresceram para 39 (notas e decisões de recuperação). API e frontend
  publicados; lint, testes, build, diff-check, API `status=ok` e frontend 200
  passaram. Nenhuma mensagem, cobrança, cliente ou painel externo foi alterado.
  Pendente do operador: vincular instâncias Evolution financeiro/vendas para o
  vínculo de comprovante.
- Data/hora: 2026-08-25 — revisão financeira por cliente publicada
- Foi criada a tela **Revisão financeira** (`/revisao`) com
  `src/pages/RevisaoFinanceira.jsx`, consumindo `/billing/overview`: mostra
  todos os clientes com método de cobrança, servidor, telas, credenciais,
  status e recuperação, com busca, filtros (recuperação, checkout, Pix,
  credenciais incompletas) e totalizadores. A rota foi adicionada ao menu e ao
  shell de navegação.
- Foi criado `docs/operacao-financeira.md` documentando o fluxo completo:
  método por cliente, fila de lembretes, reconhecimento de pagamento,
  recuperação após 14 dias, comprovante pelas instâncias financeiro/vendas e
  homologações pendentes antes de qualquer envio.
- Frontend publicado; lint, 38 testes, build, diff-check, API `status=ok` e
  frontend 200 passaram. Nenhuma mensagem, cobrança, cliente ou painel externo
  foi alterado. Próximo passo do operador: revisar os 8 clientes em recuperação
  e o lembrete planejado pela nova tela, e configurar as instâncias Evolution
  de financeiro/vendas para validar o vínculo de comprovante.
- Data/hora: 2026-08-25 — migration de cobrança aplicada e regra de recuperação definida
- Com autorização do proprietário, a migration `20260825080000_customer_billing_recovery.sql`
  foi aplicada no Supabase hospedado. A RPC `refresh_customer_billing` foi
  executada uma vez para planejamento: criou 1 lembrete planejado para hoje e
  identificou 8 clientes em recuperação (pagamento não reconhecido há mais de
  duas semanas). Nenhuma mensagem, cobrança, cliente ou painel externo foi
  alterado.
- A regra de recuperação foi ajustada para **após 14 dias** do vencimento sem
  pagamento reconhecido (antes eram 3 dias). O fluxo continua: com checkout →
  lembrete com link; sem checkout → Pix por comprovante; pagamento reconhecido →
  cancelar lembretes e marcar recuperado; não reconhecido após 14 dias → fila de
  recuperação e lembretes cancelados (sem segunda cobrança automática).
- Próximo passo: revisar a Central Operacional com os 8 clientes em recuperação
  e o lembrete planejado, validar o vínculo de comprovante pelas instâncias
  financeiro/vendas e depois definir o envio real com destino/template
  homologados.
- Data/hora: 2026-08-25 — base financeira de cobrança/recuperação preparada
- Foi criada a migration `20260825080000_customer_billing_recovery.sql`
  (ainda não aplicada ao banco), que estende `billing_reminder_queue` com
  `payment_method` (checkout/pix/manual), `checkout_url`, `recovery` e
  `attempt_count`; cria `customer_recovery_queue`; e adiciona a RPC
  `refresh_customer_billing`, que planeja lembrete com link de checkout quando
  existe, Pix por comprovante quando não, e move para recuperação clientes com
  pagamento não reconhecido após o vencimento, cancelando lembretes planejados
  para não enviar duas vezes. A RPC nunca envia mensagem, cria cobrança ou toca
  painel externo.
- API: `server/routes/billing.js` com `/billing/overview`, `/recovery/queue` e
  `/recovery/:id/decision`; webhook Evolution passou a aceitar comprovantes
  também pela instância de vendas (além da financeira). Frontend: Central
  Operacional ganhou seção **Recuperação de clientes** e badge do método de
  cobrança nos lembretes.
- Lint, 38 testes, build, diff-check, API `status=ok` e frontend 200 passaram;
  API e frontend foram publicados. Nenhuma mensagem, cobrança, cliente ou
  painel foi alterado. Pendente: aplicar a migration `20260825080000...` no
  Supabase após confirmação e definir regra de quantos dias de atraso entram em
  recuperação (padrão atual: após 3 dias do vencimento sem pagamento
  reconhecido).
- Data/hora: 2026-08-25 — Elite IPTV e CineHub cadastrados como servidores
- O banco é o projeto Supabase hospedado (ref `acmpfccutihuppfraita`); foi
  aplicada via Management API a migration
  `20260825070000_add_elite_and_cinehub_servers.sql`, que ampliou o CHECK de
  `cinehub_servers.code` para incluir `cinehub` e `elite` e inseriu/atualizou as
  linhas **CineHub** (provider cinehub) e **Elite IPTV** (provider elite) para
  todos os usuários do projeto. Leitura confirmou as duas linhas ativas, além
  do catálogo existente KYROS/VORNAK/KRONOS/ZEUS/FENIX/P2P.
- O catálogo protegido de endpoints ganhou as chaves canônicas
  `elite:4/8/12` com/sem adulto (mantendo os aliases `elite_iptv:*`). A tela
  **Servidores** agora exibe o **Catálogo operacional (testes e acessos)** com
  código, provider e status, além da lista legada. Frontend foi reconstruído e
  recriado; lint, 36 testes, build, diff-check, API `status=ok` e frontend 200
  passaram. Nenhum cliente, acesso, cobrança ou mensagem foi alterado.
- Pendente: aplicar a migration `20260825060000_webhook_audit.sql` (auditoria de
  webhooks) e, no fluxo n8n, passar `server=elite` para testes do Elite IPTV.
- Data/hora: 2026-08-25 — simulador financeiro e publicação concluídas
- A frente 10 do roadmap foi implementada: `server/financialSimulator.js` e
  `server/routes/simulator.js` fornecem payloads sintéticos de callback PaggPay,
  callback Efí, comprovante Pix e renovação, além de `POST /simulator/validate-receipt`
  que executa somente a validação local sem banco, mensagem ou painel externo.
  Foi adicionada cobertura em `server/financialSimulator.test.js` (36 testes no
  total) e a auditoria de webhook ficou resiliente quando a migration ainda não
  foi aplicada (retorna lista vazia com aviso).
- A auditoria de pagamentos passou a registrar evento, status e duração no
  `webhook_audit` quando disponível. API, frontend e worker foram
  reconstruídos/recriados; pós-publicação API respondeu `status=ok`, frontend
  HTTP 200 e os quatro serviços estão ativos. Lint, 36 testes, build e
  diff-check passaram. Nenhuma operação externa de negócio foi executada.
- Pendente: aplicar `20260825060000_webhook_audit.sql` no Supabase e, quando o
  proprietário autorizar, atualizar o router (major) para zerar as duas
  vulnerabilidades moderadas restantes.
- Data/hora: 2026-08-25 — auditoria, logs, assistente e modularização avançadas
- Foram implementadas as frentes 2–9 do roadmap: auditoria de webhooks com
  rate limit (migration `20260825060000_webhook_audit.sql`, módulo
  `server/routes/audit.js` e proteção em Evolution/PaggPay/Efí); tela
  `LogsAuditoria.jsx` em `/logs`; área de teste do assistente em
  `AssistenteAdmin.jsx` com modelo/fallback/allowlist e comandos seguros;
  worker com `attempt` e evento estruturado de falha; docs
  `docs/guia-operacional.md`; e extração de acessos/migrações de servidor para
  `server/routes/customerServer.js`.
- Vulnerabilidades de produção caíram para 2 moderadas (react-router /
  react-router-dom); a correção automática exige major do router e ficou
  registrada para rodada própria com testes visuais. Lint, 33 testes, build,
  diff-check, API `status=ok` e frontend 200 passaram. Nenhuma operação externa
  foi executada; a migration de auditoria ainda não foi aplicada ao banco.
- Pendente: aplicar a migration de webhook_audit no Supabase quando o MCP de
  banco estiver disponível e publicar frontend/API para disponibilizar `/logs`.
- Data/hora: 2026-08-25 — destino de suporte alinhado ao n8n ativo
- O operador confirmou que o fluxo de clientes atual é n8n, não Typebot. A configuração foi ajustada para usar `N8N_SUPPORT_PHONE` como variável principal; `TYPEBOT_SUPPORT_PHONE` permanece apenas como alias de compatibilidade para pontes antigas. O número de suporte foi copiado para a variável protegida do n8n, sem aparecer em status, Git ou logs.
- O `.env.local.example` foi atualizado com `N8N_SALES_PHONE` e `N8N_SUPPORT_PHONE`. A API foi reconstruída/recriada, lint, 33 testes, build e diff-check passaram e `/health` respondeu `status=ok`. Nenhuma mensagem foi enviada; a instância Evolution de suporte e a captura continuam desligadas.
- Data/hora: 2026-08-25 — número de suporte configurado no ambiente protegido
- O número informado pelo proprietário foi normalizado e configurado somente em
  `TYPEBOT_SUPPORT_PHONE` no `.env` protegido, sem copiar o valor para Git,
  status, logs ou documentação. A API foi reconstruída/recriada e respondeu
  `status=ok`.
- A instância Evolution de suporte ainda não foi identificada/configurada e a
  captura de conversas permanece desligada. Nenhuma mensagem foi enviada e o
  próximo passo é confirmar o nome exato da instância de suporte antes de
  ativar qualquer captura ou fluxo proativo.
- Data/hora: 2026-08-25 — prioridade operacional definida para Elite/P2P
- O proprietário definiu que os endpoints Elite IPTV e P2P cadastrados devem
  ficar prioritários no catálogo e nas próximas jornadas, sem exigir
  homologação individual de todos os links. O primeiro endpoint Elite 4h com
  adulto continua como referência homologada; as demais variantes ficam
  cadastradas como `pending_homologation`, prontas para uso somente quando uma
  chamada real autorizada ocorrer. Não serão solicitados telefones adicionais
  nem feitas chamadas automáticas.
- Prioridade registrada: Elite IPTV para testes padrão 4h/8h/12h, com e sem
  adulto, seguido do perfil P2P 8h. O roteamento deve preservar a seleção
  explícita de servidor/variante e nunca reutilizar endpoint de outra variante.
  Nenhum cliente, acesso, cobrança, mensagem ou painel externo foi alterado.
- Data/hora: 2026-08-25 — endpoint P2P Elite IPTV cadastrado
- O endpoint informado como **P2P — Teste P2P 8H** foi cadastrado no catálogo
  protegido como `p2p:8:p2p`, usando o host Elite já permitido. Ele permanece
  pendente de homologação real e não foi chamado nesta inclusão.
- Lint, 33 testes e `git diff --check` passaram. Nenhuma mensagem, cobrança,
  cliente, acesso ou painel externo foi alterado.
- Data/hora: 2026-08-25 — catálogo Elite IPTV completo recebido
- O endpoint informado para **Teste Grátis 12H (S/ Adulto)** foi cadastrado no
  catálogo protegido como variante `elite_iptv:12:no_adult`. O catálogo Elite
  agora possui as seis combinações 4h/8h/12h com e sem adulto; somente 4h com
  adulto foi homologada por chamada real até o momento. As outras variantes
  permanecem pendentes de teste com telefone que não esteja bloqueado pelo
  fornecedor.
- Foi adicionado teste unitário confirmando que checkout no host Elite é
  considerado utilizável. Lint, 33 testes, build e diff-check passaram. Nenhuma
  chamada real foi feita nesta inclusão, nenhuma mensagem/cobrança foi criada e
  nenhum painel foi alterado.
- Data/hora: 2026-08-25 — variante Elite 4h sem adulto aguardando telefone de QA
- Foi feita uma única chamada controlada ao endpoint fornecido para **Teste
  Grátis 4H (S/ Adulto)**, usando o mesmo telefone de QA já utilizado na
  homologação anterior. O endpoint respondeu HTTP 400 sem acesso ou checkout;
  o payload continha somente uma resposta curta. Como o CineHub/Elite pode
  aplicar a trava de teste por telefone, a variante **não foi cadastrada como
  homologada** e não houve repetição automática nem outra chamada.
- Nenhum dado sensível foi gravado no status. Para validar esta variante, usar
  um telefone controlado que ainda não tenha sido testado no Elite ou solicitar
  liberação/reset ao fornecedor; depois repetir somente com autorização.
- Data/hora: 2026-08-25 — Elite IPTV homologado em chamada controlada
- Com autorização explícita do operador, foi chamada uma vez a URL protegida do
  endpoint Elite IPTV para o telefone de QA fornecido e nome informado. A
  resposta foi HTTP 200, retornou acesso completo, pacote **Teste Grátis 4H (C/
  Adulto)**, uma conexão e `payUrl` no host Elite. Credenciais, telefone e URL
  tokenizada não foram gravados neste handoff, logs públicos ou código.
- O host `revenda-eliteiptv.online` foi adicionado à validação do adaptador e a
  variante protegida `elite_iptv:4:adult` foi cadastrada no catálogo de ambiente.
  O checkout foi reconhecido como utilizável; nenhuma segunda chamada,
  mensagem, cobrança ou alteração em painel foi executada.
- Lint, 33 testes, build e `git diff --check` passaram após a alteração. Próximo
  passo: adicionar testes unitários específicos do perfil Elite e, se desejado,
  cadastrar variantes 4h sem adulto/alturas diferentes somente com endpoints
  fornecidos e homologados.
- Data/hora: 2026-08-25 — dependências compatíveis aplicadas e serviços publicados
- Com autorização do proprietário, foi executado `npm update` dentro das faixas
  compatíveis do `package.json`. O lockfile foi atualizado; lint, 33 testes,
  build e diff-check passaram. A auditoria caiu de 24 para 4 vulnerabilidades no
  total durante a validação e, focando produção (`--omit=dev`), de 13 para 2
  moderadas, sem high/critical. Não foi usado `npm audit fix --force` e não
  houve upgrade major arriscado de React/Vite/router.
- API, worker e frontend foram reconstruídos e recriados com Docker Compose;
  Redis permaneceu ativo. Pós-publicação: API `/health` respondeu `status=ok`,
  frontend respondeu HTTP 200 e os quatro serviços ficaram ativos. Nenhuma
  mensagem, cobrança, pagamento, acesso, cliente ou painel externo foi
  acionado.
- Próxima revisão: tratar as duas vulnerabilidades moderadas restantes na
  cadeia de desenvolvimento/build em rodada separada e confirmar visualmente a
  tela `/saude` com sessão autenticada.
- Data/hora: 2026-08-24 — observabilidade do worker adicionada e audit npm revisada
- `server/worker.js` agora registra eventos JSON sanitizados de job iniciado,
  concluído e com erro, incluindo somente ID do job, nome, duração e mensagem de
  erro. O listener de falha continua atualizando a operação quando aplicável;
  nenhum payload, token, telefone ou credencial entra no log.
- A auditoria npm completa permanece com 24 vulnerabilidades transitivas (16
  high, 5 moderate, 3 low; sem critical). A auditoria focada em produção havia
  mostrado 13. As vulnerabilidades não possuem correção automática segura no
  lock atual; não foi executado `npm audit fix` nem upgrade arriscado. O próximo
  tratamento deve separar cadeia de build/dev de dependências runtime e atualizar
  Vite/PostCSS/React Router/Supabase em rodada própria.
- Serviços continuam ativos e saudáveis: API `status=ok`, frontend HTTP 200,
  Redis healthy e worker ativo. Lint, 33 testes, build, sintaxe e diff-check
  passaram. Nenhuma operação externa foi executada.
- Data/hora: 2026-08-24 — observabilidade HTTP estruturada adicionada
- A API passou a gerar `x-request-id` em cada requisição (preservando o header
  recebido quando existir), devolver o identificador na resposta e registrar um
  evento JSON com método, caminho, status e duração em milissegundos. Webhooks
  ficam fora desse log para evitar exposição acidental de payloads sensíveis.
  Nenhum token, corpo, telefone ou credencial é registrado.
- Lint, 33 testes, build, diff-check e `/health` passaram. Nenhuma operação
  externa foi executada. O roadmap técnico principal está concluído nesta
  rodada, restando revisão controlada das vulnerabilidades npm e futura
  instrumentação específica do worker.
- Data/hora: 2026-08-24 — prioridades adicionadas à Central Operacional
- A `CentralOperacional.jsx` agora calcula e exibe uma faixa de **Prioridades de
  hoje** a partir do digest existente: comprovantes para revisão, pendências
  cadastrais, códigos vencendo e lembretes planejados. Quando não há itens
  críticos, informa isso explicitamente. Não foram adicionados efeitos de
  escrita ou disparos automáticos.
- Validação completa passou novamente: lint, 33 testes, build, diff-check, API
  `status=ok` e frontend HTTP 200. Nenhum dado real ou integração externa foi
  acionado.
- Data/hora: 2026-08-24 — tela Saúde e Integrações publicada no painel
- A rota protegida `/saude` foi adicionada ao frontend com
  `src/pages/SaudeIntegracoes.jsx`. Ela consulta `/api/health/details` e mostra
  API, banco e presença de configuração das integrações sem exibir segredos.
  O texto deixa explícito que configuração presente não significa conexão ativa
  nem entrega externa confirmada.
- A tela foi adicionada ao Sidebar. Lint, 33 testes, build e `git diff --check`
  passaram. Nenhuma integração, mensagem, cliente, pagamento ou painel externo
  foi acionado nesta implementação. Próximo passo técnico: melhorar a Central
  Operacional com prioridades/atalhos e iniciar observabilidade estruturada.
- Data/hora: 2026-08-24 — endpoint autenticado de saúde das integrações criado
- Foi criado `server/routes/systemHealth.js` com `GET /health/details`, exigindo
  autenticação e retornando somente estados booleanos de API, banco e presença
  de configurações de Evolution, Telegram, MiniMax, PaggPay e Efí. Nenhuma
  chave, token, telefone ou dado de cliente é retornado. O endpoint não foi
  chamado sem sessão e nenhuma integração externa foi acionada.
- Validação completa passou novamente: sintaxe, lint, 33 testes, build,
  `git diff --check` e API `/health` com `status=ok`; frontend continua 200.
  Próximo passo é ligar uma tela administrativa protegida a esse endpoint e
  depois revisar dependências npm vulneráveis de forma controlada.
- Data/hora: 2026-08-24 — renovações modularizadas e CI criado
- As rotas de renovação e comprovantes foram extraídas para
  `server/routes/renewals.js`: abertura de renovação, registro de comprovante e
  revisão/confirmacão humana. Os contratos, filtros por proprietário,
  validação, idempotência de pagamento manual e chamada de `processPaidPayment`
  foram preservados. Foi adicionado `server/renewals.test.js`, elevando a
  suíte para 33 testes.
- Foi criado `.github/workflows/ci.yml` com checkout, Node pela `.nvmrc`, npm ci,
  lint, testes, build e diff-check em push/PR. A auditoria npm sem dependências
  de desenvolvimento ainda reporta 13 vulnerabilidades (10 high, 1 moderate,
  2 low); nenhuma correção automática foi aplicada para evitar alterar o lock
  sem revisão. Serviços seguem saudáveis: API `status=ok`, frontend HTTP 200.
- Nenhum cliente, acesso, pagamento, mensagem ou painel externo foi alterado.
  Validações locais passaram: sintaxe, lint, 33 testes, build e diff-check. O
  próximo bloco técnico é criar observabilidade/saúde de integrações e depois
  revisar dependências vulneráveis de forma controlada.
- Data/hora: 2026-08-24 — checklist publicado no frontend remoto
- O primeiro acesso ao checklist retornou 403 porque o arquivo estático novo
  herdou permissão restrita do workspace. A permissão foi corrigida para leitura
  pública (`0644`), o frontend foi reconstruído/recriado sem dependências e a
  rota `/checklist-validacao-financeira.html` passou a responder HTTP 200. A API
  continuou saudável (`/health` → `status=ok`). Nenhum dado, mensagem,
  pagamento ou integração foi alterado.
- URL para o operador: `https://iptv.velhaturbo.cloud/checklist-validacao-financeira.html`.
  A página permite revisar no navegador e usar Imprimir → Salvar como PDF.
- Data/hora: 2026-08-24 — checklist financeiro acessível como página imprimível
- Como o acesso remoto não permitia baixar links `sandbox` nem o endereço
  `127.0.0.1`, foi criada a página pública estática
  `public/checklist-validacao-financeira.html`. Ela apresenta o checklist em
  português, com caixas de seleção, campos de registro e botão **Imprimir /
  salvar em PDF**; funciona diretamente no navegador remoto e permite usar
  Imprimir → Salvar como PDF localmente. A página foi incluída no build e
  respondeu HTTP 200 localmente. Nenhum segredo, dado real ou integração foi
  exposto/acionado.
- Data/hora: 2026-08-24 — checklist financeiro disponibilizado em PDF
- O documento de revisão manual foi convertido para PDF A4 em
  `public/downloads/checklist-validacao-financeira-horizons.pdf`, mantendo as
  seções de renovação, comprovante, revisão humana, webhook, idempotência,
  Central Operacional, cenários negativos e campos de registro. A URL local
  respondeu HTTP 200. Nenhum dado real, pagamento, mensagem ou integração foi
  utilizado na geração.
- Data/hora: 2026-08-23 — operações modularizadas e checklist financeiro criado
- Como o operador informou que o smoke test do fluxo 1 está semi-validado e que
  precisa de tempo para revisar os vínculos de acesso, a parte técnica avançou
  sem depender dessa ação manual. Foi criado `docs/validacao-fluxo-financeiro.md`
  com roteiro simples para validar renovação, comprovante, revisão humana,
  webhook, separação de estados, fila operacional e critérios de aprovação.
  O documento não contém dados reais nem dispara qualquer operação.
- As rotas da Central Operacional foram extraídas para
  `server/routes/operations.js`: refresh, overview, decisões de lembrete/tarefa,
  download CSV de erros, perfis de entrega e slots de tutorial. Os contratos e
  filtros por proprietário foram preservados; `server/api.js` agora registra o
  módulo com dependências explícitas. Nenhum banco, cliente, acesso, pagamento,
  mensagem ou painel externo foi alterado.
- Validação concluída: sintaxe, lint, 32 testes do servidor, build,
  `git diff --check`, API `status=ok` e frontend HTTP 200 passaram. Pendências do
  operador: revisar o checklist financeiro e, quando possível, completar os
  vínculos reais dos acessos. Próximo passo técnico: extrair outro domínio
  coeso, provavelmente renovações/comprovantes, sem bloquear a homologação
  manual.
- Data/hora: 2026-08-23 — definição do próximo roadmap
- Após a limpeza estrutural e três módulos extraídos da API, a prioridade deixa
  de ser apenas refatoração: o maior valor operacional agora é concluir o
  vínculo dos acessos reais e validar autenticadamente as jornadas de cliente,
  instalação, renovação e comprovante. A modularização deve continuar em
  paralelo, sem bloquear a operação nem tocar integrações externas sem
  confirmação. Próxima sequência recomendada: (1) smoke test autenticado das
  rotas novas; (2) revisar os 168 vínculos com credenciais pendentes e os 61
  casos ambíguos; (3) homologar fila de renovações/comprovantes; (4) extrair
  módulo de operações da API; (5) observabilidade e CI.
- Nenhum serviço, banco, cliente, acesso, pagamento, mensagem ou painel externo
  foi alterado nesta rodada.
- Data/hora: 2026-08-23 — leitura de pagamentos/renovações modularizada
- A extração da API avançou novamente com `server/routes/paymentRead.js`, que
  passou a registrar `/integrations/receipt-extractor`, `/payments/efi` e
  `/renewals`. O módulo recebe explicitamente Supabase, configuração,
  autenticação e funções de configuração; os contratos de resposta e filtros
  por proprietário foram preservados. O bloco legado foi removido de
  `server/api.js`, sem alteração de banco, pagamentos ou dados reais.
- A revisão estrutural não encontrou outra pendência de toast/KeepAlive nesta
  frente: toast permanece unificado e o painel KeepAlive detalhado não é
  forçado no shell. Validação completa passou: lint, 32 testes do servidor,
  sintaxe dos módulos, build, `git diff --check`, API `status=ok` e frontend
  HTTP 200. Próximo passo: continuar com um módulo de rotas de operações ou
  integrações, extraindo dependências explicitamente e evitando mudanças
  externas.
- Data/hora: 2026-08-23 — webhook de pagamentos extraído da API
- A modularização gradual avançou com `server/routes/paymentWebhook.js`, que
  agora registra `/webhooks/payments/:provider` e recebe explicitamente as
  dependências de configuração, Supabase, schema, indicação e fila. O trecho
  correspondente foi retirado do fluxo ativo de `server/api.js`; o contrato de
  assinatura HMAC, validação Zod, idempotência de `payment_events`, criação de
  jobs/operações e resposta HTTP foram preservados. Nenhuma chamada real ao
  webhook ou alteração de pagamento foi executada.
- Validação concluída: `node --check` dos módulos, lint, `node --test
  server/*.test.js` (32 testes), build, `git diff --check`, API (`status=ok`) e
  frontend (HTTP 200) passaram. Próximo passo: extrair outro grupo isolado,
  preferencialmente rotas de configuração/integração sem misturar regras de
  negócio, sempre mantendo as dependências explícitas.
- Data/hora: 2026-08-23 — logs/toasts consolidados e primeira extração da API
- A camada pública de toast foi unificada: `src/hooks/useToast.js` agora é
  apenas um adaptador de compatibilidade sobre `src/components/ui/use-toast.js`,
  que passou a oferecer `success`, `error` e `info` além da API Radix original.
  Assim, as telas antigas e novas compartilham uma única store e o mesmo
  `Toaster`; nenhuma mensagem de negócio ou integração foi acionada.
- O KeepAlive foi mantido por possuir uso ativo, mas o painel de debug/exportação
  deixou de ser forçado no shell: `MainLayout` agora usa o monitor sem
  `showDebugPanel=true`. O ping continua habilitado pelo provider, sem remover a
  proteção operacional existente.
- Iniciada a modularização segura do backend com
  `server/routes/health.js`, responsável pela rota `/health`; `server/api.js`
  apenas registra o módulo. O contrato HTTP foi preservado e não houve alteração
  de banco, clientes, pagamentos, mensagens ou integrações externas.
- Validação concluída: lint, `node --test server/*.test.js` (32 testes), build,
  sintaxe, `git diff --check`, API (`status=ok`) e frontend (HTTP 200) passaram.
  Próximo passo: extrair o próximo grupo isolado de rotas, preferencialmente
  uma integração/webhook com dependências explícitas, mantendo o mesmo padrão
  de registro e sem publicar alterações externas.
- Data/hora: 2026-08-23 — scaffold legado de campanhas removido
- A auditoria confirmou que `Campanhas.jsx`, `Templates.jsx` e
  `src/services/envios.js` pertenciam ao painel antigo de campanhas e não eram
  utilizados pelo backend atual nem por outras telas além das próprias rotas.
  Os três arquivos foram removidos; as rotas e itens correspondentes também
  foram retirados de `App.jsx` e `Sidebar.jsx`. O gerador de documentação
  atualizou `public/llms.txt` removendo as duas páginas antigas. O log local e o
  KeepAlive foram preservados porque ainda possuem referências ativas em
  Configurações e no shell da aplicação, respectivamente.
- Nenhum dado, banco, cliente, acesso, pagamento, mensagem ou integração externa
  foi alterado. `npm run lint`, `npm run test:server` (32 testes), `npm run
  build`, `git diff --check` e as verificações HTTP do frontend/API passaram.
  Próximo passo recomendado: revisar a duplicação de logs/toast e o KeepAlive,
  ou iniciar a modularização gradual de `server/api.js`.
- Data/hora: 2026-08-23 — documentação principal atualizada
- O `README.md` foi reescrito para refletir o Horizons atual, substituindo a
  descrição obsoleta de painel de campanhas/Gemini por arquitetura, rotas,
  integrações Evolution/Telegram, regras de segurança, operação Docker,
  migrations, testes e estado operacional. Nenhum segredo, dado de cliente ou
  credencial foi incluído.
- A validação passou: `npm run lint`, `npm run test:server` (32 testes),
  `npm run build` e `git diff --check`. O build gerou o frontend localmente;
  nenhum serviço foi reiniciado e nenhuma integração, mensagem, cobrança,
  acesso ou painel externo foi acionado. Próximo passo: revisar e remover, com
  segurança, o scaffold legado de campanhas/templates ou iniciar a
  modularização gradual de `server/api.js`.
- Data/hora: 2026-08-23 — retomada e verificação após navegação publicada
- O estado atual foi relido e as alterações locais não commitadas foram
  confirmadas como a frente de navegação/identidade operacional: `App.jsx`
  adotou rotas aninhadas com `Outlet`, `MainLayout.jsx` passou a navegar por
  URL e `Sidebar.jsx` ganhou links para todas as telas, Logs e reparo de
  telefones. Essas mudanças permanecem no worktree junto desta atualização de
  status; não foram descartadas nem misturadas com outra frente.
- Validação local concluída: `npm run lint`, `npm run test:server` (32 testes)
  e `npm run build` passaram. API respondeu `status=ok`, frontend respondeu
  HTTP 200 e os serviços Compose (`api`, `frontend`, `worker`, `redis`) estão
  ativos. Nenhum cliente, acesso, cobrança, mensagem ou integração externa foi
  alterado nesta rodada. Próximo passo recomendado: revisar visualmente o
  smoke test autenticado das novas URLs e então decidir entre atualizar o
  README, limpar o scaffold legado ou modularizar `server/api.js`.
- Data/hora: 2026-08-23 — teste da instância oficial do bot Horizons
- Identificada e confirmada a instância `Horizons Typebot`, conectada (`open`)
  no número `+55 16 3185-0923`. Com confirmação explícita do usuário, ela
  enviou uma mensagem de homologação para `+55 16 98830-2020`. A Evolution
  aceitou o envio e gerou identificador, com estado inicial `PENDING`; resta a
  confirmação visual do recebimento para concluir a validação ponta a ponta.
- Data/hora: 2026-08-23 — homologação controlada Evolution e Telegram
- Com autorização explícita do usuário, foi enviada uma mensagem de teste para
  o WhatsApp informado via Evolution e outra para o chat administrativo já
  autorizado no Telegram. O Telegram confirmou o envio pela API, sem erros. A
  Evolution aceitou a mensagem e retornou identificador próprio, com estado
  inicial `PENDING`; a confirmação visual de recebimento no aparelho ainda deve
  ser feita pelo usuário antes de considerar a entrega ponta a ponta aprovada.
  O primeiro acesso local à Evolution falhou por isolamento de rede; a repetição
  autorizada fora desse isolamento alcançou corretamente o serviço. Nenhum
  segredo foi gravado neste handoff.
- Data/hora: 2026-08-23 — confirmação do usuário após validação autenticada
- O smoke test autenticado do frontend foi concluído pelo usuário e está OK.
  Evolution API e Telegram já estão criados e configurados no ambiente e são
  as únicas integrações de comunicação mantidas no escopo atual. SMTP, Google
  Sheets e Asaas não serão necessários e deixam de ser pendências do projeto.
  Próxima frente: homologar, de forma controlada, os fluxos existentes que usam
  Evolution e Telegram, sem cadastrar ou acionar integrações descartadas.
- Data/hora: 2026-08-23 22:06 BRT — navegação e identidade operacional publicadas
- O frontend protegido passou a usar rotas aninhadas e `Outlet`, eliminando o
  estado local que fazia links diretos e recargas voltarem ao dashboard. Todos
  os itens do menu agora usam URLs reais; Logs locais (`/logs`) e Reparo de
  telefones (`/reparo-telefones`) também ficaram acessíveis. A barra lateral foi
  atualizada para **Horizons — Central de operações**, sem marca provisória nem
  imagem externa. Nenhum cliente, cobrança, credencial ou integração real foi
  alterado. Lint, build, `git diff --check` e os 9 testes do servidor passaram.
  A imagem do frontend foi reconstruída e somente esse serviço foi recriado;
  `/`, `/central` e `/reparo-telefones` responderam HTTP 200, e a API permaneceu
  saudável em `/health`. O npm ainda reporta 24 vulnerabilidades conhecidas no
  build. Próximo passo: smoke test autenticado e configuração operacional que
  depende dos acessos reais do usuário.
- Data/hora: 2026-08-23 21:59 BRT — retomada pelo handoff e confirmação do runtime
- `PROJECT_STATUS.md`, o status legado em `projects/horizons/status.md`, o README,
  o diff local e os commits recentes foram revisados sem alteração de código,
  banco ou integrações. O handoff principal continua sendo a fonte mais atual;
  o espelho legado permanece defasado e o README ainda descreve o scaffold
  anterior. API e frontend responderam normalmente, e os quatro serviços do
  Compose (`api`, `frontend`, `worker`, `redis`) continuam ativos. A única
  alteração local permanece este próprio handoff. O ponto de decisão segue
  sendo escolher a próxima frente entre corrigir a navegação/identidade do
  produto, reduzir a dívida estrutural ou avançar as pendências operacionais de
  acessos reais, financeiro e homologações externas.
- Data/hora: 2026-08-23 19:44 BRT — revisão de código/arquitetura (somente leitura)
- Rodada de diagnóstico sem alteração de código, banco, serviços, mensagens,
  cobrança ou painel. API (`127.0.0.1:8081/health` → `status=ok`), frontend
  (`127.0.0.1:3100` → 200) e n8n (`/healthz` → 200) responderam normalmente;
  containers `api`, `frontend`, `worker` e `redis` seguem ativos e o worktree
  está limpo. O `.env` permanece gitignored (somente `.env.local.example` é
  versionado) e `dist/` não é rastreado.
- Achados estruturais priorizados: (1) navegação dupla conflitante — o
  `react-router` de `App.jsx` define rotas `/clientes`, `/planos`, `/logs` etc.
  que sempre caem em `MainLayout`, que ignora a URL e abre `dashboard`; as
  páginas novas (Testes, Central, Cobranças, Renovações, Assistente, Conexões,
  Operações, Procedimentos, Captação, Indicações) só existem como estado no
  Sidebar, sem URL/deep-link/refresh. `Logs.jsx`, `PhoneNumberRepairPage.jsx` e
  `HomePage.jsx` ficam inacessíveis. (2) `server/api.js` é monolítico com ~3.233
  linhas e ~71 rotas misturando pagamentos, IA, painéis e webhooks. (3)
  `README.md` descreve o scaffold antigo ("WhatsApp Admin Panel + Gemini +
  campanhas") e não o Horizons. (4) o espelho GBrain
  `projects/horizons/status.md` está defasado (conteúdo de 2026-08-05) enquanto
  este arquivo vai até 2026-08-18; sincronização depende de MCP/CLI disponível.
- Dívida de scaffold legado a decidir: `Campanhas.jsx` (~1.437 linhas),
  `Templates.jsx`, `src/services/envios.js`, `src/services/logs.js` (log em
  localStorage) e o subsistema KeepAlive (`SupabaseKeepAlive*` + monitor de
  debug sempre visível) vieram do painel de campanhas original e o backend só
  os referencia marginalmente. Há duplicação de toast (`hooks/useToast` vs
  `components/ui/use-toast`). O Sidebar exibe rótulos "Admin Panel / WhatsApp
  Manager", logo externo hardcoded e `v1.0.0` que não refletem o produto.
- Oportunidades de robustez/ops mapeadas: logs estruturados (hoje só `console`),
  rate-limit/replay em webhooks, métricas, CI (não há `.github/workflows`),
  testes de frontend (só `node --test server/*.test.js`), módulos de pagamento
  com maior cobertura, backup de banco e centralização/validação de configuração.
  `package.json` segue como `web-app` v0.0.0 e a auditoria npm mantém 24
  vulnerabilidades preexistentes. Nenhum arquivo foi alterado além desta nota;
  o próximo passo é o proprietário escolher quais frentes priorizar.
- Data/hora: 2026-08-18 15:26 BRT — Central Operacional segura publicada
- Foi aplicada a migration `20260818060000_operations_control_center.sql` e
  publicada a nova tela **Central Operacional**. Ela consolida pendências de
  vínculo/cadastro, fila planejada de lembretes financeiros, comprovantes para
  revisão, histórico dos lotes CSV com download autenticado dos erros, catálogo
  de aplicativos/códigos por servidor e organização dos vídeos tutoriais.
- A atualização operacional encontrou 181 tarefas abertas (incluindo vínculos
  sem credenciais e clientes sem servidor inequívoco) e uma cobrança prevista
  para o dia. Esses números são tarefas, não clientes únicos: o mesmo cliente
  pode exigir mais de uma correção. Sete roteiros-base foram criados para
  Samsung, LG, Android/Google TV, TV Box, Android, iOS e computador.
- A fila financeira é deliberadamente segura: o job apenas planeja lembretes;
  **Aprovar fila** registra aprovação, mas não envia WhatsApp, não cria Pix e
  não altera painel externo. O digest aparece na tela com pendências,
  lembretes, comprovantes e códigos vencendo em sete dias. Disparos proativos
  continuarão desativados até existir destino financeiro e homologação.
- O catálogo guarda aplicativo, DNS, códigos parceiro/Downloader/NTdown e
  validade por servidor, permitindo alertar a troca mensal sem associar código
  ao aparelho. Os roteiros aceitam URL quando a mídia for gravada e permanecem
  em `pending_recording` enquanto vazios. O rótulo do Assistente foi corrigido
  para mostrar **Escritas com confirmação** quando esse modo estiver ativo.
- Migration/RPC foram validadas em produção. API e frontend foram reconstruídos;
  ambos estão ativos, frontend respondeu 200 e API respondeu `status=ok` sem
  erros recentes. Sintaxe, lint, build, nove suítes de testes e
  `git diff --check` passaram. Nenhuma mensagem, cobrança, Pix, baixa ou ação em
  painel externo foi executada.
- Data/hora: 2026-08-18 14:16 BRT — importação segura de clientes e acessos por Telegram publicada
- O bot Telegram administrativo agora aceita arquivo CSV UTF-8 privado de até
  5 MB e 1.000 linhas. Reconhece aliases em português para nome, WhatsApp,
  servidor, usuário, senha, plano, telas, valor, dia de vencimento, validade,
  DNS, checkout e orientação original. CSV com vírgula ou ponto e vírgula,
  valores monetários brasileiros e datas `dd/mm/aaaa` são normalizados.
- A primeira etapa é sempre uma prévia sem alteração: cruza telefone exato,
  detecta nomes com telefone divergente, clientes novos, planos/servidores,
  duplicidades dentro do arquivo, campos ausentes e atualizações cadastrais.
  O Telegram mostra linhas prontas/bloqueadas, clientes existentes/novos,
  cadastros que mudarão e os motivos agregados; somente o botão **Confirmar
  importação** executa as linhas prontas.
- Foi aplicada a migration
  `20260818050000_customer_access_import_batches.sql`. Lotes e itens têm RLS,
  acesso de leitura somente pelo proprietário e senhas/orientações cifradas.
  Texto secreto não entra em `normalized_data`. A RPC do lote processa todas as
  linhas prontas numa transação: cria ou complementa cliente, telefone, plano,
  valor, telas e vencimento, e cria/atualiza o acesso principal. Linhas
  bloqueadas não são gravadas. Cancelamento/expiração elimina o lote e suas
  credenciais temporárias; prévias abandonadas são limpas na próxima carga.
- Nenhuma operação de importação chama painel externo ou envia WhatsApp. Um
  modelo está publicado em
  `/downloads/modelo-importacao-clientes-acessos.csv`. XLSX foi deliberadamente
  retirado porque a biblioteca avaliada acrescentava vulnerabilidade; no Excel
  deve-se usar **Salvar como CSV UTF-8**.
- API/frontend foram reconstruídos e estão saudáveis; modelo respondeu HTTP
  200, tabelas/RPC responderam e não há lotes existentes. Nove suítes, lint,
  build, sintaxe e `git diff --check` passaram. A auditoria npm permanece com
  24 vulnerabilidades preexistentes no conjunto antigo de dependências; a
  funcionalidade nova não adicionou dependência. Nenhum arquivo real, cliente,
  acesso, mensagem ou painel externo foi processado na validação.
- Data/hora: 2026-08-18 10:35 BRT — correções atômicas e vínculos legados reais publicados
- Foi aplicada a migration
  `20260818030000_admin_atomic_customer_and_charge.sql`. Cadastro de cliente e
  telefone principal agora ocorrem na mesma transação; alteração de telefone
  também sincroniza `customers` e `customer_phones` atomicamente. As RPCs
  aceitam somente campos permitidos e foram restringidas ao `service_role`.
- O registro de Pix PaggPay e seu `payment_event` agora convergem por RPC
  atômica e conflito idempotente. Como a aceitação no provedor externo nunca
  pode participar de uma transação PostgreSQL, uma falha posterior de
  persistência não marca mais a renovação como expirada nem incentiva nova
  cobrança: o Telegram informa reconciliação pendente e proíbe duplicar o Pix.
- O status administrativo agora informa `confirmed_writes` quando as escritas
  com confirmação estão habilitadas, em vez de declarar incorretamente modo
  somente leitura. As novas RPCs foram alcançadas com UUIDs inexistentes e
  recusaram sem escrita, como esperado.
- A auditoria atual encontrou 229 clientes. Destes, 168 possuíam exatamente um
  servidor legado real cadastrado; 17 possuíam mais de um servidor e 44 não
  tinham servidor. Nenhum teste CineHub concluído ou solicitação manual com
  usuário correspondia de forma única ao telefone de um cliente. As anotações
  antigas também não continham usuário, senha ou DNS recuperáveis.
- Foi aplicada a migration idempotente
  `20260818040000_import_unambiguous_legacy_customer_links.sql`: os 168 casos
  de servidor único foram importados como acesso principal ativo, preservando
  NOW/UNION/P2X e quantidade de telas. Validação final confirmou 168 alvos,
  168 clientes distintos, 168 principais e zero clientes órfãos. Os 17 casos
  ambíguos e os 44 sem servidor não foram alterados.
- Os dados legados não possuíam credenciais: os 168 acessos estão corretamente
  sinalizados como credenciais pendentes e ainda não liberam entrega automática.
  A API/tela **Gerenciar acesso** agora resolve e exibe o servidor legado, em
  vez de `Não identificado`, e mostra a pendência de credenciais. O único
  cliente sem linha em `customer_phones` também não possui telefone utilizável,
  portanto nenhum valor foi inventado.
- API e frontend foram reconstruídos e estão saudáveis; n8n também respondeu
  normalmente e a rota administrativa continua protegida com 401 sem sessão.
  Oito suítes/29 testes, lint, build, sintaxe e `git diff --check` passaram.
  Nenhuma mensagem, teste externo, alteração em painel ou cobrança foi criada.
  Próximo passo: preencher credenciais confirmadas dos 168 vínculos e revisar
  manualmente os 61 clientes sem servidor inequívoco.
- Data/hora: 2026-08-18 09:50 BRT — auditoria de retomada após alterações em outra sessão
- O código, a memória operacional e o runtime foram comparados sem publicar ou
  alterar serviços. API, frontend, n8n, worker e Redis estão ativos; API,
  frontend e n8n responderam normalmente. O workflow publicado permanece com
  36 nós/33 conexões conforme o último registro.
- As mudanças recentes estão presentes: fila de teste assistido, assistente
  web/Telegram, confirmações de escrita, cadastro e alteração de clientes,
  vínculo/migração interna de acesso, preparação de cobrança, acervo opcional
  de suporte e instalação para cliente identificado. WhatsApp administrativo,
  captura de suporte e instância financeira continuam desligados; Telegram e
  escritas confirmadas estão ativos. A assinatura opcional do webhook PaggPay
  continua ausente.
- Vinte e nove testes de servidor, lint, build, sintaxe e `git diff --check`
  passaram. `npm test` não é um script definido neste projeto; a suíte correta
  continua sendo `node --test server/*.test.js`.
- Foram identificadas três pendências de robustez: o status da API ainda
  apresenta `mode=read_only` mesmo com ferramentas de escrita confirmada ativas
  no Telegram; cadastro/alteração de cliente e sincronização de
  `customer_phones` não são uma transação única e ignoram erro da segunda
  gravação; e a criação Pix PaggPay pode deixar uma cobrança externa sem
  `payment_event` se a persistência falhar depois que o provedor aceitar o Pix.
  Corrigir esses pontos antes de ampliar o uso administrativo em produção.
- O bloqueio funcional mais relevante permanece: 181 clientes e nenhum acesso
  principal ativo cadastrado. A jornada de instalação está correta ao cair em
  Suporte, mas só entregará dados automaticamente depois do vínculo seguro dos
  acessos reais. Nenhuma mensagem, teste, cliente, acesso, Pix ou cobrança foi
  criado nesta auditoria.
- Data/hora: 2026-08-18 01:14 BRT — guia seguro para cliente ativo publicado
- O menu **Já sou cliente** e o bloqueio de novo teste agora oferecem
  **Instalar em outro aparelho**. A jornada confirma cliente ativo pelo telefone
  recebido da Evolution, pergunta aparelho/sistema/marca e consulta somente o
  acesso principal ativo no Horizons; não cria, renova nem altera acesso.
- O Intake marca a sessão como identidade verificada pelo transporte Evolution.
  A nova rota protegida `POST /typebot/customer-installation` exige essa sessão,
  recupera usuário/senha cifrados, deriva código do provedor ou códigos Android
  exclusivamente da resposta original do servidor, omite DNS em Samsung/LG e
  bloqueia dados ausentes ou ambíguos. Checkout não é devolvido nessa jornada.
- Mídias HTTPS do `installation_guides` são anexadas como links de apoio; quando
  não houver acesso completo, o fluxo oferece Suporte e declara que nenhuma
  alteração foi feita. Solicitação de instalação por pessoa sem cliente ativo
  também vai a suporte, sem cair por engano na criação de teste.
- O workflow foi republicado ativo com 36 nós/33 conexões, telefone QA
  preservado e zero sessões QA. API e n8n responderam saudáveis; a rota recusou
  sessão inexistente com 403. Vinte e nove testes, lint, build, sintaxe e
  `git diff --check` passaram. Nenhuma mensagem externa foi enviada.
- Auditoria agregada de qualidade revelou um bloqueio operacional: há 181
  clientes e zero `customer_panel_targets` ativos. Os seis testes CineHub
  concluídos não correspondem ao telefone de nenhum cliente, portanto nenhum
  acesso pode ser migrado automaticamente. Até os acessos reais serem vinculados
  por **Clientes → Gerenciar acesso** ou pela ferramenta Telegram confirmada
  `register_customer_access`, a nova jornada cairá corretamente em Suporte.
- Data/hora: 2026-08-18 01:09 BRT — identidade por telefone e teste assistido publicados
- O protocolo `b05be324-3fdb-4bbc-99db-10a313ebfce9` foi diagnosticado de forma
  sanitizada: o telefone não era cliente, mas possuía teste CineHub concluído e
  expirado em 10/08, com credenciais cifradas no Horizons e sem `payment_url`.
  O replay QA reutilizou esse evento; a criação do pedido sem checkout abriu o
  handoff genérico. Nenhum dado do teste estava perdido.
- O Intake agora classifica o telefone antes do fluxo comercial como cliente
  ativo, cliente vencido, teste anterior, contato novo ou cadastro ambíguo. Ele
  considera `customers`, acessos persistentes e o último teste concluído. Apenas
  contato novo pode avançar para aparelho/telas/criação. Cliente ativo recebe
  seus dados cadastrais e bloqueio de novo teste; vencido recebe renovação;
  teste anterior recebe checkout existente ou atendimento sem nova tentativa.
  `MENU` sempre renova essa consulta em vez de reutilizar estado antigo.
- O n8n foi republicado ativo com 33 nós/30 conexões. O telefone QA foi
  preservado e sua única sessão antiga removida. A próxima conversa começa pela
  nova consulta; criação de teste e checkout não foram executados nesta rodada.
- Foi criado o fluxo autenticado de teste assistido para pai/mãe/avó ou outro
  beneficiário. A tela **Testes** ganhou **Teste assistido CineHub** e exige
  telefone do solicitante, nome e telefone próprio do beneficiário, servidor,
  duração, conteúdo e confirmação explícita de criação real. Telefones iguais,
  beneficiário já cliente, duplicado ou com teste concluído são bloqueados.
- A migration `20260813000000_assisted_cinehub_tests.sql` foi aplicada. O evento
  grava `assisted`, telefone solicitante e usuário atendente; o telefone do
  beneficiário continua sendo a identidade do acesso, checkout e possível
  cobrança. Senha e resposta permanecem cifradas no banco e só aparecem na
  sessão autenticada após a criação. O endpoint respondeu 401 sem autenticação,
  confirmando que não ficou público.
- API, frontend, n8n e Redis estão saudáveis; workflow ativo. Oito suítes, lint,
  build, sintaxe e `git diff --check` passaram. Nenhuma mensagem, teste externo
  ou cobrança foi criada durante a implementação e validação.
- Data/hora: 2026-08-18 00:31 BRT — número financeiro continua indefinido
- O operador esclareceu que ainda não possui número financeiro e não reconhece
  o número citado anteriormente. Esse valor deve ser integralmente
  desconsiderado; não foi gravado em ambiente, código, banco ou memória do
  projeto. `EVOLUTION_FINANCE_INSTANCE` permanece vazia e o pareamento ocorrerá
  somente quando um novo número estiver disponível.
- Enquanto isso podem ser concluídos sem disparos externos: menu seguro de guia
  para clientes ativos; templates de todas as jornadas; agenda e seleção de
  vencimentos; geração da fila/digest financeiro de duas horas; alertas pelo
  Telegram; telas de revisão/vínculo de comprovantes; e infraestrutura de mídia
  com URLs provisórias/fallback. Ficam dependentes de insumo externo apenas o
  pareamento dos números e a publicação dos vídeos finais.
- Data/hora: 2026-08-18 00:25 BRT — comprovante espontâneo do financeiro suportado
- O webhook Evolution agora aceita comprovantes em imagem/PDF mesmo quando o
  remetente nunca iniciou uma renovação no bot. Primeiro deduplica pelo ID da
  mensagem; depois reutiliza renovação aberta ou procura o telefone entre os
  clientes. Correspondência única abre a ocorrência com cliente e mensalidade;
  telefone ausente/duplicado abre ocorrência não identificada para revisão.
- Legenda da mídia, origem e resultado da correspondência ficam no contexto da
  extração. A imagem segue pelo leitor de comprovantes e pelas validações já
  existentes de valor, data, E2E, agendamento e duplicidade, terminando em
  `awaiting_bank_review`, nunca em baixa automática baseada só na imagem.
- Foi adicionada `EVOLUTION_FINANCE_INSTANCE`; quando configurada, somente
  mídias dessa instância entram como comprovantes e a leitura do arquivo usa a
  própria instância de origem. Enquanto o número financeiro não estiver ligado
  a uma instância nomeada, a configuração permanece vazia por compatibilidade.
- O número informado pelo operador foi registrado apenas no contexto da
  conversa, não em código/status, pois ainda falta confirmar DDI e pareamento.
  API publicada saudável; sintaxe, lint, `git diff --check` e as oito suítes
  (29 testes) passaram. Nenhum comprovante real, mensagem ou baixa foi criado.
  Próximos passos deste bloco: conectar a instância financeira e implementar o
  job/resumo de duas horas.
- Data/hora: 2026-08-18 00:25 BRT — escopo final de automação consolidado
- O fechamento do Horizons foi organizado em seis entregas: menu de guia para
  cliente já ativo instalar em outro aparelho; templates padronizados por
  aparelho/servidor; lembretes de vencimento e cobrança de clientes com ou sem
  checkout; fila de comprovantes e resumo a cada duas horas; alertas proativos
  ao administrador; e conexão posterior dos números de financeiro/suporte e
  mídias tutoriais.
- O menu de guia deverá validar a identidade, localizar o acesso principal,
  permitir escolher outro aparelho e reenviar somente os campos exigidos pelo
  aplicativo, usando vídeos/imagens do `installation_guides`. Ele não cria nem
  altera acesso no painel externo.
- Clientes com checkout recebem lembrete com o link existente. Clientes legados
  sem checkout recebem instrução de pagamento/comprovante e entram no mesmo
  fluxo de renovação. Imagem de comprovante não produzirá baixa financeira
  definitiva sozinha: o sistema extrai dados, valida E2E/valor/data/agendamento
  e duplicidade, marca `comprovante recebido/em análise`, consolida a fila a
  cada duas horas e só marca pago após confirmação humana do financeiro ou
  confirmação bancária confiável. Isso evita comprovante falso ou reutilizado.
- Telegram poderá alertar solicitações e exceções; eventual aviso ao WhatsApp
  particular exigirá destino/template previamente aprovados. Números de suporte
  e financeiro ainda não existem e nenhuma mensagem/agendamento foi ativado
  nesta definição.
- Data/hora: 2026-08-18 00:18 BRT — códigos desacoplados do aparelho e vinculados ao servidor
- Foi corrigida a premissa de códigos globais: aparelho/marca define somente a
  jornada de instalação; servidor do teste define código parceiro, aplicativo,
  códigos Downloader/NTdown, link e DNS. Todos os hardcodes `00776`, `9538197`
  e `13373` foram removidos do backend, gerador Typebot e workflow n8n.
- `extractCinehubDeliveryProfile` extrai da resposta do teste o único código de
  provedor confirmado e a seção do aplicativo Android com seus códigos e link.
  Smart TV Samsung/LG recebe o código parceiro do servidor e não recebe DNS;
  Android/TV Box recebe aplicativo e códigos retornados pelo servidor. Se os
  dados estiverem ausentes ou ambíguos, o bot bloqueia a entrega e oferece
  suporte, sem reaproveitar código de outro servidor.
- Reuso de teste também recompõe o perfil a partir da resposta cifrada. A
  confirmação pós-pagamento usa o código dinâmico do mesmo teste. A rota de
  guias passou a fornecer somente o procedimento do aparelho e declara que os
  códigos virão da resposta do servidor.
- API publicada saudável e workflow ativo `9kEnUBMXxMvywDWn` republicado com
  33 nós/30 conexões. Sintaxe, lint, `git diff --check` e as oito suítes (29
  testes) passaram; busca confirmou ausência dos três códigos fixos no backend,
  geradores e workflow. Nenhum teste, cobrança ou mensagem foi disparado.
- Data/hora: 2026-08-18 00:15 BRT — padrão multimídia de instalação definido
- Decidiu-se evoluir o WhatsApp para entregar tutorial multimídia conforme
  aparelho/marca. A unidade de conteúdo será a jornada de instalação, não cada
  botão do menu: vídeos curtos reutilizáveis para Samsung, LG, Android/Google
  TV e TV Box, celular Android, iPhone/iPad e computador; console/outros seguem
  para orientação específica quando necessário.
- A sequência recomendada é mensagem curta de contexto, vídeo, imagens de
  apoio numeradas e bloco final de acesso contendo somente os campos exigidos
  pelo aplicativo escolhido. Os arquivos serão cadastrados nos
  `installation_guides` já existentes e o n8n deverá enviar mídia pela Evolution
  com fallback textual quando um arquivo estiver indisponível.
- Nenhum workflow, mídia ou mensagem foi alterado nesta decisão. Próximo passo:
  receber os vídeos/imagens finais ou provisórios, definir nomes estáveis e
  implementar o envio de imagem/vídeo no workflow ativo com homologação em um
  número controlado.
- Data/hora: 2026-08-18 00:09 BRT — DNS conflitante e entrega por aparelho corrigidas
- O último teste Telegram foi rastreado ao endpoint KYROS 6h sem adultos. O
  CineHub devolveu uma DNS estruturada que não aparecia na própria orientação,
  enquanto os links de acesso usavam outro host. A IA/Horizons não inventou o
  domínio; a divergência veio na resposta do provedor. O registro interno desse
  teste foi corrigido para o host confirmado nos links, sem nova chamada ao
  CineHub e sem mensagem ao beneficiário.
- `resolveCinehubAccessDns` agora mantém a DNS do provedor somente quando a
  orientação confirma o mesmo host. Em conflito, deriva a origem de um link de
  acesso M3U/HLS e sinaliza a substituição; respostas sem evidência ficam
  marcadas como não confirmadas. Dois testes automatizados cobrem os casos.
- A criação assistida agora coleta `device_category` e marca/fabricante. Se o
  aparelho não for informado, pede que o comando completo seja reenviado. A
  mensagem pronta varia por Smart TV Samsung/LG, Android/Google TV, TV Box,
  Android, iPhone/iPad, computador, console e outros.
- Samsung/LG recebem instrução de loja, Vizzion Play, provedor 00776, usuário e
  senha, sem DNS. Android TV, TV Box e celular Android recebem passos para
  Downloader/NTdown, códigos 9538197/13373, instalação do IBO 4K Plus e só então
  usuário, senha e DNS. iOS usa App Store/Xtream Codes; demais categorias têm
  orientação específica ou pedem modelo para atendimento.
- Rótulos humanos da IA como `Smart TV` são normalizados para o enum interno;
  comandos reais de Samsung e Android foram interpretados corretamente sem
  criar testes. API publicada e saudável; sintaxe, lint, `git diff --check` e
  as oito suítes (28 testes) passaram. Nenhum novo teste ou mensagem externa foi
  disparado nesta correção.
- Data/hora: 2026-08-17 23:39 BRT — acesso interno e cobrança inteligente publicados
- O Telegram ganhou `register_customer_access`, que registra ou migra o acesso
  somente no banco do Horizons pela RPC transacional existente. A ação exige
  cliente, servidor, usuário, telas e motivo, preserva histórico, cifra senha e
  mensagem completa e declara na confirmação que não entra nem altera o painel
  externo do servidor.
- Senhas e mensagens de acesso são cifradas antes de entrarem na confirmação ou
  auditoria; o texto original desses comandos é substituído por uma indicação
  protegida. O resumo nunca exibe a senha.
- A ferramenta `prepare_customer_charge` procura primeiro o checkout HTTPS do
  acesso principal ativo. Se existir, apenas o devolve no Telegram. Se não
  existir, após confirmação cria renovação e cobrança Pix PaggPay, registra o
  evento pendente e devolve o copia-e-cola no Telegram. Nenhuma mensagem é
  enviada ao cliente; o canal financeiro aguarda número/instância próprios.
- A interpretação MiniMax foi validada sem escrita para registro de acesso e
  preparação de cobrança. API publicada e saudável; sintaxe, lint,
  `git diff --check` e as oito suítes (25 testes) passaram. Nenhum acesso real,
  checkout, Pix ou mensagem foi criado nesta publicação.
- Data/hora: 2026-08-17 23:34 BRT — gestão cadastral pelo Telegram publicada
- O assistente administrativo ganhou consulta de planos e três ações com
  confirmação: `create_customer`, `update_customer` e
  `set_customer_payment_status`. Ele pode cadastrar cliente usando um plano já
  existente, alterar nome, telefone, plano, valor, telas, vencimento, estado,
  pagamento e observações, ou marcar pago/pendente. Busca ambígua, telefone
  duplicado, plano inexistente e alteração vazia são recusados antes da escrita.
- O cadastro cria também o telefone principal em `customer_phones`; nenhuma
  operação aceita IDs inventados pela IA. O Telegram exibe o cliente e os
  campos exatos antes dos botões, e a execução continua atômica por confirmação
  reivindicada uma única vez e auditada.
- A interpretação MiniMax foi validada sem escrita com comandos de cadastro e
  pagamento e extraiu corretamente ferramenta/campos. API publicada e saudável;
  sintaxe, lint, `git diff --check` e as oito suítes (25 testes) passaram.
  Nenhum cliente real foi criado ou alterado na publicação. Próximo bloco:
  vínculo/migração de acesso, renovação e cobrança Pix confirmadas.
- Data/hora: 2026-08-17 23:29 BRT — acervo seguro de conversas de suporte preparado
- Foi criada e aplicada a migration
  `20260818020000_support_conversation_archive.sql`. O acervo registra mensagens
  textuais do suporte com instância, ID externo deduplicado, telefone, direção,
  horário e estado de revisão; possui RLS e leitura restrita ao proprietário.
- O webhook Evolution ganhou captura opcional da instância de suporte, incluindo
  mensagens recebidas e enviadas. A função não responde contatos, não treina o
  modelo automaticamente e ignora eventos de outras instâncias. A configuração
  permanece desligada até o operador confirmar o nome exato da instância
  Evolution ligada ao número de suporte; `Meu numero` foi a única instância
  identificada pelo utilitário local, mas não foi presumida como suporte.
- API publicada e saudável. Sintaxe, lint, `git diff --check` e as oito suítes
  (25 testes) passaram. Nenhuma mensagem externa foi enviada e nenhuma conversa
  foi capturada nesta implementação. Próximos passos: confirmar a instância de
  suporte, ativar a coleta, criar revisão/extração de procedimentos e ampliar
  as ferramentas confirmadas do Telegram para cadastro, acesso, renovação e
  cobrança por operações de negócio específicas.
- Data/hora: 2026-08-17 23:31 BRT — confirmação Telegram reparada e publicada
- A auditoria confirmou que o novo comando chegou ao webhook, mas o MiniMax
  devolveu um objeto JSON válido seguido de texto adicional. O parser rejeitou
  a resposta antes de criar `admin_assistant_confirmations`, portanto nenhum
  botão foi enviado e nenhuma ação externa ocorreu.
- O parser agora extrai o primeiro objeto JSON completo por balanceamento de
  chaves. Comandos no formato `Envie pelo WhatsApp para <telefone> a mensagem
  exata: <texto>` também seguem um caminho determinístico que preserva
  literalmente o destino e a mensagem, sem depender da interpretação da IA.
- Falhas posteriores passam a ser respondidas no próprio Telegram, em vez de
  ficarem apenas na auditoria. API reconstruída e saudável; sintaxe, lint,
  `git diff --check` e 25 testes de servidor passaram. Nenhuma mensagem
  WhatsApp ou teste externo foi executado durante o reparo.
- Data/hora: 2026-08-17 23:18 BRT — ausência de botão de confirmação esclarecida
- A auditoria mostrou que o bot Telegram recebeu somente o `/start`, processado
  como `help`; nenhum comando de escrita chegou ao webhook e, por isso, nenhuma
  linha foi criada em `admin_assistant_confirmations` e nenhum teclado de
  confirmação deveria aparecer. O webhook está saudável, sem updates pendentes
  ou erro, e aceita `message` e `callback_query`.
- Para homologar, o operador precisa enviar o comando completo dentro do chat
  privado do bot Telegram. O bot então interpreta a ação e cria os botões; a
  palavra `Confirmar` enviada no chat do Codex não identifica nem executa uma
  solicitação. Nenhuma mensagem WhatsApp ou teste foi criado no diagnóstico.
- Data/hora: 2026-08-17 23:13 BRT — ações confirmadas liberadas no bot Telegram
- O assistente administrativo Telegram agora interpreta duas ferramentas de
  escrita: `create_assisted_test` e `send_whatsapp`. A IA somente extrai os
  campos; toda solicitação gera um resumo com destino/conteúdo exatos e botões
  **Confirmar**/**Cancelar**, expira em dez minutos e não produz efeito antes
  do clique do único Telegram User ID autorizado.
- `send_whatsapp` exige telefone e mensagem completos e, depois da confirmação,
  envia exatamente o texto aprovado pela instância Evolution explicitamente
  configurada como `Horizons Typebot`. A ferramenta não cria texto por conta
  própria, não escolhe contatos e não usa a instância administrativa.
- `create_assisted_test` exige nome e telefone do beneficiário; KYROS, 6 horas
  e sem adultos são os padrões quando o operador não especifica outros valores.
  Na confirmação, valida cliente existente, duplicidade de prospect e teste
  anterior, cria uma reserva idempotente, chama o CineHub uma vez, cifra senha
  e resposta em repouso e devolve as credenciais somente no chat privado do
  Telegram. Falhas ficam auditadas e não são repetidas automaticamente.
- A migration `20260818010000_admin_confirmations_telegram.sql` foi aplicada e
  o webhook Telegram agora aceita `message` e `callback_query`. Os estados de
  confirmação são reivindicados atomicamente antes da execução; cliques
  repetidos, expirados ou de outro usuário não executam a ação.
- API/frontend publicados e saudáveis; escrita, Telegram, um usuário permitido
  e instância de vendas explícita foram confirmados no container. Vinte e quatro
  testes, lint, build, sintaxe e `git diff --check` passaram. Nenhum teste real
  foi criado e nenhuma mensagem WhatsApp foi enviada durante a implementação.
  A primeira homologação deve gerar uma confirmação e cancelá-la; somente
  depois executar uma ação real conscientemente aprovada.
- Data/hora: 2026-08-17 23:05 BRT — assistente administrativo Telegram ativo
- O bot Telegram administrativo foi validado pela API oficial, configurado no
  `.env` protegido e limitado a um único Telegram User ID confirmado por uma
  mensagem privada `/start`. O token e o ID não foram copiados para código,
  migrations ou esta memória. Como o token foi enviado originalmente no chat,
  recomenda-se regenerá-lo no BotFather depois da homologação e atualizar o
  ambiente protegido.
- Foi publicada a rota `POST /webhooks/telegram/admin`, protegida pelo header
  secreto nativo do webhook Telegram, allowlist de user ID e chat privado. Ela
  reutiliza o mesmo interpretador MiniMax, ferramentas somente de leitura,
  formatação e auditoria do assistente web. Grupos, usuários fora da allowlist
  e mensagens sem texto são ignorados.
- A migration `20260818000000_admin_assistant_telegram.sql` foi aplicada para
  permitir o canal `telegram` na auditoria; a deduplicação usa o ID do update.
  O webhook público foi registrado sem erro, a fila pendente zerou e o `/start`
  foi processado uma única vez como ferramenta `help`, com status `completed`.
- API e frontend foram reconstruídos e estão saudáveis. Oito suítes, lint,
  build, sintaxe e `git diff --check` passaram. O bot continua estritamente em
  leitura: ainda não responde clientes, não envia WhatsApp e não executa
  alterações, renovações, cobranças ou testes.
- Data/hora: 2026-08-17 22:34 BRT — fila de teste assistido atualizada automaticamente
- A homologação do operador percorreu nome e telefone do beneficiário e o
  workflow registrou corretamente uma solicitação `pending`, sem erro e sem
  criar acesso externo. O protocolo também foi devolvido ao WhatsApp. A ausência
  visual na tela ocorreu porque **Testes** carregava a fila somente ao montar a
  página ou ao clicar em **Atualizar**; não era perda da solicitação.
- A tela **Testes** agora atualiza silenciosamente a fila a cada 15 segundos e
  quando a janela recupera foco, sem substituir a tela por spinner. Frontend
  reconstruído e publicado; lint, build e `git diff --check` passaram. A
  solicitação existente continua pendente para revisão e nenhum acesso foi
  criado.
- Para o assistente administrativo no WhatsApp, a allowlist deve conter o
  número de quem enviará os comandos, não o número conectado como bot. O canal
  administrativo deve permanecer separado da linha de Vendas para evitar que
  mensagens de clientes sejam interpretadas como comandos privilegiados.
- Data/hora: 2026-08-17 22:29 BRT — assistente IA integrado ao painel e preparado para WhatsApp
- Foi publicada a tela **Assistente IA** no menu do Horizons. Ela reutiliza o
  endpoint autenticado do proprietário e apresenta de forma estruturada busca
  de clientes, resumo de cadastro/acessos, checkout, inadimplentes e métricas.
  O modo permanece somente leitura; a IA interpreta o pedido, enquanto os dados
  continuam vindo das ferramentas determinísticas e restritas do backend.
- A execução do assistente foi centralizada para web e WhatsApp, com auditoria
  por canal. O webhook Evolution administrativo reconhece comandos apenas se a
  feature flag estiver ativa e o remetente estiver na allowlist exata; nesse
  caso ele não registra o administrador como prospect. As respostas possuem
  formatação específica por ferramenta e nenhuma senha é retornada.
- Foi criada e aplicada a migration
  `20260817020000_admin_assistant_whatsapp_dedupe.sql`; cada mensagem do canal
  administrativo possui ID único na auditoria para impedir resposta duplicada
  em retentativas do webhook. A API MiniMax está configurada, mas
  `ADMIN_ASSISTANT_WHATSAPP_ENABLED` permanece falso e a allowlist está vazia.
  Portanto, o canal WhatsApp ainda não responde e aguarda o número exato que
  enviará os comandos administrativos.
- API e frontend foram reconstruídos e estão saudáveis; rotas administrativas
  sem sessão retornam 401 e a coluna de deduplicação respondeu pela API do
  banco. Oito suítes, lint, build, sintaxe e `git diff --check` passaram.
  Nenhuma mensagem WhatsApp ou escrita de negócio foi executada. Próximo passo:
  cadastrar um único número administrativo, ativar a flag e homologar primeiro
  uma consulta inofensiva; ferramentas de escrita continuam desligadas.
- Data/hora: 2026-08-17 22:09 BRT — fila de teste para outra pessoa publicada
- O caminho WhatsApp **Teste para outra pessoa** agora coleta primeiro o nome e
  depois o WhatsApp próprio do beneficiário. O telefone é normalizado com DDD,
  precisa ser diferente do solicitante e não dispara o CineHub. Ao concluir, o
  n8n registra uma solicitação pendente e informa protocolo e aviso explícito
  de que nenhum acesso foi criado.
- Foi criada e aplicada a migration
  `20260817010000_assisted_test_requests.sql`, com fila por proprietário, RLS,
  estados `pending/completed/rejected`, seleção CineHub e vínculo opcional ao
  evento criado. A rota protegida `POST /typebot/assisted-test-requests` usa uma
  chave baseada no ID da mensagem; repetições retornam o registro existente e
  nunca reabrem uma solicitação concluída ou recusada.
- A tela **Testes** exibe a fila recebida pelo WhatsApp, permite recusar sem
  efeito externo ou revisar com o formulário preenchido. Somente **Confirmar e
  criar acesso real**, em sessão administrativa autenticada, chama o CineHub.
  A API confere se nome e telefones coincidem com a solicitação pendente antes
  de criar e, no sucesso, vincula o evento e marca a fila como concluída.
- Migration, API e frontend foram publicados; o workflow permaneceu ativo com
  33 nós/30 conexões, um telefone QA e três sessões preservadas. API, frontend,
  worker e Redis estão ativos; a nova rota rejeita chamada sem token com 401.
  Oito suítes, lint, build, sintaxe e `git diff --check` passaram. A primeira
  sondagem coincidiu com o restart da API e recebeu reset; após três segundos,
  a saúde respondeu `ok`. Nenhuma mensagem, teste ou cobrança foi criada nesta
  publicação; falta homologar a coleta pelo telefone QA e depois revisar a
  pendência sem confirmar a criação externa.
- Data/hora: 2026-08-17 21:46 BRT — retomada e estado atual confirmados
- `api`, `frontend`, `worker`, Redis e n8n estão ativos e saudáveis. As duas
  instâncias Evolution, `Meu numero` e `Horizons Typebot`, permanecem `open`;
  o webhook do bot está habilitado para `MESSAGES_UPSERT` no workflow completo
  e a integração Typebot legada continua desabilitada.
- O histórico recente confirmou uma jornada WhatsApp em 2026-08-17 que avançou
  por listas até o checkout. O envio com plano/valor indefinidos ocorreu antes
  da correção registrada às 15:00; a versão ativa atual contém a proteção
  `Number.isFinite` e usa descrição genérica quando esses dados não existem.
  Nenhuma mensagem, teste, cobrança, reinício ou alteração externa foi feita
  nesta retomada. Sintaxe do gerador e `git diff --check` passaram.
- Data/hora: 2026-08-17 15:00 BRT — checkout histórico e base do teste assistido corrigidos
- O diagnóstico da sessão ativa confirmou que o checkout histórico estava
  presente e válido, mas não havia quantidade de telas nem valor do plano na
  memória da conversa. O comando **Abrir checkout** montava a resposta com
  esses campos indefinidos. O workflow agora envia uma mensagem genérica e
  válida nesses casos, preserva o link e orienta o contato a tocá-lo; quando
  plano e valor existem, continua mostrando os detalhes.
- O workflow n8n foi republicado ativo com 30 nós/27 conexões. A publicação
  preservou as três sessões existentes e a inspeção da versão ativa confirmou
  a correção. Nenhuma mensagem, cobrança ou teste externo foi disparado.
- Foi aplicada a migration `20260813000000_assisted_cinehub_tests.sql`, que
  habilita no evento CineHub a marca de teste assistido, o telefone do
  solicitante e o operador autenticado. Consulta somente de leitura confirmou
  os três campos no schema publicado. A tela **Testes** e a rota autenticada
  de criação assistida deixam de falhar por ausência dessas colunas.
- O fluxo WhatsApp de **Teste para outra pessoa** ainda abre apenas um handoff
  genérico. O próximo passo é coletar nome e WhatsApp do beneficiário,
  registrar uma solicitação pendente e entregá-la ao assistente administrativo.
  A criação externa deve ocorrer somente depois de comando/confirmacão do
  operador; o número administrativo e o texto final de qualquer envio ainda
  precisam ser confirmados antes de ativar mensagens.
- Data/hora: 2026-08-17 14:34 BRT — migração de cliente entre servidores publicada
- Foi aplicada a migration
  `20260817000000_customer_server_migrations.sql`. Cada cliente agora pode ter
  exatamente um acesso principal ativo em `customer_panel_targets`; acessos
  anteriores recebem data de desativação e referência para o substituto. A RPC
  transacional `migrate_customer_server_access` cria o novo acesso, torna-o
  principal, desativa o anterior e grava `customer_server_history` de forma
  atômica, preservando credenciais, checkout e histórico.
- A API autenticada ganhou leitura de acessos/histórico por cliente e criação de
  migração. Senha e resposta original do servidor são cifradas antes da RPC. A
  operação exige servidor ativo, motivo, usuário do novo acesso e quantidade de
  telas; portanto, nunca desativa o acesso anterior antes de o novo estar
  informado e validado pelo operador.
- A tela Clientes ganhou a ação **Gerenciar acesso**. O modal mostra o acesso
  principal, histórico de servidores e formulário para primeiro vínculo ou
  migração, incluindo servidor, motivo, usuário, senha, pacote, telas, DNS,
  checkout, validade e resposta original cifrada. A antiga seleção de etiquetas
  foi preservada por compatibilidade.
- Migração, schema e função foram validados sem escrita em cliente real. API e
  frontend foram reconstruídos e estão saudáveis; nova rota retorna 401 sem
  autenticação. Oito suítes, lint, build, sintaxe e `git diff --check` passaram.
  A primeira migração real permanece pendente de ação explícita no painel.
- Data/hora: 2026-08-17 14:13 BRT — respostas por servidor auditadas sem telefone
- Com autorização explícita do operador, os seis endpoints 6h/sem adultos foram
  chamados com `phone` e `senderPhone` vazios. Fenix, Kronos, Kyros, Vornak e
  Zeus criaram e retornaram testes completos com checkout. O P2P também criou
  teste e checkout, mas o adaptador local o classificou inicialmente como
  incompleto porque seu `dns` é `null`; duas chamadas diagnósticas adicionais
  confirmaram o contrato P2P. Nenhum teste foi associado a cliente/prospect,
  nenhuma cobrança ou mensagem foi criada e as credenciais não foram
  persistidas pelo Horizons.
- A análise confirmou configuração por servidor: DNS principal e alternativos,
  código rotativo de apps parceiros, datas diferentes de rotação e pequenas
  diferenças de apps/códigos Android. O bloco comum contém M3U/HLS/TS, apps
  parceiros de Smart TV, apps licenciados anuais, Android, iOS, computadores,
  videogames, Chromecast e TVs antigas.
- Problemas de qualidade encontrados: `connections` estruturado pode divergir
  do texto humano; Fenix contém pelo menos um DNS com URL malformada; algumas
  linhas de apps parceiros exibem credenciais fixas diferentes do acesso
  dinâmico; a data de rotação informada pelo Vornak já estava vencida; e o P2P
  usa contrato próprio sem DNS, apenas Binstream com código Downloader/link.
  Portanto, não importar a resposta inteira como tutorial confiável sem parser,
  normalização e regras específicas por servidor.
- Próxima implementação recomendada: catálogo versionado por servidor com DNS
  por finalidade, apps e códigos com vigência, instruções comuns reutilizáveis,
  exceção P2P e credenciais sempre vindas do acesso do cliente. `git diff
  --check` passou; nenhum código ou serviço foi alterado nesta auditoria.
- Data/hora: 2026-08-17 14:09 BRT — auditoria multisservidor bloqueada por telefone usado
- O catálogo protegido contém 24 endpoints: Fenix, Kronos, Kyros, P2P, Vornak
  e Zeus, cada um nas combinações 6h/12h e completo/sem adultos. Com autorização
  explícita do operador, foi tentado exatamente um teste 6h sem adultos em cada
  servidor usando o telefone QA e chaves idempotentes separadas.
- Os seis endpoints recusaram antes de criar acesso com
  `CINEHUB_PHONE_ALREADY_TESTED`. A trava do CineHub é global para o telefone,
  não independente por servidor. Nenhum usuário, checkout, cobrança ou mensagem
  nova foi gerado; seis eventos internos ficaram corretamente marcados como
  `failed` para auditoria.
- A consulta de histórico encontrou quatro testes concluídos, mas somente dois
  possuem orientação completa e ambos são KYROS; eles confirmam que a resposta
  inclui M3U/HLS/TS, DNS, apps parceiros e código mensal, apps licenciados/pagos,
  códigos Downloader/NTdown, links por plataforma, tutoriais e IPs para TVs
  antigas. Os códigos e DNS variam por servidor e não devem ser tratados como
  configuração global. Para comparar Fenix, Kronos, P2P, Vornak e Zeus ainda são
  necessários cinco telefones controlados que nunca tenham sido testados no
  CineHub, um por servidor, ou uma liberação/reset fornecida pelo painel.
- `git diff --check` passou. Nenhum código ou serviço foi alterado nesta rodada.
- Data/hora: 2026-08-17 14:01 BRT — checkout histórico recuperado para QA
- Com confirmação explícita do operador, foi criado de forma idempotente um
  evento concluído para o teste CineHub histórico do prospect/telefone QA final
  `2020`. O registro contém usuário, pacote de três conexões, datas originais e
  checkout válido; a senha foi cifrada pelo cofre AES-GCM e o round-trip foi
  validado. O DNS não foi informado e permanece nulo. Nenhum valor individual
  de acesso ou URL completa foi registrado nesta memória.
- A validação revelou que um evento concluído mais novo, sem checkout utilizável,
  ocultava o checkout histórico porque a API consultava apenas o primeiro
  resultado. `server/api.js` agora examina até 25 testes recentes e escolhe o
  primeiro checkout CineHub válido, tanto no intake quanto na rota de renovação,
  preservando o teste mais recente para a classificação de identidade.
- API e worker foram reconstruídos. A rota publicada usada pelo bot respondeu
  HTTP 200, `found=true`, checkout válido e pacote esperado para a sessão QA.
  Vinte e dois testes, lint, sintaxe, saúde da API e `git diff --check` passaram.
  Nenhuma mensagem, cobrança, pagamento ou acesso externo foi criado.
- A tentativa inicial de persistir a coluna opcional `assisted` foi recusada sem
  escrita porque a migração correspondente ainda não está aplicada no schema
  publicado; o registro foi salvo depois usando somente colunas disponíveis.
- Data/hora: 2026-08-17 11:36 BRT — regra de dados operacionais IPTV
- Por orientação explícita do proprietário, `AGENTS.md` agora distingue
  credenciais IPTV de clientes das credenciais de infraestrutura e dos painéis
  administrativos. Usuário, senha, DNS/servidor, validade e plano podem ser
  recebidos, analisados, importados e atualizados nos campos próprios do banco
  Horizons, usando a proteção existente da aplicação.
- Esses dados individuais continuam fora de código, Git, `PROJECT_STATUS.md`,
  GBrain e logs públicos; diagnósticos e resumos devem mascará-los. A mudança é
  somente de política operacional, passou em `git diff --check` e não alterou
  banco, serviços, clientes, mensagens ou integrações.
- Data/hora: 2026-08-17 11:18 BRT — opções clicáveis restauradas como lista
- A investigação confirmou que o runtime usa Evolution API 2.4.0-rc2 e contém
  a montagem moderna de `interactiveMessage` com `additionalNodes`, porém os
  reply buttons ainda reproduzem o defeito conhecido da Evolution/Baileys: a
  API aceita `sendButtons`, grava status `PENDING` e o WhatsApp não entrega. O
  projeto oficial possui relato aberto equivalente (#2404); não há versão mais
  nova publicada que corrija o comportamento de forma verificável.
- O script canônico `/root/n8n/tools/create-horizons-full-workflow.mjs` passou a
  apresentar os menus da conversa como `sendList`, transporte interativo que a
  própria Evolution 2.4 implementa pelo `listMessage` legado compatível. O menu
  inicial agora mostra `Escolher opção` e abre três linhas clicáveis; menus
  seguintes gerados por `buttons()` ou `list()` usam o mesmo formato. Os aliases
  de texto foram preservados.
- O workflow foi republicado ativo com 30 nós/27 conexões. Sintaxe do script,
  `git diff --check`, saúde do n8n e saúde da API passaram. Nenhuma mensagem foi
  enviada pelo agente; falta o operador reenviar `MENU` e confirmar visualmente
  o botão `Escolher opção` e a seleção de uma linha.
- Data/hora: 2026-08-17 11:13 BRT — fallback textual homologado no WhatsApp
- O operador reenviou `MENU` e confirmou que o bot voltou a responder. A
  resposta chegou como texto numerado, conforme a publicação de fallback, e
  não como botões. Isso homologa entrega, webhook, intake e execução do fluxo;
  a apresentação interativa continua indisponível porque os envios anteriores
  de `interactiveMessage` ficavam em `PENDING` na Evolution e não apareciam no
  WhatsApp.
- Nenhuma mensagem foi enviada pelo agente e o workflow não foi republicado.
  Para recuperar botões será necessário diagnosticar separadamente o formato
  interativo suportado pela versão atual da Evolution/WhatsApp sem remover o
  fallback textual funcional.
- Data/hora: 2026-08-17 11:13 BRT — retomada e saúde operacional
- O contexto integral e o worktree em andamento foram preservados. `api`,
  `frontend`, `worker` e `redis` permanecem ativos; Redis está healthy. API
  (`127.0.0.1:8081/health`), frontend (`127.0.0.1:3100`) e n8n
  (`127.0.0.1:5678/healthz`) responderam normalmente. A instância
  administrativa Evolution `Meu numero` permanece `open`.
- O próximo passo funcional continua sendo o operador reenviar `MENU` ao bot
  pelo telefone de QA e confirmar se o fallback textual numerado é exibido.
  Nenhuma mensagem, teste, cobrança, pagamento, reinício ou alteração externa
  foi realizada nesta retomada.
- Data/hora: 2026-08-16 19:13 BRT — menus com fallback textual após novo pareamento
- O reteste confirmou que os `MENU` enviados às 19:03 e 19:07 BRT foram
  recebidos pela Evolution e processados pelo n8n. O workflow gerou corretamente
  o menu interativo, mas as respostas `interactiveMessage` permaneceram com
  status `PENDING` e não foram exibidas no WhatsApp. Não era falha de webhook,
  intake ou execução do workflow.
- O script canônico `/root/n8n/tools/create-horizons-full-workflow.mjs` passou a
  enviar os menus principais como texto numerado pelo endpoint `sendText` e a
  aceitar o nome visível da opção como alias do ID interno. O menu inicial
  também foi convertido para texto. A lógica de triagem, teste, pedido, checkout
  e pagamento não foi alterada.
- O workflow foi republicado ativo com 30 nós/27 conexões. A inspeção do
  modelo publicado confirmou fallback textual e aliases ativos, sem botões no
  menu inicial. Nenhuma mensagem foi enviada pelo agente, nenhum teste ou
  cobrança foi criado; falta o operador reenviar `MENU` para homologar a
  entrega do texto pelo WhatsApp.
- Data/hora: 2026-08-16 19:02 BRT — instância do bot pareada novamente
- Após o pareamento manual pelo operador, a instância Evolution `Horizons
  Typebot` voltou ao estado `open`; `Meu numero` também permanece `open`. O
  webhook do bot continua habilitado para `MESSAGES_UPSERT` e aponta para o
  endpoint correto do workflow completo no n8n. A integração Typebot legada
  permanece desabilitada, conforme a arquitetura atual. Nenhuma mensagem foi
  enviada pelo agente; o próximo passo é o operador reenviar `MENU` e confirmar
  a resposta.
- Data/hora: 2026-08-16 18:58 BRT — falha do `MENU` diagnosticada
- A mensagem enviada pelo operador não chegou ao n8n. A instância Evolution
  dedicada `Horizons Typebot` está `close`, enquanto a instância administrativa
  `Meu numero` permanece `open`. O webhook da instância do bot continua ativo,
  assinado para `MESSAGES_UPSERT` e apontando para o endpoint correto do n8n.
- O workflow `Horizons | Atendimento WhatsApp completo | v1` permanece ativo
  com 30 nós, mas não recebeu execução nova; as execuções mais recentes ainda
  são de 2026-08-10. A correção exige parear novamente a instância do bot por
  QR Code, ação que depende de autorização do operador. Nenhum serviço foi
  reiniciado e nenhuma mensagem foi enviada durante o diagnóstico.
- Data/hora: 2026-08-16 18:53 BRT — retomada operacional
- O contexto integral do projeto foi relido e o worktree em andamento foi
  preservado. `api`, `frontend`, `worker` e `redis` permanecem ativos; Redis
  está healthy. API (`127.0.0.1:8081/health`), frontend
  (`127.0.0.1:3100`) e n8n (`127.0.0.1:5678/healthz`) responderam normalmente.
- O próximo passo funcional continua sendo a homologação visual do atendimento
  n8n pelo telefone de QA, iniciada pelo operador com `MENU`. Nenhuma mensagem,
  teste, cobrança, pagamento, reinício ou alteração externa foi realizada
  nesta retomada.
- Data/hora: 2026-08-13 17:32 BRT — orientações de instalação auditadas e publicadas
- O escopo foi restringido ao conteúdo pós-teste; criação de testes e checkout
  já estavam homologados e não foram reexecutados. A auditoria encontrou que o
  workflow não distinguia Android/iOS nem Fire TV/TV Box, podia selecionar o
  primeiro manual da categoria por ordem do banco e ignorava `requires_human`.
- O workflow ativo agora pergunta Android ou iPhone/iPad, Fire TV ou TV Box
  Android e, para TCL/Philips/AOC, Android/Google TV ou Roku. A API prioriza o
  manual genérico correto por categoria e a entrega interrompe orientações não
  confirmadas com botão para suporte. O workflow foi republicado ativo com 30
  nós/27 conexões e manteve um telefone QA; não havia sessão QA para remover.
- As mensagens publicadas ficaram objetivas por plataforma: Samsung/LG usam
  Vizzion Play como preferência e provedor `00776`; Fire/Android TV/TV Box usam
  IBO 4K Plus, Downloader `9538197`, NTdown `13373` e o link validado
  `https://aftv.news/9538197`; Android usa esse link; iPhone/iPad usa Smarters
  Player Lite da App Store; computador usa Web Player ou 9Xtream da Microsoft
  Store. Login, senha e DNS continuam vindo do teste, sem valores fixos no bot.
- A checagem externa encontrou dois links quebrados, MAX4K na Play Store e IPTV
  Smarters no Uptodown (HTTP 404); ambos foram retirados e os 15 manuais foram
  atualizados no banco. Roku continha passos incorretos (`3x OK` e ADB); o manual
  foi corrigido conforme a documentação oficial, mas como não há pacote Roku
  `.zip` aprovado cadastrado, a automação agora exige suporte nesse caso.
- API reconstruída e saudável; n8n saudável. Nove combinações de aparelho foram
  consultadas na API publicada e retornaram o manual esperado; Roku retornou
  `requires_human=true`. Dezenove testes, lint, build, sintaxe e
  `git diff --check` passaram. Nenhuma mensagem, teste ou cobrança foi criado.
- Data/hora: 2026-08-13 17:00 BRT — painel PaggPay não fornece signing secret
- O operador confirmou que o painel atual não gera nem exibe signing secret ao
  configurar o webhook. A especificação pública afirma que `whsec_...` seria
  retornado na criação do endpoint, mas essa capacidade não está disponível na
  interface observada; não apagar nem recriar o webhook funcional apenas para
  perseguir esse segredo.
- O callback permanece operável sem `PAGGPAY_WEBHOOK_TOKEN`: ele extrai somente
  um identificador `txn_*` e reconfirma a transação pela API PaggPay autenticada
  antes de qualquer efeito, com correlação restrita por referência ou telefone
  e valor. A assinatura fica como endurecimento opcional caso a PaggPay passe a
  fornecer o segredo ou o suporte habilite a função.
- Data/hora: 2026-08-13 16:59 BRT — retomada e bloqueios externos confirmados
- A retomada confirmou `api`, `frontend`, `worker` e `redis` ativos; Redis está
  healthy. Fora do isolamento do sandbox, API (`127.0.0.1:8081/health`),
  frontend (`127.0.0.1:3100`) e n8n (`127.0.0.1:5678/healthz`) responderam
  normalmente. A instância administrativa Evolution `Meu numero` está `open`.
- `PAGGPAY_WEBHOOK_TOKEN` permanece ausente no container da API. A próxima ação
  que endurece o callback exige abrir o painel autenticado da PaggPay, obter ou
  rotacionar o signing secret `whsec_...` e gravá-lo diretamente no `.env`
  protegido; nenhum segredo deve ser enviado no chat.
- A homologação visual do atendimento também está pronta para continuação pelo
  telefone de QA, iniciando uma conversa nova com `MENU` para o número do bot.
  Nenhuma mensagem, cobrança, teste externo ou alteração de serviço foi feita
  nesta retomada.
- Data/hora: 2026-08-13 16:57 BRT — webhook PaggPay existente confirmado e callback corrigido
- Entregas reais repetidas da PaggPay nos logs confirmaram que o webhook da conta
  já está cadastrado e aponta para o Horizons. O erro não era ausência do
  cadastro: checkouts CineHub usam uma referência externa não UUID, e o callback
  tentava compará-la diretamente com `renewal_requests.id` (UUID), respondendo
  500 e provocando as retentativas da PaggPay.
- O callback agora consulta `renewal_requests` somente quando `reference_id` for
  UUID; referências externas seguem para a correlação restrita por telefone e
  valor. Referência desconhecida não confirma pagamento nem renova cliente. A API
  foi reconstruída, saúde respondeu `ok`, o callback público respondeu 202 a um
  envelope sintético e os logs novos ficaram sem erro. Sete suítes, lint, sintaxe
  e `git diff --check` passaram; nenhuma cobrança foi criada.
- A lacuna de segurança permanece: o container de produção possui chave API
  PaggPay válida, mas `PAGGPAY_WEBHOOK_TOKEN` continua vazio. Portanto, o cadastro
  do endpoint está funcional, porém o Horizons ainda não valida o `whsec_...` das
  entregas. É necessário revelar/rotacionar o signing secret no painel e gravá-lo
  diretamente no `.env` protegido antes de considerar o webhook endurecido.
- Data/hora: 2026-08-13 16:45 BRT — pré-configuração PaggPay auditada
- A chave PaggPay de produção já instalada foi validada por uma consulta
  somente leitura e respondeu HTTP 200. A documentação oficial atual confirmou
  o endpoint de conta, segredo `whsec_...`, assinatura HMAC-SHA256 sobre
  `<timestamp>.<corpo bruto>`, tolerância de cinco minutos e cadastro pelo painel
  de desenvolvedor. A implementação local corresponde a esse contrato.
- O callback público `POST https://iptv.velhaturbo.cloud/api/webhooks/paggpay`
  foi validado com envelope sintético sem transação e respondeu HTTP 202; a
  API e o proxy local também responderam 202. Nenhuma cobrança ou transação foi
  criada. O teste inicial com HEAD produziu 404 porque a rota aceita somente
  POST; isso não é falha do callback.
- Falta uma ação autenticada no painel PaggPay: cadastrar/confirmar essa URL,
  assinar ao menos `transaction.succeeded`, `transaction.failed` e
  `transaction.refunded`, e transferir o `signing_secret` diretamente para o
  ambiente protegido como `PAGGPAY_WEBHOOK_TOKEN`, sem colocá-lo no chat. Depois
  disso, recriar somente API/worker e validar rejeição de assinatura inválida e
  uma entrega de teste do painel.
- Data/hora: 2026-08-13 16:25 BRT — reteste seguro preparado para números já usados
- O script canônico `/root/n8n/tools/create-horizons-full-workflow.mjs` passou a
  preservar e aplicar o modo QA existente: lista `qaPhones`, replay do último
  teste concluído do próprio telefone, intenção correta de compra, recuperação
  persistente do checkout e aviso explícito `MODO HOMOLOGAÇÃO`. Uma futura
  republicação não deve mais apagar essas proteções do workflow.
- Foi criado `/root/n8n/tools/reset-horizons-qa-sessions.mjs`, que remove somente
  as sessões dos telefones cadastrados como QA e preserva workflow, lista QA,
  clientes, eventos de teste, pedidos e checkouts. O reset foi executado:
  havia um telefone QA e uma sessão correspondente; depois, o workflow voltou
  ativo com uma entrada QA e zero sessões QA abertas.
- Auditoria do workflow ativo confirmou replay QA, aviso visual e recuperação
  persistente de checkout habilitados. As instâncias Evolution `Meu numero` e
  `Horizons Typebot` estão `open`. Sete suítes do servidor, lint, build, sintaxe
  dos scripts e `git diff --check` passaram.
- `PAGGPAY_WEBHOOK_TOKEN` não está configurado no ambiente; falta obter e salvar
  o segredo oficial `whsec_...` e conferir o endpoint no painel PaggPay antes de
  homologar confirmação real de pagamento. Nenhuma mensagem, teste externo,
  pedido ou cobrança foi criado nesta preparação.
- Data/hora: 2026-08-13 16:13 BRT — levantamento de pendências
- O núcleo permanece operacional: `api`, `frontend`, `worker` e `redis` estão
  ativos, Redis está healthy, e API (`127.0.0.1:8081/health`), frontend
  (`127.0.0.1:3100`) e n8n (`127.0.0.1:5678/healthz`) responderam normalmente.
- A pendência prioritária continua sendo a homologação visual ponta a ponta
  do atendimento n8n por aparelho/marca, tutorial, teste, checkout e retornos de
  erro, usando apenas o telefone de QA e sem criar acesso ou pagamento real sem
  confirmação explícita. Depois dessa validação, corrigir os manuais observados
  e validar callback/assinatura PaggPay em ambiente controlado.
- Dívidas posteriores: concluir a renovação Union no agente local, homologar o
  assistente administrativo autenticado e endurecer sua autenticação antes de
  qualquer escrita/WhatsApp. Nenhuma mensagem, cobrança, teste ou alteração
  externa foi realizada neste levantamento.
- Data/hora: 2026-08-11 15:13 BRT — retomada e saúde dos serviços
- Na retomada, o ponto funcional continua sendo a homologação visual do
  workflow completo do n8n por categoria/marca, usando o replay controlado do
  telefone operador quando aplicável e corrigindo os tutoriais observados.
- `api`, `frontend`, `worker` e `redis` do Horizons permanecem ativos; Redis
  está healthy. API (`127.0.0.1:8081/health`), frontend
  (`127.0.0.1:3100`) e n8n (`127.0.0.1:5678/healthz`) responderam normalmente.
- Nenhuma mensagem, teste, pedido, cobrança ou alteração externa foi feita
  nesta conferência.
- Data/hora: 2026-08-11 00:05 BRT — checkout persistente e modo de homologação n8n
- O botão `Reenviar checkout` não depende mais apenas do estado em memória da
  conversa. Quando `checkoutUrl` não estiver na sessão, o n8n consulta o último
  checkout CineHub persistido para o telefone antes de considerar atendimento
  humano. A triagem agora também registra corretamente `purchase` ao escolher
  assinatura direta.
- Foi criado um modo controlado de homologação para um telefone operador no
  `staticData.global.qaPhones` do workflow. Para esse telefone, o backend pode
  repetir somente seu próprio último teste concluído, inclusive expirado, sem
  chamar o CineHub ou criar novo acesso. A entrega mostra explicitamente
  `MODO HOMOLOGAÇÃO`; clientes fora da lista mantêm o limite real do painel.
- O workflow foi republicado ativo com webhook habilitado e validações positivas
  para recuperação persistente, replay QA e aviso visual. A API foi reconstruída
  e API/n8n responderam saudáveis. Sintaxe, sete suítes de testes, lint e
  `git diff --check` passaram.
- Limitação esperada: o replay QA só consegue reenviar um checkout individual
  que ainda esteja persistido no último teste desse mesmo telefone; ele nunca
  inventa nem associa checkout de outro cliente. Próxima etapa funcional:
  homologar cada categoria/marca e corrigir o conteúdo dos tutoriais observados.
- Data/hora: 2026-08-10 23:20 BRT — cache de sessão do n8n limpo corretamente
- O telefone de homologação voltou a aparecer no `staticData` mesmo sem nova
  execução: o runtime ativo do n8n mantinha uma cópia em memória e sobrescreveu
  a primeira limpeza feita por API. Isso explicava a persistência do estado.
- O workflow foi desativado brevemente, a sessão alvo foi removida com o runtime
  parado e o workflow foi reativado. A verificação imediata e outra após cinco
  segundos confirmaram workflow ativo, webhook habilitado, zero sessões e
  ausência do telefone alvo.
- A Evolution foi conferida: `Horizons Typebot` aponta para o webhook correto do
  n8n e sua integração Typebot está desabilitada; `Meu numero` continua apontando
  para o webhook administrativo legado do Horizons. Não havia nova execução do
  n8n depois da tentativa anterior, e somente o workflow completo está ativo.
- Nenhuma mensagem, teste ou pedido foi criado durante a correção.
- Data/hora: 2026-08-10 23:00 BRT — sessão de reteste limpa no n8n
- Com autorização do operador, foi removida somente a sessão do telefone de
  homologação do `staticData.global.sessions` no workflow ativo do n8n. O
  workflow permaneceu ativo, a atualização respondeu HTTP 200 e a verificação
  confirmou zero sessões remanescentes e ausência do telefone alvo.
- Nenhum registro do banco Horizons, pedido, mensagem WhatsApp ou dado do painel
  CineHub foi alterado nesta operação. O operador informou ter excluído o teste
  diretamente no painel CineHub; o próximo passo é iniciar nova conversa e
  homologar a criação do teste e o checkout retornado.
- Data/hora: 2026-08-10 22:45 BRT — fluxo ativo confirmado no n8n
- A orquestração atual do atendimento WhatsApp é o workflow ativo do n8n
  `Horizons | Atendimento WhatsApp completo | v1`; Typebot não participa do
  runtime atual. Rotas internas que ainda contêm `/typebot/` são somente nomes
  legados do backend Horizons e devem ser tratadas como dívida de nomenclatura.
- Execuções recentes do n8n confirmaram dois cenários: uma tentativa recebeu
  `phone_already_tested` do CineHub; depois, o backend reutilizou o teste anterior
  e o fluxo avançou até `Criar pedido automático`, que respondeu 422 por uma
  associação antiga de prospect. A API atualmente publicada já aceita a
  correspondência segura pelo mesmo telefone, além do prospect.
- A comparação sanitizada no banco confirmou: sessão e evento possuem o mesmo
  telefone, prospects diferentes, evento concluído porém expirado e sem checkout
  individual utilizável. Portanto, esse telefone não pode gerar outro teste no
  CineHub e não existe um link antigo recuperável para ele. Para homologar a
  criação real e o `payUrl`, é necessário usar um telefone ainda não testado;
  isso cria acesso externo e depende de confirmação explícita do operador.
- Nenhuma mensagem foi enviada, nenhum novo teste foi criado e nenhum pedido foi
  inserido nesta rodada.
- Data/hora: 2026-08-10 22:10 BRT — checkout SPA por fragmento reconhecido
- O operador forneceu o formato real do checkout CineHub:
  `https://painelcinehub.top/#/checkout/<ref>/<ref>`. A análise anterior estava
  incorreta porque inspecionou pathname/query, mas não o fragmento (`hash`) da
  SPA; uma URL válida desse formato também aparenta pathname `/`.
- `isUsableCinehubCheckoutUrl` agora aceita estritamente o hash
  `#/checkout/<token>/<token>` nos hosts homologados e continua rejeitando a
  raiz sem referências. Teste específico adicionado, lint/sintaxe/diff
  aprovados e API reconstruída/saudável.
- O link exato do pedido anterior havia sido removido durante a correção
  equivocada e não pôde ser recuperado nos logs após recriações do contêiner.
  O exemplo fornecido não foi associado ao cliente. O pedido segue em revisão
  manual; um novo `payUrl` válido será preservado corretamente nas próximas
  respostas do painel. Nenhuma cobrança ou novo teste foi criado.
- Data/hora: 2026-08-10 21:50 BRT — checkout genérico bloqueado
- O último pedido real mostrou a raiz de `painelcinehub.top` como checkout. A
  consulta confirmou que essa URL veio sem caminho, parâmetros ou referência
  no `payUrl` do teste CineHub; não era um checkout individual PaggPay.
- Foi adicionada validação `isUsableCinehubCheckoutUrl`: aceita somente HTTPS
  dos hosts homologados e rejeita a raiz sem referência. O Typebot agora
  verifica `requires_human` antes de exibir link e encaminha para atendimento
  quando não houver checkout válido.
- O pedido afetado foi alterado de `waiting_payment` para `manual_review`; seu
  checkout e o `payment_url` genérico do teste vinculado foram removidos. Não
  existia cobrança válida para cancelar. API reconstruída, Typebot republicado
  com 36 grupos/113 blocos, e 19 testes, sintaxe, lint e `git diff --check`
  passaram. A primeira publicação coincidiu com o restart da API e recebeu
  `ECONNRESET`; foi repetida após healthcheck e concluída sem warnings.
- Data/hora: 2026-08-10 14:24 BRT — colaboração n8n por API habilitada
- O operador concluiu o cadastro inicial e gerou uma API key. A chave foi
  transferida diretamente do PostgreSQL do n8n para `/root/n8n/.api-key`, sem
  ser impressa, com permissão `0600` e exclusão no `.gitignore`.
- A API local `GET /api/v1/workflows` respondeu HTTP 200 autenticado e retornou
  zero workflows. O agente pode agora listar, inspecionar, importar e atualizar
  workflows sem depender de copiar tokens pelo chat.
- Próximo passo: desenhar o primeiro workflow Evolution → normalização/dedupe →
  estado de conversa → menu inicial, mantendo a integração Typebot ativa até a
  homologação do novo fluxo e evitando dois consumidores simultâneos.
- Data/hora: 2026-08-10 14:20 BRT — n8n recuperado após HTTP 502 transitório
- O usuário encontrou 502 logo após a publicação. Containers n8n/PostgreSQL
  permaneceram ativos, mas a origem local recusou conexão brevemente durante a
  recriação do n8n e, no mesmo intervalo, conexões QUIC do cloudflared foram
  renegociadas. Não houve perda de banco ou volume.
- Após estabilização, `127.0.0.1:5678/healthz` e
  `https://n8n.velhaturbo.cloud/healthz` responderam HTTP 200 com `status=ok`;
  a raiz pública também respondeu HTTP 200. O cadastro inicial pode prosseguir.
- Data/hora: 2026-08-10 14:17 BRT — n8n Community instalado
- Foi criada uma stack isolada em `/root/n8n` com n8n `2.33.7`, PostgreSQL 16,
  volumes persistentes, segredos locais em `.env` com modo `0600`, timezone BRT,
  retenção/pruning de execuções e bind exclusivo em `127.0.0.1:5678`.
- O painel está acessível em `https://n8n.velhaturbo.cloud`. A rota foi incluída
  na configuração remota do túnel Cloudflare ativo e o CNAME foi corrigido para
  o UUID real `...b2ec...`; o arquivo local antigo continha `...b5ec...`.
  Horizons continuou em HTTP 200 e Typebot no redirecionamento 307 esperado.
- Saúde local do n8n respondeu `{"status":"ok"}`; n8n e PostgreSQL estão em
  execução e o banco está healthy. Nenhum workflow, webhook Evolution ou
  credencial de negócio foi criado ainda.
- Próximo passo obrigatório: operador abre o endereço HTTPS e cria o usuário
  proprietário. Depois, gerar uma API key do n8n e armazená-la em arquivo
  protegido na VPS para permitir colaboração por API sem expor o token no chat.
- Data/hora: 2026-08-10 14:04 BRT — duplicação removida e teste ativo reutilizado
- Homologação do usuário revelou dois defeitos: o choice fallback aparecia
  junto do menu com valores internos em inglês e a Union devolveu HTTP 400 ao
  tentar criar outro teste para o mesmo telefone ainda dentro da validade.
- Todos os interativos agora usam IDs numéricos apenas no transporte, mantendo
  os valores semânticos nas variáveis. Isso volta a acionar a supressão do
  fallback na Evolution e impede lista/menu + opções textuais duplicadas.
- Antes de chamar a Union, a API procura um teste concluído e ainda válido para
  o telefone. Quando existe, recupera com segurança suas credenciais cifradas,
  tutorial e checkout, sem criar um segundo acesso. O evento que falhou ficou
  registrado como `Union respondeu 400`; nenhum teste foi criado nessa falha.
- API reconstruída e saudável; Typebot republicado sem warnings. Validação:
  18 testes, lint, `git diff --check`, 24 choices, zero divergência de IDs e
  zero interativo inválido. Nenhuma mensagem foi enviada nesta correção.
- Avaliação de arquitetura: Typebot sobre Evolution/Baileys exige um adaptador
  frágil entre dois motores de sessão. Para uma migração, a opção preferida é
  Botpress Studio + integração oficial WhatsApp Business/Meta; Blip Builder é
  alternativa brasileira mais gerenciada. n8n deve ficar como orquestrador de
  APIs/pagamento, não como editor principal da conversa.
- Data/hora: 2026-08-10 13:18 BRT — jornada teste → checkout publicada
- O Typebot não exibe mais **Preparar meu acesso**. Depois de aparelho, plano,
  telas e conteúdo, cria o teste e entrega tutorial, aplicativo, provedor,
  usuário e senha juntos. LG agora recebe LG Content Store, lista de apps e
  provedor `00776`; Samsung preserva as três fotos e recebe a mesma lista.
- Depois do teste, as opções são **Fechar plano**, **Falar com atendente** e
  **Voltar ao menu**. Fechar plano vincula o pedido ao evento do teste e envia
  o `payment_url` retornado pelo Union, em vez de abrir handoff de Vendas.
- Um lembrete único é agendado para 60 minutos após o teste. Ele não é enviado
  se o pedido já estiver pago, concluído ou cancelado. O cliente pode tocar nas
  opções existentes ou digitar `MENU` para voltar ao início.
- O callback PaggPay passou a interpretar valores em centavos, suporta a
  assinatura HMAC oficial e sempre reconfirma a transação pela API. Checkouts
  do teste são associados somente quando telefone + valor identificam um único
  pedido aguardando pagamento nas últimas 48h; ambiguidades não confirmam.
  Pagamento confirmado marca pedido/lead e envia confirmação via Evolution.
- A migração `20260810000000_trial_checkout_followup.sql` foi aplicada. API e
  worker foram reconstruídos e estão saudáveis. Typebot publicado sem warnings:
  36 grupos, 112 blocos, 99 arestas, 48 variáveis e 24 choices, sem divergência
  de IDs. Sete testes, lint e validação estrutural passaram.
- PaggPay está em produção, mas `PAGGPAY_WEBHOOK_TOKEN` ainda não contém o
  `whsec_...` oficial. O callback continua seguro contra confirmação falsa por
  consultar a transação na API, porém o segredo de assinatura deve ser salvo na
  configuração e o endpoint correspondente conferido no painel PaggPay.
- Nenhum teste, checkout, pagamento ou mensagem WhatsApp real foi disparado
  nesta rodada. Próximo passo: nova sessão WhatsApp e homologação visual de LG,
  entrega do teste e abertura do checkout; pagamento real exige confirmação
  operacional específica antes do reteste.
- Data/hora: 2026-08-10 10:42 BRT — IDs dos menus conferidos contra todos os choices
- O reteste real avançou até **quantidade de telas**, mas o clique retornou
  `Invalid message`. Causa: a lista enviava IDs `1 tela`, `2 telas`, `3 telas`
  e `Mais de 3 telas`, enquanto o choice aceitava `1`, `2`, `3` e `4`.
- A correção foi aplicada e republicada sem warnings. A mesma auditoria revelou
  e corrigiu preventivamente o padrão em **tipo de conteúdo**, **Suporte** e
  **Financeiro**, antes que o usuário chegasse a essas etapas.
- O gerador agora compara, em ordem, cada `id`/`rowId` emitido pelo interativo
  com o `content` aceito pelo choice seguinte. A geração falha antes de publicar
  se houver qualquer divergência. Modelo publicado: 25 choices e zero
  divergências; telas confirmadas como `1`, `2`, `3`, `4` dos dois lados.
- Sintaxe, lint e `git diff --check` passaram. Nenhuma mensagem WhatsApp ou
  criação de acesso foi disparada pelo agente; é necessário iniciar uma sessão
  nova antes do próximo reteste.
- Data/hora: 2026-08-10 10:34 BRT — fluxo interativo completo publicado (versão 6.1)
- O Typebot publicado agora contém 36 grupos, 116 blocos, 100 arestas e 44
  variáveis. As 25 escolhas estão pareadas com 18 menus de botões (até três
  opções) ou 7 listas (quatro a dez opções); não há opção numerada visível.
- Os 18 planos foram divididos em duas listas de nove, com navegação entre as
  páginas. Assim, essa etapa não volta mais ao fallback `▶️ 1`, `▶️ 2` etc.
- Para Samsung, o fluxo envia em sequência as três imagens de controles do
  catálogo, pergunta **Primeiro**, **Segundo** ou **Terceiro controle** e segue
  para a preparação do acesso. Depois da criação efetiva do teste, envia uma
  orientação objetiva de instalação com aplicativo, provedor, login e senha
  reais da execução. Foram removidos os textos genéricos `[USUÁRIO]` e
  `[SENHA]` e o despejo integral do manual nessa etapa.
- Validação do rascunho e do modelo publicado: 25 choices, zero choices sem
  interativo, zero IDs duplicados, zero arestas sem destino, zero menus fora
  dos limites, três imagens Samsung, zero placeholders de credenciais e zero
  blocos interativos numerados. Publicação retornou HTTP 200, sem warnings.
- O GBrain foi retirado do escopo por decisão do operador, pois não há serviço
  de embeddings disponível. Não tentar sincronizá-lo em próximas rodadas; este
  `PROJECT_STATUS.md` permanece como fonte de verdade do projeto.
- Nenhuma mensagem WhatsApp, teste ou acesso real foi criado pelo agente. A
  homologação visual deve começar em uma sessão nova (`#sair`) e percorrer
  menu inicial, dispositivo, Samsung e as duas páginas de planos.
- Data/hora: 2026-08-10 09:48 BRT — incidente documentado e checklist endurecido
- O diagnóstico, as tentativas intermediárias, a causa raiz, a correção
  definitiva, a publicação, as validações e a homologação pendente dos menus
  Evolution↔Typebot foram consolidados em
  `docs/evolution-typebot-interactive-incident-2026-08-10.md`.
- Regra operacional adicionada: não declarar correção de imagem derivada apenas
  por inspecionar um artefato de build. É obrigatório confirmar o entrypoint,
  o arquivo resolvido pelo runtime, o conteúdo dentro do container ativo e
  separar validação técnica de homologação visual no WhatsApp.
- A tentativa histórica de sincronização com o GBrain falhou por falta de cota
  de embeddings. A partir da revisão acima, essa integração está explicitamente
  descontinuada e não deve ser repetida.
- Data/hora: 2026-08-10 09:47 BRT — correção aplicada ao bundle ativo da Evolution
- O reteste do usuário ainda exibiu `Invalid message` ao clicar na lista e os
  fallbacks `▶️ 1` a `▶️ 8`. Os logs confirmaram ambos no mesmo fluxo. A causa
  da persistência foi operacional: a imagem anterior alterava somente
  `/evolution/dist/main.mjs`, enquanto `npm run start:prod` resolve e executa
  `/evolution/dist/main.js`.
- Foi criado o patch reproduzível em `ops/evolution/`, agora aplicado aos dois
  bundles. A extração prioriza `selectedRowId` antes do título da linha, e o
  fallback é suprimido para choices numéricos de até dez itens, preservando os
  choices textuais e o catálogo de 18 planos.
- A imagem anterior foi preservada com a tag de backup
  `horizons/evolution-api:2.4.0-rc2-buttons-pre-mainjs-fix`; a tag ativa foi
  reconstruída e somente `evolution_api` foi recriado. O bundle ativo contém
  as duas correções, API Horizons está saudável e `Meu numero` e
  `Horizons Typebot` voltaram a `open`. Nenhuma mensagem externa foi enviada;
  falta o usuário encerrar/reabrir a conversa e homologar visualmente um menu
  curto e a lista de dispositivos.
- Data/hora: 2026-08-10 09:35 BRT — clique de lista e fallback corrigidos
- Homologação real mostrou a lista de dispositivos, mas o clique em Smart TV
  chegava ao Typebot como título `1 - Smart TV`; o choice esperava `1` e
  respondia `Invalid message`. A Evolution 2.4 expunha também o
  `selectedRowId`, porém `getConversationMessage` priorizava o título por ordem
  de propriedades.
- A imagem derivada agora prioriza `responseRowId` antes de
  `listResponseMessage`. O fallback `▶️` também foi suprimido para inputs com
  quatro a dez itens, cobrindo respostas em que o bloco `[list]` e o choice
  chegam em lotes separados. O catálogo com 18 planos mantém fallback por não
  caber numa lista única.
- Imagem reconstruída e implantada; licença ativa, `Meu numero` e `Horizons
  Typebot` em `open`, e verificações internas confirmaram as duas alterações no
  bundle. Nenhuma mensagem externa foi enviada; falta reteste visual do clique.
- Data/hora: 2026-08-10 06:30 BRT — MiniMax M2.7 no atendimento em texto livre
- Foi adicionado `server/minimaxSupport.js` e o endpoint protegido
  `POST /typebot/ai/interpret`. A IA retorna somente intenção, rota, aparelho,
  fabricante, confiança e resposta curta em schema estrito; não possui
  ferramentas para criar teste, renovar, cobrar ou gerar Pix. Uma saída com
  ação/rota inventada é rejeitada.
- O submenu Atendimento agora oferece `Escrever o que preciso`. O Typebot envia
  o texto ao classificador e encaminha apenas para location, renew, access,
  support, finance ou human. Chamada real controlada ao `MiniMax-M2.7`
  classificou corretamente um pedido de teste em Smart TV Samsung; não houve
  mensagem WhatsApp nem efeito externo.
- O gatilho da integração `Horizons Typebot` foi alterado de palavra-chave exata
  para `triggerType=all`; qualquer mensagem recebida inicia o fluxo. `#sair`,
  `listeningFromMe=false` e `stopBotFromMe=true` foram preservados. Fluxo
  republicado com 28 grupos, 94 blocos, 83 arestas e 43 variáveis. API
  reconstruída; 17 testes, sintaxe, lint e `git diff --check` passaram.
- A chave MiniMax pertence somente ao `.env` protegido e não foi copiada para
  código ou memória operacional. Como foi enviada em texto no chat, recomenda-se
  rotacioná-la após a homologação.
- Data/hora: 2026-08-10 03:25 BRT — listas clicáveis para menus longos
- Menus com até três opções continuam como reply buttons; menus de quatro a
  dez opções agora usam `[list]` com linhas clicáveis. Dispositivos voltaram a
  uma única seleção com oito itens e marcas de Smart TV a uma lista com sete,
  removendo a paginação. O catálogo de 18 planos permanece numerado por exceder
  o limite de dez linhas de uma lista WhatsApp.
- A imagem derivada da Evolution foi reconstruída para também suprimir o choice
  numérico quando a resposta já contém `[list]`. Fluxo republicado com 27
  grupos, 89 blocos, 12 menus de botões e 5 listas; máximos validados em três
  botões e oito linhas. Licença ativa, duas instâncias `open`, sintaxe/lint e
  `git diff --check` aprovados. Nenhuma mensagem externa foi enviada.
- Data/hora: 2026-08-10 03:10 BRT — botões sem fallback duplicado e dispositivos paginados
- A Evolution 2.4 enviava corretamente o bloco `[buttons]`, mas o adaptador
  Typebot ainda enviava depois o `choice input` como `▶️ 1`, `▶️ 2` etc. Foi
  criada a imagem derivada persistente
  `horizons/evolution-api:2.4.0-rc2-buttons`, que suprime somente esse fallback
  quando a mesma resposta já contém botões, mantendo `awaitUser` e o clique.
- Dispositivos foram divididos em quatro páginas de até três botões e marcas de
  Smart TV em três páginas; Android TV, TV Box e celular já tinham até três.
  Fluxo republicado com 32 grupos, 99 blocos, 19 menus `[buttons]`, zero menu
  acima de três replies. Licença segue ativa, ambas as instâncias estão `open`,
  sintaxe/lint/`git diff --check` passaram. Falta reteste visual; nenhuma
  mensagem externa foi enviada pelo agente.
- Data/hora: 2026-08-10 02:50 BRT — licença ativa e botões republicados
- O operador concluiu a ativação da Evolution 2.4; `/license/status` retornou
  `active`, e as instâncias `Meu numero` e `Horizons Typebot` permanecem `open`.
- Os marcadores `[buttons]` foram restaurados para menus de até três opções e o
  Typebot foi republicado. Validação: 12 blocos de botões, zero listas, máximo
  de três replies, sintaxe, lint e `git diff --check` aprovados. Nenhuma
  mensagem externa foi enviada; falta homologação visual no WhatsApp.
- Data/hora: 2026-08-10 02:30 BRT — Evolution atualizada para 2.4.0-rc2
- A imagem `evoapicloud/evolution-api:latest` continuava sendo 2.3.7; a tag
  final `v2.4.0` não existe no Docker Hub. Foi instalada e fixada no Compose a
  release pública mais recente, `evoapicloud/evolution-api:2.4.0-rc2` (runtime
  reporta 2.4.0), que contém a correção oficial de mensagens interativas.
- Antes da migração, banco PostgreSQL em formato custom e Compose/.env foram
  salvos em `/root/evolution-backups/2026-08-10-pre-upgrade/`. As duas novas
  migrações Prisma foram aplicadas com sucesso; `Meu numero` e `Horizons
  Typebot` reconectaram em estado `open`, sem novo QR.
- A 2.4 exige licenciamento. `/license/status` está `inactive`, portanto os
  endpoints de negócio ficam em HTTP 503 até o operador concluir o registro em
  `https://evolution.velhaturbo.cloud/manager/login`, cuja disponibilidade foi
  confirmada. Não houve envio de mensagem de teste durante a atualização.
- Data/hora: 2026-08-10 02:10 BRT — reply buttons incompatíveis no cliente QR
- O teste do menu de três opções confirmou que a Evolution enviou o interativo
  como `viewOnceMessage` e recebeu confirmação de entrega, mas o cliente
  WhatsApp não renderizou a mensagem. O Typebot então exibiu somente seu choice
  fallback (`▶️ 1`, `▶️ 2`, `▶️ 3`). Assim, reduzir a três opções não resolve:
  reply buttons não são confiáveis nesta conexão Evolution/Baileys via QR.
- Os marcadores `[buttons]` foram removidos para não gerar mensagens invisíveis.
  Todos os menus agora enviam primeiro os nomes completos numerados e depois o
  input numérico do Typebot. Versão aplicada, validada com zero `[buttons]` e
  zero `[list]`, publicada, e lint/sintaxe/`git diff --check` passaram. Botões
  oficiais ficam condicionados à integração WhatsApp Business Platform/Meta.
- Data/hora: 2026-08-10 02:00 BRT — menus de botões limitados a três opções
- O reteste real retornou `Invalid message. Please, try again.` antes do menu
  numérico porque o primeiro menu tentava enviar sete reply buttons. O native
  flow usado pela Evolution/WhatsApp aceita, na prática, no máximo três botões
  desse tipo por mensagem.
- O menu inicial foi reorganizado em três categorias clicáveis: `Teste ou
  assinatura`, `Já sou cliente` e `Atendimento`. Cada categoria abre outro menu
  com no máximo três botões; menus maiores continuam numerados para não gerar
  mensagem inválida.
- Alteração aplicada e publicada. Rascunho conferido com 12 blocos `[buttons]`,
  zero `[list]` e máximo de três replies por bloco. `node --check`, lint e
  `git diff --check` passaram. Nenhuma mensagem WhatsApp ou teste externo foi
  disparado pelo agente; falta reteste visual após reiniciar a conversa.
- Data/hora: 2026-08-10 01:40 BRT — fallback de listas para botões native flow
- O reteste real exibiu somente números. Logs confirmaram que a Evolution
  reconheceu `[list]` e tentou `listMessage`, mas Baileys falhou antes do envio
  com `TypeError: this.isZero is not a function` em `ListMessage.toObject`; em
  seguida o choice numérico foi enviado normalmente. O defeito não estava no
  Typebot nem na sessão do usuário.
- O código compilado confirmou que `[buttons]` usa `buttonMessage` com
  `nativeFlowMessage`, caminho diferente do `ListMessage` legado. O gerador foi
  alterado para usar botões em menus de até 10 opções e nunca emitir `[list]`.
  O catálogo de 18 planos permanece numerado por ser extenso; paginação fica
  como melhoria posterior.
- Rascunho validado com 14 blocos `[buttons]` e zero `[list]`; schema, sintaxe,
  lint e `git diff --check` passaram, e o fluxo foi republicado sem warnings.
  Nenhuma mensagem ou teste real foi disparado pelo agente. Falta o reteste
  visual após `#sair` para confirmar suporte do cliente WhatsApp ao native flow.
- Data/hora: 2026-08-10 01:25 BRT — menus interativos Evolution↔Typebot
- Por solicitação do usuário, foi inspecionado o adaptador Typebot compilado
  da Evolution API 2.3.7. Ele possui suporte nativo a marcações `[buttons]` e
  `[list]`: chama `buttonMessage`/`listMessage` e devolve o ID selecionado ao
  mesmo input da sessão Typebot. Não foi necessário criar ponte paralela,
  duplicar sessão ou alterar a imagem/container Evolution.
- O gerador do fluxo agora transforma menus com até três opções em botões de
  resposta e menus maiores em lista interativa. Os IDs são os mesmos números
  aceitos pelos blocos `choice`, portanto a linha numérica enviada pelo Typebot
  continua como fallback para clientes que não renderizem interativos.
- O rascunho foi validado com 15 blocos interativos (8 de botões e 7 de lista),
  schema Typebot, lint e `git diff --check` passaram, e o bot foi republicado
  sem warnings. Nenhuma mensagem, teste externo ou cobrança foi disparada. A
  renderização real ainda precisa ser homologada visualmente: encerrar a sessão
  atual com `#sair`, reenviar `HORIZONS TESTE 2026` e verificar o primeiro menu.
- Data/hora: 2026-08-10 01:05 BRT — fluxo WhatsApp numerado, mídia e manuais seguros
- A partir do retorno do usuário, foi confirmado que a jornada real exigia o
  texto exato das opções, mostrava URL de imagem, não entregou credenciais e
  recomendou orientação incompatível. Consulta sanitizada confirmou que nenhum
  novo `union_direct_test_event` foi criado: o último teste real registrado
  continua sendo de 2026-08-01. Portanto, esta jornada não alcançou uma criação
  externa; nenhum acesso novo foi gerado durante o diagnóstico/correção.
- Os principais menus agora exibem lista numerada e aceitam respostas de um
  dígito (`1`, `2`, etc.), solução compatível com Evolution↔Typebot mesmo sem
  botões interativos nativos. Aparelhos foram separados em Smart TV, Android
  TV/Fire TV, TV Box e celular; somente marcas/modelos com manual cadastrado
  seguem automaticamente, e combinações desconhecidas vão ao humano.
- O endpoint de recomendação não escolhe mais um manual genérico quando foi
  informada uma marca específica incompatível. Retorna `found=false` com HTTP
  `200` para o fluxo encaminhar com segurança. Validações controladas:
  Samsung retornou manual de alta confiança com texto e mídia; Philips foi
  recusada e marcada para humano; Android TV genérica retornou manual com
  texto e mídia.
- O manual agora usa bloco `image` com `{{guide_media_url}}`, para a imagem ser
  entregue como mídia na conversa em vez de aparecer como link no texto. A
  criação de teste ganhou condição que exige usuário e senha preenchidos antes
  de afirmar sucesso; as credenciais são enviadas em campos visualmente
  separados. Falta homologar a renderização dessa imagem e uma única criação
  real ponta a ponta com nova confirmação explícita.
- O Typebot ficou com 24 grupos, 83 blocos, 69 arestas e 37 variáveis e foi
  republicado sem warnings. API reconstruída e saudável; schema Typebot, lint,
  15 testes, sintaxe e `git diff --check` passaram. A primeira tentativa de
  rebuild terminou antes de subir o container, deixando a API brevemente fora;
  ela foi restaurada imediatamente e respondeu `{ "status": "ok" }`.
- Data/hora: 2026-08-10 00:25 BRT — primeira jornada WhatsApp e correção de identidade
- O usuário enviou o gatilho real e recebeu as duas primeiras mensagens, o que
  homologou Evolution→Typebot→WhatsApp. Em seguida o bot pediu telefone como
  se estivesse no navegador. A sessão sanitizada confirmou `remoteJid` e
  `pushName` presentes nos parâmetros da Evolution; nenhum valor pessoal foi
  impresso ou persistido nesta memória.
- Causa: os blocos iniciais sobrescreviam os valores comuns injetados pela
  Evolution com os valores de sistema `Phone number` e `Contact name`, que só
  pertencem ao canal WhatsApp oficial do Typebot. O fluxo agora copia
  `remoteJid` para `phone` por um bloco `Custom` e preserva `pushName`; quando
  `remoteJid` não existe, o preview web continua caindo no pedido manual.
- O rascunho corrigido ficou com 21 grupos, 73 blocos, 67 arestas e 36
  variáveis e foi republicado sem warnings. Nenhum teste CineHub, Pix, cobrança
  ou mensagem ativa foi criado/enviado durante a correção. Para retestar, o
  usuário deve encerrar a sessão antiga com `#sair` e reenviar
  `HORIZONS TESTE 2026`; a nova jornada deve pular telefone e nome e mostrar o
  menu principal.
- Data/hora: 2026-08-09 23:55 BRT — Typebot publicado e ligado à Evolution
- Com confirmação explícita, a Evolution recebeu
  `TYPEBOT_ENABLED=true` e `TYPEBOT_API_VERSION=latest`; `evolution_api` foi
  recriada. O Compose também recriou seu Redis dependente. As instâncias `Meu
  numero` e `Horizons Typebot` voltaram e permaneceram `open`, sem novo QR.
- O rascunho `Atendimento IPTV — Horizons` foi publicado pela API local como
  `horizons-atendimento`, sem warnings. O viewer público e seu endpoint de
  `startChat` responderam `200`; a sondagem usou entrada vazia e não enviou
  mensagem WhatsApp nem criou teste/cobrança externa.
- Foi cadastrada uma única integração Typebot habilitada na instância
  `Horizons Typebot`: gatilho `keyword` + `equals` com o valor exato
  `HORIZONS TESTE 2026`, encerramento `#sair`, `listeningFromMe=false`,
  `stopBotFromMe=true` e `keepOpen=false`. Nenhuma mensagem foi enviada pelo
  agente. Próximo passo: o usuário envia a frase-gatilho de outro WhatsApp para
  o número conectado e confirma o recebimento da primeira resposta.
- Durante a publicação foi diagnosticado erro Cloudflare `1033`: o serviço
  havia sido movido às 23:07 para o túnel saudável
  `velhaturbo-tunnel`, mas DNS/ingressos ainda apontavam ao túnel antigo. Com
  autorização, `cloudflared` foi reiniciado e os dez hosts já existentes na
  configuração local foram migrados, preservando seus serviços. Validação:
  `iptv`/`bot`/`evolution` responderam `200`, `typebot` e `omni` responderam
  redirecionamento esperado, e `hermes` voltou a alcançar a origem (`404` na
  raiz, não mais `530`). O token DNS enviado pelo usuário no chat não foi
  usado, impresso nem persistido; foi recomendada sua rotação.
- Data/hora: 2026-08-09 22:35 BRT — pré-homologação Evolution↔Typebot
- A instância dedicada `Horizons Typebot` foi consultada pela API protegida e
  está `open`; a instância anterior `Meu numero` também permanece `open`.
  Nenhuma mensagem foi enviada e nenhuma sessão foi alterada.
- API, frontend, worker, Redis, builder e viewer Typebot estão ativos. O fluxo
  `Atendimento IPTV — Horizons` continua em rascunho, sem `publicId` e sem
  registro em `PublicTypebot`.
- A consulta somente leitura `GET /typebot/find/Horizons Typebot` respondeu
  `400` com `Typebot is disabled`. O container Evolution não recebeu as flags
  `TYPEBOT_ENABLED`/`TYPEBOT_API_VERSION`; a configuração oficial da versão
  confirma que a integração nasce desativada. Próximo passo, com confirmação
  do impacto: adicionar `TYPEBOT_ENABLED=true` e `TYPEBOT_API_VERSION=latest`
  ao ambiente protegido da Evolution e recriar somente `evolution_api`, o que
  causa uma breve indisponibilidade do WhatsApp. Depois validar as duas
  instâncias, publicar o rascunho e cadastrar um gatilho exclusivo de teste
  antes de qualquer jornada real.
- Data/hora: 2026-08-09 22:25 BRT — instância Evolution para Typebot criada
- Com autorização explícita, foi criada pela API protegida a instância
  separada `Horizons Typebot`, usando integração WhatsApp Baileys e QR Code. A
  API respondeu `201`; o estado inicial foi `connecting`. O QR foi entregue
  somente ao usuário para leitura no WhatsApp Business e não foi gravado no
  repositório. O número e o pairing code não foram copiados para esta memória.
- A instância anterior `Meu numero` permaneceu `open`; nenhuma sessão existente
  foi desconectada e nenhuma mensagem foi enviada. Próximo passo: depois que o
  usuário escanear o QR, validar que `Horizons Typebot` mudou para `open` antes
  de configurar webhook/Typebot ou realizar qualquer mensagem de teste.
- Data/hora: 2026-08-09 22:19 BRT — diagnóstico do Evolution Manager
- O relato de painel vazio foi reproduzido: na versão Evolution API `2.3.7`,
  `/manager/` carregava somente o contêiner React quando não havia sessão e
  não redirecionava visualmente. A rota direta `/manager/login` renderizou o
  formulário completo, já com a URL HTTPS pública preenchida. HTML, JavaScript
  e CSS responderam HTTP `200`; túnel e origem estão funcionais.
- Não foi recomendado acesso por IP/porta `8080`, pois ele usa HTTP e poderia
  expor a chave global. Nenhuma chave foi exibida, nenhuma instância foi criada
  e nenhuma sessão foi desconectada durante o diagnóstico. O acesso correto é
  `https://evolution.velhaturbo.cloud/manager/login`. Se o usuário não tiver a
  chave global, a alternativa segura é o agente criar uma instância dedicada
  pela API protegida e entregar somente o QR Code para leitura no celular.
- Data/hora: 2026-08-09 22:13 BRT — painel Evolution publicado
- Com autorização explícita, foi adicionado ao túnel Cloudflare remoto o
  ingresso `evolution.velhaturbo.cloud` para a Evolution local em
  `127.0.0.1:8080`, preservando as rotas existentes. Foi criado um CNAME
  proxied para o túnel ativo. `https://evolution.velhaturbo.cloud/manager/`
  respondeu HTTP `200` via Cloudflare.
- O número comercial informado será usado temporariamente na homologação do
  Typebot e não foi copiado para esta memória. A instância existente `Meu
  numero` continuava `open` antes da publicação; nenhuma sessão foi
  desconectada, substituída ou pareada pelo agente. O usuário fará o QR Code
  diretamente no Manager. Depois do pareamento, validar a nova instância antes
  de configurar Typebot/webhook ou enviar qualquer mensagem.
- Data/hora: 2026-08-09 — preview Typebot automatizado e corrigido
- O motor real de preview do Typebot foi exercitado pela API autenticada, sem
  publicar o bot, conectar WhatsApp, criar acesso externo ou gerar cobrança.
  A jornada de teste passou por telefone, nome, menu, aparelho, marca, manual,
  telas, 18 planos e perfil de conteúdo, parando no botão final **Criar meu
  teste**. Todos os sete grupos de dispositivo retornaram manual com título e
  mídia; os contratos inválidos das sete rotas protegidas responderam `400`.
- O preview web falhava na entrada porque os valores de sistema `Phone number`
  e `Contact name` existem somente no WhatsApp. O rascunho ganhou duas etapas
  condicionais: solicita telefone e nome apenas quando o transporte não os
  fornecer. No WhatsApp futuro, os dados injetados continuam pulando essas
  perguntas.
- Foi corrigido o mapeamento global das respostas HTTP: Typebot 3.17.1 exige
  expressões `data.campo`; os caminhos antigos sem `data.` executavam o webhook,
  mas deixavam protocolo, manual, credenciais e Pix vazios. Reteste confirmou
  protocolo UUID preenchido e manual Samsung com título, instruções e mídia.
- A renovação agora verifica `customer_match=found` antes de exibir **Gerar
  Pix**. Um contato sintético sem cliente foi encaminhado ao atendimento e não
  viu a opção de cobrança. O rascunho permanece não publicado, agora com 21
  grupos, 74 blocos, 67 arestas, 36 variáveis e 18 planos. Os testes criaram
  somente registros internos claramente identificados como `TESTE PREVIEW
  HORIZONS` e handoffs de auditoria; nenhum efeito externo/financeiro ocorreu.
- Próximo passo para homologar ponta a ponta: com confirmação explícita,
  executar uma única criação real KYROS de 6 horas pelo botão final do
  preview, usando nome e telefone de teste definidos pelo usuário. Depois
  validar retorno das credenciais. Publicação e Evolution continuam bloqueados.
- Data/hora: 2026-08-08 16:22 BRT — retomada operacional
- O projeto foi retomado preservando o worktree existente, que continua com 60
  entradas modificadas/não rastreadas e apenas o commit inicial no histórico.
  Nenhuma alteração anterior foi descartada ou sobrescrita.
- `frontend`, `api`, `worker` e `redis` estão ativos; Redis está saudável, a
  API respondeu `{ "status": "ok" }` em `127.0.0.1:8081/health`, o frontend
  respondeu HTTP `200` em `127.0.0.1:3100` e o builder Typebot respondeu `307`
  para `/signin` em `127.0.0.1:3200`. Nenhum serviço foi reiniciado.
- O ponto de retomada permanece revisar no preview o rascunho **Atendimento
  IPTV — Horizons**, verificando alternativas, clareza e tamanho das mensagens e
  corrigindo dados externos variáveis dos manuais. Publicar o bot, conectar o
  Evolution/WhatsApp, criar testes externos ou efetuar pagamentos continuam
  dependendo de autorização explícita.
- Data/hora: 2026-08-05 — manuais vinculados ao rascunho Typebot
- Os 15 procedimentos de `/root/iptv/MANUAL.md` foram importados de forma
  idempotente em `installation_guides` para o proprietário configurado. As 18
  imagens e o PDF-fonte foram publicados em `public/manuals/iptv/`; o manual
  Markdown foi preservado em `docs/manual-iptv-fonte.md`. Nenhuma credencial
  real foi encontrada ou gravada.
- O endpoint `POST /typebot/guides/recommend` agora valida categorias conhecidas
  e devolve também título, instruções e URL da mídia principal em campos simples
  para mapeamento no Typebot. Uma consulta autenticada para Samsung retornou o
  manual Tizen com confiança alta e mídia válida.
- O rascunho **Atendimento IPTV — Horizons** foi atualizado para perguntar entre
  Smart TV, Android/Fire TV, TV Box, celular/tablet, computador, console e
  Chromecast; ampliou as marcas e passou a consultar/exibir o manual no grupo
  de aplicativo. Validação final: schema 6.1, 19 grupos, 67 blocos, 59 arestas,
  36 variáveis, 19 blocos HTTP e zero arestas quebradas. `publicId` ausente,
  credencial WhatsApp ausente e WhatsApp desativado: o bot não foi publicado.
- Lint, build, seis suítes de testes, sintaxe e `git diff --check` passaram. API
  e frontend foram reconstruídos; API saudável, recomendação funcional e PDF
  respondendo HTTP `200`. Próximo passo: revisar no preview as alternativas e
  o tamanho/clareza de cada mensagem; corrigir informações externas variáveis
  antes de autorizar publicação ou conexão ao WhatsApp.
- Data/hora: 2026-08-05 — material de manuais recebido em `/root/iptv`
- Recebidos `MANUAL.md`, `MANUAL.pdf` com 24 páginas e 18 imagens JPEG. O
  Markdown organiza 15 alternativas: TVs antigas/DNS, Samsung Tizen, LG webOS,
  Roku, Panasonic, Toshiba/Hisense Vidaa, Fire TV, Android/Google TV, TV Box,
  Android, iPhone, computadores, consoles e Chromecast. Todas as imagens foram
  abertas e revisadas visualmente; não foram encontradas credenciais reais.
- O material ainda não foi publicado nem inserido em `installation_guides`.
  Antes disso, revisar informações externas que podem variar ou ficar
  desatualizadas — DNS/IPs, modo desenvolvedor/sideload, códigos Downloader,
  disponibilidade de apps e links de terceiros. Preservar o PDF como fonte e
  usar o Markdown como base estruturada para os cadastros.
- A tela atual aceita URLs de mídia, mas não faz upload das fotos. A próxima
  etapa técnica é armazenar os arquivos em caminho controlado, vincular cada
  foto ao manual correspondente e importar os procedimentos como rascunhos
  revisáveis antes de disponibilizá-los ao atendimento/Typebot.
- Data/hora: 2026-08-05 10:04 BRT — retomada e verificação operacional
- Projeto retomado a partir deste arquivo e da página
  `projects/horizons/status` no GBrain. O arquivo local permanece mais recente:
  o GBrain ainda refletia principalmente o estado de 2026-08-03 antes desta
  sincronização.
- `frontend`, `api`, `worker` e `redis` estão ativos; Redis está saudável, a
  API respondeu `{ "status": "ok" }` em `127.0.0.1:8081/health` e o frontend
  respondeu HTTP `200` em `127.0.0.1:3100`. Nenhum serviço foi reiniciado.
- Próximo passo permanece validar o assistente administrativo com uma sessão
  Supabase real do proprietário, ainda somente em leitura. Antes de qualquer
  escrita ou ligação ao WhatsApp, faltam definir número administrativo,
  allowlist, PIN/segundo fator e executar testes autenticados controlados.
- Data/hora: 2026-08-05 — assistente administrativo privado em modo leitura
- Aplicadas as migrations `20260805000000_admin_assistant_and_server_history.sql`
  e `20260805010000_admin_confirmations.sql`. O Supabase agora possui catálogo
  CineHub por proprietário, histórico imutável de migração, auditoria do
  assistente, vínculo de acesso ao servidor e confirmações temporárias.
- Implementadas ferramentas reais somente de leitura: localizar cliente, resumo
  sanitizado, acessos/checkout, inadimplentes e métricas por período. Pagamentos
  são filtrados pelos IDs dos clientes do proprietário antes de qualquer soma.
- Publicados `GET /admin-assistant/status` e `POST /admin-assistant/query`, ambos
  exigindo sessão Supabase válida e correspondência ao proprietário configurado.
  Sem autenticação, ambos responderam `401` dentro do container. Toda consulta
  aceita passa por MiniMax, schema estrito, limiar de confiança e auditoria.
- Escritas e WhatsApp permanecem deliberadamente desligados por feature flags.
  A estrutura de confirmação está pronta, mas nenhuma ferramenta de escrita foi
  exposta. Faltam número administrativo, allowlist, PIN/segundo fator e testes
  autenticados reais. API reconstruída; 15 testes, lint e diff-check passaram.
- Data/hora: 2026-08-05 — leitura de comprovantes com MiniMax M3
- O extrator visual de comprovantes passou a usar MiniMax M3 para imagens JPEG,
  PNG e WebP. Ele envia a imagem somente ao backend, exige JSON estruturado e
  normaliza valor, data, pagador, recebedor, banco, end-to-end ID, agendamento e
  confiança. Respostas com tipos/confiança inválidos são rejeitadas.
- PDF não é enviado ao chat visual MiniMax; requer conversão segura para imagem
  ou o fallback visual anterior, se configurado. A extração continua sendo
  apenas triagem: não confirma pagamento nem renova cliente sem verificação
  financeira/revisão prevista no fluxo.
- Testes cobrem extração estruturada, rejeição de resposta inválida e bloqueio
  de PDF sem fallback. Testes, sintaxe, lint e `git diff --check` passaram. API
  reconstruída e saudável. Uma chamada real com PNG vazio, sem dados pessoais,
  confirmou o contrato multimodal do M3 e retornou os oito campos esperados com
  confiança zero. Nenhum comprovante real ou pagamento foi processado.
- Data/hora: 2026-08-05 — fundação MiniMax do assistente administrativo
- Implementado `server/minimaxAdmin.js`: interpreta comandos em intenções JSON
  estritamente validadas, usa M2.7 como principal e M3 somente quando a chamada
  principal falha ou retorna estrutura inválida. A resposta nunca executa banco
  ou painel diretamente.
- Primeira allowlist contém apenas leitura: ajuda, localizar cliente, resumo do
  cliente, checkout, inadimplentes e métricas. Ferramentas inventadas e pedidos
  de senha, escrita, renovação ou migração são rejeitados nesta fase. Ainda não
  existe rota pública, WhatsApp administrativo ou executor ligado à IA.
- Configuração MiniMax adicionada ao backend e ao exemplo de ambiente sem chave.
  Testes cobrem interpretação válida, fallback M2.7→M3 e rejeição de ferramenta
  de escrita. Testes, sintaxe, lint e `git diff --check` passaram.
- Data/hora: 2026-08-05 — MiniMax configurada e validada
- A chave MiniMax foi inserida pelo usuário no `.env` protegido do Horizons e
  validada sem exibição do segredo. Configuração: `MiniMax-M2.7` principal,
  `MiniMax-M3` fallback, 1.200 tokens máximos, temperatura 0,2, timeout 45 s e
  uma tentativa adicional. `GET /v1/models` respondeu `200` e confirmou ambos
  os modelos na conta, além da família M2.
- Uma chamada mínima sem dados de clientes foi realizada em cada modelo:
  M2.7 respondeu `200` com 66 tokens totais; M3 respondeu `200` com 204 tokens.
  Principal e fallback estão funcionais. Ainda não há ferramenta administrativa
  ligada aos modelos, nem execução autônoma ou acesso WhatsApp.
- Data/hora: 2026-08-04 — padrão KYROS e assistente administrativo solicitado
- Regra comercial definida: testes oferecidos automaticamente ao cliente usam
  KYROS por 6 horas; o cliente escolhe somente completo ou sem adultos. Os
  demais servidores/durações permanecem no catálogo protegido para escolha do
  atendente, contingência, diagnóstico e migração. O rascunho Typebot foi
  ajustado para enviar `server=kyros` e `duration_hours=6` como constantes.
- O Horizons deverá cadastrar servidores CineHub e manter histórico temporal do
  servidor de cada acesso. Trocar KYROS por outro servidor em uma manutenção
  não deve apagar o vínculo anterior; deve registrar origem, destino, motivo,
  operador, data e credenciais/metadados novos protegidos.
- Foi solicitado um assistente administrativo privado no WhatsApp para consultar
  clientes, credenciais, checkout, planos, recebimentos, inadimplência e métricas,
  além de alterar telefone/plano, renovar e migrar servidor. Uma API de IA poderá
  interpretar os pedidos, mas a execução será feita por ferramentas restritas,
  schemas determinísticos, autenticação reforçada, confirmação para escrita e
  auditoria. Blueprint em `docs/whatsapp-admin-assistant.md`.
- Esclarecimento: registrar uma renovação no Horizons não renova o cliente no
  painel CineHub. O assistente deve tratar controle interno, pagamento,
  solicitação ao painel e confirmação do painel como estados/operações
  diferentes. Mesmo a alteração interna exige confirmação e auditoria porque
  afeta vencimentos, cobranças, inadimplência e relatórios; operação externa
  exige confirmação reforçada e verificação do resultado.
- Limite confirmado pelo usuário: o Horizons não terá acesso à renovação no
  CineHub; ela ocorre entre checkout, pagamento e painel. O Horizons observará
  a PaggPay e poderá registrar `payment_confirmed` + `renewal_expected`, mas não
  `panel_renewal_confirmed` sem evidência externa. Inferir meses somente com
  correlação inequívoca de transação, checkout, cliente, plano e tabela de
  preços; valor isolado não é prova suficiente. Ambiguidades e reclamações de
  não renovação devem abrir revisão/manutenção manual sem nova cobrança.
- Data/hora: 2026-08-04 — catálogo CineHub multisservidor preparado
- Foram recebidas e cadastradas, somente na configuração protegida, 24 URLs de
  teste: KYROS, VORNAK, KRONOS, ZEUS, FENIX e P2P BINSTREAM, cada servidor com
  6h/12h e completo/sem adultos. Tokens/URLs completos não foram copiados para
  este handoff nem expostos no rascunho exportável.
- O adaptador seleciona a URL por `server`, `duration_hours` e `content`, valida
  host/caminho, normaliza o telefone e acrescenta `Content-Type=application/json`
  e `senderPhone=<telefone>`. O rascunho Typebot ganhou escolhas de servidor,
  duração e perfil de conteúdo antes da confirmação, enviando `{{phone}}` pela
  ponte privada do Horizons.
- Catálogo validado com 24/24 combinações, sem ausências; testes unitários,
  sintaxe e `git diff --check` passaram. API reconstruída e saudável. Rascunho
  validado com 19 grupos, 70 blocos, 49 arestas, 35 variáveis, zero arestas
  quebradas e ainda não publicado/sem WhatsApp. Nenhum dos 24 endpoints foi
  disparado nesta etapa.
- Data/hora: 2026-08-04 — roadmap comercial e próximas entradas do usuário
- O usuário enviará os endpoints de teste dos diferentes servidores do painel.
  Para cada endpoint, preparar o mesmo contrato homologado de telefone do
  contato (`Content-Type=application/json` e `senderPhone=<phone normalizado>`),
  mantendo allowlist/configuração protegida e sem criar testes reais em lote.
- O usuário também preparará manuais de aplicativos e televisores e obterá um
  número WhatsApp definitivo. Depois: completar o Typebot em rascunho, conectar
  Evolution somente com autorização, executar testes controlados, validar e
  ajustar, e apenas então publicar.
- Fase posterior: aquisição de clientes por mídia paga, Instagram, Telegram,
  panfletagem e painel de LED. Elaborar estratégia apenas para oferta legal e
  licenciada, com consentimento/opt-in, identificação do remetente e opt-out;
  não automatizar spam, listas compradas ou mensagens em massa não solicitadas.
- O usuário confirmou esta ordem como o roadmap oficial: cadastrar e padronizar
  endpoints por servidor; homologar testes controlados; cadastrar manuais de
  TVs/aparelhos/apps; obter número comercial exclusivo; ligar Evolution com
  autorização; finalizar o Typebot em rascunho; testar a jornada WhatsApp de
  ponta a ponta; validar cadastro, teste, checkout, pagamento e entrega; ajustar;
  publicar; monitorar; e somente então ampliar aquisição.
- A estratégia de captação confirmada combina anúncios segmentados com entrada
  consentida no funil, remarketing, indicações rastreáveis, Instagram,
  comunidade voluntária no Telegram e panfletagem com QR/UTM, acompanhando
  custo por lead, teste, venda, CAC e retorno. WhatsApp deve ser usado com
  opt-in e opt-out, sem listas compradas ou disparos frios não solicitados.
- O painel de LED pretendido será **móvel/portátil**, carregado pelo usuário
  enquanto realiza panfletagem para chamar atenção. Projetar mais adiante com
  baixo peso, ergonomia, autonomia de bateria, brilho legível, ventilação,
  proteção climática, estabilidade elétrica, conteúdo curto e QR Code/UTM
  rastreável; verificar regras locais e autorização dos pontos de uso.
- Data/hora: 2026-08-04 — primeiro teste autorizado com `senderPhone`
- Com autorização explícita, foi criada uma única solicitação real no endpoint
  externo CineHub, usando o telefone informado pelo usuário (final `02020`) em
  `senderPhone` e no corpo JSON. O servidor respondeu HTTP `200` e retornou os
  sete campos esperados: usuário, senha, DNS, pacote, validade, mensagem e
  `payUrl`. Credenciais não foram impressas nem registradas neste handoff.
- O sucesso confirma a criação e o contrato da chamada, mas o payload de retorno
  não informa se `senderPhone` foi persistido no cadastro. O usuário conferiu o
  resultado e confirmou que funcionou; a passagem e persistência do telefone no
  cadastro CineHub ficam homologadas para esse teste controlado.
- Data/hora: 2026-08-04 — endpoint externo de teste CineHub com telefone
- Endpoint-base CineHub já identificado:
  `https://painelcinehub.top/api/chatbot/4vLbM8n1gG/JOALymdL4w`.
- Para o bloco HTTP do Typebot, testar a variante complementada com os
  parâmetros informados pelo usuário:
  `?Content-Type=application/json&senderPhone={{phone}}`.
  A URL completa pertence a outro servidor, não ao Horizons nem a esta VPS.
  `senderPhone` deve receber em runtime a variável `phone`, que o fluxo atual
  preenche com o telefone do contato. Não usar `$json.body.root.phone` nesse
  ponto.
- Implementado sem expor a URL tokenizada no rascunho: o bloco `trial-create`
  continua chamando a ponte privada do Horizons com `phone: "{{phone}}"`; o
  adaptador normaliza esse telefone e acrescenta `Content-Type=application/json`
  e `senderPhone=<telefone>` à chamada externa do CineHub. A configuração
  protegida passou a apontar para `painelcinehub.top`; a API foi reconstruída e
  a saúde respondeu `200`. Teste unitário e validação do rascunho passaram.
  Não houve chamada externa, criação de teste, publicação ou conexão WhatsApp.
- Antes da homologação, confirmar se esse painel realmente exige
  `Content-Type` na query; no HTTP convencional ele seria um cabeçalho. Manter
  a forma acima no primeiro teste por ser o contrato funcional informado.
- Data/hora: 2026-08-04 — ponto de parada combinado
- O usuário vai preparar em casa, hoje, o manual por TV/aparelho: marca e
  sistema/modelo quando possível, foto frontal do controle, aplicativo principal
  e alternativo, link/código de instalação, configuração, tipo de credencial
  utilizada e erros comuns. O material pode ser entregue uma marca por vez.
- O usuário espera obter amanhã os números de celular definitivos, especialmente
  Vendas; até recebê-los, manter os destinos provisórios atuais. Próxima retomada:
  cadastrar os manuais/imagens no Horizons, substituir o placeholder de apps no
  rascunho Typebot e revisar os telefones. Continuam pendentes de autorização
  explícita: conectar Evolution, publicar o bot, criar teste real e realizar
  pagamento controlado.
- Data/hora: 2026-08-04 — checkout permanente e consulta de acesso
- A migration `20260804020000_persistent_customer_access.sql` foi criada e
  aplicada. O retorno de novos testes Union/CineHub passa a conservar senha e
  mensagem completa cifradas por AES-256-GCM, além do usuário, DNS, pacote,
  validade e `payUrl`. O cadastro permanente do acesso ganhou DNS, checkout
  estável, credencial/mensagem cifradas e data da última entrega. O checkout é
  único por proprietário e poderá ser reutilizado em todas as renovações,
  inclusive após meses de inatividade.
- Foi publicado `POST /typebot/access/lookup`. Ele devolve os acessos ativos e
  o checkout permanente somente para sessão ligada a cliente cuja identidade
  tenha sido comprovada pelo transporte. Por segurança, permanece bloqueado
  (`identity_verified=false`) até a futura integração Evolution autenticar que
  o remetente controla o número; telefone digitado não libera credenciais.
- O rascunho não publicado do Typebot ganhou o botão **Consultar meus dados** e
  o grupo correspondente. Agora possui 19 grupos, 64 blocos, 49 arestas e 32
  variáveis, com os mesmos 18 planos. O texto do teste informa que os dados
  ficam vinculados ao cadastro. Não houve publicação ou conexão à Evolution.
- Migration aplicada; API reconstruída. Lint, oito testes e `git diff --check`
  passaram. Nenhum teste, cliente, cobrança, pagamento ou mensagem real foi
  criado/enviado. Continua pendente implementar a conversão paga que copia o
  acesso do evento de teste para `customer_panel_targets` e homologar a
  referência do checkout CineHub dentro da transação PaggPay.
- Data/hora: 2026-08-04 — regra de checkout CineHub/PaggPay esclarecida
- O fluxo comercial pretendido usa o `payUrl` único devolvido junto ao teste
  pelo CineHub/Union; esse checkout cobra via PaggPay e o próprio painel tenta
  renovar o acesso quando recebe o pagamento. O Horizons deve observar a
  PaggPay independentemente, correlacionar a transação ao teste/pedido, marcar
  pagamento confirmado e só então enviar a confirmação financeira. Em venda
  direta, depois da ativação confirmada, deve enviar também a mensagem completa
  de acesso e instalação retornada pelo teste.
- A API oficial PaggPay oferece listagem e consulta de transações, com status,
  valor, horário, pagador, `transaction_reference` e referências Pix. Ainda é
  necessário capturar/homologar uma transação real originada pelo checkout do
  CineHub para descobrir qual referência correlacionável ele preserva. Não
  atribuir pagamento automaticamente apenas por valor/horário/telefone.
- PaggPay confirmará o recebimento do dinheiro, mas não prova que o painel tinha
  créditos ou que a renovação foi concluída. O modelo de estados precisa manter
  `payment_confirmed` separado de `panel_activation_confirmed`; sem confirmação
  do painel, avisar pagamento recebido e deixar a ativação em verificação, sem
  prometer acesso renovado.
- A mensagem completa do teste contém senha e códigos. Hoje ela é transitória e
  não é persistida. A nova exigência é guardá-la somente cifrada em repouso,
  com acesso restrito, auditoria e descarte após entrega/conversão; nunca em
  logs, JSON público ou coluna de texto simples. Nenhuma cobrança, teste,
  mensagem, conexão Evolution ou publicação Typebot foi feita nesta auditoria.
- Data/hora: 2026-08-04 — auditoria do vínculo lead → teste → cliente
- Confirmado no código que a primeira triagem do Typebot cria ou atualiza um
  registro em `prospects` (Possíveis Clientes), grava perfil de qualificação,
  sessão e evento. A criação do teste exige esse prospect e persiste, ligado a
  ele, usuário externo, pacote, DNS, expiração e URL de pagamento retornados
  pelo Union/CineHub; a senha é deliberadamente apenas transitória e não é
  armazenada no Horizons.
- A conversão automática do prospect em `customers`, a criação do
  `customer_panel_target` a partir do acesso de teste e o reaproveitamento
  atômico desses dados após o primeiro pagamento ainda não estão implementados.
  Portanto, aquisição/conversão continua em proposta/encaminhamento manual até
  essa etapa ser construída e homologada com uma criação real autorizada. A
  integração Evolution e a publicação do Typebot permanecem intocadas.
- Data/hora: 2026-08-04 — fluxo Typebot preenchido em rascunho
- Por instrução explícita, **não conectar à Evolution sem nova autorização**.
  Também não publicar o bot. O código-fonte oficial da tag `v3.17.1` foi
  consultado em `/tmp` para usar o schema exato dos blocos V6; nenhum código
  externo foi incorporado ao Horizons.
- O rascunho **Atendimento IPTV — Horizons** foi preenchido via API com schema
  `6.1`: 18 grupos, 61 blocos, 45 arestas, 28 variáveis e 17 blocos HTTP. Inclui
  captura nativa de telefone/nome/sessão, menu, teste, aquisição, renovação
  PaggPay, suporte, financeiro, atendente, mais de três telas e falha segura.
  O catálogo atual de 18 planos do Horizons foi convertido em botões com IDs e
  preços vindos do backend, sem confiar em valor digitado pelo cliente.
- As chamadas HTTP usam a ponte privada e mapeiam respostas para variáveis. O
  teste é idempotente, a renovação usa PaggPay idempotente e avisos deixam claro
  que comprovante/texto não confirma pagamento. A aquisição nova registra
  proposta e encaminha para Vendas; pagamento automático continua bloqueado
  até a conversão segura lead→cliente→painel ser homologada.
- A área de aparelhos/controles/apps ficou deliberadamente como placeholder:
  coleta local e marca, explica a futura foto/classificação e segue para telas,
  mas não recomenda aplicativo nem aceita imagem até o usuário fornecer o
  catálogo e o payload Evolution→Typebot ser capturado com autorização.
- Revisão detectou que Typebot interpola quantidades como texto; schemas de
  triagem/pedido passaram a usar coerção numérica validada. API reconstruída.
  Sintaxe, lint, três suítes e diff check passaram. Leitura final confirmou zero
  arestas inválidas, `publicId` ausente, credencial WhatsApp ausente e WhatsApp
  desativado. O fluxo não foi executado em preview para não criar lead, teste,
  proposta ou cobrança. Nenhuma mensagem foi enviada.
- Data/hora: 2026-08-04 — acesso API Typebot e rascunho criados
- O usuário adicionou `TYPEBOT_API_TOKEN` diretamente ao `.env` protegido. A
  presença e a autenticação foram validadas sem imprimir o token; a consulta
  oficial `GET /api/v1/workspaces` retornou um único workspace e a listagem
  inicial confirmou zero bots. URL, workspace ID e bot ID foram registrados no
  ambiente/configuração; `.env` permanece modo `0600`.
- Foi criado via API o rascunho não publicado **Atendimento IPTV — Horizons**.
  Uma primeira tentativa vazia foi rejeitada pelo schema V6 e não criou objeto;
  após incluir o evento inicial obrigatório, a criação funcionou. O rascunho
  recebeu 17 grupos nomeados conforme o blueprint e 26 variáveis de sessão.
  Os grupos ainda estão sem blocos/mensagens/arestas; não houve publicação nem
  conexão Evolution/WhatsApp.
- `server/config.js` e `.env.local.example` agora reconhecem token, workspace e
  bot. A API precisou ser reconstruída (uma simples recriação ainda usava a
  imagem anterior); depois do build, os quatro campos foram confirmados apenas
  como booleanos. Nenhum segredo foi exibido.
- Data/hora: 2026-08-04 — destinos Typebot configurados
- Com autorização explícita, foram configurados no `.env` protegido os destinos
  de Financeiro, Suporte, Atendimento Geral e, provisoriamente, Vendas usando o
  número geral enquanto o comercial é adquirido. Os números não foram copiados
  para documentação/GBrain. Somente a API foi recriada com `--no-deps`; Redis e
  worker permaneceram ativos. Saúde respondeu `200` e os quatro campos foram
  confirmados apenas como booleanos. Nenhuma mensagem ou handoff foi disparado.
- O usuário vai montar o catálogo de marcas/aparelhos, imagens de controles e
  aplicativos. Foi aprovado conceitualmente um classificador visual. O desenho
  seguro foi adicionado ao fluxo: saída estruturada, confirmação obrigatória,
  alternativas para confiança média, segunda foto/humano para confiança baixa,
  download somente por transporte autenticado e retenção curta. Antes de
  implementar a entrada de imagem, capturar o payload real Evolution→Typebot
  para evitar aceitar URL arbitrária/SSRF.
- Data/hora: 2026-08-04 — fundação da jornada Typebot publicada
- A jornada solicitada foi especificada em `docs/typebot-customer-journey.md`:
  identificação → menu (teste, renovação, aquisição, suporte, financeiro ou
  humano), triagem de local/aparelho/marca/foto do controle, recomendação de
  aplicativo, telas simultâneas, plano, teste e instrução personalizada. Até 3
  telas simultâneas usam um acesso; acima disso calcula `ceil(telas/3)`, mas
  bloqueia cobrança automática e encaminha para Vendas. O blueprint contém 17
  grupos do editor, botões, variáveis e regras de falha segura.
- Foi criada e aplicada a migration
  `20260804010000_typebot_conversation_intake.sql`, com perfis de qualificação,
  sessões Typebot, handoffs por departamento e pedidos comerciais. Ela também
  liga pedidos/lead às renovações e testes diretos. A migration anterior
  `20260804000000_paggpay_typebot_idempotency.sql` foi aplicada na mesma rodada.
- A API agora publica, todos protegidos pelo token privado da ponte:
  `POST /typebot/intake`, `POST /typebot/handoffs`,
  `POST /typebot/guides/recommend`, `GET /typebot/offers` e
  `POST /typebot/orders`. Preços vêm do catálogo Horizons, não de variável do
  cliente. O endpoint de teste exige lead previamente triado, vincula o evento,
  passa nome/telefone ao endpoint Union e marca o funil como `test_sent` após
  sucesso. Esse novo payload de telefone ainda precisa de uma criação controlada
  para comprovar que o CineHub/Union efetivamente o persiste.
- Configuração aceita destinos separados protegidos para Vendas, Suporte,
  Financeiro e Geral; nenhum número foi inventado/configurado e nenhum handoff
  foi acionado. Para aquisição nova, existe pedido/qualificação, mas a cobrança
  automática permanece bloqueada até implementar e homologar a conversão
  atômica lead→cliente→alvo de painel. Renovação existente pode usar PaggPay:
  Horizons recebe/reconfirma o webhook e enfileira o painel, sem o CineHub
  precisar receber callback. O `payUrl` Union já observado continua inadequado
  como checkout único correlacionável.
- API reconstruída/publicada; o Compose recriou Redis e API, worker reconectou e
  permaneceu ativo. Saúde API `200`, frontend `200`; novas rotas sem token
  retornaram `401`. Sintaxe, lint, três suítes de teste e `git diff --check`
  passaram. Nenhum teste, cobrança, pagamento, renovação, lead fictício ou
  mensagem real foi criado nesta rodada.
- Próximos insumos: quatro telefones de handoff; marcas/plataformas e apps
  recomendados; fotos/mídias autorizadas ou decisão sobre classificador visual;
  catálogo comercial final; e token API do workspace Typebot guardado no
  ambiente protegido para automatizar a montagem visual.
- Data/hora: 2026-08-04 — administrador Typebot criado; cadastro fechado
- O usuário confirmou o primeiro acesso. O banco Typebot contém exatamente um
  usuário, sem dados pessoais impressos na validação. `DISABLE_SIGNUP` voltou a
  `true` imediatamente e somente o builder foi recriado. O provedor Nodemailer
  continua ativo, o domínio público redireciona corretamente para `/signin`, as
  82 migrations permanecem aplicadas e não há migrations pendentes. Novos
  cadastros estão bloqueados; o usuário administrador existente continua podendo
  autenticar por link mágico. Próximo passo: criar no editor o fluxo inicial de
  renovação e então publicar/aplicar a rota idempotente Typebot→PaggPay do
  Horizons.
- Data/hora: 2026-08-04 — autenticação Typebot por e-mail ativada
- O usuário configurou diretamente no `.env` protegido as credenciais SMTP do
  Gmail; apenas a presença das variáveis foi verificada, sem revelar valores.
  `DISABLE_SIGNUP` foi temporariamente alterado para `false` e somente o builder
  foi recriado. A rota de providers interna e pública passou a anunciar
  `nodemailer` com callback no domínio correto; o builder está pronto, sem
  migrations pendentes. O SMTP ainda não foi exercitado pelo agente para não
  disparar e-mail sem necessidade. Próximo passo: o administrador solicitar o
  link mágico e concluir seu primeiro acesso; imediatamente depois voltar
  `DISABLE_SIGNUP=true` e recriar somente o builder.
- Data/hora: 2026-08-04 — diagnóstico de acesso público Typebot
- Após o usuário relatar domínio inacessível, o caminho completo foi revalidado:
  container builder ativo, origem local `307`, túnel ativo, edge Cloudflare
  `307` e HTTPS público redirecionando para `/signin`. Cloudflare DNS e Google
  DNS já devolvem dois endereços IPv4 e dois IPv6; a navegação IPv6 respondeu
  `200` na página de login. O resolvedor local da VPS ainda mantinha cache
  negativo apenas para IPv4, embora os resolvedores autoritativos/públicos já
  estivessem corretos. O cenário é compatível com propagação/cache DNS do
  cliente, não falha do Typebot ou do túnel. Nenhuma configuração foi alterada
  durante este diagnóstico.
- Data/hora: 2026-08-04 — DNS e túnel Typebot publicados
- Foi encontrada uma credencial Cloudflare DNS protegida na VPS e, com
  autorização do usuário, foram criados os CNAMEs proxied
  `typebot.velhaturbo.cloud` e `bot.velhaturbo.cloud`. A investigação do primeiro
  retorno `530` mostrou que o serviço systemd usa um token de túnel remotamente
  gerenciado diferente do ID presente no arquivo local legado. Os CNAMEs foram
  corrigidos para o túnel efetivamente conectado e as duas rotas foram
  acrescentadas à configuração remota via API, preservando `hermes`, `iptv` e o
  catch-all existentes. O conector recebeu a configuração versão 3.
- HTTPS validado: o builder respondeu `307` para `/signin`; o viewer respondeu
  `200` diretamente no edge Cloudflare. No encerramento, o resolvedor local da
  VPS já enxergava o builder, mas ainda não o viewer, compatível com propagação
  ou cache DNS inicial. Não foram exibidos tokens/segredos e nenhuma rota
  externa não relacionada foi modificada. Próximo passo: realizar o primeiro
  onboarding administrativo controlado e então construir/publicar o fluxo.
- Data/hora: 2026-08-04 — Typebot instalado; DNS pendente
- O e-mail administrativo fornecido pelo usuário foi configurado diretamente
  no `.env` protegido do Typebot e não foi registrado neste arquivo. O ambiente
  `/root/typebot` está ativo com builder/viewer `3.17.1`, PostgreSQL 16 e Redis
  7; os quatro containers estão em execução, banco e Redis saudáveis, as 82
  migrations concluíram e o builder respondeu localmente. Builder e viewer
  permanecem publicados somente em loopback nas portas `3200` e `3201`.
- O segredo de criptografia inicialmente gerado excedia o limite de 32
  caracteres da versão atual. Ele foi corrigido e rotacionado antes da criação
  de usuários ou dados; builder/viewer foram recriados e ficaram prontos. O
  utilitário temporário de rotação foi removido para impedir uma segunda
  execução acidental. O `.env` está com modo `0600` e foi adicionado um
  `.gitignore` operacional em `/root/typebot`.
- Foram adicionados e validados no túnel Cloudflare os ingressos
  `typebot.velhaturbo.cloud` → `127.0.0.1:3200` e
  `bot.velhaturbo.cloud` → `127.0.0.1:3201`. O serviço correto
  `cloudflared.service` foi reiniciado e está ativo. O VPS não possui certificado
  de origem nem token Cloudflare para criar registros DNS; por isso os dois
  nomes ainda não resolvem publicamente. Criar CNAMEs proxied `typebot` e `bot`
  apontando para o hostname do túnel. Depois validar HTTPS e fazer o primeiro
  acesso administrativo de forma controlada antes de montar/publicar o bot.
- O cadastro está fechado (`DISABLE_SIGNUP=true`) e ainda não existe usuário ou
  bot. Será necessário habilitar o primeiro cadastro somente durante o onboarding
  do administrador e confirmar o método de autenticação disponível; não deixar
  cadastro público aberto. A migration e a rota local Typebot→PaggPay do Horizons
  continuam não publicadas. Nenhuma cobrança, pagamento, renovação ou mensagem
  foi criada/enviada nesta instalação.
- Data/hora: 2026-08-04 — preparação da instalação Typebot
- O usuário autorizou a instalação (`manda bala`). A configuração Docker
  oficial atual e o modelo de ambiente foram revisados; a release estável
  identificada foi `3.17.1`. Foi criado `/root/typebot/docker-compose.yml` com
  imagens builder/viewer fixadas nessa versão, PostgreSQL 16 Alpine, Redis 7,
  volumes persistentes, healthchecks, rede isolada e publicação somente em
  loopback (`3200` builder, `3201` viewer). Também foi criado `.env.example`
  sem segredos. Nenhum container Typebot foi iniciado e nenhuma rota Cloudflare
  ou DNS foi alterada ainda.
- Bloqueio necessário antes do primeiro boot: obter do usuário o e-mail que será
  `ADMIN_EMAIL`. O cadastro deve nascer fechado (`DISABLE_SIGNUP=true`), portanto
  não iniciar com e-mail inventado nem abrir cadastro público. Após receber o
  e-mail, gerar segredos localmente, criar `.env` com permissão `0600`, iniciar
  os containers, validar migrations/saúde, adicionar os dois ingressos ao
  cloudflared, criar DNS do túnel e validar HTTPS.
- Data/hora: 2026-08-04 — Typebot self-hosted aprovado
- O usuário aprovou seguir com Typebot self-hosted e forneceu a documentação
  oficial Evolution Foundation da integração. Confirmado que a Evolution API
  integra nativamente por `POST /typebot/create/{instance}`, com gatilho por
  palavra-chave/todos/nenhum, operadores incluindo regex, expiração, palavra de
  encerramento, debounce e gerenciamento de sessão. Também pode iniciar o bot
  ativamente e injeta `remoteJid`, `pushName`, `instanceName`, `serverUrl`,
  `apiKey` e `ownerJid`. Tratar `apiKey` como segredo transitório: não salvar a
  variável nos resultados, mensagens, logs ou exports compartilhados.
- O túnel Cloudflare atual usa `/root/.cloudflared/config.yml` e já publica
  outros hosts `velhaturbo.cloud`; ainda não possui rotas Typebot. Instalação
  recomendada: serviços isolados builder/viewer/Postgres, portas somente em
  loopback e dois hosts, provisoriamente `typebot.velhaturbo.cloud` (editor) e
  `bot.velhaturbo.cloud` (viewer/API consumida pela Evolution). Nenhum DNS,
  túnel ou container Typebot foi criado nesta rodada; confirmar os dois nomes
  antes da alteração externa.
- Data/hora: 2026-08-04 — decisão sobre Typebot em revisão
- Após o cadastro do callback PaggPay pelo usuário, a publicação do endpoint
  Typebot foi pausada para avaliar a ferramenta. A documentação oficial atual
  confirma que Typebot é `fair source` sob FSL, não open source OSI na versão
  corrente; cada versão converte para Apache 2.0 após dois anos. O uso
  self-hosted pela própria empresa para atender seus clientes é permitido, mas
  não se pode revender acesso/hospedagem Typebot nem embutir o editor como
  produto concorrente. O deploy oficial usa Docker, dois apps Next.js (builder
  e viewer) e PostgreSQL, com HTTPS via proxy reverso. A VPS atual tem 8 CPUs,
  23 GiB de RAM (16 GiB disponíveis na verificação) e cerca de 60 GiB livres,
  capacidade suficiente para um piloto self-hosted.
- Recomendação atual: manter Typebot como camada visual de conversa e o
  Horizons como fonte de verdade/idempotência/pagamentos. Ele possui bloco HTTP
  com mapeamento de respostas, variáveis de telefone/contato no WhatsApp e
  integração oficial com WhatsApp Business Platform da Meta. O transporte
  Evolution/BotBot existente pode continuar por adaptador Horizons; não assumir
  compatibilidade nativa do Typebot com Evolution. n8n é melhor como automação
  de bastidores, não como construtor principal da conversa, e também usa licença
  fair-code. Botpress atual favorece cloud/agentes de IA e adicionaria custo e
  complexidade desnecessários ao fluxo determinístico de renovação.
- O código local do endpoint idempotente Typebot→PaggPay e sua migration foram
  preparados, mas ainda não foram publicados nem aplicados ao banco. Nenhuma
  cobrança foi criada. Próxima decisão: aprovar o piloto Typebot self-hosted;
  depois reservar dois subdomínios (builder/viewer), preparar Postgres/backup e
  construir o fluxo renovar → Pix PaggPay → aguardar confirmação → renovar.
- Data/hora: 2026-08-04 12:20 BRT — PaggPay publicada
- O usuário manteve e configurou diretamente no `.env` protegido a chave
  PaggPay e autorizou seu uso. A chave não foi impressa nem copiada para código,
  comandos ou documentação. Foram implementados `server/paggpay.js`, testes,
  `POST /api/payments/paggpay/pix` e `POST /api/webhooks/paggpay`. A cobrança
  cria `renewal_requests`, envia seu UUID em `reference_id`, persiste o evento
  pendente e devolve QR/EMV. O callback extrai apenas um ID `txn_*`, reconfirma
  a transação pela API autenticada, exige referência conhecida e valor exato,
  e somente `succeeded` converge para `processPaidPayment`. Repetições pagas
  respondem como duplicadas e não enfileiram outra renovação.
- API recriada e publicada. Saúde interna respondeu `200`; callback vazio local
  e público respondeu `202 ignored_missing_transaction_id`; consulta PaggPay
  somente de leitura respondeu `200`, confirmando a chave sem revelar dados da
  conta. Sintaxe, lint, testes do servidor e `git diff --check` passaram. Nenhuma
  cobrança foi criada e nenhum pagamento/mensagem foi efetuado. URL pronta para
  cadastro: `https://iptv.velhaturbo.cloud/api/webhooks/paggpay`. O contrato está
  em `docs/paggpay.md`. Próximo passo: cadastrar essa URL no painel PaggPay,
  receber um callback real controlado e então ligar o bloco HTTP do Typebot ao
  endpoint de cobrança com idempotência de sessão.
- Data/hora: 2026-08-04 BRT — avaliação PaggPay
- O usuário decidiu substituir a frente Stripe/CineHub por PaggPay. A
  documentação oficial e o OpenAPI em português foram consultados. A API usa
  Bearer token, possui produção em `https://api.paggpay.com/v1` e sandbox em
  `https://sandbox-api.paggpay.com/v1`. `POST /pix` cria cobrança em centavos,
  retorna QR/EMV e aceita `reference_id`, que é ecoado nos webhooks; o desenho
  recomendado é usar o UUID de `renewal_requests` nessa referência para
  correlação determinística. O request também aceita `webhook_url` por
  cobrança. Nenhuma chamada à API financeira foi feita.
- Segurança PaggPay: uma chave de produção foi enviada pelo chat e deve ser
  revogada/rotacionada antes de qualquer uso; ela não foi copiada para arquivo,
  comando ou configuração. O OpenAPI público não documenta assinatura,
  segredo, headers ou schema do callback. Antes de cadastrar o webhook, criar
  endpoint dedicado com token aleatório na URL, idempotência e correlação por
  `reference_id`; confirmar também no painel/suporte se existe assinatura de
  webhook. Homologar primeiro com chave sandbox e sem pagamento real.
- Data/hora: 2026-08-04 BRT
- Retomada da frente Typebot/checkout Stripe concluída até o primeiro bloqueio
  externo. O GBrain `projects/horizons/status` foi consultado e estava alinhado
  ao arquivo local. A inspeção somente de leitura confirmou que ainda não há
  `renewal_requests`, eventos `payment_events.provider=stripe` nem variáveis
  Stripe/CineHub configuradas no backend. O único teste direto Union persistido
  continua sendo o de 2026-08-01; seu `payUrl` aponta somente para a raiz do
  Union, sem caminho/query de checkout e sem plano, valor ou referência que
  permita correlação. Nenhum checkout foi criado, nenhuma mensagem foi enviada
  e nenhum pagamento foi iniciado.
- Bloqueio atual: configurar Stripe, planos e valores no CineHub e gerar um
  checkout novo de teste. Depois, homologar de forma somente de leitura os
  campos retornados pelo Union e o evento Stripe correspondente (identificador,
  metadata/reference, valor e status) antes de implementar o webhook nativo.
  Não adivinhar nomes de metadata nem aceitar correlação apenas por telefone ou
  valor. Nenhum pagamento real deve ser feito sem confirmação explícita.
- `docker compose ps` mostrou API, frontend, worker e Redis em execução. A
  consulta de dados executada dentro da API funcionou, mas a verificação das
  portas `127.0.0.1:8081`/`3100` ficou inconclusiva nesta sessão por restrição
  local de rede/socket. A tentativa de sincronizar esta atualização no GBrain
  foi recusada temporariamente pelo provedor de embeddings com HTTP 429; o
  arquivo local permanece como fonte de verdade e a sincronização deve ser
  repetida na próxima rodada.
- Data/hora: 2026-08-03 17:35 BRT
- Ponto de parada solicitado para continuidade em casa. Os passos concluídos
  desta frente são: migration aplicada; backend/frontend/worker publicados;
  fila e tela de renovações ativas; webhook Evolution unificado para texto e
  mídia, autenticado e validado; adaptador visual para imagens/PDF implementado.
  O extrator permanece intencionalmente inativo porque nenhuma chave de IA foi
  configurada. Quando houver chave, inserir diretamente no `.env` protegido
  (`OPENAI_API_KEY`) e recriar somente a API; nunca enviar a chave pelo chat.
- Próxima frente acordada: (1) usuário configurar Stripe, planos e valores no
  CineHub; (2) gerar checkout novo e homologar usuário, plano, valor,
  persistência do link e referência/metadata enviada à Stripe; (3) implementar
  webhook Stripe com verificação de assinatura, correlação ao cliente,
  `payment_event` e confirmação WhatsApp; (4) criar endpoints Typebot e roteiro
  do fluxo renovar → checkout ou Pix → comprovante → revisão → renovação; (5)
  testar ponta a ponta com cliente fictício, pagamento controlado, comprovante
  normal/agendado/duplicado e mensagem final. Nenhum pagamento real deve ser
  feito sem confirmação explícita.
- Comando recomendado para retomar em outra máquina/conversa:
  `Continue o Horizons em /root/horizons-app, leia AGENTS.md e PROJECT_STATUS.md e retome pela integração Typebot/checkout Stripe.`
- Data/hora: 2026-08-03 16:15 BRT
- Etapas 1–3 do fluxo de comprovantes concluídas em produção. A migration
  `20260803000000_manual_pix_receipts.sql` foi aplicada pelo Management API ao
  projeto resolvido a partir do `SUPABASE_URL`; `renewal_requests` e
  `pix_receipts` responderam `200` no PostgREST. Frontend, API e worker foram
  reconstruídos e publicados; containers ativos, API saudável e frontend `200`.
- O webhook Evolution existente foi preservado e unificado: textos continuam
  alimentando prospects e imagens/PDF agora são associados à renovação aberta,
  baixados sob demanda pela Evolution e encaminhados ao extrator. A URL já
  apontava para `/api/webhooks/evolution`, recebia `MESSAGES_UPSERT` e foi
  corrigida para incluir o token protegido na query. Chamada vazia autenticada
  respondeu `202`; chamada sem token permanece `401`. Nenhuma mensagem foi
  enviada e nenhum comprovante real foi criado.
- Etapa 4 implementada, mas não ativada: `server/receiptExtractor.js` aceita
  JPEG/PNG/WebP/PDF, usa Structured Outputs e valida o resultado antes da fila
  humana. A escolha inicial é `gpt-4o-mini`, pois a API DeepSeek atual não
  documenta entrada visual e a compreensão visual MiniMax está documentada
  principalmente via MCP/Token Plan. Não existe chave OpenAI, MiniMax ou
  DeepSeek configurada no ambiente; portanto não houve chamada paga nem teste
  real do extrator. A integração permanece degradável: sem chave, o comprovante
  entra para revisão humana com `extraction_failed`.
- Data/hora: 2026-08-03 BRT
- Definido o novo fluxo de renovação por checkout persistido ou Pix manual com
  comprovante. O comprovante será apenas evidência para triagem: OCR/IA extrai
  campos e sinaliza divergências, mas somente conferência humana do crédito
  poderá confirmar pagamento. Foi adicionada a migration
  `20260803000000_manual_pix_receipts.sql`, ainda não aplicada, com solicitações
  de renovação, comprovantes, estados operacionais, RLS e prevenção de E2E
  duplicado. O contrato funcional está em
  `docs/manual-pix-renewal-flow.md`. Próximo passo: endpoints autenticados,
  adaptador de extração e recepção de mídia Evolution/Typebot; depois aplicar a
  migration somente após revisão do schema de produção.
- Backend e interface inicial concluídos em 2026-08-03: `GET/POST /renewals`,
  registro de comprovante, revisão humana e confirmação idempotente por E2E.
  Uma confirmação cria `payment_events.provider=manual_pix` e reutiliza
  `processPaidPayment`, portanto converge na fila de renovação já existente. A
  nova tela **Renovações** exibe alertas e oferece confirmar no banco, rejeitar
  ou solicitar outro comprovante. A validação determinística foi isolada em
  `server/receiptValidation.js` e coberta por testes. `node --check`, lint,
  build, testes do servidor e `git diff --check` passaram. A migration continua
  não aplicada e não houve deploy. Pendências externas: escolher o extrator de
  imagem/PDF, mapear mídia Evolution/Typebot e homologar metadata/referência de
  um evento Stripe real após configurar o CineHub.
- Data/hora: 2026-08-01 BRT
- Retomada da avaliação do GestorV3: o objetivo é auditar uma conta demo para
  decidir se o serviço pode assumir a gestão do negócio IPTV, substituir partes
  do Horizons ou operar integrado a ele. A página pública anuncia gestão de
  clientes, financeiro, faturas, WhatsApp e renovação automática em painéis sob
  consulta, mas isso ainda não comprova integração com Union/Unix/NOW, API,
  webhooks, exportação de dados ou baixa Pix. A sessão gráfica anterior não
  permaneceu ativa após a interrupção; a auditoria autenticada continua
  pendente e deve ser somente de leitura, sem registrar credenciais.
- A URL demo foi alcançada e o formulário foi inspecionado. O login é protegido
  por Cloudflare Turnstile; tanto o Chrome isolado sem interface quanto o Chrome
  completo em tela virtual mantiveram o desafio pendente. As credenciais não
  chegaram a ser submetidas, não houve tentativa inválida e nenhum dado da demo
  foi alterado. Conforme a regra operacional de painéis, o desafio precisa ser
  resolvido manualmente em um navegador visível antes da auditoria autenticada.
- Auditoria visual parcial da demo GestorV3 recebida: foram comprovados no menu
  módulos de clientes, colaboradores, servidores, planos, produtos, financeiro,
  movimentações, relatórios, tags, V3Pay, gateways, webhook, WhatsApp comum e
  oficial, Telegram, e-mail, SMS, indicações e logs. O dashboard mostrou
  indicadores de clientes, parcelamentos e saldos, e a interface menciona 2FA.
  As telas internas decisivas não foram abertas; continuam sem comprovação as
  integrações Union/Unix/NOW, operações de criação/renovação, Efí Pix, API,
  eventos de webhook, WhatsApp/Typebot/BotBot e exportação completa de dados.
  Decisão provisória: não substituir o Horizons. O GestorV3 só deve avançar
  para piloto complementar após evidência das quatro telas críticas e resposta
  formal do suporte sobre painéis/portabilidade. O Horizons já tem, ao contrário
  do que constou no relatório externo, integração Efí Pix em produção,
  webhooks/API, BotBot/Typebot, criação homologada Union/Unix/NOW, renovação
  Union parcialmente homologada, trilha auditável e manuais por dispositivo.
- Evidência adicional da tela **Cadastrar Servidor** do GestorV3 confirma que a
  renovação automática é uma função real do produto, não apenas publicidade: o
  sistema orienta cadastrar o servidor para renovar após a confirmação do
  pagamento, oferece a opção **Sem integração**, exige associar o código do
  usuário do painel ao cadastro GestorV3 e calcula o consumo de créditos pelo
  período configurado no plano do cliente. Isso comprova o desenho funcional
  pagamento → renovação e também revela risco operacional de mapeamento/período
  incorreto. Ainda faltam os valores do seletor de integração para confirmar
  Union/Unix/NOW, os campos/segredos exigidos, o mecanismo técnico, os estados
  de falha/idempotência e quais gateways efetivamente disparam a renovação.
- Auditoria detalhada do seletor GestorV3 encontrou 28 integrações. **NOW** é
  nativo e **Qpanel/Sigma** aparece nos modos Token/Código e Login/Senha; o
  operador informou que Union e Unix são painéis da família Sigma. Isso torna
  sua compatibilidade fortemente provável, mas ainda exige homologar cada URL
  no modo correto porque os nomes Union/Unix não aparecem separadamente. As
  integrações armazenam no GestorV3 token/API key ou login/senha conforme o
  provedor, e a demo não comprovou criptografia, mascaramento ou controle de
  acesso desses segredos.
- Gateways comprovados no GestorV3: Mercado Pago, Asaas, Pix Manual e
  V3Pay/GestorPay. Asaas e V3Pay exibem callback automático; Efí/Gerencianet
  não foi encontrada. Existem diagnóstico de crons, registros de login/painel e
  log de renovações, mas a demo não comprovou idempotência, retentativa,
  reconciliação, tratamento de painel indisponível ou crédito insuficiente.
  Decisão atual: GestorV3 é forte candidato a assumir CRM/cobrança/renovação,
  inclusive NOW e possivelmente Union/Unix via Sigma. Antes de migrar, fazer
  piloto isolado por painel e decidir entre trocar o gateway para Asaas/V3Pay
  ou manter Efí no Horizons e integrar os sistemas por API/webhook.
- MVP operacional recomendado para entrada rápida em produção: manter o endpoint
  atual Horizons/Union para criação e entrega automática de testes; quando o
  cliente comprar, fazer uma única conversão/cadastro no GestorV3 vinculando o
  código do usuário, servidor Sigma/NOW e plano. A partir daí, emitir e cobrar
  pelo gateway homologado do GestorV3 (Asaas ou V3Pay) para que o pagamento
  dispare a renovação automática e as mensagens. Isso deixa manual apenas a
  primeira conversão e remove o trabalho recorrente de entrar no painel a cada
  mensalidade. Manter Efí + aviso manual seria publicável, mas não resolve o
  gargalo central; integrar Efí ao GestorV3 fica para depois caso exista API de
  confirmação externa.
- Integração BotBot/Typebot iniciada em 2026-08-01. A especificação pública
  BotBot API v2 foi validada e o backend ganhou cliente para
  `POST /api/v2/messages`, usando `authKey` no header e `appKey` somente no nó
  WhatsApp. Foram publicados: webhook BotBot autenticado, endpoint protegido
  para blocos HTTP do Typebot, envio administrativo autenticado e consulta de
  eventos. A migration `20260801000000_botbot_integration.sql` foi aplicada no
  Supabase com RLS e auditoria idempotente. Nenhuma credencial foi gravada no
  código ou Git e nenhum WhatsApp foi enviado. Um callback interno fictício
  respondeu `202` e foi persistido; chamadas sem segredo retornaram `401`
  local e publicamente. API pública e local responderam `ok` após o deploy.
  Para criação imediata, a URL tokenizada gerada pelo Union deve continuar
  cadastrada diretamente como resposta URL no BotBot. O encaminhamento
  automático da conversa ao Typebot só será habilitado depois de receber o
  primeiro payload BotBot real e informar `TYPEBOT_API_URL` e
  `TYPEBOT_PUBLIC_ID`; até lá, o webhook apenas audita e não responde.
- Primeiro teste de palavra-chave BotBot → URL nativa do Union foi disparado
  pelo usuário. Como esse caminho é direto e não passa pelo webhook Horizons,
  nenhum evento era esperado na nova tabela. A tentativa de inspeção somente
  de leitura no Union ficou bloqueada pelo modal de gerenciamento da integração:
  o painel expõe o botão de fechar no DOM, mas fora da área clicável do agente,
  e mantém cópias ocultas dos menus/logs. Nenhum segundo teste foi disparado e
  nenhuma operação foi repetida. A confirmação deve vir da resposta recebida
  no WhatsApp ou da abertura manual de Logs/Fila do BotBot no Union.
- Homologação confirmada pelo usuário em 2026-08-01: um contato externo enviou
  a palavra-chave configurada no BotBot; o BotBot chamou a URL nativa do Union,
  o Union criou o teste imediatamente e o acesso foi entregue à pessoa no
  WhatsApp. A criação de teste Union por BotBot está funcional ponta a ponta e
  não depende do agente visual. A mensagem enviada ainda é o modelo padrão de
  teste do Union/BotBot; personalizar esse template é uma etapa posterior e não
  deve alterar a automação já homologada.
- Em 2026-08-01 foi comprovado que a URL tokenizada de Teste Automático do
  Union aceita `POST` direto e não depende do BotBot. O Horizons passou a expor
  `POST /api/typebot/union/tests`, protegido por token e com idempotência. A
  homologação real criou o acesso externo `771183`, pacote de teste de 2 horas,
  e recebeu credenciais, mensagem pronta e link de pagamento; nenhum segredo ou
  senha foi persistido. A repetição da mesma chave retornou `409` e não criou
  outro acesso. O BotBot permanece opcional para transporte de mensagens; o
  Typebot agora pode controlar a conversa e chamar o Horizons diretamente.
- Motivo: retomada autorizada da conversão/renovação do teste Union.
- Estado: o pacote versionado
  `public/downloads/horizons-local-panel-agent-windows-v16.zip` já estava
  publicado e é idêntico ao código atual de `local-panel-agent/agent.mjs`.
  O ZIP v16 respondeu `200 OK` no frontend local (11.434 bytes) e a API respondeu
  `{"status":"ok"}`. Nenhuma configuração, credencial ou versão anterior foi
  alterada na preparação da v16. O agente `Meu computador` está ativo e a
  conexão Union está em modo automático, `connected`, com criação e renovação
  habilitadas. A única tentativa de renovação do teste já criado
  `rafaeltesteunion` (usuário externo `321709`) com o plano `HIPER I SEM
  ADULTOS 12H` falhou antes de interagir com o painel: o Chrome isolado não
  estava em execução e o CDP local não respondeu. Nenhuma renovação foi
  efetuada e o teste segue `sent`. Um novo comando de abrir o login seguro foi
  concluído pelo agente. Por orientação explícita do usuário, o Union deve
  clicar em **Entrar** quando a página inicial carregada já possuir as
  credenciais salvas; o login manual não deve ser solicitado nesse caso. O
  agente v17 implementa etapas opcionais para **Entrar** e **Continuar** e só
  as aciona quando visíveis; caso contrário, segue em uma sessão autenticada.
  API, worker e frontend foram recriados; o ZIP público v17 respondeu `200 OK`
  (11.460 bytes). O computador deve atualizar apenas `agent.mjs` a partir do
  pacote v17, preservando `config.json`, e reiniciar o agente antes de uma nova
  execução de renovação. Após a atualização, o perfil salvo abriu autenticado
  em `#/dashboard`; não houve necessidade de login manual. Duas tentativas de
  renovação pararam antes de enviar o formulário: primeiro por ausência de uma
  aba aberta, depois porque o seletor capturado do ícone de renovação na linha
  do cliente não existe mais no HTML atual. Uma captura somente de leitura
  confirmou o teste na lista e os ícones de ação visíveis, sem acionar nenhum
  deles; a operação segue `sent`. Antes de uma nova tentativa, é preciso
  identificar com precisão o ícone de renovação atual da linha de
  `rafaeltesteunion`, evitando clicar em uma ação ambígua. A captura posterior
  confirmou o seletor atual `td:nth-of-type(5) > div > button:nth-of-type(2)`.
  Em 2026-08-01, uma renovação autorizada foi concluída pelo agente: o Union
  aceitou o plano `HIPER I SEM ADULTOS 12H` e o Horizons atualizou o teste para
  `converted` (usuário externo `321709`). O resolvedor do campo Plano foi
  ajustado para usar o rótulo visível, que foi o método homologado, e o worker
  foi recriado; a API respondeu `{"status":"ok"}`. A sincronização pelo CLI
  do GBrain ficou pendente: o banco PGLite está corretamente em uso pelo
  servidor MCP e não foi interrompido.

## Atualização — novo teste Union (2026-08-01)

- O teste `horizonsauto0801` foi criado com sucesso no Union, perfil sem
  adultos, 12 horas, usuário externo `478383`; o Horizons o registrou como
  `sent`.
- A renovação automática desse novo teste permanece pendente. O Union abre a
  janela de renovação, mas mantém inputs de plano visíveis e ocultos
  duplicados; o agente atual não conseguiu validar a seleção no controle
  efetivamente clicável. Nenhum envio de renovação foi feito para esse novo
  teste, evitando converter com plano incorreto.
- A sequência operacional confirmada é: abrir **Renovar**, selecionar o plano,
  enviar **Renovar** e fechar a confirmação. O bloqueio atual está somente no
  segundo passo: os IDs de input expostos pelo Union são instâncias ocultas e
  não recebem foco/clique do CDP; o agente precisa passar a localizar o botão
  visível do combobox antes de a renovação poder ser totalmente autônoma.
- O agente v18 implementa `select_visible_combobox`: encontra o gatilho visível
  por geometria a partir do rótulo, filtra e clica apenas na opção que está no
  topo da janela. Worker e frontend foram publicados; o ZIP v18 respondeu
  `200 OK` localmente. Atualizar apenas `agent.mjs`, preservando `config.json`,
  antes de retomar a renovação pendente.

## Registro anterior — conversão Union

- Estado: ainda não concluída. O registro prematuro como convertido foi
  corrigido para `sent`. O fluxo confirmado é **Clientes** → pesquisa superior
  → ícone de calendário da linha → janela de renovação → plano HIPER sem
  adultos. O Union recria o ID do campo de plano a cada abertura; o agente
  Windows v16, já publicado, resolve o campo no diálogo que está realmente
  visível (o Union mantém comboboxes ocultos duplicados) e confirma a opção
  filtrada pelo teclado. O caminho confirmado na captura é o link **Clientes**
  dos Favoritos à esquerda (`div:nth-of-type(2) > div > div >
  div:nth-of-type(15) > a`), seguido do filtro de lista `Pesquisar`, do
  calendário da linha e da janela de renovação. Em 2026-07-31, após a
  correção da busca e a confirmação por teclado do combobox, foi constatado
  visualmente que o campo do plano ainda permanecia em **Selecionar**; o teste
  foi restaurado para `sent`. O agente v16 corrige esse diagnóstico. A API foi
  corrigida
  para identificar a ação da operação (e não o comando local) ao atualizar o
  status de futuras renovações.

## Objetivo atual

Evoluir o Horizons de painel administrativo para operação segura de criação e
gestão de testes IPTV, com fluxo auditável entre o app, o agente de navegador
local e os painéis Unix, Union e NOW.

## Frente paralela — manuais de instalação

- A tela `src/pages/ManuaisInstalacao.jsx` já permite cadastrar manuais por
  categoria de dispositivo, fabricante/modelo, painel recomendado, aplicativo,
  instruções e links de mídia.
- Próximo material necessário: quais TVs/plataformas e aplicativos serão
  suportados inicialmente, além dos links/fotos/vídeos oficiais disponíveis.
- Os manuais devem ser escritos em passos curtos, reutilizáveis e sem incluir
  credenciais; o compartilhamento por WhatsApp será ligado depois.

## Arquitetura atual

- Repositório e VPS: `/root/horizons-app`.
- Frontend: React/Vite, entregue pelo container `frontend` em `127.0.0.1:3100`.
- API: Node/Express no container `api`, publicada internamente em
  `127.0.0.1:8081`; saúde em `GET /health`.
- Worker: BullMQ/Redis no container `worker`; Redis é o serviço `redis`.
- Dados/autorização: Supabase. As migrations novas de painéis ficam em
  `supabase/migrations/20260728*.sql`.
- Pagamentos: há uma base genérica em `payment_events` e `automation_jobs`.
  `POST /webhooks/payments/:provider` exige um HMAC interno e recebe um payload
  normalizado; ainda não existe adaptador, cobrança Pix, OAuth mTLS ou webhook
  nativo do Efí Bank.

## Integração Efí Bank — diagnóstico de 2026-07-29

- Os certificados P12 de homologação e produção foram disponibilizados no host,
  fora do repositório, e tiveram as permissões reduzidas para `0600`, proprietário
  `root:root`. Não copiar, versionar nem imprimir o seu conteúdo.
- A API Pix Efí exige o certificado cliente também no OAuth2, junto de
  `client_id` e `client_secret`; cada ambiente tem seu próprio par de
  credenciais. A chave Pix da conta também será necessária para emitir Cob.
- O endpoint de webhook Pix normalmente requer mTLS. O Horizons é exposto por
  túnel, portanto a implantação deverá usar uma origem/domínio com terminação
  mTLS compatível ou o recurso `skip-mTLS` da Efí com token aleatório de callback
  validado pela API e restrições de borda adicionais. Não cadastrar webhook nem
  realizar chamadas financeiras antes da escolha explícita do modo.
- Implementação inicial concluída, ainda inativa sem variáveis de ambiente:
  `server/efiPix.js` realiza OAuth2 mTLS com P12 e emite Cob Pix; a API oferece
  `POST /payments/efi/pix`, `POST /payments/efi/webhook/register` e recebe
  `POST /webhooks/efi?token=…`. O callback encontra a cobrança pendente pelo
  `txid`, marca o evento como pago e reutiliza a fila de renovação existente.
- O compose monta `/opt/certificados` no API e worker como
  `/run/certificados:ro`; não há cópia de certificado para imagem ou repositório.
- A configuração passou a aceitar os dois conjuntos de credenciais sem troca de
  arquivo: `EFI_HOMOLOGATION_*` e `EFI_PRODUCTION_*`. `EFI_ENVIRONMENT` escolhe
  qual deles fica ativo; manter `homologation` até a validação completa.
- Em 2026-07-29, as credenciais dos dois ambientes foram inseridas diretamente
  no `.env` protegido (`0600`) e o ambiente ativo ficou em `homologation`. Foi
  criado localmente o token do callback e configurada a URL pública do Horizons
  sem registrá-la ainda na Efí.
- Frontend, API e worker foram reconstruídos. Saúde em `127.0.0.1:8081/health`
  respondeu `ok`; a rota do callback rejeita chamadas sem token (`401`) e os
  dois P12 estão montados no container somente para leitura. O OAuth2 mTLS da
  Efí em homologação foi testado com sucesso. Não houve cobrança, movimentação
  financeira ou cadastro de webhook na conta Efí.
- O usuário confirmou e o webhook Pix de homologação foi cadastrado com sucesso
  na Efí em modo `skip-mTLS`, apontando para o callback protegido do Horizons.
  Nenhuma cobrança foi criada durante o cadastro. Em seguida, uma Cob de R$ 1,00
  em homologação foi emitida para um cadastro de teste novo; a Efí confirmou o
  pagamento e o callback marcou o evento como `paid` no Horizons. A validação
  de emissão, callback e reconciliação foi concluída ponta a ponta.
- Frente futura registrada: avaliar uma integração financeira separada para
  monitorar entradas/saídas da conta Efí e notificar no Telegram; não misturar
  esse escopo com a automação operacional do Horizons sem desenho próprio de
  permissões, dados e notificações.

## Cobranças Pix — interface (2026-07-29)

- A tela **Cobranças Pix** foi adicionada ao menu do Horizons. Ela lista os
  eventos Efí do usuário autenticado, identifica claramente homologação versus
  produção, e permite escolher cliente, valor, validade e descrição para gerar
  uma Cob Pix.
- Após a geração, exibe QR code e Pix copia-e-cola, além de atualizar o
  histórico com estado de pagamento. A API passou a expor somente os campos
  necessários de `payment_events` pertencentes aos clientes do usuário; o
  payload bruto do provedor nunca é enviado ao navegador.
- Frontend e API foram reconstruídos/publicados. Build e lint passaram; API
  confirmou saúde em `127.0.0.1:8081/health` e todos os serviços continuam
  executando.

## Efí produção (2026-07-29)

- Por confirmação explícita do usuário, `EFI_ENVIRONMENT` foi alterado para
  `production` e apenas a API foi recriada. A saúde respondeu `ok` e o OAuth2
  mTLS de produção foi validado com sucesso, sem emissão de cobrança.
- Atenção: o webhook configurado anteriormente é o de homologação. Antes de
  emitir uma cobrança real, cadastrar o webhook da chave Pix de produção no
  mesmo callback protegido, após confirmação explícita do usuário.
- O usuário confirmou e o webhook da chave Pix de produção foi cadastrado com
  sucesso no callback protegido do Horizons. A emissão de cobranças reais e a
  confirmação automática de pagamento estão prontas; toda nova cobrança deve
  ser tratada como ação financeira real.
- Verificado em 2026-07-29: `node --check` em `server/api.js` e
  `server/efiPix.js`, `npm run lint`, `docker compose ... config --services` e
  `git diff --check` concluíram sem erro.
- Navegador de painel remoto: `server/panel_browser_bridge.py`; abre somente uma
  sessão visível para login manual e nunca preenche credenciais.
- Navegador de painel local: `local-panel-agent/`, instalado no computador do
  usuário. Ele busca comandos do Horizons, abre Chrome com perfil isolado e
  pode registrar capturas de fluxo sem salvar valores de senha.

## Estado dos serviços (verificado em 2026-07-29)

- `frontend`, `api`, `worker` e `redis` estão em execução via
  `docker-compose.vps.yml`.
- A API respondeu `{ "status": "ok" }` em `127.0.0.1:8081/health`.
- O bridge do navegador de painéis está em execução.
- O agente local `Meu computador` está `active` e reportou presença em
  2026-07-29 14:23 BRT (conforme fuso registrado pelo banco).

## Painéis e automação

| Painel | Conexão | Estado | Automação |
|---|---|---|---|
| Unix | `connected`, agente local | Fluxo de teste mapeado e homologado | Automática para `create_test` |
| NOW | agente local | Adaptador de criação de teste implementado; homologação pendente | Requer aprovação manual até homologar |
| Union | `connected`, agente local | Sem captura no Horizons; há protótipos técnicos fora da produção | Não executar até capturar e homologar |

### Unix

- O adaptador está em `server/panelFlows.js` como `unix-create-test-v1`.
- A execução local resolve rótulos/textos visíveis pois IDs do painel mudam por
  sessão.
- Criação de acesso é uma ação externa real: requer confirmação explícita antes
  de disparar manualmente.

### Union

- Há scripts exploratórios em `.automation/u9ion_*.py`, incluindo login,
  leitura e criação de cliente-teste. Eles são evidência técnica, não o
  adaptador de produção.
- Em 2026-07-31 foi registrada e revisada a captura
  `5587b524-ed3a-4074-9c51-872c2c2cd5e0`: login manual, **Clientes**,
  **Adicionar**, formulário **Adicionar Cliente**, servidor, plano, horas,
  usuário, senha, nome e **Salvar**. A conexão permaneceu `connected`, com o
  agente local ativo, capacidade `create_test` e modo automático habilitados.
- O adaptador `union-create-test-v1` foi implementado em
  `server/panelFlows.js`. Ele usa rótulos e opções visíveis, pois os IDs do
  Union mudam a cada sessão; recebe servidor, plano, horas, usuário, senha,
  nome e WhatsApp opcional. A senha transita somente no comando efêmero para o
  agente e é removida do resultado armazenado pelo Horizons.
- A tela **Testes** agora cria solicitações Union e mostra os campos necessários
  para disparar o roteiro. API, worker e frontend foram reconstruídos; a saúde
  da API, frontend e o download do pacote do agente foram validados. O agente
  Windows v7 também passa a executar cliques de seletores por eventos físicos
  do navegador, reduzindo incompatibilidades com o painel.
- A homologação externa ainda falta: ela criará um acesso real e depende de uma
  solicitação com os valores de teste e da confirmação operacional explícita no
  momento do envio. Não foi criado acesso Union nesta rodada.
- Ajuste posterior antes da homologação: o Union gera usuário e senha por
  botões no formulário. O adaptador passou a acionar esses geradores nativos e
  a tela não pede mais credenciais predefinidas. Isso requer o pacote Windows
  v8; frontend e worker foram publicados novamente, e o ZIP v8 foi validado.
- Tentativa de homologação autorizada em 2026-07-31: o agente v8 estava ativo,
  mas ao abrir a URL inicial não encontrou o menu autenticado **Clientes**.
  A primeira tentativa parou antes do clique; a segunda aguardou o menu por
  15 segundos e também parou antes de qualquer alteração. Nenhum acesso foi
  criado e a solicitação voltou a `pending`. Próxima ação: abrir **Login
  seguro** na conexão Union, autenticar manualmente no Chrome isolado e então
  repetir uma única execução autorizada para `rafaeltesteunion` (HIPER, plano
  sem adultos de 12h, WhatsApp vazio).
- Diagnóstico aprofundado: após corrigir a entrada para o botão capturado
  **Continuar**, o agente alcançou **Clientes** e **Adicionar**, mas parou ao
  localizar o controle de **Servidor** porque o Union separa rótulo e campo em
  contêineres irmãos. Nenhuma tentativa alcançou preenchimento ou salvamento.
  O agente Windows v9 resolve o controle por rótulo também nos contêineres
  seguintes; o pacote foi validado e publicado. Atualizar somente `agent.mjs`,
  preservando `config.json`, antes da próxima tentativa autorizada.
- Nova execução com v9: servidor, plano e horas foram alcançados/preenchidos,
  mas o botão de geração ao lado de **Usuário** ainda estava fora do contêiner
  imediato do campo. Não houve salvamento. O agente Windows v10 passou a
  procurar ações visíveis também nos elementos irmãos/ancestrais do controle;
  o pacote foi validado e publicado. Atualizar `agent.mjs` mantendo
  `config.json` antes de retomar a solicitação pendente.
- Revisão visual da captura confirmou o final do formulário: **Nome** está na
  parte inferior e o controle que cria o teste é um botão azul de envio sem
  texto visível. O adaptador preenche `rafaeltesteunion`, rola o controle para
  a tela e usa o seletor exato registrado para esse botão; não usa mais uma
  busca textual por “Salvar”. Worker reconstruído e validação do roteiro
  concluída. A conversão para cliente permanece fora deste fluxo e só será
  feita após confirmar a criação do teste.
- Na execução com v10, o seletor estrutural do botão azul não permaneceu válido
  após o preenchimento, mas a operação parou antes do envio. O v11 substitui
  esse seletor por uma ação semântica: encontra o formulário pelo texto
  capturado “Continue nesta tela após clicar em salvar” e aciona seu único
  botão `submit`. API, worker e frontend foram reconstruídos; saúde e pacote
  v11 foram validados. Atualizar `agent.mjs`, preservar `config.json`, e só
  então repetir a solicitação Union pendente.
- Conversão para cliente: o adaptador `union-promote-test-v1` foi criado a
  partir da captura para pesquisar pelo nome, abrir a ação de renovação,
  selecionar o plano e concluir o envio. As tentativas automáticas de abrir a
  sessão pararam na tela inicial antes de pesquisar ou alterar o painel. O
  teste comprovadamente criado foi restaurado para `sent` com o usuário externo
  registrado. Próximo passo: usuário clica manualmente em **Entrar** no Chrome
  isolado e deixa a tela **Clientes** aberta; então a operação usa o modo
  `already_in_customers`, sem recarregar a URL do painel, para executar a
  conversão autorizada.
- Diagnóstico de 2026-07-31: uma captura somente de leitura após abrir o
  navegador seguro confirmou a causa das falhas: o Chrome isolado está em
  `#/sign-in?redirect=/dashboard`, com os campos de usuário e senha visíveis;
  não há sessão autenticada recuperável por clique automático. O agente não
  preenche credenciais por segurança. Nenhuma tentativa de conversão pesquisou
  ou alterou o teste. Próximo passo obrigatório: usuário autentica manualmente
  no Chrome seguro do Union e confirma a chegada ao painel; então retomar a
  conversão já autorizada pelo fluxo `already_in_customers`.
- Homologação concluída em 2026-07-31 com o agente v11: uma única solicitação
  autorizada para `rafaeltesteunion` foi criada no Union (HIPER, plano sem
  adultos de 12h, WhatsApp vazio). A operação e o comando do agente terminaram
  como `completed`; o Horizons registrou o usuário externo retornado e marcou
  o teste como `sent`. A senha gerada pelo painel não foi persistida no
  resultado nem nos dados do teste. A conversão para cliente não foi executada
  e permanece como ação separada.

### NOW

- Em 2026-07-30 foram concluídas três sessões de captura nessa conexão: uma
  vazia, uma completa com 15 eventos e uma complementar com 11 eventos, ambas
  úteis e sem erros. O fluxo inclui abrir **Adicionar Teste** e preencher nome,
  usuário, senha e celular.
- O adaptador `now-create-test-v1` foi implementado em `server/panelFlows.js`.
  Ele usa os IDs estáveis dos campos capturados e para após **Adicionar**. A
  ação posterior de confirmação **Sim** observada na captura era a limpeza do
  teste de demonstração, não faz parte da criação e foi excluída do roteiro.
- O adaptador deve usar o botão nativo **Gerar Senha** e selecionar
  explicitamente o perfil **COM ADULTO** ou **SEM ADULTO** antes de concluir.
- API e worker foram reconstruídos e publicados em 2026-07-30; a API respondeu
  `{"status":"ok"}` na verificação de saúde após a publicação.
- A execução deve permanecer com aprovação manual até uma homologação com
  cliente de teste confirmar a criação e as credenciais retornadas.

### Homologação NOW em andamento

- O usuário autorizou em 2026-07-30 a criação de um teste real de homologação
  em nome de `rafaelpascottoteste`, com senha gerada pelo painel, seguida da
  conversão em cliente após sucesso.
- A conexão NOW está `connected`; falhas de roteiro não devem ser tratadas como
  desconexão de sessão.
- Em 2026-07-30 foi configurado aviso de desconexão por WhatsApp para o número
  autorizado pelo usuário. O alerta é emitido uma única vez quando uma execução
  troca a conexão de `connected` para `reconnect_required`, evitando repetição.
- A primeira tentativa de homologação não criou acesso: o agente não encontrou
  o item **Teste** no navegador local e a operação falhou antes de qualquer
  alteração no painel. A segunda tentativa também não criou acesso: o usuário
  excedia o limite de 15 caracteres do NOW e o botão genérico não submetia o
  formulário correto. O adaptador foi corrigido para usar o botão capturado e
  rejeitar usuários longos antes da execução. A conexão voltou a exigir login
  manual; não considerar o NOW homologado ou liberado em produção até uma
  tentativa bem-sucedida.
- Correção adicional: falhas de seletor/clique não alteram mais o estado da
  sessão do painel. Antes, a API marcava qualquer falha do adaptador como
  `reconnect_required`, mesmo sem perda de autenticação; a lógica agora só
  solicita reconexão e envia alerta quando o agente reportar indício real de
  sessão expirada ou login necessário. O estado NOW foi restaurado para
  `connected` após confirmar que as falhas anteriores eram do roteiro.
- As tentativas anteriores não criaram o teste no NOW, apesar de um retorno
  técnico incorreto de conclusão. Diagnóstico: o agente local antigo atribuía
  valores aos campos sem digitação real, então o painel não os reconhecia.
  Foi preparado o agente Windows v4, que usa eventos reais de teclado do
  navegador. A homologação só será retomada após substituir o agente local e
  confirmar os dados obrigatórios restantes (perfil e celular).
- Em 2026-07-31, uma nova tentativa com perfil sem adultos e celular vazio não
  alterou o painel: falhou antes do formulário, pois o Chrome local permaneceu
  na última página e não encontrou a navegação **Teste**. O agente Windows v5
  passa a voltar para a página inicial da conexão antes de cada roteiro. O ZIP
  publicado não inclui `config.json` nem credenciais; é necessário substituir
  o arquivo no computador local e reiniciar o agente antes de nova tentativa.
- Após a atualização declarada para v5, a repetição ainda falhou antes do
  formulário em **Teste**. Isso indica que o Chrome isolado do NOW chegou a uma
  tela sem o menu autenticado (provavelmente login), não uma falha de criação.
  Não houve teste criado. A próxima ação é o usuário abrir o login seguro do
  NOW no Chrome local, autenticar-se manualmente e confirmar a sessão antes de
  uma nova tentativa única.
- Homologação concluída em 2026-07-31: após o login manual/CAPTCHA, o agente v6
  executou o fluxo completo do NOW com clique físico em **Entrar**, criação de
  teste sem adulto e celular vazio. O teste foi aceito pelo painel com usuário
  externo registrado; a senha foi gerada no painel e não é persistida pelo
  Horizons. A conversão para cliente permanece separada e não foi executada.
- Diagnóstico de 2026-07-30: as três conexões (Unix, NOW e Union) continuam
  presentes no banco. API e frontend responderam normalmente; nenhuma conexão
  foi removida durante a publicação do adaptador.
- Correção aplicada: o proxy nginx do frontend agora resolve o serviço Docker
  `api` dinamicamente. Antes, ele mantinha o IP antigo da API após sua
  recriação e retornava `502` para a tela; o frontend foi reconstruído e a rota
  voltou a alcançar a API. A reescrita da rota também foi corrigida para
  remover o prefixo `/api` antes do encaminhamento; a validação sem sessão
  retornou `401`, comportamento esperado (não mais `404` ou `502`).
- Em 2026-08-01 foi publicada a versão consolidada Windows v19 do agente local.
  Os fluxos Union de criação e renovação agora selecionam os campos visíveis do
  Element Plus, clicam a opção exibida no dropdown e validam o valor visual
  selecionado antes de prosseguir. A renovação usa o segundo botão de ação da
  linha (ícone amarelo de calendário), escolhe o plano, clica em **Renovar**,
  exige a abertura de **Confirmação de Renovação** e então clica em **Fechar**.
  O fluxo de criação recebeu a mesma seleção validada para servidor e plano.
  Sintaxe, empacotamento, serviços, API e download local foram validados; o ZIP
  público respondeu HTTP 200 em
  `https://iptv.velhaturbo.cloud/downloads/horizons-local-panel-agent-windows-v19.zip`.
  A execução ponta a ponta no computador local ainda depende da instalação da
  v19 e não deve ser considerada homologada antes desse teste real.
- Homologação real da v19 em 2026-08-01: o teste Union `horizonsauto0803` foi
  criado automaticamente com usuário externo `122928`. A proteção contra falso
  sucesso funcionou. Na renovação, a captura confirmou a lista de Clientes e
  que Renovar é o terceiro botão visível da linha (ícone amarelo). O agente
  abriu corretamente a janela Renovar, mas não conseguiu abrir o dropdown
  visível de Plano; a operação falhou antes do envio, não consumiu renovação e
  o teste permaneceu com status `sent`. Portanto, a v19 não está homologada
  ponta a ponta e o próximo ajuste deve tratar o combobox real dessa janela,
  além de usar o filtro Pesquisar visível e a ação relativa à linha.

## Fluxo seguro de homologação de um painel

1. Em **Conexões de Painéis**, abrir login seguro no agente local.
2. Usuário autentica manualmente e resolve qualquer desafio.
3. Confirmar login no Horizons.
4. Iniciar **Capturar fluxo** e executar somente um fluxo com cliente de teste.
5. Concluir a captura, revisar eventos e criar adaptador versionado em
   `server/panelFlows.js`.
6. Validar execução com aprovação manual antes de definir a conexão como
   automática.

## Código e arquivos importantes

- `server/api.js`: API, conexões, capturas, comandos do agente e operações.
- `server/worker.js`: processamento assíncrono e fallback para revisão manual.
- `server/panelFlows.js`: adaptadores determinísticos e versionados por painel.
- `local-panel-agent/agent.mjs`: execução local de comandos e captura.
- `src/pages/ConexoesPaineis.jsx`: UI de conexões, login e captura.
- `src/pages/Testes.jsx`: tela de testes; hoje indica suporte automático ao Unix.
- `src/pages/OperacoesPaineis.jsx`: fila e conclusão manual de operações.

## Observações de repositório

- O worktree possui várias alterações locais e arquivos novos não commitados.
  Elas pertencem ao projeto em andamento: não descartá-las nem restaurar em
  massa.
- O `README.md` herdado ainda descreve o projeto antigo de WhatsApp/Gemini e
  está desatualizado; não tratá-lo como descrição confiável do estado atual.

## Automação visual no n8n

- Correção do pedido após reuso em 2026-08-10: execuções `79` e `86` chegaram
  corretamente ao teste CineHub anterior, mas `POST /typebot/orders` retornou
  422 porque comparava somente o `prospect_id` antigo do teste com o prospect
  novo da conversa. A validação agora aceita correspondência segura por
  `prospect_id` **ou telefone normalizado** da sessão/teste. O nó **Criar pedido
  automático** também ganhou saída de erro para abrir handoff de pagamento, em
  vez de deixar o WhatsApp sem resposta. As tentativas 79/86 pararam antes do
  insert do pedido; API e workflow ativo foram republicados.
- Correção de retorno teste→assinatura em 2026-08-10: **Quero assinar** não
  tenta mais criar um segundo teste para quem já passou pelo CineHub. A chamada
  envia `reuse_existing_checkout=true`; a API procura o teste concluído mais
  recente pelo telefone, mesmo expirado, reutiliza seu `payment_url` e evento e
  então cria o pedido `new_subscription`. Só cria acesso oculto quando nunca
  houve teste anterior. **Fazer teste** mantém a regra normal e não reutiliza
  teste expirado como novo benefício.
- Validação controlada do telefone de homologação retornou HTTP 200,
  `reused=true`, `reused_for_checkout=true`, evento e checkout presentes, sem
  chamada externa de criação. Depois da validação, a resposta de assinatura foi
  endurecida para devolver ao n8n somente pacote/validade/checkout; usuário,
  senha e DNS permanecem cifrados no backend até o callback PaggPay. O histórico
  de execuções bem-sucedidas do n8n voltou para `none` para não persistir
  credenciais do caminho de teste.
- Caminhos **Fazer teste** e **Quero assinar** separados em 2026-08-10. Ambos
  criam o acesso CineHub e o pedido correlacionado, porém:
  - `trial`: envia imediatamente tutorial, aplicativo, usuário, senha e
    checkout;
  - `purchase`: mantém usuário/senha ocultos e envia somente plano, valor e o
    `payment_url` do teste CineHub. O pedido usa `purpose=new_subscription`.
- No callback PaggPay confirmado, pedidos `new_subscription` agora recuperam o
  `union_direct_test_event_id` correlacionado, abrem usuário/senha cifrados
  apenas naquele momento, consultam o perfil de aparelho e enviam confirmação,
  orientação de instalação, usuário, senha e DNS pelo WhatsApp. Pedidos de
  teste/conversão mantêm a confirmação anterior para não duplicar credenciais.
  Nenhum dado secreto foi colocado no n8n ou em logs. API/workflow ativos
  republicados; sintaxe e cinco testes PaggPay/CineHub passaram. Pagamento real
  não foi executado nesta validação.
- Fallback de renovação ajustado em 2026-08-10: se a busca exclusiva pelo
  `payment_url` do teste CineHub retornar erro/não encontrado, o n8n cria
  automaticamente um handoff de Vendas com o resumo `checkout CineHub não
  localizado` e solicita o envio manual dos dados de pagamento. Só depois do
  handoff responde ao cliente: **Um atendente irá entrar em contato por aqui
  para enviar os dados de pagamento**, incluindo protocolo e botão Menu. O
  workflow ativo passou a 30 nós e 27 origens conectadas.
- Renovação CineHub corrigida em 2026-08-10: o ramo **Renovar plano** deixou de
  gerar Pix PaggPay e agora chama `POST /api/typebot/cinehub/checkout`. A rota
  retorna somente o checkout permanente, priorizando o acesso ativo do cliente
  e usando como fallback o `payment_url` do teste CineHub mais recente. A busca
  considera `prospect_id` atual **ou telefone normalizado**, pois a sessão de
  homologação tinha um prospect novo enquanto o teste concluído estava ligado
  a registro anterior do mesmo telefone. Validação somente leitura retornou
  HTTP 200, `source=cinehub_test` e host `painelcinehub.top`, sem imprimir o
  link completo. O n8n envia esse link e informa que a confirmação é automática;
  nenhuma nova cobrança Pix é criada pelo botão Renovar.
- Análise de duplicação em 2026-08-10: somente o workflow completo estava ativo
  no n8n e o webhook Evolution estava correto, mas a integração Typebot, apesar
  de `enabled=false`, ainda conservava uma sessão `opened` para o telefone de
  homologação. Essa sessão legada interceptava respostas e emitia
  `Invalid message. Please, try again.`, ao mesmo tempo em que o n8n respondia,
  causando a percepção de menu duplicado. A sessão foi fechada pela rota
  oficial `typebot/changeStatus`; auditoria posterior confirmou integração
  desabilitada, zero sessões Typebot e nenhum bot n8n nativo paralelo. O
  workflow/webhook n8n segue ativo. Durante a homologação,
  `saveDataSuccessExecution` foi alterado para `all` para permitir auditoria de
  mensagens bem-sucedidas e comparação por `messageId`.
- Tratamento comercial publicado em 2026-08-10: respostas HTTP 400 do CineHub
  na criação são normalizadas como `phone_already_tested` e HTTP 409 com a
  mensagem `Este número já efetuou um teste em nosso servidor.`. Repetições da
  mesma chave idempotente consultam o evento `failed` anterior e devolvem o
  mesmo código sem chamar novamente o CineHub. O ramo de erro do n8n diferencia
  esse caso de indisponibilidade genérica e envia: **Este número já efetuou um
  teste em nosso servidor. Para conhecer o serviço novamente ou assinar um
  plano, fale com nossa equipe.**, com botões Menu e Vendas. API e workflow
  ativo republicados; sintaxe e dois testes do adaptador CineHub passaram.
- Correção de nomenclatura/rota em 2026-08-10: inspeção protegida do catálogo
  confirmou que `kyros:6:no_adults` e o endpoint padrão apontam para
  `painelcinehub.top/api/chatbot/...`; nenhuma chamada estava indo para
  `union.meugestor.top`. Os nomes `Union` eram legado interno. Foi publicada a
  rota canônica `POST /api/typebot/cinehub/tests`, o workflow agora usa o nó
  **Criar teste CineHub** e todas as referências internas do n8n foram
  atualizadas. A rota antiga `/typebot/union/tests` permanece somente como
  compatibilidade temporária com o Typebot desativado. API reconstruída,
  sintaxe e teste de integração passaram; nova rota respondeu 401 sem token,
  confirmando existência e proteção. O HTTP 400 da execução 46 foi devolvido
  pelo próprio CineHub para o telefone já testado, não por um painel Union.
- Diagnóstico definitivo da execução `46` em 2026-08-10: a nova separação de
  triagem funcionou e retornou `session_id` e `prospect_id`; a falha seguinte
  foi HTTP 502 no Horizons porque o Union respondeu 400. O banco confirma um
  evento novo `failed`, sem usuário, DNS, checkout ou cobrança. O telefone de
  homologação já teve um teste KYROS concluído anteriormente e expirado, motivo
  provável da recusa de novo teste pelo painel. O nó de criação agora usa saída
  de erro dedicada: em qualquer recusa, envia explicação segura e botões de
  menu/Vendas, sem deixar a conversa silenciosa e sem continuar para tutorial,
  pedido ou checkout. Workflow ativo atualizado para 27 nós e 24 origens. Para
  homologar uma nova criação real, usar telefone ainda não testado no Union.
- Quarta correção do teste real em 2026-08-10: execuções `32` e `39` pararam
  no nó **Garantir triagem antes do teste** com `invalid syntax` antes de uma
  chamada HTTP válida. A montagem aninhada do JSON foi retirada da expressão
  do nó HTTP. O novo nó **Preparar triagem do teste** cria `intakePayload` em
  JavaScript e o HTTP apenas serializa esse objeto. Workflow republicado ativo
  com 26 nós e 23 origens conectadas. As duas falhas não chamaram criação de
  teste nem cobrança; repetir **2 telas** exercita a correção.
- Terceira correção do teste real em 2026-08-10: a execução `25` recebeu a
  escolha de 2 telas, porém parou antes de criar qualquer acesso com HTTP 422
  `Faça a triagem do possível cliente antes de criar o teste.` O comando MENU
  reinicializava o estado e mostrava o menu sem chamar Intake. Agora o primeiro
  MENU executa Intake e o ramo de teste possui ainda um nó independente
  **Garantir triagem antes do teste**, que registra intenção e perfil e passa o
  `prospect_id` confirmado à criação Union. Workflow ativo atualizado para 25
  nós e 22 origens conectadas. Repetir **2 telas** passa a criar o teste real;
  a tentativa 25 não reservou nem criou teste ou cobrança.
- Segunda correção do teste real em 2026-08-10: a execução `18` recebeu
  corretamente `content:no_adults`, mas a Evolution devolveu HTTP 400 porque a
  etapa seguinte tentou enviar quatro reply buttons (1, 2, 3 e mais de 3
  telas), acima do limite de três do WhatsApp. A etapa **Telas simultâneas** foi
  convertida para lista com quatro linhas e já mostra os valores R$ 35, R$ 60
  e R$ 80. Workflow republicado e ativo; o usuário deve repetir **Sem adultos**
  para receber a lista corrigida. Nenhum teste ou cobrança foi iniciado nessa
  falha.
- Correção durante o teste real em 2026-08-10: execuções `5` e `10` falharam
  no nó **Enviar pela Evolution** com HTTP 400 ao tentar mostrar as marcas de
  Smart TV. O schema da Evolution 2.4 instalada aplica `isNotEmpty` ao campo
  opcional `description` de cada linha; o workflow enviava `description: ""`.
  O construtor de listas agora omite completamente a propriedade quando não há
  descrição. Workflow republicado e mantido ativo; a correção também protege a
  lista de problemas de suporte. Nenhuma mensagem foi enviada pelo agente para
  validar a mudança; o usuário deve repetir a escolha **Smart TV**.
- Teste controlado iniciado em 2026-08-10 na instância **Horizons Typebot**
  (`551631850923`): configuração Typebot preservada em backup local protegido,
  integração Typebot desabilitada (não excluída), workflow completo ativado e
  webhook Evolution configurado para `MESSAGES_UPSERT` no endpoint de produção
  do n8n. O envio do workflow foi fixado na mesma instância Horizons Typebot,
  evitando responder pela instância administrativa **Meu numero**. O usuário
  deve enviar `MENU` de outro WhatsApp para `551631850923`; o número informado
  é a linha do bot e não deve receber mensagem enviada por si próprio.
- Ajuste comercial de 2026-08-10: o fluxo completo não abre mais o catálogo de
  18 planos. A escolha de telas define diretamente o plano cadastrado no
  Horizons: 1 tela = **PLANO 1 TELA / R$ 35**, 2 telas = **PLANO 2 TELAS /
  R$ 60** e 3 telas = **PLANO 3 TELAS / R$ 80**. Mais de três telas continua
  indo para proposta manual.
- Após criar/reutilizar o teste, o n8n agora cria imediatamente o pedido ligado
  ao evento do teste, captura o `checkout_url` do pedido (com fallback seguro
  para o `payment_url` retornado pelo teste) e envia no mesmo atendimento:
  tutorial, aplicativo, credenciais, valor/telas e link de pagamento. O botão
  posterior apenas reenvia o checkout já guardado; não cria outro pedido ou
  cobrança. Isso garante que o pedido exista antes de um pagamento rápido e
  possa ser correlacionado pelo callback PaggPay.
- O workflow atualizado possui 24 nós e 21 origens conectadas, permanece
  inativo e foi auditado pela API: lista geral de planos removida, três valores
  presentes, pedido automático conectado após o tutorial e checkout incluído
  na primeira entrega. Nenhum teste, checkout real, cobrança ou mensagem foi
  disparado na atualização.
- Em 2026-08-10 foi criado o workflow completo
  **Horizons | Atendimento WhatsApp completo | v1**, ID
  `9kEnUBMXxMvywDWn`, com 26 nós e 23 origens conectadas. O fluxo cobre menu,
  teste/assinatura, aparelho e marca, perfil de conteúdo, telas, catálogo de
  planos, criação/reuso idempotente do teste KYROS, tutorial específico,
  entrega conjunta de instalação + login + senha, fechamento pelo checkout,
  renovação Pix PaggPay, suporte, atendimento humano e retorno ao menu.
- As chamadas de triagem, planos, teste, manual, pedido, PaggPay e handoff usam
  a credencial protegida **Horizons Bot API | n8n**. O envio usa a credencial
  protegida **Evolution API | Horizons**. Nenhum token foi embutido nos nós.
- O motor mantém estado por telefone e deduplica mensagens por ID durante 24h.
  Menus são enviados diretamente pela Evolution em português, sem o choice
  duplicado do Typebot. O lembrete de teste e a confirmação de pagamento
  continuam nos serviços idempotentes do Horizons, que já enviam a mensagem
  quando o evento correspondente é confirmado.
- Auditoria pela API do n8n confirmou zero conexões quebradas, todos os nós
  obrigatórios presentes e credenciais vinculadas nos oito nós de integração.
  O workflow permanece **inativo** e nenhuma mensagem, teste ou cobrança real
  foi executada nesta criação.
- Webhook reservado do fluxo completo:
  `https://n8n.velhaturbo.cloud/webhook/horizons-whatsapp-completo-v1`.
- Script reproduzível/upsert do fluxo completo:
  `/root/n8n/tools/create-horizons-full-workflow.mjs`.
- Em 2026-08-10 foi criado no n8n o workflow
  **Horizons | Entrada WhatsApp (Evolution) | v1**, ID
  `qC35S1For9SFTGbO`. Ele recebe eventos da Evolution, normaliza mensagens e
  respostas de botões/listas, ignora grupos, mensagens próprias e eventos sem
  texto, evita reprocessamento pelo ID da mensagem e prepara o envio do menu
  inicial com três opções em português.
- A chave da Evolution foi cadastrada no cofre de credenciais do n8n como
  **Evolution API | Horizons**; a chave não está gravada no workflow nem no
  script de criação.
- O workflow permanece **inativo** para impedir respostas duplicadas enquanto
  o Typebot continua atendendo. Nenhuma mensagem de WhatsApp foi disparada na
  criação ou validação.
- Webhook de produção reservado:
  `https://n8n.velhaturbo.cloud/webhook/horizons-whatsapp-inbound-v1`.
- Script reproduzível/upsert:
  `/root/n8n/tools/create-horizons-entry-workflow.mjs`.
- Próximo passo: abrir o editor visual, construir os três ramos (teste/venda,
  cliente e atendente), testar com número controlado e só então planejar o
  corte do Typebot e a ativação do webhook na Evolution.

## Decisões registradas

- A memória do projeto deve residir no repositório (`AGENTS.md` + este arquivo),
  para funcionar entre computadores e chats novos.
- Credenciais, cookies e desafios dos painéis não saem do navegador local nem
  entram neste arquivo.
- Automação de painel só é habilitada após captura e homologação específica do
  fluxo.
- GBrain foi instalado localmente na VPS (`gbrain 0.42.67.0`) com Bun. A base
  PGLite local foi inicializada em `/root/.gbrain/brain.pglite` com o modelo
  `voyage:voyage-4-large`. O modo de busca confirmado é `conservative`.
- O MCP global `gbrain` está configurado para o Codex como subprocesso local;
  a credencial do provedor fica no ambiente restrito desse MCP, nunca no
  repositório. A memória contém as páginas `projects/horizons/status` e
  `projects/horizons/operating-protocol`, ambas com embeddings validados. A
  primeira consulta recuperou corretamente o próximo passo do projeto.
