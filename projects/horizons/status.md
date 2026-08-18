---
type: note
title: Horizons — memória operacional do projeto
ingested_via: put_page
ingested_at: '2026-08-05T17:09:04.988Z'
source_kind: put_page
---

# Horizons — memória operacional do projeto

> Este arquivo é o handoff permanente entre conversas, máquinas e agentes.
> Atualize-o ao fim de cada rodada relevante; não armazene segredos.

## Última revisão

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
