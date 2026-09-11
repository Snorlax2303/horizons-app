# WPlay (wwpanel) — contrato para o n8n

O painel **WPlay** expõe API HTTP própria. O n8n **não** deve chamar o painel
direto nem guardar a chave `WWPANEL_API_KEY`: ele fala com o Horizons, que é o
único que autentica no painel (`https://mcapi.knewcms.com:2087`) e registra a
operação. Assim a chave permanece só no `.env` protegido e toda escrita passa
pelo gate e pela auditoria.

> Enquanto `WWPANEL_WRITES_ENABLED=false`, todas as rotas de escrita respondem
> `403` sem chamar o painel. Isso é intencional: operações reais consomem
> créditos. Ligue a flag só quando for executar de verdade.

## Autenticação (Horizons)

Todas as chamadas abaixo exigem sessão Supabase do proprietário no header
`Authorization: Bearer <access_token>`, como as demais rotas internas. Em
workflow n8n, use a credencial **Horizons Bot API | n8n**.

## Leitura (nunca consome crédito)

- `GET /api/wplay/status` → `{ configured, writesEnabled, baseUrl }`.
- `GET /api/wplay/catalog` → planos, add-ons, pacotes IPTV/P2P, Krator/Nexus,
  apps, durações aceitas (horas) e produtos de teste. Use os `id` exatamente como
  vêm; não invente IDs.
- `GET /api/wplay/services` → serviços do painel (o `_id` é o `serviceId` exigido
  no teste Krator+).
- `GET /api/wplay/install?product=&brand=&username=&password=` → texto de
  instalação pronto, vindo do catálogo do próprio painel, com a lista de apps
  sugeridos. `product`: `iptv|p2p|krator|nexus|whot`. `brand`: `samsung|lg|roku|
  android|android_tv|desktop|dns`. Preenche `{{usuário}}`/`{{senha}}` quando
  enviados. **Nexus fora de Android responde `found:false` (`nexus_android_only`).**

### Fluxo guiado do cliente (WhatsApp, bot no n8n)

1. Pergunta a marca/aparelho → chama `/api/wplay/install`.
2. Mostra os apps sugeridos; o cliente diz qual encontrou (ou pede o resto da lista).
3. `POST /api/wplay/tests` cria o **teste**.
4. `POST /api/wplay/apps/activate` ativa o app **no teste** — **não consome crédito**.
5. Só depois do **pagamento** a linha de produção é criada/ativada no painel.

## Escrita (consome créditos; gate obrigatório)

| Ação | Rota | Corpo |
| --- | --- | --- |
| Criar teste (trial) | `POST /api/wplay/tests` | `{ product?, package_iptv?, package_p2p?, package_krator?, package_nexus?, serviceId?, testDuration?, whatsapp?, country?, notes?, mac? }` |
| Ativar app do teste | `POST /api/wplay/apps/activate` | `{ nameApp, mac?, namePlaylist?, id_user? }` |
| Criar cliente | `POST /api/wplay/customers` | `{ name, whatsapp?, country?, planId?, package_iptv?, notes? }` |
| Renovar (estender) | `PATCH /api/wplay/customers/:id/extend` | `{ days }` |
| Adicionar +48h | `PATCH /api/wplay/customers/:id/add-48h` | — |
| Trocar plano | `PATCH /api/wplay/customers/:id/plan` | `{ planId?, package_iptv? }` |
| Ativar trial → cliente | `POST /api/wplay/customers/:id/activate` | `{ planId?, package_iptv?, notes? }` |
| Ativar app licenciado (Xtream) | `POST /api/wplay/apps/activate-xstream` | `{ nameApp, email?, password?, id_user? }` |

Notas do teste:

- `testDuration` é **número de horas** (`1,2,4,8,12,24`); `'4h'` também é aceito e
  convertido para `4`.
- `product: 'krator'` usa a rota própria do painel e **exige** `package_krator` +
  `serviceId` (de `/api/wplay/services`). `product: 'nexus'` exige `package_nexus`.
  Sem `product`, o produto é inferido pelos campos enviados; o padrão é `iptv`.

Respostas de erro de negócio do painel chegam como `400`; indisponibilidade do
painel como `502`; escrita desligada como `403`; chave ausente como `503`.

## Recomendações de fluxo no n8n

1. Consulte `/api/wplay/catalog` uma vez e guarde os IDs que o atendimento usa.
2. Só chame as rotas de escrita com intenção explícita do operador.
3. Depois de criar/reutilizar, entregue as credenciais retornadas apenas no
   canal privado correto; não registre usuário/senha em logs de execução.
4. Nada aqui substitui a confirmação humana para ações que consomem crédito.

## Estado

Implementado no Horizons e ligado no workflow do bot (n8n). As rotas de escrita seguem sob
`WWPANEL_WRITES_ENABLED=false`; o bot checa `GET /api/typebot/wplay/status` e só usa o caminho
WPlay quando `enabled:true`, caindo no fluxo antigo caso contrário.

### Rotas da ponte do bot (autenticadas por `x-horizons-bot-token`)

| Rota | Uso |
| --- | --- |
| `GET /api/typebot/wplay/status` | `{ configured, enabled, products }` — decide o caminho. |
| `POST /api/typebot/wplay/install` | Instalação por produto/marca (leitura). |
| `POST /api/typebot/wplay/trials` | Cria o teste e já ativa o app se vier `mac` (escrita). |
| `POST /api/typebot/wplay/app` | Ativa o app de um teste existente pelo MAC (escrita). |
