# WPlay — produtos, telas e orientação de instalação

Fonte de verdade do **catálogo de instalação**: o próprio painel, em
`GET /panel-links` (15 itens) — códigos Downloader, códigos de Play Store
(M7 Download / XS Control / Loja SSH e ntDown), links diretos, lojas e o canal
por plataforma. **Não duplicar esse conteúdo aqui**: ele muda no painel e este
documento envelheceria. Aqui fica só o **esquema** (o que é o quê e para quem).

## Planos e adicionais (lidos de `GET /products`)

| id | Nome | Tipo | Streamings | Telas (o que o cliente recebe) |
| --- | --- | --- | --- | --- |
| 2 | Essencial 2 IPTV + 1 P2P | plano | P2P, IPTV | 2 telas IPTV + 1 tela P2P |
| 5 | Premium 1 IPTV + 2 Nexus | plano | IPTV, NEXUS | 1 tela IPTV + 2 telas Nexus |
| 11 | Ultra 1 Krator+ | plano | WHOT, KRATOR | 1 tela Krator+ (híbrido) + Whot |
| 10 | Whot | plano | WHOT | Whot (conteúdo adulto) — à parte |
| 7 | Nexus | adicional | NEXUS | +1 tela Nexus |
| 8 | IPTV e P2P | adicional | P2P, IPTV | +IPTV/P2P |
| 9 | Whot | adicional | WHOT | +Whot |
| 12 | Krator+ | adicional | KRATOR | +1 tela Krator+ |

> Atenção: o plano **Ultra 1 Krator+ (11)** já vem com os streamings **WHOT + KRATOR**.
> Se a intenção é manter o adulto como plano separado, isso precisa ser decidido e
> conferido no painel (hoje o Ultra carrega Whot junto).

## Compatibilidade por produto (evidência do catálogo do painel)

- **Krator+** — Android (Link direto, Downloader, Play Store M7/XS Control/Loja SSH e ntDown),
  **Roku Store**, **LG Store** e **Samsung Store** (todas: "busque por Krator+"), Celular
  Android (Play Store) e Apple Store ("muito em breve").
- **Nexus** — só aparece com canais **Android** (Link direto, Downloader, Play Store, site).
  O catálogo **não** menciona Roku/LG/Samsung para Nexus → **indício forte de que é
  Android-only**. Confirmar antes de prometer em TV de outra marca.
- **IPTV / P2P** — Android TV (via app **TV Bro** + loja WPlay), **LG/Samsung/Roku**
  (apps recomendados: WTV Player, Kplay, Brasil IPTV [Code: `wplay`], XCloud TV
  [Provider: `warez`]), Windows e macOS, celular Android.
- **TVs por DNS/STB (SmartUP)** — canais DNS STB (V2/V3/v3²) e SmartUP.
- **Whot** — acesso em `whot.me`.

## O fluxo de orientação já tem modelo no painel

O template `[IPTV] LG/Samsung/Roku` é exatamente o desenho pedido:

> Aplicativos recomendados: WTV Player · Kplay · Brasil IPTV (Code: `wplay` + usuário e senha)
> · XCloud TV (Provider: `warez` + usuário e senha)
> "Alguns aplicativos podem não estar disponíveis no modelo da sua TV, tente todas as sugestões!"

Ou seja: por marca → lista de apps prováveis → o cliente diz **qual ele encontrou** →
instala → manda o **MAC** (ou o código do app) → ativamos no painel.

## Fluxo guiado (a implementar)

1. Perguntar a marca/aparelho (Samsung, LG, Roku, Android TV/Fire Stick, TV Box, celular, PC).
2. Mostrar os apps prováveis daquela marca (do catálogo do painel).
3. Cliente achou → instala e informa **MAC** (ou código do app).
4. Cliente **não** achou → bot mostra **o resto da lista**; cliente escolhe e informa o MAC.
5. Ativação: `POST /lines/active/app` (ou `/xstream` para WTV Player/Wapp, XCloud, Kplay)
   com `{ nameApp, mac, namePlaylist: <nome do usuário>, id_user }`.

## Decisões confirmadas pelo dono (2026-09-11)

- **Nexus é Android-only** — não oferecer em LG/Samsung/Roku.
- **Whot não terá plano próprio** — sai apenas embutido no **Ultra 1 Krator+** (comportamento
  atual do painel está correto).
- **O fluxo guiado roda no bot do cliente (WhatsApp, bot rodando no n8n)** — **não é mais
  Typebot**. O Telegram do dono é assistente pessoal (consultas, alterações, crons do Horizons
  e dos painéis, preferencialmente o painel warez/WPlay).

## Fluxo aprovado — teste, app e pagamento

1. Cliente conversa com o bot, informa a marca/aparelho.
2. Bot consulta `GET /wplay/install` e mostra os apps sugeridos pela própria marca.
3. Cliente diz qual encontrou (ou pede o resto da lista) e informa o **MAC** da TV.
4. Bot cria o **teste** (`POST /wplay/tests`) e **ativa o app no próprio teste**
   (`POST /wplay/apps/activate` com `id_user` = id do teste).
   **Ativar app em teste não consome crédito** — o cliente já assiste durante o trial.
5. Só **depois do pagamento** a linha de produção é criada/ativada no painel.

Consequência: o vínculo com a linha precisa ser guardado no cliente (`external_line_id` /
`external_test_line_id` / `external_line_kind` — migração `20260911120000_wplay_customer_lines.sql`),
porque é o `id_user` que amarra a ativação do app, não o MAC sozinho.

## Pontos em aberto

