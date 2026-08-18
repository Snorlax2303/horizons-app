import fs from 'node:fs';

const baseUrl = 'http://127.0.0.1:5678/api/v1';
const workflowId = '9kEnUBMXxMvywDWn';
const apiKey = fs.readFileSync('/root/n8n/.api-key', 'utf8').trim();
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${payload.message || ''}`);
  return payload;
}

const workflow = await request(`/workflows/${workflowId}`);
const executions = await request(`/executions?workflowId=${workflowId}&limit=20&includeData=true`);
const qaPhone = executions.data
  .map((execution) => execution.data?.resultData?.runData?.['Decidir etapa']?.at(-1)?.data?.main?.flat?.()?.[0]?.json?.phone)
  .find(Boolean);
if (!qaPhone) throw new Error('Não foi possível identificar o telefone controlado de homologação.');

const decision = workflow.nodes.find((node) => node.name === 'Decidir etapa');
const createTrial = workflow.nodes.find((node) => node.name === 'Criar teste CineHub');
const prepareIntake = workflow.nodes.find((node) => node.name === 'Preparar triagem do teste');
const assemble = workflow.nodes.find((node) => node.name === 'Montar acesso e instalação');
if (!decision || !createTrial || !prepareIntake || !assemble) throw new Error('Nós esperados não foram encontrados.');

let decisionCode = decision.parameters.jsCode;
decisionCode = decisionCode.replace(
  "store.seen ??= {}; store.sessions ??= {};",
  "store.seen ??= {}; store.sessions ??= {}; store.qaPhones ??= [];",
);
decisionCode = decisionCode.replace(
  "s.lastSeenAt=new Date().toISOString(); if (input.pushName) s.name=input.pushName;",
  "s.lastSeenAt=new Date().toISOString(); if (input.pushName) s.name=input.pushName; s.qaMode=store.qaPhones.includes(phone);",
);
decisionCode = decisionCode.replace(
  "else if (key==='close:plan') { out=s.checkoutUrl?text('💳 Link para pagamento do seu plano de '+s.screens+' tela(s) — R$ '+Number(s.planAmount).toFixed(2).replace('.',',')+':\\n\\n'+s.checkoutUrl+'\\n\\nA confirmação é automática.'):text('Não encontrei o checkout desta conversa. Digite MENU para recomeçar ou fale com Vendas.'); }",
  "else if (key==='close:plan') { out=s.checkoutUrl?text('💳 Link para pagamento do seu plano de '+s.screens+' tela(s) — R$ '+Number(s.planAmount).toFixed(2).replace('.',',')+':\\n\\n'+s.checkoutUrl+'\\n\\nA confirmação é automática.'):{action:'renewal',phone,session:s}; }",
);
if (!decisionCode.includes("s.qaMode=store.qaPhones.includes(phone)")) throw new Error('Falha ao habilitar o modo QA na decisão.');
if (!decisionCode.includes("{action:'renewal',phone,session:s}")) throw new Error('Falha ao habilitar recuperação persistente do checkout.');
decision.parameters.jsCode = decisionCode;

prepareIntake.parameters.jsCode = prepareIntake.parameters.jsCode.replace(
  "intent:'trial'",
  "intent:s.intent==='purchase'?'purchase':'trial'",
);

let trialBody = createTrial.parameters.jsonBody;
trialBody = trialBody.replace(
  "reuse_existing_checkout:$('Decidir etapa').item.json.session.intent==='purchase'",
  "reuse_existing_checkout:$('Decidir etapa').item.json.session.intent==='purchase',qa_replay_existing_test:$('Decidir etapa').item.json.session.qaMode===true",
);
if (!trialBody.includes('qa_replay_existing_test')) throw new Error('Falha ao adicionar replay QA à criação do teste.');
createTrial.parameters.jsonBody = trialBody;

let assembleCode = assemble.parameters.jsCode;
assembleCode = assembleCode.replace(
  "const message='✅ Seu teste está pronto!\\n\\n📲 INSTALAÇÃO\\n'",
  "const qaNotice=trial.qa_replay?'🧪 MODO HOMOLOGAÇÃO — o acesso abaixo é uma repetição do último teste deste telefone; nenhum novo teste foi criado no CineHub.\\n\\n':'';\nconst message=qaNotice+'✅ Seu teste está pronto!\\n\\n📲 INSTALAÇÃO\\n'",
);
if (!assembleCode.includes('MODO HOMOLOGAÇÃO')) throw new Error('Falha ao identificar a entrega simulada.');
assemble.parameters.jsCode = assembleCode;

await request(`/workflows/${workflowId}/deactivate`, { method: 'POST' });
try {
  const sessions = workflow.staticData?.global?.sessions || {};
  for (const session of Object.values(sessions)) session.qaMode = String(session.phone || '') === String(qaPhone);
  const staticData = {
    ...(workflow.staticData || {}),
    global: { ...(workflow.staticData?.global || {}), sessions, qaPhones: [qaPhone] },
  };
  await request(`/workflows/${workflowId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      staticData,
    }),
  });
} finally {
  await request(`/workflows/${workflowId}/activate`, { method: 'POST' });
}

const verified = await request(`/workflows/${workflowId}`);
const verifiedDecision = verified.nodes.find((node) => node.name === 'Decidir etapa')?.parameters?.jsCode || '';
const verifiedTrial = verified.nodes.find((node) => node.name === 'Criar teste CineHub')?.parameters?.jsonBody || '';
console.log(JSON.stringify({
  active: verified.active,
  webhookEnabled: verified.nodes.some((node) => node.type === 'n8n-nodes-base.webhook' && node.disabled !== true),
  qaPhones: verified.staticData?.global?.qaPhones?.length || 0,
  persistentCheckoutLookup: verifiedDecision.includes("{action:'renewal',phone,session:s}"),
  qaReplayRequest: verifiedTrial.includes('qa_replay_existing_test'),
  qaDeliveryNotice: (verified.nodes.find((node) => node.name === 'Montar acesso e instalação')?.parameters?.jsCode || '').includes('MODO HOMOLOGAÇÃO'),
}, null, 2));
