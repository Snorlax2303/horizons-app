# Horizons — memória operacional do projeto

> Handoff permanente entre conversas, máquinas e agentes. Atualize ao fim de cada
> rodada relevante; não armazene segredos nem dados de clientes.
>
> Histórico completo até 2026-10-13 (homologações Unix/Union/NOW, Efí, PaggPay,
> n8n, WPlay etc.): `docs/historico/PROJECT_STATUS-ate-2026-10-13.md`.
> Plano em execução: `docs/plano-correcoes-e-melhorias.md`.

## Última revisão

- Data/hora: 2026-10-13 (noite) — Fases 2/3/4 do plano (parte que não depende de WhatsApp nem da chave de IA)
- **Comprovantes — causa do backlog encontrada e corrigida**: até 13/09 não havia instância de comprovantes configurada e o webhook aceitava *qualquer* mídia do número pessoal (inclusive grupos e mensagens do próprio dono) — daí 4.287 "comprovantes" e 155 renovações abertas (71 de grupos, 45 de números desconhecidos, 37 de clientes conhecidos com 179 imagens). Nova regra em `server/evolutionMedia.js`: só conversa privada, nunca `fromMe`, só instância configurada; sem instância configurada, nada vira comprovante.
- **Manutenção do backlog** (`server/routes/receiptMaintenance.js`, botões em `/renovacoes`, somente proprietário, sempre com prévia): `POST /payments/receipts/reprocess` (relê falhas de clientes conhecidos com a IA; marca `media_unavailable` quando a Evolution não devolve mais a mídia) e `POST /payments/receipts/dismiss-groups` (arquiva como `rejected` as ocorrências de grupos, sem apagar). **Nenhum dos dois foi executado** — aguardam chave de IA / decisão do dono.
- **Lembretes**: novas rotas `GET /typebot/billing/reminders/sendable` e `POST /typebot/billing/reminders/:id/sent` (token da ponte do bot, dono fixo; só marca como enviado o que estava `approved`). Workflow n8n `tRtpDjTu1GNkL8Za` atualizado para elas e **continua desativado**.
- **Monitor operacional**: job `health-monitor` no worker a cada 15 min (`server/healthMonitor.js`) avisa no Telegram administrativo: instância Evolution fora de `open`, entrada de WhatsApp parada > 6 h, falha de comprovantes > 50% em 24 h, IA sem configuração. Dedupe em Redis, lembrete a cada 12 h, aviso de "resolvido". Primeira execução entregue (HTTP 200) com 4 problemas. Tela em `/saude` (rota `GET /health/monitor`). Ajustes por env: `HORIZONS_HEALTH_MONITOR_ENABLED`, `HORIZONS_MONITOR_INSTANCES`, `HORIZONS_MONITOR_INBOUND_SILENCE_HOURS`, `HORIZONS_MONITOR_REMIND_HOURS`.
- **Bot com IA (lado servidor)**: `/typebot/ai/interpret` ganhou intenção `installation`, `app_name` casado com a lista real do painel (`panel_app`), MAC extraído do texto por regex (não pela IA), confiança < 0,6 → pergunta, < 0,35 → humano (`handoff`), e log só com modelo/intenção/confiança. **O workflow do n8n ainda não chama essa rota** (precisa da chave de IA e de número controlado).
- **Dependências**: `npm audit fix` (lock gerado com o npm 10 do `node:22-alpine` para o `npm ci` do Docker): crítica `proxy-addr` e `qs` resolvidas; restam 8 (todas da cadeia `tailwindcss` 3, só build — exige migração para Tailwind 4).
- Verificação: 134/134 testes, lint limpo, build ok; smoke do container novo; `api`, `worker` e `frontend` recriados — API 200, front 200.

## Estado atual (verificado em 2026-10-13)

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

1. Dono: salvar a chave do OmniRoute e os modelos em `/configuracoes` (testar conexão e modelos na própria tela).
2. Validar a IA: assistente (Telegram/painel), `/typebot/ai/interpret` e um reprocessamento piloto em `/renovacoes`.
3. Dono: reconectar `Meu numero` (e `Financeiro`, se ainda for usado) e **decidir qual número recebe comprovantes** — hoje só `Horizons Typebot` é aceito, mas o webhook dessa instância vai para o n8n, não para `/webhooks/evolution`.
4. Ligar o ramo de texto livre do bot no n8n à rota de interpretação (com número controlado) e serializar por telefone.
5. Arquivar as 71 ocorrências de grupos (botão em `/renovacoes`, após confirmação do dono).
6. Reativar o workflow de lembretes depois de aprovar lembretes na Central e testar com número controlado.
7. Pendências da Fase 4: retenção de execuções do n8n (exige reiniciar o n8n), remover `SUPABASE_ACCESS_TOKEN`/`WWPANEL_PANEL_*`/`MINIMAX_*` do `.env` de runtime, dividir `server/api.js`, Tailwind 4, decidir automação Union/Unix (69 falhas × 13 sucessos).

## Decisões registradas

- A memória do projeto fica no repositório (`AGENTS.md` + este arquivo + `docs/historico/`).
- Credenciais, cookies e desafios dos painéis não saem do navegador local nem entram neste arquivo.
- Automação de painel só é habilitada após captura e homologação específica do fluxo.
- WPlay: pagamento sempre validado antes de criar/renovar (Opção B); trial e ativação de app em teste não consomem crédito.
- 2026-10-13: MiniMax/Qwen descontinuados; toda IA passa pelo OmniRoute (ChatGPT/Claude), com chave e modelos configuráveis pelo painel. O OmniRoute continua acessível externamente por decisão do dono.
- 2026-10-13: a IA só classifica e extrai; respostas ao cliente vêm de templates/catálogo; comprovante é evidência para revisão humana, nunca baixa automática.
- GBrain: página `projects/horizons/status` espelha este arquivo quando o MCP estiver disponível.
