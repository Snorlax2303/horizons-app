# BotBot, Typebot e Union

## Fluxo recomendado de criação de teste no Union

O Horizons pode chamar diretamente o link tokenizado gerado em **Teste
Automático** no Union. Assim, o Typebot controla a conversa e usa um bloco HTTP
com esta configuração:

1. método `POST`;
2. URL `https://iptv.velhaturbo.cloud/api/typebot/union/tests`;
3. header `x-horizons-bot-token` com o segredo configurado somente no Typebot;
4. corpo JSON:

```json
{
  "idempotency_key": "{{identificador_unico_da_solicitacao}}",
  "phone": "{{telefone}}",
  "name": "{{nome}}",
  "prospect_id": "{{prospect_id_retornado_pela_triagem}}"
}
```

Antes deste bloco, `POST /api/typebot/intake` deve cadastrar a conversa e
devolver `prospect_id`. O identificador deve ser estável para a mesma solicitação e diferente para cada
novo teste. A resposta `201` contém `test.username`, `test.password`,
`test.reply` e `test.payment_url`. O Typebot deve enviar `test.reply` ao cliente
e não registrar a senha em logs. Uma resposta `409` indica que a mesma
solicitação já foi processada e não deve ser repetida.

Como alternativa legada, o link do Union ainda pode ser cadastrado diretamente
no BotBot em **Chatbot → Criar Resposta**, usando resposta do tipo **URL** e uma
palavra-chave exclusiva.

A URL original do Union e o valor do header são credenciais. Eles não devem
entrar no frontend, Git, mensagens ou logs; o Typebot deve guardar apenas o
header secreto no bloco HTTP.

## Ponte Horizons

- `POST /api/webhooks/botbot`: recebe e audita eventos reais do BotBot. Exige
  `x-horizons-bot-token` ou `?token=...` quando a interface de resposta URL não
  permitir headers.
- `POST /api/typebot/botbot/messages`: endpoint para bloco HTTP do Typebot
  enviar WhatsApp pelo BotBot. Exige `x-horizons-bot-token`.
- `POST /api/typebot/union/tests`: cria o teste diretamente no Union, devolve a
  mensagem pronta uma única vez e bloqueia duplicidade por `idempotency_key`.
- `POST /api/typebot/intake`: identifica cliente/lead e persiste a triagem.
- `GET /api/typebot/offers` e `POST /api/typebot/orders`: consultam catálogo e
  criam proposta sem aceitar preço vindo da conversa.
- `POST /api/typebot/guides/recommend`: escolhe o manual por aparelho.
- `POST /api/typebot/handoffs`: abre atendimento de Vendas, Suporte ou Financeiro.
- `POST /api/integrations/botbot/messages`: envio administrativo autenticado
  por uma sessão Horizons.
- `GET /api/integrations/botbot`: estado da integração e últimos eventos do
  usuário autenticado.

Variáveis exclusivas do backend:

- `BOTBOT_API_URL`
- `BOTBOT_AUTH_KEY`
- `BOTBOT_APP_KEY`
- `BOTBOT_WEBHOOK_TOKEN`
- `TYPEBOT_API_URL`
- `TYPEBOT_PUBLIC_ID`
- `UNION_TEST_URL_DEFAULT`

O webhook de entrada do BotBot permanece somente para auditoria. A criação
direta do teste é independente dele e só ocorre quando o bloco HTTP específico
do Typebot chama `/api/typebot/union/tests`.
