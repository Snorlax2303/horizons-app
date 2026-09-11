# Operação financeira do Horizons

Fluxo de cobrança, comprovante e recuperação. Nenhum passo deste documento
envia mensagem, cria cobrança ou altera painel externo sem aprovação explícita
do proprietário.

## 1. Método de cobrança por cliente

A RPC `refresh_customer_billing` classifica cada cliente ativo pelo acesso
principal:

- **Link de checkout**: quando o acesso principal possui `checkout_url`.
  O lembrete planejado contém o link para pagamento.
- **Pix por comprovante**: quando existe acesso principal sem checkout.
  O lembrete pede pagamento Pix e envio do comprovante.
- **Manual**: quando não há acesso principal identificado.

A tela **Revisão financeira** (`/revisao`) mostra todos os clientes com o
método, servidor, telas, credenciais e status de recuperação, para revisão um
por um.

## 2. Fila de lembretes

A Central Operacional lista os lembretes planejados com:

- método (link de checkout / Pix por comprovante / manual);
- estágio (`before_3_days`, `due_today`, `overdue_1_day`, `overdue_3_days`);
- prévia da mensagem.

**Aprovar** apenas registra aprovação. Nenhuma mensagem é enviada até existir
destino e template homologados e a autorização de envio do proprietário.

## 3. Reconhecimento de pagamento

Um pagamento é considerado reconhecido quando existe `payment_event` com
`status=paid` para o cliente a partir do dia anterior ao vencimento.

Quando reconhecido:

- lembretes planejados são cancelados;
- o cliente sai da recuperação (status `recovered`).

## 4. Fila de recuperação

Após **14 dias** do vencimento sem pagamento reconhecido, o cliente entra em
`customer_recovery_queue`:

- lembretes planejados são cancelados para **não enviar a segunda vez**;
- o cliente aparece em **Recuperação de clientes** na Central Operacional e na
  Revisão financeira;
- decisões possíveis: **Marcar recuperado** ou **Arquivar**;
- nenhuma nova cobrança automática é planejada para ele até revisão.

## 5. Comprovante recebido no financeiro ou nas vendas

O webhook Evolution aceita mídia (imagem/PDF) de comprovante das instâncias
**financeira** e **de vendas**, quando configuradas:

- deduplica pelo ID da mensagem;
- vincula ao cliente por telefone;
- abre renovação + comprovante para revisão humana;
- **nunca** baixa pagamento sozinho pela imagem.

Para ativar, configurar no ambiente:

```text
EVOLUTION_FINANCE_INSTANCE=
EVOLUTION_SALES_INSTANCE=Horizons Typebot
```

A captura permanece desligada enquanto `EVOLUTION_FINANCE_INSTANCE` estiver
vazia e nenhuma instância de vendas for explicitamente configurada como fonte
de comprovante.

## 6. Homologações pendentes

Antes de enviar qualquer mensagem real:

1. definir a instância Evolution do financeiro e/ou confirmar a de vendas;
2. validar visualmente um comprovante recebido e vinculado ao cliente;
3. aprovar o texto do lembrete por método (checkout/Pix);
4. aprovar o destino financeiro e o template;
5. homologar o envio em um único cliente controlado;
6. só então liberar a fila aprovada.

## 7. Contrato de envio (n8n) — preparado, não disparado

Quando o envio for homologado, o n8n poderá consumir a lista aprovada:

```text
GET /api/billing/reminders/sendable
```

Retorna, para cada lembrete `approved`:

- `message_preview` (texto final aprovado);
- `payment_method` (`checkout` | `pix` | `manual`);
- `checkout_url` quando existir;
- `due_date`, `stage`;
- cliente com `name` e `phone`.

Após o envio real, marcar o lembrete como enviado:

```text
POST /api/billing/reminders/{id}/sent
```

Atualiza `status='sent'`, define `sent_at` e incrementa o controle de
auditoria. Não envia nada.

O script do workflow de cobrança (`tools/create-horizons-billing-workflow.mjs`)
está preparado em modo local (não publicado); gera `Horizons | Envio de
lemretes financeiros | v1` no n8n quando você definir `PUBLISH=true`.

Regras do envio:

- só itens `approved` aparecem na lista;
- o disparo continua desligado até aprovação do proprietário;
- após envio real, marcar `sent` com `sent_at` e incrementar `attempt_count`;
- cliente em recuperação não recebe lembrete (já cancelado);
- comprovante recebido vincula por telefone e segue para revisão.

## 8. Regras de segurança

- Aprovar fila não envia mensagem.
- Comprovante é triagem, não baixa.
- Pagamento reconhecido e renovação no painel são estados diferentes.
- Cliente em recuperação não recebe segunda cobrança automática.
- Nenhuma operação externa sem confirmação explícita.
