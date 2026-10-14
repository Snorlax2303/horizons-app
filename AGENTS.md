# Horizons — instruções permanentes para agentes

## Fonte de verdade entre conversas

Antes de analisar, alterar ou executar qualquer tarefa neste repositório, leia
integralmente `PROJECT_STATUS.md` (estado atual) e consulte
`docs/historico/PROJECT_STATUS-ate-2026-10-13.md` quando precisar do histórico
detalhado de uma integração. Ele é a memória operacional durável do
Horizons e deve permitir que um agente novo retome o projeto sem depender do
histórico de conversa.

Quando o MCP `gbrain` estiver disponível, consulte também a página
`projects/horizons/status` antes de iniciar uma tarefa nova. O arquivo local
continua sendo a fonte de verdade em caso de divergência, pois é versionável e
fica junto do código.

Antes de encerrar **toda rodada de trabalho relevante**, atualize
`PROJECT_STATUS.md` com fatos verificáveis: o que mudou, o que foi validado,
problemas encontrados, decisões, estado dos serviços e o próximo passo. Faça
isso também quando a rodada for apenas de diagnóstico. Não registre senhas,
tokens, cookies, URLs assinadas, dados pessoais de clientes ou qualquer outro
segredo. Se não houve descoberta nem mudança material, atualize apenas o campo
`Última revisão` e mantenha o restante intacto.

O resumo entregue ao usuário não substitui essa atualização. Ao iniciar um chat
novo, o comando suficiente é: `Continue o Horizons em /root/horizons-app e leia
o contexto do projeto.`

Depois de atualizar `PROJECT_STATUS.md`, sincronize a página
`projects/horizons/status` no GBrain quando o MCP/CLI estiver disponível. Não
grave segredos no GBrain; a configuração de credenciais pertence somente ao
ambiente restrito do MCP.

## Segurança e operação

- Preserve alterações não relacionadas no worktree; ele pode estar propositalmente sujo.
- Nunca exponha nem grave conteúdo de `.env`, credenciais de painéis, cookies ou tokens.
- Credenciais de acesso IPTV de clientes (usuário, senha, DNS/servidor, validade
  e plano) são dados operacionais autorizados pelo proprietário do projeto para
  recebimento, análise, importação e atualização nos cadastros do Horizons. Elas
  devem ser armazenadas somente nos campos próprios do banco, usando a proteção
  já prevista pela aplicação. Não confundir esses dados com credenciais de
  infraestrutura ou de painéis administrativos.
- Mesmo autorizadas para tratamento operacional, credenciais IPTV individuais
  e dados pessoais de clientes não devem ser copiados para código-fonte, Git,
  `PROJECT_STATUS.md`, GBrain, logs públicos ou respostas destinadas a terceiros.
  Em diagnósticos e resumos, mascarar os valores; quando o usuário fornecer os
  dados no chat, utilizá-los apenas para a operação solicitada.
- Painéis IPTV: logins, CAPTCHA e desafios são sempre manuais. Automação só pode
  operar um fluxo previamente capturado/homologado e dentro das capacidades da
  conexão.
- Antes de criar acesso, renovar ou alterar dados em um painel externo, explique
  a ação e obtenha confirmação explícita do usuário.
- O agente local de painéis faz apenas conexões HTTPS de saída ao Horizons; não
  solicitar que o usuário envie credenciais do painel para a VPS.
- Para serviços, use `docker compose -f docker-compose.vps.yml ...`. Não pare ou
  reinicie serviços sem motivo e sem comunicar o impacto.

## Verificação mínima

Após mudança de código, rode a verificação proporcional (por exemplo, lint,
build ou testes focados). Para mudanças de deploy, confirme API e frontend em
`127.0.0.1:8081` e `127.0.0.1:3100`, respectivamente, sem revelar segredos.
