import { Worker } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';
import { createQueue } from './queue.js';
import { buildPanelFlow } from './panelFlows.js';
import { sendEvolutionText } from './evolution.js';
import { composeDailyDigest, sendTelegramMessage } from './telegramDigest.js';
import { composeRenewalListMessage, loadWhatsappRenewalItems } from './routes/renewalList.js';
import { openAccessValue } from './accessVault.js';
import { createAiSettingsStore } from './aiSettings.js';
import { monitorSettings, runHealthMonitor } from './healthMonitor.js';

const config = getConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { connection, automationQueue } = createQueue(config.redisUrl);

function workerEvent(event, fields = {}) {
  console.info(JSON.stringify({ event: `worker_${event}`, ...fields }));
}

const telegramDigestEnabled = process.env.HORIZONS_TELEGRAM_DAILY_DIGEST_ENABLED === 'true';
const telegramDigestCron = process.env.HORIZONS_TELEGRAM_DAILY_DIGEST_CRON || '0 8 * * *';

if (telegramDigestEnabled) {
  await automationQueue.add('telegram-daily-digest', {}, {
    repeat: { pattern: telegramDigestCron },
    jobId: 'telegram-daily-digest-repeat',
    removeOnComplete: 100,
    removeOnFail: 100,
  });
  workerEvent('telegram_digest_scheduled', { cron: telegramDigestCron });
}

const whatsappRenewalEnabled = process.env.HORIZONS_WHATSAPP_RENEWAL_ENABLED === 'true';
const whatsappRenewalCron = process.env.HORIZONS_WHATSAPP_RENEWAL_LIST_CRON || '0 */2 * * *';

if (whatsappRenewalEnabled) {
  await automationQueue.add('whatsapp-renewal-list', {}, {
    repeat: { pattern: whatsappRenewalCron },
    jobId: 'whatsapp-renewal-list-repeat',
    removeOnComplete: 100,
    removeOnFail: 100,
  });
  workerEvent('whatsapp_renewal_list_scheduled', { cron: whatsappRenewalCron });
}

const staleCatalogEnabled = process.env.HORIZONS_STALE_CATALOG_CHECK_ENABLED === 'true';
const staleCatalogCron = process.env.HORIZONS_STALE_CATALOG_CHECK_CRON || '0 3 * * 1';

if (staleCatalogEnabled) {
  await automationQueue.add('stale-delivery-profiles', {}, {
    repeat: { pattern: staleCatalogCron },
    jobId: 'stale-delivery-profiles-repeat',
    removeOnComplete: 100,
    removeOnFail: 100,
  });
  workerEvent('stale_catalog_scheduled', { cron: staleCatalogCron });
}

// Monitor de saúde: avisa o dono no Telegram quando WhatsApp/entrada/IA param.
const healthMonitor = monitorSettings();
const aiSettings = createAiSettingsStore({ supabase, config });

if (healthMonitor.enabled) {
  await automationQueue.add('health-monitor', {}, {
    repeat: { pattern: healthMonitor.cron },
    jobId: 'health-monitor-repeat',
    removeOnComplete: 50,
    removeOnFail: 50,
  });
  workerEvent('health_monitor_scheduled', { cron: healthMonitor.cron });
}

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
  const startedAt = Date.now();
  const attempt = (job.attemptsMade || 0) + 1;
  workerEvent('job_started', { job_id: job.id, job_name: job.name, attempt });
  if (job.name === 'telegram-daily-digest') {
    const text = await composeDailyDigest(supabase, config.horizonsOwnerUserId);
    const chatId = config.telegramAdminAllowedUserIds[0];
    const result = await sendTelegramMessage(config, chatId, text);
    workerEvent('job_completed', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt, result });
    return result;
  }
  if (job.name === 'whatsapp-renewal-list') {
    const items = await loadWhatsappRenewalItems(supabase, config, config.horizonsOwnerUserId);
    const text = composeRenewalListMessage(items);
    if (!text || !config.horizonsWhatsappRenewalNumber || !config.evolutionApiUrl || !config.evolutionFinanceInstance || !config.evolutionApiKey) {
      workerEvent('job_completed', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt, count: items.length, skipped: true });
      return { skipped: true, count: items.length };
    }
    const phone = String(config.horizonsWhatsappRenewalNumber).replace(/\D/g, '');
    const url = `${String(config.evolutionApiUrl).replace(/\/$/, '')}/message/sendText/${encodeURIComponent(config.evolutionFinanceInstance)}`;
    const sendResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
      body: JSON.stringify({ number: phone, text, delay: 500 }),
      signal: AbortSignal.timeout(30_000),
    });
    workerEvent('job_completed', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt, count: items.length, status: sendResponse.status });
    return { sent: sendResponse.ok, count: items.length, status: sendResponse.status };
  }
  if (job.name === 'health-monitor') {
    const result = await runHealthMonitor({ config, supabase, aiSettings, redis: connection, sendTelegramMessage, settings: healthMonitor });
    workerEvent('job_completed', {
      job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt,
      problems: result.signals.problems.map((item) => item.key),
      opened: result.plan.opened.length, resolved: result.plan.resolved.length, delivery: result.delivery,
    });
    return { problems: result.signals.problems.length };
  }
  if (job.name === 'stale-delivery-profiles') {
    const today = new Date().toISOString().slice(0, 10);
    const { data: expired, error } = await supabase.from('server_delivery_profiles')
      .select('id').eq('user_id', config.horizonsOwnerUserId).eq('active', true).not('valid_until', 'is', null).lt('valid_until', today);
    if (error) { workerEvent('job_error', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt, error: error.message }); throw error; }
    const count = (expired || []).length;
    if (count) await supabase.from('server_delivery_profiles').update({ active: false, updated_at: new Date().toISOString() }).in('id', (expired || []).map((row) => row.id));
    workerEvent('job_completed', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt, deactivated: count });
    return { deactivated: count };
  }
  try {
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
  workerEvent('job_completed', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt });
  } catch (error) {
    workerEvent('job_error', { job_id: job.id, job_name: job.name, attempt, duration_ms: Date.now() - startedAt, error: error.message });
    throw error;
  }
}, { connection, concurrency: 1 });

worker.on('failed', async (job, error) => {
  console.error(JSON.stringify({ event: 'worker_job_failed', job_id: job?.id, job_name: job?.name, attempts: job?.attemptsMade || 0, error: error.message }));
  if (job?.data?.operationId) await supabase.from('panel_operations').update({
    status: 'failed', last_error: error.message,
  }).eq('id', job.data.operationId);
});
