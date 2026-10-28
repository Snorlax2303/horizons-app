# Horizons — plano de correções e melhorias (2026-10-13)

Origem: auditoria somente leitura de 2026-10-13 (ver `PROJECT_STATUS.md`).
Decisões do dono nesta rodada:

- O WhatsApp (instâncias Evolution `Meu numero` e `Financeiro`) será reconectado pelo dono.
- MiniMax e Qwen deixam de existir. **Toda IA passa pelo OmniRoute** (API OpenAI-compatível
  em `127.0.0.1:20129/v1`), usando modelos ChatGPT (provedor `codex`) e Claude (provedor
  `claude`), já conectados e ativos no OmniRoute.

## Repriorização após auditoria de 2026-10-26

Antes das fases pendentes: recuperar o Supabase existente (estado INACTIVE confirmado na gestão), conferir integridade/disponibilidade e só então recuperar o worker ausente. API/frontend HTTP 200 não comprovam banco funcional. Verificar jobs e flags de envio antes de iniciar worker; há um health-monitor ativo preso e outro atrasado. Financeiro está desconectado e sem webhook configurado; bot segue ativo no n8n sem rota de IA. As contagens financeiras e ausência de chave de IA de 13/10 não foram revalidadas porque o banco está indisponível.

Validações de 26/10: 134 testes no container Node 22, lint e build aprovados. Nenhum deploy, mensagem, operação de painel ou alteração financeira nesta auditoria. Ordem: banco → worker/monitor → IA → WhatsApp/webhooks → bot serializado → backlog/lembretes → segredos/retenção/dependências/modularização.

## Execução de 2026-10-27

Arquivamento confirmado pelo dono e concluído em transação única: 71 renovações de grupos e 3.930 comprovantes pendentes marcados como rejeitados, sem exclusões. Conferência posterior: 84 renovações privadas aguardando revisão, 357 comprovantes pendentes e nenhum grupo aberto. Dono já possui chave OmniRoute, mas chave/modelos ainda não estavam salvos no Horizons na consulta desta rodada.

## Execução de 2026-10-26

- Banco reativado e consultas autenticadas funcionando; cadastro público continua desligado.
- Worker recuperado; monitor corrigido para reportar indisponibilidade do banco.
- Dono escolheu Financeiro para comprovantes; webhook configurado e exclusividade publicada. Reconexão por QR fica com o dono.
- Valores de credenciais de gestão/painel/MiniMax neutralizados no ambiente dos containers api/worker.
- Vite/Zod e transitivas atualizadas: audit 0; schemas migrados, 136 testes aprovados. Tailwind 4 deixa de ser requisito de segurança para o audit observado.
- Carregamento de páginas sob demanda publicado: JS inicial de 1,38 MB para 562,48 kB. Login renderizado no Chrome; smoke aprovado.
- IA ausente confirmada no banco. Acesso de gestão OmniRoute via CLI retornou 401; dono deve criar chave dedicada e configurar modelos na tela. Nenhuma chave reaproveitada de outro serviço.
- Prévia: 71 renovações de grupos/3.930 comprovantes pendentes. Arquivamento aguardando confirmação específica, sem alterações financeiras.
- Restante: chave/modelos, QR e número controlado; bot IA/serialização; reprocessamento; lembretes; retenção n8n; modularização API; decisão Union/Unix. Nenhum desses passos é considerado concluído.

## Andamento (2026-10-13)

- Fase 0: concluída.
- Fase 1: código e tela publicados; falta o dono salvar a chave/modelos.
- Fase 2: lado servidor pronto (`/typebot/ai/interpret` com entidades e limiares); falta ligar no n8n.
- Fase 3: filtro de mídia corrigido, ferramentas de reprocessamento/arquivamento e rotas de lembretes do bot prontas; aguardam WhatsApp/chave/confirmação.
- Fase 4: monitor no Telegram ativo, `proxy-addr`/`qs` corrigidos, `PROJECT_STATUS.md` enxugado; restante listado em `PROJECT_STATUS.md`.

Regra geral: cada fase termina com testes verdes, deploy controlado (com aviso de impacto) e
atualização do `PROJECT_STATUS.md`. Nenhuma escrita em painel externo, cobrança ou mensagem
proativa sem confirmação explícita.

---

## Fase 0 — Contenção (prioridade imediata)

