# PaggPay

## Callback

Cadastre no painel PaggPay:

`https://iptv.velhaturbo.cloud/api/webhooks/paggpay`

O callback oficial usa `X-Paggpay-Webhook-Signature`, com HMAC-SHA256 sobre
`<timestamp>.<corpo bruto>` e tolerância de cinco minutos. Configure o segredo
`whsec_...` em `PAGGPAY_WEBHOOK_TOKEN`. Além da assinatura, o Horizons não
confia no status recebido: extrai apenas o identificador `txn_*`, consulta
`GET /v1/transactions/{id}` com a chave privada e processa somente a transação
autoritativa retornada pela PaggPay. A correlação usa o UUID da
`renewal_requests` enviado como `reference_id`; valor divergente nunca renova e
vai para revisão.

O parâmetro legado `?token=...` continua aceito apenas enquanto a instalação
não migrar para um segredo `whsec_...`. Nunca coloque a chave da API na URL.

## Cobrança

`POST /api/payments/paggpay/pix` exige sessão Horizons e recebe:

```json
{
  "customer_id": "uuid",
  "amount": 49.9,
  "plan_name": "Plano mensal",
  "external_username": "usuario-no-painel",
  "payer_pays_fee": false
}
```

O endpoint abre a renovação, envia seu UUID como `reference_id`, registra a
transação pendente e devolve QR/EMV. Criar uma cobrança em produção é uma ação
financeira e requer confirmação operacional explícita.

## Typebot

Use `POST /api/typebot/renewals/paggpay` com o header privado
`x-horizons-bot-token`. O corpo é:

```json
{
  "idempotency_key": "{{id_unico_da_sessao}}",
  "phone": "{{telefone}}",
  "amount": 49.9,
  "plan_name": "Plano mensal",
  "external_username": "usuario-no-painel",
  "payer_pays_fee": false
}
```

A mesma `idempotency_key` devolve a cobrança existente e nunca cria um segundo
Pix. O Typebot deve apresentar `pix_copy_paste` e pode renderizar `qr_code`;
nunca deve registrar o header secreto nos logs ou em variáveis públicas.
