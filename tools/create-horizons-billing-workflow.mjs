// Horizons | Envio de lembretes financeiros | v1 (LOCAL, NAO PUBLICADO)
// Este script gera um workflow do n8n que busca a lista aprovada de lembretes
// financeiros no Horizons e envia pela Evolution. O disparo real permanece
// desligado ate o proprietario autorizar destino e template.
//
// Uso apos publicacao (quando autorizado):
//   node tools/create-horizons-billing-workflow.mjs
//
// Fluxo:
//   Schedule -> Buscar lembretes aprovados -> Para cada item:
//     -> Enviar pela Evolution -> Marcar como enviado

import fs from 'node:fs';

const N8N = 'http://127.0.0.1:5678';
const NAME = 'Horizons | Envio de lembretes financeiros | v1';
const apiKey = fs.readFileSync('/root/n8n/.api-key', 'utf8').trim();

function envFile(path) {
  const out = {};
  for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue;
    const i = raw.indexOf('=');
    if (i < 0) continue;
    out[raw.slice(0, i).trim()] = raw.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return out;
}

const env = envFile('/root/horizons-app/.env');
const evolutionUrl = (env.EVOLUTION_API_URL || 'https://evolution.velhaturbo.cloud').replace(/\/$/, '');
const sendInstance = env.EVOLUTION_SALES_INSTANCE || env.N8N_EVOLUTION_INSTANCE || 'Horizons Typebot';
const bridgeToken = env.BOTBOT_WEBHOOK_TOKEN || env.WEBHOOK_SHARED_SECRET;

async function api(path, options = {}) {
  const response = await fetch(`${N8N}${path}`, { ...options, headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json', ...options.headers } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const credentials = (await api('/api/v1/credentials')).data || [];
const evolutionCredential = credentials.find((c) => c.name === 'Evolution API | Horizons');
if (!evolutionCredential) throw new Error('Credential "Evolution API | Horizons" nao encontrada no n8n.');
const bridgeCredential = credentials.find((c) => c.name === 'Horizons Bot API | n8n') || credentials.find((c) => c.name === 'Horizons API Header');
if (!bridgeCredential) throw new Error('Credential de ponte com Horizons nao encontrada no n8n.');

const node = (name, type, position, parameters, extra = {}) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name, type, typeVersion: type === 'n8n-nodes-base.httpRequest' ? 4.2 : type === 'n8n-nodes-base.code' ? 2 : type === 'n8n-nodes-base.scheduleTrigger' ? 1.2 : 1,
  position, parameters, ...extra,
});
const code = (name, x, y, jsCode) => node(name, 'n8n-nodes-base.code', [x, y], { jsCode });
const http = (name, y, method, path, jsonBody, extra = {}) => {
  const params = {
    method, url: `https://iptv.velhaturbo.cloud/api${path}`,
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    options: { timeout: 60000 },
  };
  if (method !== 'GET') {
    params.sendBody = true; params.specifyBody = 'json'; params.jsonBody = jsonBody;
  }
  return node(name, 'n8n-nodes-base.httpRequest', [760, y], params,
    { credentials: { httpHeaderAuth: { id: bridgeCredential.id, name: bridgeCredential.name } }, ...extra });
};

// Codigo: itera sobre os lembretes aprovados; gera um item por lembrete.
const splitCode = String.raw`
const items = $json.items || [];
return items.map((item) => ({
  json: {
    id: item.id,
    phone: item.customers?.phone,
    name: item.customers?.name,
    payment_method: item.payment_method,
    checkout_url: item.checkout_url,
    message_preview: item.message_preview,
  }
}));
`;

// Codigo: monta a chamada Evolution de acordo com o metodo.
const sendCode = String.raw`
const item = $json;
const phone = String(item.phone || '').replace(/\D/g, '');
if (!phone) return [{ json: { skip: true, reason: 'sem telefone', id: item.id } }];
let body;
if (item.payment_method === 'checkout' && item.checkout_url) {
  body = { number: phone, text: item.message_preview + '\n\n' + item.checkout_url, delay: 500 };
} else {
  body = { number: phone, text: item.message_preview, delay: 500 };
}
return [{ json: { id: item.id, phone, endpoint: 'sendText', body } }];
`;

const sendEvolution = node('Enviar pela Evolution', 'n8n-nodes-base.httpRequest', [1480, 240], {
  method: 'POST',
  url: `={{ '${evolutionUrl}/message/' + $json.endpoint + '/' + encodeURIComponent('${sendInstance}') }}`,
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.body) }}',
  options: { timeout: 30000 },
}, { credentials: { httpHeaderAuth: { id: evolutionCredential.id, name: 'Evolution API | Horizons' } } });

const nodes = [
  node('Observacao de seguranca', 'n8n-nodes-base.stickyNote', [-560, -260], {
    content: '## Antes de ativar\n1. Confirmar destino (cliente) e template.\n2. Homologar com 1 cliente controlado em sandbox.\n3. Garantir que o item aprovado e de cliente com checkout valido OU com instrucoes de Pix validas.\n4. Manter o disparo desligado enquanto houver cliente em recuperacao.\n5. Marcar `sent` apos cada envio.',
    height: 280, width: 540, color: 3,
  }),
  node('Agendar busca', 'n8n-nodes-base.scheduleTrigger', [-340, 240], {
    rule: { interval: [{ field: 'cronExpression', expression: '*/30 * * * *' }] },
  }),
  http('Buscar lembretes aprovados', 240, 'GET', '/typebot/billing/reminders/sendable', undefined),
  code('Separar por lembrete', 520, 240, splitCode),
  code('Montar envio', 980, 240, sendCode),
  sendEvolution,
  http('Marcar como enviado', 1300, 'POST', '/typebot/billing/reminders/{{$json.id}}/sent', '={{ JSON.stringify({}) }}'),
  code('Log final', 1520, 240, "return [{ json: { id: $json.id, sent: $json.sent !== false, at: new Date().toISOString() } }];"),
];

const C = {};
const link = (a, b) => { C[a] ??= { main: [[]] }; C[a].main[0].push({ node: b, type: 'main', index: 0 }); };
link('Agendar busca', 'Buscar lembretes aprovados');
link('Buscar lembretes aprovados', 'Separar por lembrete');
link('Separar por lembrete', 'Montar envio');
link('Montar envio', 'Enviar pela Evolution');
link('Enviar pela Evolution', 'Marcar como enviado');
link('Marcar como enviado', 'Log final');

const all = (await api('/api/v1/workflows?limit=100')).data || [];
const old = all.find((w) => w.name === NAME);
const oldDetails = old ? await api(`/api/v1/workflows/${old.id}`) : null;
const workflow = {
  name: NAME, nodes, connections: C,
  settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none', saveManualExecutions: true, timezone: 'America/Sao_Paulo' },
  ...(oldDetails?.staticData ? { staticData: oldDetails.staticData } : {}),
};

// ATENCAO: a publicacao real so ocorre quando voce confirmar.
// Para preparar sem publicar, remova o comentario da proxima linha.
if (process.env.PUBLISH === 'true') {
  const saved = await api(old ? `/api/v1/workflows/${old.id}` : '/api/v1/workflows', { method: old ? 'PUT' : 'POST', body: JSON.stringify(workflow) });
  console.log(JSON.stringify({ id: saved.id, name: saved.name, active: saved.active, nodes: saved.nodes?.length, connections: Object.keys(saved.connections || {}).length }, null, 2));
} else {
  console.log('Workflow pronto (nao publicado). Defina PUBLISH=true para publicar.');
}
