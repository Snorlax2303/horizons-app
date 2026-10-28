# Horizons — memória operacional do projeto

> Handoff permanente entre conversas, máquinas e agentes. Atualize ao fim de cada
> rodada relevante; não armazene segredos nem dados de clientes.
>
> Histórico completo até 2026-10-13 (homologações Unix/Union/NOW, Efí, PaggPay,
> n8n, WPlay etc.): `docs/historico/PROJECT_STATUS-ate-2026-10-13.md`.
> Plano em execução: `docs/plano-correcoes-e-melhorias.md`.

## Última revisão

- 2026-10-27 — dono relatou falha em Testar modelos; imagem confirmou `gemini-web/gemini-3.5-flash` e `gemini-web/gemini-3.1-pro`. Logs de metadados do OmniRoute para a chave Horizons mostraram HTTP 500 por `playwright-core/browsers.json` ausente. Serviço `omniroute-host` usava `omniroute:base`, sem Chromium e com pacote nested Playwright 1.62.0 parcial (core raiz 1.61.1).
- Reparação publicada: imagem derivada `omniroute:horizons-web`, pacote core completo compatível 1.62.0 + Chromium/dependências. Arquivos de build e overlay em `ops/omniroute-web/`; publicação preservou env/volumes/portas/integrações CLI originais. Validado lançamento do Chromium em container isolado sem rede; serviço OmniRoute healthy após recriação. **Futuras recriações devem usar o overlay documentado**, ou voltam à imagem base sem navegador. Compose original de OmniRoute, que já tinha alterações do dono, não foi editado.
- Teste real sintético dos dois modelos após reparo: ambos ainda falham. O conector agora chega ao navegador, mas termina com `elementHandle.click: Timeout 30000ms exceeded` (HTTP 400 nos logs); chamada do Horizons também atinge limite de 30 s. Não há evidência suficiente para afirmar que a sessão expirou ou que existe confirmação sobreposta. Solicitado ao dono conferir/reconectar sessão Gemini Web e verificar campo sem login/confirmacão. Nenhum CAPTCHA/login contornado. **Gemini Web ainda não homologado**, não salvar modelos nem declarar operação de IA concluída.
- Correção publicada de diagnóstico: falhas de teste são resultado HTTP 200 com `ok:false`, mensagem controlada e status do provedor, evitando depender de conteúdo de respostas 502 eventualmente substituídas por proxy. Interface trata `ok:false` como falha e mantém mensagem, sem falso sucesso. Mensagens não expõem caminhos/segredos do provedor. Não se comprovou qual intermediário substituiu o erro anterior por aviso genérico.
- Validação: 137/137 testes Node 22 aprovados, lint e build aprovados; Chrome com componente real/API simulada confirmou seleção/salvamento e falha de provedor legível sem indicador de sucesso. API/worker/frontend publicados, smoke local e público Configurações HTTP 200; OmniRoute healthy. Nenhuma operação em painel ou envio WhatsApp nesta rodada. Modelos selecionados na tela ainda não constavam salvos na consulta inicial desta rodada.

- 2026-10-27 — solicitação do dono: escolher modelos em lista sem digitar IDs. Configurações agora usa selects para fast/smart/vision e reservas ordenadas (até 5, sem duplicatas), com busca por nome/provedor. Catálogo carrega automaticamente com chave salva ou pelo botão Carregar modelos para chave nova; usa `/settings/ai/test` sem parâmetro de chat. Troca de URL/chave invalida catálogo e descarta respostas anteriores; modelos salvos ausentes do catálogo são preservados e identificados. Lista vazia/erro têm mensagem e bloqueiam seleção nova. Nenhum modelo foi escolhido automaticamente.
- 2026-10-27 — chave do dono **já salva**, conferida sem revelar valor; consulta real ao OmniRoute retornou **610 modelos**. Testes Chrome com componente real/API simulada passaram para carregamento automático, filtro sem alterar seleção, troca de chave, seleção e gravação dos IDs, reservas/remover/ordem, catálogo vazio e erro. Lint/build aprovados; frontend publicado, smoke API/frontend/n8n aprovado, público Configurações HTTP 200 e bundle novo conferido no container.

