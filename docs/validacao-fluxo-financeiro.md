# Checklist de validação financeira — Horizons

Este documento serve para a revisão manual do operador. A validação deve ser
feita primeiro em ambiente controlado, sem enviar mensagens reais ou confirmar
pagamentos reais sem autorização explícita.

## 1. Preparação

- [ ] Confirmar que o acesso do operador é o proprietário correto.
- [ ] Confirmar que existem planos com valor e quantidade de telas corretos.
- [ ] Confirmar que o cliente de teste está identificado pelo telefone correto.
- [ ] Confirmar que o cliente possui ou não possui acesso principal conforme o
      cenário que será testado.
- [ ] Confirmar que a instância de comunicação usada no teste é a correta.
- [ ] Confirmar que o destino financeiro ainda não está habilitado para disparo
      automático durante a revisão.

## 2. Abrir uma renovação

A renovação pode ser aberta pelo painel ou pela jornada Typebot.

Verificar:

- [ ] O cliente correto aparece na renovação.
- [ ] O telefone é normalizado sem perder o DDD.
- [ ] O plano e o valor esperado estão corretos.
- [ ] A renovação começa em `awaiting_receipt` quando aguarda comprovante.
- [ ] Cliente inexistente é recusado.
- [ ] Uma tentativa duplicada não cria uma renovação indevida.

Resultado esperado: a solicitação fica registrada, mas nenhum pagamento é
considerado confirmado e nenhum painel externo é alterado.

## 3. Registrar comprovante Pix

Testar, de preferência, um comprovante de homologação ou um payload sem dados
reais.

- [ ] O comprovante é associado à renovação correta.
- [ ] Valor divergente aparece como sinalização de validação.
- [ ] Data agendada ou inconsistente fica sinalizada.
- [ ] E2E repetido é recusado como duplicado.
- [ ] Comprovante incompleto não vira pagamento confirmado.
- [ ] O estado da renovação muda para `awaiting_bank_review`.
- [ ] A tela mostra claramente que ainda falta revisão humana.

Importante: OCR/IA é somente triagem. A imagem nunca deve produzir baixa
financeira definitiva sozinha.

## 4. Revisar comprovante

Na tela **Renovações**:

- [ ] Abrir o comprovante pendente.
- [ ] Conferir cliente, valor, data, banco e E2E contra a fonte financeira.
- [ ] Testar **Rejeitar**: o estado deve ficar `rejected`.
- [ ] Testar **Solicitar outro comprovante**: deve voltar a `awaiting_receipt`.
- [ ] Confirmar somente quando o crédito estiver realmente conferido.
- [ ] Conferir que a revisão registra operador e horário.

Ao confirmar, o sistema pode preparar a renovação interna/operação de painel,
mas isso não prova que o painel externo renovou o acesso.

## 5. Separação dos estados

Confirmar visualmente que o sistema diferencia:

- cobrança criada;
- pagamento pendente;
- pagamento confirmado;
- renovação aguardando operação;
- operação de painel pendente de aprovação;
- operação executada;
- renovação confirmada externamente.

Nunca considerar `payment_confirmed` como equivalente a
`panel_renewal_confirmed`.

## 6. Webhook de pagamento

Com payload controlado e assinatura válida:

- [ ] Assinatura inválida retorna 401.
- [ ] Payload inválido retorna 400.
- [ ] Evento repetido não cria duplicidade.
- [ ] Evento pago conhecido é associado ao cliente correto.
- [ ] Cliente de outro proprietário não é processado.
- [ ] Cliente sem acesso vinculado vai para revisão manual.
- [ ] Conexão sem capacidade de renovação não é executada automaticamente.
- [ ] Operação automática só entra na fila quando a conexão está conectada e
      homologada.

## 7. Fila da Central Operacional

Na tela **Central Operacional**:

- [ ] Atualizar o resumo sem erro.
- [ ] Conferir tarefas abertas.
- [ ] Conferir lembretes planejados.
- [ ] Aprovar um lembrete e confirmar que a tela informa que nenhuma mensagem
      foi enviada.
- [ ] Cancelar um lembrete e confirmar o estado.
- [ ] Resolver/ignorar uma tarefa.
- [ ] Baixar erros de uma importação bloqueada.
- [ ] Conferir códigos vencendo em até sete dias.

## 8. Critérios de aprovação

O fluxo só deve ser considerado homologado quando:

- [ ] não houver duplicidade de pagamento ou renovação;
- [ ] nenhuma confirmação depender somente de valor/telefone/horário;
- [ ] comprovantes divergentes forem encaminhados para revisão;
- [ ] nenhuma mensagem for disparada sem aprovação/configuração;
- [ ] nenhuma operação de painel ocorrer sem conexão homologada;
- [ ] todos os estados forem visíveis e auditáveis;
- [ ] o operador conseguir identificar o que foi confirmado e o que ainda está
      pendente.

## 9. Pendências para registrar após o teste

- Cenário testado:
- Data/hora:
- Operador:
- Resultado:
- Tela/rota onde ocorreu:
- Mensagem de erro, se houver:
- Estado antes:
- Estado depois:
- Foi enviada mensagem? (sim/não)
- Foi criado pagamento real? (sim/não)
- Foi alterado painel externo? (sim/não)
- Observações:
