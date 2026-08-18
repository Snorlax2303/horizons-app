# Assistente administrativo do Horizons no WhatsApp

## Objetivo

Permitir que o proprietário consulte e opere o Horizons por um número WhatsApp
administrativo separado do atendimento aos clientes. Uma API de IA interpreta
linguagem natural, mas nunca executa diretamente no banco ou nos painéis.

## Identidade e segurança

- Aceitar comandos somente de números administrativos previamente autorizados.
- Exigir segundo fator ou PIN temporário ao iniciar uma sessão administrativa.
- Sessões curtas, expiração automática e bloqueio após tentativas inválidas.
- Separar ferramentas somente de leitura das ferramentas que alteram dados.
- Exigir resumo e confirmação explícita para renovar, migrar servidor, trocar
  plano/telefone/credenciais, cancelar ou realizar qualquer operação financeira.
- Nunca enviar senha completa em grupos. Em conversa privada autenticada,
  revelar credenciais somente sob pedido explícito, com auditoria e mensagem
  efêmera quando o transporte permitir.
- Registrar solicitante, comando interpretado, ferramenta, alvo, antes/depois,
  confirmação, resultado e horário. Nunca registrar senha em texto simples.
- A IA produz uma intenção estruturada; uma camada determinística valida schema,
  permissão, cliente, limites e idempotência antes de executar.

## Consultas planejadas

- Localizar cliente por nome, telefone, usuário ou ID.
- Consultar servidor, plano, vencimento, status, telefone e histórico.
- Recuperar checkout permanente durante atendimento manual.
- Recuperar acesso/credenciais cifradas sob autenticação reforçada.
- Consultar recebimentos do dia/período, inadimplentes e valores pendentes.
- Informar novos clientes e testes na semana, mês ou intervalo solicitado.
- Resumir funil: contatos, testes, conversões, pagamentos e ativações.

## Alterações planejadas

- Corrigir nome ou telefone.
- Trocar plano.
- Registrar/ajustar renovação somente no Horizons, sem executar no painel.
- Solicitar renovação real no painel como operação distinta e mais crítica.
- Migrar um acesso entre KYROS, VORNAK, KRONOS, ZEUS, FENIX e P2P.
- Atualizar usuário, senha, DNS, validade e checkout após manutenção.
- Registrar motivo da migração e preservar o histórico do acesso anterior.

## Separação de estados

- `horizons_renewal_recorded`: controle interno atualizado; não prova renovação.
- `payment_confirmed`: pagamento confirmado; não prova ativação no painel.
- `panel_renewal_requested`: solicitação enviada ao painel.
- `panel_renewal_confirmed`: painel confirmou nova validade/acesso.
- O bot deve dizer explicitamente qual desses estados foi alterado e nunca usar
  apenas "renovado" quando a operação ocorreu somente no Horizons.
- Ajustes internos exigem confirmação simples e auditoria. Chamadas ao painel,
  mudanças financeiras, migrações e exposição de credenciais exigem confirmação
  reforçada e, quando aplicável, verificação posterior do resultado externo.
- No fluxo atual, o Horizons não possui acesso para comandar ou consultar a
  renovação feita pelo checkout CineHub. A PaggPay confirma o pagamento, e o
  checkout/painel deve tentar renovar automaticamente, mas sem evidência do
  CineHub o estado correto é `renewal_expected`, nunca `panel_renewal_confirmed`.
- O período pode ser calculado automaticamente somente quando a transação
  estiver correlacionada a um checkout/cliente/plano e a tabela de preços
  produzir uma única combinação possível. Valor isolado, horário aproximado ou
  telefone não bastam. Casos ambíguos seguem para revisão manual.
- Depois do pagamento, registrar prazo esperado e abrir uma janela de exceção:
  se o cliente informar que não renovou, encaminhar para manutenção sem cobrar
  novamente e preservar pagamento e tentativa no histórico.

## Modelo de servidor do cliente

Cada acesso deve apontar para um servidor cadastrado no Horizons e possuir
histórico temporal. Uma migração encerra o vínculo anterior e cria um novo,
sem apagar o passado. Todos os servidores pertencem ao provedor CineHub, mas
permanecem identificados individualmente para manutenção e relatórios.

## Padrão de teste

- Cliente: KYROS, 6 horas.
- Cliente escolhe apenas completo ou sem adultos.
- Outros servidores e durações ficam disponíveis somente para atendente/admin,
  contingência, diagnóstico ou substituição de servidor.

## Fases

1. Modelar servidores, acessos e histórico de migração.
2. Criar API administrativa com ferramentas pequenas e auditáveis.
3. Implementar autenticação reforçada e confirmações.
4. Ligar a API de IA apenas ao interpretador de intenções.
5. Conectar um número WhatsApp administrativo separado via Evolution.
6. Homologar primeiro consultas; depois alterações reversíveis; por último,
   renovações, migrações e operações financeiras.

## Estado implementado em 2026-08-05

- MiniMax M2.7 com fallback M3 e schema estrito de intenções.
- API privada autenticada e restrita ao proprietário em modo somente leitura.
- Ferramentas: localizar cliente, resumo, checkout, inadimplentes e métricas.
- Auditoria persistente de interpretação e execução sem senhas.
- Catálogo KYROS/VORNAK/KRONOS/ZEUS/FENIX/P2P e histórico de migração.
- Estrutura de confirmações temporárias pronta no banco.
- `ADMIN_ASSISTANT_WRITES_ENABLED=false` e
  `ADMIN_ASSISTANT_WHATSAPP_ENABLED=false` por padrão.
- Pendências externas: número administrativo, allowlist, PIN/segundo fator e
  homologação das consultas antes de liberar qualquer escrita.
