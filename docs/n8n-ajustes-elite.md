# Ajustes no n8n — uso do Elite IPTV como servidor principal

Ajustes preparados para o fluxo **`Horizons | Atendimento WhatsApp completo | v1`**
(arquivo `/root/n8n/tools/create-horizons-full-workflow.mjs`). Nenhuma
alteração foi publicada no n8n. Aplique os trechos abaixo quando você
confirmar o disparo real para o Elite.

## 1. Servidor de teste padrão: Elite

**Onde:** linha `http('Criar teste CineHub',360,...)` (criação do teste).

**Atual** (fixo em CineHub/KYROS):

```js
http('Criar teste CineHub',360,'typebot/cinehub/tests',`={{
  JSON.stringify({
    idempotency_key:'trial_'+...,
    phone:...,
    name:...,
    prospect_id:...,
    server:'kyros',
    duration_hours:6,
    content:...,
    reuse_existing_checkout:...,
    qa_replay_existing_test:...
  })
}}`, {onError:'continueErrorOutput'})
```

**Proposto** — aceita `server` e `duration_hours` do estado da sessão, com
fallback `elite` + 4h. Variáveis lidas de `Decidir etapa` e estado da sessão:

```js
http('Criar teste CineHub',360,'typebot/cinehub/tests',`={{
  JSON.stringify({
    idempotency_key:'trial_'+$('Decidir etapa').item.json.phone+'_'+($('Decidir etapa').item.json.session.server||'elite')+'_'+($('Decidir etapa').item.json.session.screens||1),
    phone:$('Decidir etapa').item.json.phone,
    name:$('Decidir etapa').item.json.session.name,
    prospect_id:$json.prospect_id,
    server: $('Decidir etapa').item.json.session.server || 'elite',
    duration_hours: $('Decidir etapa').item.json.session.duration_hours || 4,
    content: $('Decidir etapa').item.json.session.content,
    reuse_existing_checkout:$('Decidir etapa').item.json.session.intent==='purchase',
    qa_replay_existing_test:$('Decidir etapa').item.json.session.qaMode===true
  })
}}`, {onError:'continueErrorOutput'})
```

## 2. Escolha de servidor/duração no menu

**Onde:** máquina de estados (`Decidir etapa`), após `screens()`.

**Atual** (criação de teste com 6h fixo):

```js
const offer=offers[s.screens];s.planId=offer.id;...
s.step='creating_trial';out={action:'trial',phone,session:s};
```

**Proposto** — captura `server` e `duration_hours` da escolha anterior
(adicionar etapa "Escolher servidor/duração" antes de confirmar o plano, ou
aceitar pelo MENU quando o cliente digitar "elite 4h", "elite 8h", etc.).

Sugestão mínima: adicionar uma nova etapa `server_select` entre `content()`
e `screens()` que armazena `s.server` e `s.duration_hours`. Padrões:
`server='elite'`, `duration_hours=4`. O KYROS 6h fica disponível caso o
cliente peça explicitamente (digitando ou via seleção manual).

```js
// dentro de "Decidir etapa", novo ramo:
else if (key.startsWith('server:')) {
  const [server, duration] = key.slice(7).split(':'); // ex.: 'server:elite:4'
  s.server = server; s.duration_hours = Number(duration) || 4;
  s.step = 'screens';
  out = screens();
}
else if (key === 'server:kyros:6') {
  s.server = 'kyros'; s.duration_hours = 6;
  s.step = 'screens';
  out = screens();
}
```

Botão sugerido antes da escolha de telas:

```js
const servers = () => list('Servidor de teste', 'Selecione o servidor principal do seu teste.', 'Escolher servidor', [
  ['server:elite:4',  'Elite IPTV — 4 horas'],
  ['server:elite:8',  'Elite IPTV — 8 horas'],
  ['server:elite:12', 'Elite IPTV — 12 horas'],
  ['server:kyros:6',  'CineHub (KYROS) — 6 horas'],
  ['server:kyros:12', 'CineHub (KYROS) — 12 horas'],
  ['menu', 'Voltar ao menu'],
]);
```

## 3. Textos neutros

Trocar referências a “CineHub” e “CineHub/Union” por “servidor” quando o
conteúdo já é neutro. Manter “CineHub” apenas quando o `server` for
`kyros`, `vornak`, `kronos`, `zeus`, `fenix` ou `p2p`.

## 4. Aplicação

- Aplicar as edições localmente em `/root/n8n/tools/create-horizons-full-workflow.mjs`;
- rodar o gerador: `node tools/create-horizons-full-workflow.mjs`;
- revisar os nós `Criar teste CineHub` e a máquina de estados;
- validar visualmente no telefone de QA com Elite;
- só então publicar o workflow ativo.

Nada disso será feito automaticamente até você confirmar.
