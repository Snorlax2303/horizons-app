// Monitor operacional do Horizons: detecta quedas que antes passaram dias sem
// ninguém ver (instância do WhatsApp fechada, entrada de mensagens parada,
// leitura de comprovantes falhando, IA sem configuração) e avisa o dono no
// Telegram administrativo. Só lê dados; nunca envia nada a clientes.

const HOUR = 3_600_000;

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function monitorSettings(env = process.env) {
  return {
    enabled: env.HORIZONS_HEALTH_MONITOR_ENABLED !== 'false',
    cron: env.HORIZONS_HEALTH_MONITOR_CRON || '*/15 * * * *',
    inboundSilenceHours: Number(env.HORIZONS_MONITOR_INBOUND_SILENCE_HOURS || 6),
    receiptFailureMin: Number(env.HORIZONS_MONITOR_RECEIPT_FAILURE_MIN || 3),
    remindEveryHours: Number(env.HORIZONS_MONITOR_REMIND_HOURS || 12),
    // Instâncias vigiadas; vazio = todas as instâncias da Evolution.
    instances: String(env.HORIZONS_MONITOR_INSTANCES || '').split(',').map((item) => item.trim()).filter(Boolean),
  };
}

async function evolutionInstances(config, fetchImpl) {
  if (!config.evolutionApiUrl || !config.evolutionApiKey) return { error: 'Evolution não configurada.' };
  try {
    const response = await fetchImpl(`${String(config.evolutionApiUrl).replace(/\/+$/, '')}/instance/fetchInstances`, {
      headers: { apikey: config.evolutionApiKey }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { error: `Evolution respondeu ${response.status}.` };
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : payload?.data || [];
    return {
      items: list.map((item) => ({
        name: item.name || item.instanceName || 'sem nome',
        state: item.connectionStatus || item.connectionState || item.state || item.status || 'unknown',
        updated_at: item.updatedAt || null,
      })),
    };
  } catch (error) {
    return { error: `Evolution inacessível: ${error.message}` };
  }
}

// Coleta sinais e devolve a lista de problemas atuais (cada um com chave estável).
export async function collectHealthSignals({ config, supabase, aiSettings, settings = monitorSettings(), fetchImpl = globalThis.fetch, now = Date.now() }) {
  const problems = [];
  const signals = { checked_at: new Date(now).toISOString() };

  const evolution = await evolutionInstances(config, fetchImpl);
  signals.evolution = evolution;
  if (evolution.error) {
    problems.push({ key: 'evolution:unreachable', severity: 'high', text: evolution.error });
  } else {
    const watched = settings.instances.length ? evolution.items.filter((item) => settings.instances.includes(item.name)) : evolution.items;
    for (const instance of watched) {
      if (instance.state !== 'open') {
        problems.push({
          key: `evolution:${instance.name}`, severity: 'high',
          text: `WhatsApp "${instance.name}" está ${instance.state}${instance.updated_at ? ` desde ${new Date(instance.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}. Reconecte pelo QR Code.`,
        });
      }
    }
  }

  const safeQuery = (query) => Promise.resolve(query).catch(() => ({ error: { code: 'unreachable' } }));
  const databaseFailures = [];
  const { data: lastInbound, error: inboundError } = await safeQuery(supabase.from('lead_events').select('created_at')
    .eq('user_id', config.horizonsOwnerUserId).eq('event_type', 'whatsapp_inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (inboundError) databaseFailures.push('inbound');
  signals.last_inbound_at = lastInbound?.created_at || null;
  if (!inboundError && lastInbound?.created_at) {
    const silentHours = (now - new Date(lastInbound.created_at).getTime()) / HOUR;
    signals.inbound_silent_hours = Math.round(silentHours * 10) / 10;
    if (silentHours >= settings.inboundSilenceHours) {
      problems.push({ key: 'inbound:silent', severity: 'medium', text: `Nenhuma mensagem de WhatsApp recebida há ${Math.floor(silentHours)} h.` });
    }
  }

  const since = new Date(now - 24 * HOUR).toISOString();
  const [failed, total] = await Promise.all([
    safeQuery(supabase.from('pix_receipts').select('id', { count: 'exact', head: true }).eq('user_id', config.horizonsOwnerUserId).eq('extraction_status', 'failed').gte('created_at', since)),
    safeQuery(supabase.from('pix_receipts').select('id', { count: 'exact', head: true }).eq('user_id', config.horizonsOwnerUserId).gte('created_at', since)),
  ]);
  if (failed.error || total.error) databaseFailures.push('receipts');
  signals.receipts_24h = { failed: failed.error ? null : failed.count ?? 0, total: total.error ? null : total.count ?? 0 };
  if (!failed.error && !total.error && (failed.count || 0) >= settings.receiptFailureMin && (failed.count || 0) > (total.count || 0) / 2) {
    problems.push({ key: 'receipts:failing', severity: 'medium', text: `Leitura de comprovantes falhou em ${failed.count} de ${total.count} nas últimas 24 h.` });
  }

  if (aiSettings) {
    try {
      const ai = await aiSettings.resolve();
      signals.ai_configured = Boolean(ai?.apiKey && ai?.baseUrl && (ai.models?.fast || ai.models?.smart || ai.models?.vision));
      if (!signals.ai_configured) {
        problems.push({ key: 'ai:not_configured', severity: 'low', text: 'IA (OmniRoute) sem chave/modelos: salve em Configurações.' });
      }
    } catch {
      signals.ai_configured = null;
      databaseFailures.push('ai_settings');
    }
  }

  signals.database = { status: databaseFailures.length ? 'error' : 'ok', failed_checks: databaseFailures };
  if (databaseFailures.length) {
    problems.push({ key: 'database:unavailable', severity: 'high', text: 'Falha ao consultar o banco do Horizons. Verifique disponibilidade do Supabase e conexão da aplicação.' });
  }

  signals.problems = problems;
  return signals;
}

// Decide o que avisar: problemas novos, lembrete periódico dos que continuam
// e "resolvido" para os que sumiram. `state` = { [key]: { since, notified_at, text } }.
export function planAlerts(problems, state = {}, { now = Date.now(), remindEveryHours = 12 } = {}) {
  const next = {};
  const opened = []; const reminded = []; const resolved = [];
  for (const problem of problems) {
    const previous = state[problem.key];
    if (!previous) {
      opened.push(problem);
      next[problem.key] = { since: now, notified_at: now, text: problem.text };
    } else if (now - previous.notified_at >= remindEveryHours * HOUR) {
      reminded.push(problem);
      next[problem.key] = { ...previous, notified_at: now, text: problem.text };
    } else {
      next[problem.key] = { ...previous, text: problem.text };
    }
  }
  for (const [key, previous] of Object.entries(state)) {
    if (!next[key]) resolved.push({ key, text: previous.text });
  }
  return { opened, reminded, resolved, state: next };
}

export function composeAlertMessage({ opened, reminded, resolved }) {
  const lines = [];
  if (opened.length) lines.push('🚨 <b>Horizons — novo problema</b>', ...opened.map((item) => `• ${escapeHtml(item.text)}`));
  if (reminded.length) lines.push('', '⏰ <b>Continua pendente</b>', ...reminded.map((item) => `• ${escapeHtml(item.text)}`));
  if (resolved.length) lines.push('', '✅ <b>Resolvido</b>', ...resolved.map((item) => `• ${escapeHtml(item.text)}`));
  return lines.join('\n').trim();
}

const STATE_KEY = 'horizons:health-monitor:state';

export async function runHealthMonitor({ config, supabase, aiSettings, redis, sendTelegramMessage, settings = monitorSettings(), fetchImpl, now = Date.now() }) {
  const signals = await collectHealthSignals({ config, supabase, aiSettings, settings, fetchImpl, now });
  const previous = JSON.parse((await redis.get(STATE_KEY)) || '{}');
  const plan = planAlerts(signals.problems, previous, { now, remindEveryHours: settings.remindEveryHours });
  const text = composeAlertMessage(plan);
  let delivery = { skipped: true, reason: 'nothing_to_report' };
  if (text) {
    delivery = await sendTelegramMessage(config, config.telegramAdminAllowedUserIds?.[0], text);
    // Se o Telegram falhar, não grava o estado: tenta avisar de novo na próxima rodada.
    if (delivery?.ok === false) return { signals, plan, delivery };
  }
  await redis.set(STATE_KEY, JSON.stringify(plan.state));
  return { signals, plan, delivery };
}