- 2026-10-27 — corrigido formulário de IA que apagava a chave durante digitação: callbacks `error/success/info` do hook de toast eram recriados a cada render; `error` alterava a identidade de `load`, repetindo o efeito e `applyView`, que esvaziava o formulário. Callbacks estabilizados fora do hook; tela distingue chave digitada ainda não salva de campo vazio com chave já salva. Regressão no Chrome com componente real e API simulada (chave fictícia): antes, 31 GETs, texto perdido e chave não enviada; depois, 1 GET, texto preservado e chave correta enviada, campo limpo somente após salvar com indicador de chave salva. Nenhuma chave real usada no teste. Lint/build aprovados. Frontend publicado; smoke API/frontend/n8n aprovado e rota pública de Configurações HTTP 200; conteúdo novo conferido no container.

- 2026-10-27 — dono confirmou expressamente arquivar 71 ocorrências indevidas de grupos e seus comprovantes pendentes. Operação executada em transação única no Supabase, com guardas de contagem (71 renovações e 3.930 comprovantes); HTTP 201. Verificação independente: 71 renovações `rejected`, 84 `awaiting_bank_review`; 3.930 comprovantes `rejected`, 357 `pending`; zero renovações abertas de grupos no escopo. Totais preservados (155 renovações, 4.287 comprovantes), sem exclusões, baixas financeiras ou mensagens.
- 2026-10-27 — dono informou que já possui a chave OmniRoute. Consulta autenticada confirmou que **ainda não está salva no Horizons**, modelos fast/smart/vision também vazios. Orientado a salvar em Configurações, sem compartilhar segredo no chat. Validação da IA continua pendente desse salvamento.

### Recuperação de 26/10

- 2026-10-26 — recuperação autorizada pelo dono ("siga o plano"). Supabase reativado via API de gestão (`POST /restore` HTTP 200), acompanhado até **ACTIVE_HEALTHY**; consultas autenticadas voltaram. `disable_signup=true` confirmado na gestão. Não há evidência de perda de dados; não foi feita auditoria completa de integridade.
- Worker recuperado via Docker Compose; job de monitor preso foi recuperado pelo BullMQ. Fila verificada sem jobs ativos e sem falhas após processamento; monitor concluiu consulta e identificou WhatsApp desconectado, entrada parada e IA ausente. Resumo diário Telegram e lista WhatsApp estão desligados. Lembretes n8n continuam inativos.
- Publicados api/worker/frontend: monitor agora emite `database:unavailable` em erros de consulta, usa contagens nulas quando indisponíveis, não acusa ausência de chave quando a leitura falha e restringe consultas de comprovantes ao dono. Suporta `connectionState` da Evolution.
- Dono escolheu **Financeiro** para comprovantes e fará a reconexão por QR depois. `EVOLUTION_FINANCE_INSTANCE=Financeiro` e `HORIZONS_RECEIPT_INSTANCES=Financeiro`; código e teste garantem exclusividade. Webhook Financeiro habilitado e conferido apontando ao Horizons com autenticação, somente `MESSAGES_UPSERT`. Nenhuma mensagem de teste enviada.
- Dependências atualizadas: Vite 6.4.5, Zod 4.6.7 (schemas de mapas ajustados), correções transitivas. `npm audit` **0 vulnerabilidades** no momento da validação; não implica ausência de vulnerabilidades desconhecidas. Tailwind 3 mantido, pois migração não foi necessária para resolver o audit atual.
- Páginas carregadas sob demanda: JS inicial 1.381,52 → 562,48 kB (gzip 399,03 → 168,41 kB); dashboard e demais páginas em chunks próprios. README atualizado para OmniRoute e rotas; ferramenta de consulta Evolution reconhece `connectionStatus`.
- Compose neutraliza valores `SUPABASE_ACCESS_TOKEN`, `WWPANEL_PANEL_USER/PASS` e `MINIMAX_API_KEY` no ambiente de api/worker. Arquivo operacional protegido original mantido; presença vazia na API/worker confirmada após primeiro deploy.
- Validações: 136/136 testes no container publicado (Node 22), lint, build Vite e `git diff --check` aprovados; smoke API/frontend/n8n, público HTTP 200; Chrome renderizou login com campo senha e botão Entrar, sem ErrorBoundary. Login real do dono e fluxo cliente completo não exercitados.
- Banco recontado: 181 clientes ativos; 4.287 comprovantes `failed`; 155 renovações `awaiting_bank_review` (71 grupos, 37 privadas com cliente, 47 privadas sem vínculo); 167 lembretes `planned`; operações de painel 69 falhas/13 concluídas. Última entrada registrada em 2026-10-06. Prévia de manutenção: 71 renovações de grupos e 3.930 comprovantes pendentes vinculados, nenhum confirmado. **Arquivamento não executado**, confirmação específica solicitada ao dono no chat.
- IA: sem chave e sem modelos no ambiente e na configuração do banco. OmniRoute consultado por CLI nativo retornou 401 de gestão; não se tentou contornar autenticação. Solicitado ao dono criar chave dedicada `horizons` com no_log e salvá-la/modelos na tela Configurações, sem compartilhar chave no chat. Bot n8n ainda sem rota de IA.
- Retenção n8n: workflow principal de Afiliados tem configuração padrão de salvar sucesso; continua pendente. Nenhuma alteração nesse workflow de outro projeto nem reinício do n8n nesta rodada.

