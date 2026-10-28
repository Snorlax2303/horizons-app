# Horizons

Central operacional para gestão de clientes, acessos IPTV, testes assistidos,
renovações, comprovantes e integrações de atendimento.

O Horizons concentra a operação interna com rastreabilidade e confirmação
explícita para ações sensíveis. Ele não deve ser tratado como um disparador
irrestrito de mensagens nem como automação autônoma de painéis externos.

## Visão geral

O sistema oferece:

- cadastro, busca e manutenção de clientes;
- planos, valores, telas e vencimentos;
- vínculo e histórico de acessos por servidor;
- importação segura de clientes e acessos via CSV UTF-8;
- testes CineHub/Union com prevenção de duplicidade;
- testes assistidos para outra pessoa, com revisão do operador;
- instalação orientada por aparelho, marca e servidor;
- catálogo de aplicativos, códigos e manuais de instalação;
- fila de renovações e comprovantes Pix para revisão humana;
- preparação de cobranças e acompanhamento de pagamentos;
- Central Operacional com pendências, lembretes e lotes de importação;
- assistente administrativo com ferramentas restritas e confirmação para escrita;
- integração administrativa com Telegram;
- integração de atendimento via Evolution API/WhatsApp;
- operações de painéis com aprovação, auditoria e agente local opcional;
- auditoria operacional e histórico de eventos.

## Arquitetura

```text
React + Vite + Tailwind
          │
          ▼
Express API ─────── Supabase/PostgreSQL
    │  │                    │
    │  └── Redis/BullMQ ─── Worker
    │
    ├── Evolution API / WhatsApp
    ├── Telegram administrativo
    ├── PaggPay e Efí (quando configurados)
    ├── CineHub/Union (testes homologados)
    ├── OmniRoute (assistente, interpretação e leitura de comprovantes)
    └── agente local de painéis (fluxos previamente homologados)
```

### Frontend

- React 18;
- Vite;
- React Router;
- Tailwind CSS;
- Radix UI e componentes próprios;
- autenticação protegida;
- rotas com deep-link e recarga preservando a tela.

### Backend

- Node.js com Express;
- Supabase como banco e camada de RPC/RLS;
- Redis e BullMQ para trabalhos assíncronos;
- integrações externas isoladas em adaptadores;
- dados sensíveis de acesso protegidos em repouso;
- operações de escrita sujeitas a confirmação e idempotência quando aplicável.

## Rotas principais do painel

Depois da autenticação, o painel possui estas áreas:

| Rota | Área |
| --- | --- |
| `/` | Dashboard |
| `/central` | Central Operacional |
| `/clientes` | Clientes e acessos |
| `/prospects` | Possíveis clientes |
| `/testes` | Testes e fila assistida |
| `/manuais` | Manuais de instalação |
| `/cobrancas` | Cobranças Pix |
| `/renovacoes` | Renovações e comprovantes |
| `/assistente` | Assistente administrativo |
| `/servidores` | Servidores e catálogo |
| `/conexoes` | Conexões de painéis |
| `/operacoes` | Operações de painéis |
| `/procedimentos` | Procedimentos homologados |
| `/importacao` | Importação CSV |
| `/logs` | Logs locais legados |
| `/reparo-telefones` | Reparo cadastral de telefones |
| `/configuracoes` | Configurações e IA (OmniRoute) |
| `/saude` | Saúde das integrações e monitor operacional |
| `/novo-acesso` | Assistente de novo acesso |
| `/wplay` | Painel WPlay (somente proprietário) |
| `/baixa` | Baixa de pagamentos |
| `/revisao` | Revisão financeira |

## Requisitos

- Node.js conforme `.nvmrc`;
- npm;
- Docker e Docker Compose para o ambiente completo;
- projeto Supabase configurado;
- Redis disponível;
- credenciais de integrações somente no ambiente protegido.

Não coloque tokens, senhas, cookies, chaves de API ou credenciais de clientes no
código, em migrations, no Git, em logs públicos ou nesta documentação.

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie o modelo de ambiente:

   ```bash
   cp .env.local.example .env.local
   ```

