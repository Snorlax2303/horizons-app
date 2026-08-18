import { Worker } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';
import { createQueue } from './queue.js';
import { buildPanelFlow } from './panelFlows.js';
import { sendEvolutionText } from './evolution.js';

const config = getConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { connection } = createQueue(config.redisUrl);

async function returnToManual(operationId, reason) {
  await supabase.from('panel_operations').update({
    status: 'pending_approval', last_error: reason,
  }).eq('id', operationId);
}

async function processPanelOperation(operationId) {
  const { data: operation, error } = await supabase.from('panel_operations').select(`
    id,status,action,panel_connection_id,input,
    panel_connections(id,provider,base_url,automation_mode,session_status,capabilities,agent_id,browser_location)
  `).eq('id', operationId).maybeSingle();
  if (error || !operation) throw new Error('Operação de painel não encontrada.');
  if (!['queued', 'processing'].includes(operation.status)) return;

  const panel = operation.panel_connections;
  if (!panel || panel.automation_mode !== 'automatic' || panel.session_status !== 'connected') {
    await returnToManual(operationId, 'Ação aguardando execução manual ou reconexão do painel.');
    return;
  }

  const capability = operation.action === 'renew_customer' ? 'renew' : operation.action === 'create_test' ? 'create_test' : 'lookup';
  if (!panel.capabilities?.[capability]) {
    await returnToManual(operationId, 'A conexão não possui capacidade liberada para esta ação.');
    return;
  }

  const flow = buildPanelFlow(operation, panel);
  if (panel.browser_location === 'local_agent' && panel.agent_id && flow?.steps) {
    const { data: command, error: commandError } = await supabase.from('panel_agent_commands').insert({
      agent_id: panel.agent_id, panel_connection_id: panel.id, action: 'run_panel_flow',
      payload: { operation_id: operation.id, test_request_id: operation.input?.test_request_id || null, base_url: operation.input?.keep_current_page === true ? null : panel.base_url, flow },
    }).select('id').single();
    if (commandError || !command) throw new Error('Não foi possível enviar o roteiro para o agente local.');
    return;
  }

  // Session-aware browser adapters are intentionally opt-in. The worker must
  // never invent a session, solve a challenge, or spend a renewal credit when
  // a connector has not been explicitly attached and homologated.
  await returnToManual(operationId, `Conector ${panel.provider} ainda não homologado para execução automática.`);
}

const worker = new Worker('iptv-automation', async (job) => {
  if (job.name === 'trial-follow-up') {
    const { data: trial, error } = await supabase.from('union_direct_test_events')
      .select('id,phone,status,prospect_id').eq('id', job.data.trialEventId).maybeSingle();
    if (error || !trial || trial.status !== 'completed' || !trial.phone) return;
    const { data: order } = await supabase.from('sales_orders').select('id,status')
      .eq('union_direct_test_event_id', trial.id).maybeSingle();
    if (order && ['paid', 'provisioning', 'completed', 'cancelled'].includes(order.status)) return;
    await sendEvolutionText(config, trial.phone,
      'Seu teste ainda está disponível. Quer escolher um plano ou precisa de ajuda? Toque em uma das opções da conversa. Para voltar ao início, digite MENU.');
    await supabase.from('lead_events').insert({
      user_id: config.horizonsOwnerUserId, prospect_id: trial.prospect_id,
      event_type: 'trial_follow_up_sent', payload: { union_direct_test_event_id: trial.id },
    });
    return;
  }
  if (job.name === 'renew-customer') {
    await supabase.from('automation_jobs').update({
      status: 'manual_review', last_error: 'Pagamento legado: vincule as telas a uma conexão de painel antes de renovar.',
    }).eq('payment_event_id', job.data.paymentEventId);
    return;
  }
  if (job.name !== 'panel-operation') throw new Error(`Job não suportado: ${job.name}`);
  await supabase.from('panel_operations').update({ status: 'processing', last_error: null })
    .eq('id', job.data.operationId).eq('status', 'queued');
  await processPanelOperation(job.data.operationId);
}, { connection, concurrency: 1 });

worker.on('failed', async (job, error) => {
  console.error(`Job ${job?.id} falhou:`, error.message);
  if (job?.data?.operationId) await supabase.from('panel_operations').update({
    status: 'failed', last_error: error.message,
  }).eq('id', job.data.operationId);
});