### Registro anterior (13/10; histórico, não revalidado no banco)

- Data/hora: 2026-10-13 (noite) — Fases 2/3/4 do plano (parte que não depende de WhatsApp nem da chave de IA)
- **Comprovantes — causa do backlog encontrada e corrigida**: até 13/09 não havia instância de comprovantes configurada e o webhook aceitava *qualquer* mídia do número pessoal (inclusive grupos e mensagens do próprio dono) — daí 4.287 "comprovantes" e 155 renovações abertas (71 de grupos, 45 de números desconhecidos, 37 de clientes conhecidos com 179 imagens). Nova regra em `server/evolutionMedia.js`: só conversa privada, nunca `fromMe`, só instância configurada; sem instância configurada, nada vira comprovante.
- **Manutenção do backlog** (`server/routes/receiptMaintenance.js`, botões em `/renovacoes`, somente proprietário, sempre com prévia): `POST /payments/receipts/reprocess` (relê falhas de clientes conhecidos com a IA; marca `media_unavailable` quando a Evolution não devolve mais a mídia) e `POST /payments/receipts/dismiss-groups` (arquiva como `rejected` as ocorrências de grupos, sem apagar). **Nenhum dos dois foi executado** — aguardam chave de IA / decisão do dono.
- **Lembretes**: novas rotas `GET /typebot/billing/reminders/sendable` e `POST /typebot/billing/reminders/:id/sent` (token da ponte do bot, dono fixo; só marca como enviado o que estava `approved`). Workflow n8n `tRtpDjTu1GNkL8Za` atualizado para elas e **continua desativado**.
- **Monitor operacional**: job `health-monitor` no worker a cada 15 min (`server/healthMonitor.js`) avisa no Telegram administrativo: instância Evolution fora de `open`, entrada de WhatsApp parada > 6 h, falha de comprovantes > 50% em 24 h, IA sem configuração. Dedupe em Redis, lembrete a cada 12 h, aviso de "resolvido". Primeira execução entregue (HTTP 200) com 4 problemas. Tela em `/saude` (rota `GET /health/monitor`). Ajustes por env: `HORIZONS_HEALTH_MONITOR_ENABLED`, `HORIZONS_MONITOR_INSTANCES`, `HORIZONS_MONITOR_INBOUND_SILENCE_HOURS`, `HORIZONS_MONITOR_REMIND_HOURS`.
- **Bot com IA (lado servidor)**: `/typebot/ai/interpret` ganhou intenção `installation`, `app_name` casado com a lista real do painel (`panel_app`), MAC extraído do texto por regex (não pela IA), confiança < 0,6 → pergunta, < 0,35 → humano (`handoff`), e log só com modelo/intenção/confiança. **O workflow do n8n ainda não chama essa rota** (precisa da chave de IA e de número controlado).
- **Dependências**: `npm audit fix` (lock gerado com o npm 10 do `node:22-alpine` para o `npm ci` do Docker): crítica `proxy-addr` e `qs` resolvidas; restam 8 (todas da cadeia `tailwindcss` 3, só build — exige migração para Tailwind 4).
- Verificação: 134/134 testes, lint limpo, build ok; smoke do container novo; `api`, `worker` e `frontend` recriados — API 200, front 200.