3. Preencha somente as variáveis necessárias no ambiente local. Para produção,
   use o `.env` protegido do serviço e nunca o version controle.

4. Inicie apenas o frontend para desenvolvimento:

   ```bash
   npm run dev
   ```

5. Para executar a API diretamente:

   ```bash
   npm run api
   ```

6. Para executar o worker diretamente:

   ```bash
   npm run worker
   ```

## Execução com Docker Compose

Os serviços do Horizons devem ser operados com o arquivo oficial:

```bash
docker compose -f docker-compose.vps.yml up -d
```

Verificar o estado:

```bash
docker compose -f docker-compose.vps.yml ps
```

Endpoints locais de verificação:

- API: `http://127.0.0.1:8081/health`;
- frontend: `http://127.0.0.1:3100`.

Não reinicie serviços sem necessidade. Antes de publicar uma alteração, informe
o impacto e valide API e frontend.

## Comandos de desenvolvimento

```bash
# lint
npm run lint

# testes do backend
npm run test:server

# build de produção
npm run build
```

A suíte atual usa o runner nativo do Node:

```bash
node --test server/*.test.js
```

## Banco e migrations

As migrations ficam em `supabase/migrations/` e devem ser aplicadas de forma
controlada no projeto correto. Migrations que envolvem clientes, acessos,
pagamentos ou credenciais precisam ser idempotentes, possuir proteção de acesso
e ser validadas antes de qualquer escrita real.

Regras importantes:

- um cliente pode ter no máximo um acesso principal ativo;
- migrações entre servidores preservam histórico;
- credenciais e mensagens originais de acesso ficam protegidas;
- importações começam sempre por prévia;
- linhas bloqueadas não são gravadas;
- comprovante de pagamento é evidência para revisão, não baixa automática;
- pagamento confirmado e renovação confirmada no painel são estados diferentes.

## Integrações e segurança operacional

### Evolution API / WhatsApp

A Evolution é usada por instâncias separadas conforme a finalidade. O bot de
atendimento, o canal administrativo e eventuais canais de suporte/financeiro
devem permanecer explicitamente configurados. Não habilite disparos proativos
sem destino, template, opt-in e homologação.

### Telegram administrativo

O bot administrativo deve operar em chat privado, com allowlist de usuário. Ações
de escrita apresentam resumo e exigem confirmação explícita. Cliques repetidos,
confirmações expiradas e usuários não autorizados não devem executar operações.

### Painéis externos

Logins, CAPTCHA e desafios são manuais. O agente local só deve executar fluxos
previamente capturados e homologados, dentro das capacidades liberadas para a
conexão. Antes de criar, renovar ou alterar qualquer acesso em painel externo,
é necessária confirmação explícita do proprietário.

### Pagamentos

O sistema separa criação de cobrança, recebimento confirmado e eventual
ativação/renovação no painel externo. Não correlacione pagamentos apenas por
valor, horário ou telefone. Use referência idempotente e evidência suficiente.

## Organização do repositório

```text
src/                 frontend React e páginas do painel
server/              API Express, integrações, worker e testes
supabase/migrations/ schema, RLS e RPCs
public/              arquivos públicos não sensíveis
docs/                contratos e procedimentos operacionais
tools/               geradores e utilitários de publicação
local-panel-agent/   agente local para fluxos homologados
ops/                 arquivos operacionais e serviços auxiliares
PROJECT_STATUS.md    memória operacional e handoff entre sessões
```

## Estado operacional

O estado detalhado, as homologações, pendências e decisões ficam em
[`PROJECT_STATUS.md`](./PROJECT_STATUS.md). Ele é a fonte de verdade do projeto
entre sessões e deve ser atualizado ao final de toda rodada relevante.

Pendências operacionais não devem ser inferidas como concluídas apenas porque o
código foi publicado. A entrega real de mensagens, pagamentos e operações de
painel precisa ser confirmada no sistema de origem.

## Licença e uso

Projeto privado do operador. Não publique configurações, dados de clientes,
credenciais, tokens ou exports operacionais.