| # | Ação | Tipo | Observação |
|---|---|---|---|
| 0.1 | Exigir `requireHorizonsOwner` em todas as rotas `/wplay/*` (leitura e escrita) e nas demais rotas que tocam painel externo/crédito | código + teste | Fecha o gasto de crédito por qualquer conta autenticada |
| 0.2 | Desligar cadastro público no Supabase (`disable_signup=true`) e remover a rota `/register` do frontend | config + código | Hoje `disable_signup=false` |
| 0.3 | Até 0.1 estar publicado: `WWPANEL_TESTS_ENABLED=false` | `.env` + recriar `api` | Exige "confirmo" (reinício rápido da API) |
| 0.4 | Versionar `server/auth.js`/`auth.test.js`, commitar o worktree atual e dar push dos 4 commits pendentes | git | Build a partir do Git hoje quebra |
| 0.5 | `.gitignore` cobrir `.env.bak*` e `*.bak-*`; mover backups para fora do repositório | git | Evita commit acidental de segredo |
| 0.6 | Desativar o workflow n8n de lembretes até a Fase 3 | n8n | Para os 401 a cada hora |

## Fase 1 — Camada única de IA via OmniRoute

Substitui `server/minimaxAdmin.js`, `server/minimaxSupport.js` e o caminho MiniMax/OpenAI de
`server/receiptExtractor.js`.

1. **Chave dedicada no OmniRoute** (criada pelo dono no dashboard): nome `horizons`,
   `allowed_models` restrito aos modelos escolhidos, limite por minuto/dia, `no_log` ligado
   (há dados de clientes e comprovantes). Gravar só no `.env` como `OMNIROUTE_API_KEY`.
2. **Configuração** (`server/config.js`, `.env.local.example`):
   - `LLM_BASE_URL=http://host.docker.internal:20129/v1` (já validado: o container `api`
     alcança o OmniRoute; responde 401 sem chave). Decisão do dono: o OmniRoute continua
     acessível externamente (protegido por senha/chave), sem restringir as portas.
   - `LLM_API_KEY`, `LLM_MODEL_FAST`, `LLM_MODEL_SMART`, `LLM_MODEL_VISION`,
     `LLM_FALLBACK_MODELS` (lista; ex.: Claude ↔ GPT), `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`.
   - IDs exatos dos modelos confirmados via `GET /v1/models` com a chave nova.
   - Remover `MINIMAX_*`, `RECEIPT_AI_*` e a chave MiniMax do `.env`.
3. **`server/llm.js`** (cliente único):
   - `chat({ task, messages, schema, images })` → perfil por tarefa (modelo, tokens,
     temperatura), cadeia de fallback, timeout, retry só em 429/5xx.
   - Saída **sempre JSON validado com Zod**; resposta inválida = erro, nunca texto livre
     usado como dado.
   - Log estruturado só com `task`, `model`, `fallback_used`, latência e tokens — sem
     conteúdo, telefone ou imagem.
   - `llmIsConfigured()` substitui os `minimax*IsConfigured`.
4. **Migração dos três usos atuais**:
   | Uso | Arquivo atual | Perfil | Modelo sugerido |
   |---|---|---|---|
   | Leitura de comprovante Pix (visão) | `receiptExtractor.js` | `vision` | Claude Sonnet / GPT com visão |
   | Interpretação de mensagem do cliente (`/typebot/ai/interpret`) | `minimaxSupport.js` | `fast` | Claude Haiku / GPT mini |
   | Assistente administrativo (Telegram) | `minimaxAdmin.js` | `smart` | Claude Sonnet / GPT |
5. **Testes**: trocar os testes MiniMax por testes de `llm.js` com `fetch` simulado
   (fallback, JSON inválido, timeout, 429) e testes de contrato por tarefa.
6. **Saúde**: `/saude` e `SaudeIntegracoes.jsx` passam a mostrar "IA (OmniRoute)" com
   modelo e status, no lugar de MiniMax.

## Fase 2 — Boteamento com IA (bot do WhatsApp no n8n)

Hoje o n8n decide por regras (`Decidir etapa`) e **não chama IA**. Modelo proposto, híbrido:

1. Botões/menus continuam determinísticos (rápidos e previsíveis).
2. Texto livre → `POST /typebot/ai/interpret` (perfil `fast`) devolve
   `{ intent, confidence, entities }`:
   - intents: `comprar`, `teste`, `instalar`, `suporte`, `pagamento`, `renovar`, `humano`, `outro`;
   - entidades: marca/aparelho, app, MAC, plano, menção a comprovante.
