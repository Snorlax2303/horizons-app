# Renovação por Pix manual e comprovante

O comprovante é evidência para triagem, não confirmação de liquidação. Somente
uma pessoa conferindo o crédito no banco pode mover a solicitação para
`payment_confirmed`.

## Fluxo

1. Identificar cliente pelo WhatsApp e recuperar o checkout salvo.
2. Priorizar o checkout do painel para renovação automática.
3. Se o cliente escolher Pix direto, informar chave, valor e solicitar o comprovante.
4. Associar imagem/PDF à solicitação aberta daquele telefone.
5. Extrair valor, horário, pagador, recebedor, banco, E2E e indicação de agendamento.
6. Validar valor, destinatário, data, legibilidade e duplicidade do E2E.
7. Exibir na fila humana como `awaiting_bank_review`.
8. Após conferência bancária, criar o evento de pagamento e reutilizar a fila de renovação existente.
9. Após renovação manual/automática, enviar confirmação ao cliente.

## Regras de segurança

- Nunca confirmar por OCR/IA isoladamente.
- Bloquear reutilização do mesmo E2E por proprietário.
- Comprovante agendado, antigo, ilegível, de valor divergente ou destinatário incorreto exige revisão.
- Nome do pagador diferente é alerta, não rejeição automática.
- A referência da mídia deve ser privada e temporária; não persistir base64 no banco.
- Toda mudança de estado deve ser idempotente e auditável.

## Extração

A primeira versão usa um adaptador: pode receber campos preenchidos pelo
operador ou por um extrator multimodal. A confiança é calculada por campo e as
regras determinísticas têm precedência sobre a interpretação do modelo.

## Contratos de integração

- `POST /api/renewals`: abre uma solicitação e persiste checkout/plano/valor.
- `POST /api/renewals/:id/receipts`: registra mídia e resultado estruturado da extração.
- `POST /api/renewals/:renewalId/receipts/:receiptId/review`: exige decisão humana.
- `GET /api/renewals`: alimenta a fila operacional no painel.

O Typebot deve guardar o `renewal.id` na sessão. A Evolution deve entregar a
referência privada da mídia ao adaptador; somente o resultado estruturado entra
no endpoint de comprovantes. A mídia não deve ser pública nem enviada em base64.

O checkout CineHub/Stripe converge por outro adaptador: o webhook cria um
`payment_event`, correlaciona-o à solicitação por referência/metadata e chama a
mesma rotina de pagamento confirmado. A correlação exata será homologada depois
que o CineHub estiver configurado e um evento Stripe real puder ser inspecionado.