## Estado anterior (verificado em 2026-10-13; atualizações acima)

| Item | Estado |
|---|---|
| Containers | `api`, `worker`, `frontend` recriados em 2026-10-13; `redis` healthy |
| Publicação | `iptv.velhaturbo.cloud` (Cloudflare Tunnel) → frontend `127.0.0.1:3100`, API `127.0.0.1:8081` |
| Evolution | `Horizons Typebot` open (webhook → n8n); `Meu numero` close desde 06/10; `Financeiro` close desde 26/08 |
| IA | OmniRoute (`http://host.docker.internal:20129/v1`); **chave ainda não salva** em `/configuracoes` |
| Cadastro público Supabase | desligado (`disable_signup=true`); 4 contas não-proprietárias confirmadas ainda existem |
| WPlay | rotas só do proprietário; `.env`: `WWPANEL_WRITES_ENABLED=true`, `WWPANEL_TESTS_ENABLED=true`, demais flags `false` |
| n8n | `Atendimento WhatsApp completo` ativo; `Entrada WhatsApp (Evolution)` inativo; `Envio de lembretes financeiros` **inativo** |
| Fila financeira | 155 renovações `awaiting_bank_review` (backlog de agosto, ver acima); 167 lembretes `planned` |

## Próximos passos

1. Chave já salva e catálogo real com 610 modelos confirmado em 27/10. Dono seleciona os modelos fast/smart/vision e reservas nas listas de `/configuracoes`; salvar e validar com dados sintéticos antes de usar comprovantes reais. Não se confirmou no_log nesta consulta de inferência.
2. Dono: reconectar `Meu numero` e `Financeiro` pelo QR quando puder. Financeiro já é a única instância habilitada para comprovantes e tem webhook pronto. Número controlado e texto/destino confirmados ainda necessários para teste real.
3. Após chave/modelos: ligar texto livre do n8n à interpretação com serialização por telefone e homologação controlada. Não publicar sem validar caminho de erro, duplicidade e ordem.
4. Arquivamento de grupos concluído em 27/10, autorizado pelo dono. Revisar os 84 pedidos privados restantes; preservar revisão humana e não executar baixa automática.
5. IA/WhatsApp disponíveis: piloto de reprocessamento e revisão humana. Mídia antiga pode não estar disponível na Evolution.
6. Lembretes: aprovação na Central, teste com texto/destino confirmados e só então reativação do workflow.
7. Retenção do n8n, modularização do `server/api.js`, decisão sobre recapturar Union/Unix ou manter manual, e conserto do auxiliar global WhatsApp (arquivo de configuração ausente). Código atual não mudou esses fluxos. Tailwind 4 é modernização opcional, não mais requisito para zerar vulnerabilidades do audit atual.

## Decisões registradas

- A memória do projeto fica no repositório (`AGENTS.md` + este arquivo + `docs/historico/`).
- Credenciais, cookies e desafios dos painéis não saem do navegador local nem entram neste arquivo.
- Automação de painel só é habilitada após captura e homologação específica do fluxo.
- WPlay: pagamento sempre validado antes de criar/renovar (Opção B); trial e ativação de app em teste não consomem crédito.
- 2026-10-13: MiniMax/Qwen descontinuados; toda IA passa pelo OmniRoute (ChatGPT/Claude), com chave e modelos configuráveis pelo painel. O OmniRoute continua acessível externamente por decisão do dono.
- 2026-10-13: a IA só classifica e extrai; respostas ao cliente vêm de templates/catálogo; comprovante é evidência para revisão humana, nunca baixa automática.
- GBrain: página `projects/horizons/status` espelha este arquivo quando o MCP estiver disponível.