3. `confidence` abaixo do limite → handoff humano (`/typebot/handoffs`).
4. A IA **só classifica e extrai**; respostas ao cliente vêm de templates e do catálogo do
   painel (`GET /panel-links`). Respostas geradas livremente, só para FAQ com base nos
   manuais, e numa etapa posterior.
5. Serializar o processamento por telefone (pendência anotada em 2026-09-14) para eliminar
   menus fora de ordem.
6. Imagem recebida num contexto de pagamento → extração (Fase 1) → vínculo com a renovação →
   fila de revisão humana. Comprovante continua sendo **evidência, não baixa automática**.

## Fase 3 — Retomar a operação (depende do WhatsApp reconectado)

1. Dono reconecta `Meu numero` e `Financeiro`; confirmar que `lead_events` volta a crescer e
   que `/webhooks/evolution` recebe tráfego.
2. **Lembretes**: criar rota da ponte do bot (`/typebot/billing/reminders/sendable` e
   `/typebot/billing/reminders/:id/sent`, com `x-horizons-bot-token`) ou ajustar o workflow ao
   contrato atual; disparo só para lembretes `approved`. Reativar o workflow após teste com
   número controlado.
3. **Comprovantes**: reprocessar os 4.287 `pix_receipts` com falha em lotes pequenos (piloto
   de 20, medir acerto, depois lotes com limite de taxa). Risco: a mídia está referenciada
   como `evolution:<messageId>` — depende de a Evolution ainda ter a mídia armazenada após a
   reconexão. Se não tiver, marcar como `media_unavailable` e revisar manualmente.
4. Revisar o backlog de 155 `renewal_requests` em `awaiting_bank_review` com os dados extraídos.

## Fase 4 — Segurança, observabilidade e qualidade

1. **Alertas no Telegram administrativo**: instância Evolution `close`; `lead_events` sem
   entrada por mais de X horas; workflow n8n com erro repetido; extração com taxa de falha
   alta. (Teria detectado a queda de 7 dias.)
2. **n8n**: o workflow de Afiliados gera ~700 execuções/dia e expulsa o histórico do Horizons
   (poda em 10.000). Desligar o salvamento de execuções de sucesso dele ou aumentar o limite.
3. **Dependências**: atualizar Express/`proxy-addr` (crítica) e `qs`; planejar Vite/Tailwind.
4. **Segredos no runtime**: tirar `SUPABASE_ACCESS_TOKEN` (token de gestão) e
   `WWPANEL_PANEL_USER/PASS` do `.env` carregado por `api`/`worker`; manter só no ambiente
   de operação.
5. **Automação de painéis por navegador**: 69 falhas × 13 sucessos (Union/Unix). Decidir
   entre recapturar os fluxos ou priorizar painéis com API (WPlay) e manter os outros manuais.
6. **Código**: dividir `server/api.js` (3.351 linhas) em módulos `routes/typebot`,
   `routes/webhooks`, `routes/agent`, `routes/admin`; code-split do bundle (1,37 MB).
7. **Documentação**: mover o histórico do `PROJECT_STATUS.md` (272 KB) para
   `docs/historico/` e manter o status atual enxuto; atualizar a tabela de rotas do README
   (`/wplay`, `/saude`, `/novo-acesso`, `/baixa`).

---

## Pendências que só o dono fecha

| Item | Para quê | Fase |
|---|---|---|
| Reconectar `Meu numero` e `Financeiro` (QR Code) | Entrada de mensagens e comprovantes | 3 |
| Criar a chave `horizons` no OmniRoute e informar os modelos preferidos | Camada de IA | 1 |
| "confirmo" para recriar `api`/`worker` em cada deploy | Publicar correções | 0–4 |
| Confirmar desligamento do cadastro público | Contenção | 0 |
| Número controlado para teste do bot e dos lembretes | Homologação | 2–3 |
| Decisão sobre painéis Union/Unix (recapturar ou manual) | Automação | 4 |

## Riscos

- **Assinaturas ChatGPT/Claude via OAuth**: o OmniRoute usa contas de assinatura (provedores
  `codex` e `claude`). Uso automatizado contínuo pode bater em cota ou nos termos de uso do
  provedor. Mitigação: fallback entre os dois, limite por chave no OmniRoute e, no médio
  prazo, chave de API oficial para produção.
- **Dados sensíveis enviados a terceiros**: comprovantes e mensagens de clientes passam a ir
  para OpenAI/Anthropic. Enviar só o necessário, usar `no_log` na chave e nunca enviar
  credenciais IPTV no prompt.
