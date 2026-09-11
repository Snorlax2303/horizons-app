# Guia operacional do Horizons

Documento de referência por papel para operação segura do Horizons, sem
credenciais ou dados pessoais. O detalhamento técnico e de integrações está em
`docs/` e a memória operacional em `PROJECT_STATUS.md`.

## Papel: Operador (atendimento e rotina)

Responsável por operar o painel no dia a dia e encaminhar casos que exigem
decisão do proprietário.

### Rotina diária

1. Abrir **Central Operacional** (`/central`) e conferir as **Prioridades de hoje**:
   - comprovantes para revisão;
   - pendências cadastrais;
   - códigos vencendo em 7 dias;
   - lembretes planejados.
2. Resolver pendências cadastrais em **Clientes**:
   - servidor não definido;
   - credenciais pendentes;
   - telefone ou nome pendente;
   - cliente com mais de um servidor.
3. Revisar **Renovações**:
   - comprovantes pendentes;
   - valor, data, banco e E2E conferidos com a fonte;
   - rejeitar ou solicitar novo comprovante quando houver divergência;
   - confirmar somente após conferir o crédito real.
4. Conferir **Cobranças Pix** e a fila aprovada.
5. Verificar **Saúde e integrações** (`/saude`) se houver suspeita de falha.
6. Consultar **Logs e auditoria** (`/logs`) para webhooks recentes quando
   houver erro de integração.

### Regras obrigatórias

- Nunca confirmar pagamento sem conferência humana.
- `pagamento confirmado` não significa renovação no painel externo.
- Comprovante é evidência para triagem, não baixa automática.
- Não enviar mensagens proativas sem autorização.
- Não repetir operações indefinidamente em caso de erro; registrar e escalar.

## Papel: Administrador (proprietário)

Responsável por autorizar escritas, configurações, integrações e homologações.

### Responsabilidades

- Preencher credenciais dos acessos reais em **Clientes → Gerenciar acesso**.
- Autorizar criação, renovação ou alteração em painéis externos.
- Configurar instâncias Evolution (vendas/suporte/financeiro) no ambiente.
- Aprovar lembretes financeiros e acompanhar a fila.
- Revisar comandos de escrita do assistente no Telegram com confirmação.
- Decidir upgrade de dependências e mudanças estruturais.

### Confirmação para escrita

Ações como cadastro, alteração de cliente, vínculo de acesso e cobrança exigem
confirmação explícita. O canal Telegram administrativo deve ter allowlist de um
único operador e chat privado.

## Papel: Homologação

Checklists e roteiros de validação:

- `docs/validacao-fluxo-financeiro.md` (renovação/comprovante/webhook);
- página pública `/checklist-validacao-financeira.html` para revisão remota;
- homologação de painéis externos deve usar telefone controlado e chamada
  autorizada.

## Fluxo de contingência

- Falha na API: verificar `/health` e logs; reiniciar somente o container
  afetado com impacto comunicado.
- Falha no worker: conferir Redis e fila; não reprocessar manualmente sem
  entender o erro.
- Instância Evolution desconectada: repare o QR code manualmente; não tentar
  automação de login.
- Pagamento confirmado sem renovação: revisar manualmente no painel; não criar
  nova cobrança automática sem evidência.

## Segurança

- Nunca colocar tokens, senhas ou dados de clientes em código, Git, logs ou
  documentação.
- `.env` protegido somente na VPS.
- Credenciais IPTV somente nos campos protegidos do banco.
- Auditoria e logs estruturados não devem conter payloads de webhook.
