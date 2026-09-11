import { composeDailyDigest } from './telegramDigest.js';

import { WWPANEL_PLANS, WWPANEL_IPTV_PACKAGES, WWPANEL_APPS } from './wplayCatalog.js';

async function loadRecovery(supabase, ownerId) {
  const { data } = await supabase.from('customer_recovery_queue')
    .select('id,status,last_due_date,reason,customers(id,name,phone)').eq('user_id', ownerId).in('status', ['pending', 'reminded']).order('updated_at', { ascending: false }).limit(20);
  return data || [];
}

async function loadReminders(supabase, ownerId) {
  const { data } = await supabase.from('billing_reminder_queue')
    .select('id,due_date,stage,payment_method,status,customers(id,name,phone)').eq('user_id', ownerId).in('status', ['planned', 'approved']).order('due_date').limit(20);
  return data || [];
}

async function loadLowQueue(supabase, ownerId) {
  const { data: renewals } = await supabase.from('renewal_requests')
    .select('id,expected_amount,due_date,status,customers(id,name,phone),pix_receipts(id,review_status)')
    .eq('user_id', ownerId).eq('status', 'awaiting_bank_review').order('updated_at').limit(20);
  const renewalIds = (renewals || []).map((r) => r.id);
  const { data: receipts } = renewalIds.length
    ? (await supabase.from('pix_receipts').select('id,renewal_request_id,end_to_end_id,amount,paid_at,validation_flags,review_status,created_at').eq('user_id', ownerId).in('renewal_request_id', renewalIds).order('created_at', { ascending: false })).data || []
    : [];
  const receiptsByRenewal = new Map();
  for (const r of receipts) {
    const list = receiptsByRenewal.get(r.renewal_request_id) || [];
    list.push(r);
    receiptsByRenewal.set(r.renewal_request_id, list);
  }
  return (renewals || []).map((renewal) => ({ ...renewal, receipts: receiptsByRenewal.get(renewal.id) || [] }));
}

async function loadRenewalsForPanel(supabase, ownerId) {
  const { data } = await supabase.from('renewal_requests')
    .select('id,expected_amount,due_date,updated_at,customers(id,name,phone)').eq('user_id', ownerId).eq('status', 'renewal_pending').order('updated_at').limit(20);
  return data || [];
}

async function loadNoAccess(supabase, ownerId) {
  const { data: customers } = await supabase.from('customers').select('id,name,phone,status,due_day').eq('user_id', ownerId).eq('status', 'active').order('name');
  const { data: targets } = await supabase.from('customer_panel_targets').select('id,customer_id,active,is_primary').eq('user_id', ownerId).eq('active', true).eq('is_primary', true);
  const primaryByCustomer = new Set((targets || []).map((t) => t.customer_id));
  return (customers || []).filter((c) => !primaryByCustomer.has(c.id));
}

async function loadLowCredentials(supabase, ownerId) {
  const { data: targets } = await supabase.from('customer_panel_targets')
    .select('id,customer_id,external_username,access_password_ciphertext,active,is_primary,valid_until,customers(id,name,phone),cinehub_servers(id,name)')
    .eq('user_id', ownerId).eq('active', true).eq('is_primary', true);
  return (targets || []).filter((t) => !t.external_username || !t.access_password_ciphertext);
}

async function loadSemCheckout(supabase, ownerId) {
  const { data: customers } = await supabase.from('customers').select('id,name,phone,status,value,due_day,paid').eq('user_id', ownerId).eq('status', 'active');
  const { data: targets } = await supabase.from('customer_panel_targets')
    .select('customer_id,checkout_url,active,is_primary').eq('user_id', ownerId).eq('active', true).eq('is_primary', true);
  const map = new Map((targets || []).map((t) => [t.customer_id, t.checkout_url]));
  return (customers || []).filter((c) => !map.get(c.id));
}

async function loadHoje(supabase, ownerId) {
  const [reminders, receipts, recovery, receiptsLow] = await Promise.all([
    supabase.from('billing_reminder_queue').select('id,due_date,stage,payment_method,status,customers(id,name,phone)').eq('user_id', ownerId).in('status', ['planned', 'approved']),
    supabase.from('renewal_requests').select('id,due_date,status').eq('user_id', ownerId).eq('status', 'renewal_pending'),
    supabase.from('customer_recovery_queue').select('id,status').eq('user_id', ownerId).in('status', ['pending', 'reminded']),
    supabase.from('renewal_requests').select('id').eq('user_id', ownerId).eq('status', 'awaiting_bank_review'),
  ]);
  return {
    reminders: reminders.data || [],
    renewals: receipts.data || [],
    recovery: recovery.data || [],
    baixa_count: receiptsLow.data?.length || 0,
  };
}

function formatBaixa(items) {
  if (!items.length) return { text: '✅ Nenhum comprovante aguardando baixa.' };
  const lines = [`📋 *${items.length} comprovante(s) aguardando baixa*`, ''];
  for (const r of items) {
    const rec = (r.receipts || [])[0];
    lines.push(`• ${r.customers?.name || '—'} (${r.customers?.phone || '—'}) · vencimento ${r.due_date ? new Date(`${r.due_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'} · esperado R$ ${Number(r.expected_amount || 0).toFixed(2).replace('.', ',')}${rec ? ` · recebido R$ ${Number(rec.amount || 0).toFixed(2).replace('.', ',')}` : ''}`);
  }
  lines.push('');
  lines.push('Acesse /baixa no painel para revisar e confirmar.');
  return { text: lines.join('\n') };
}

function formatRecovery(items) {
  if (!items.length) return { text: '✅ Nenhum cliente em recuperação.' };
  const lines = [`♻️ *${items.length} cliente(s) em recuperação*`, ''];
  for (const r of items) {
    lines.push(`• ${r.customers?.name || '—'} (${r.customers?.phone || '—'}) · vencimento ${r.last_due_date ? new Date(`${r.last_due_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'} · ${r.status}${r.reason ? ` · ${r.reason}` : ''}`);
  }
  return { text: lines.join('\n') };
}

function formatReminders(items) {
  if (!items.length) return { text: '✅ Nenhum lembrete de cobrança planejado.' };
  const lines = [`� *${items.length} lembrete(s) planejado(s)*`, ''];
  for (const r of items) {
    lines.push(`• ${r.customers?.name || '—'} (${r.customers?.phone || '—'}) · vencimento ${r.due_date ? new Date(`${r.due_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'} · ${r.stage} · ${r.status} · ${r.payment_method} · id ${r.id.slice(0, 8)}`);
  }
  lines.push('');
  lines.push('Use /aprovar <id> ou /rejeitar <id> para decidir. Acesse /central para revisar e aprovar.');
  return { text: lines.join('\n') };
}

function formatRenewals(items) {
  if (!items.length) return { text: '✅ Nenhuma baixa confirmada aguardando renovação.' };
  const lines = [`🔄 *${items.length} baixa(s) confirmada(s) para renovar*`, ''];
  for (const r of items) {
    lines.push(`• ${r.customers?.name || '—'} (${r.customers?.phone || '—'}) · R$ ${Number(r.expected_amount || 0).toFixed(2).replace('.', ',')} · ${r.due_date ? new Date(`${r.due_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'} · id ${r.id.slice(0, 8)}`);
  }
  lines.push('');
  lines.push('Acesse /baixa → Renovação no painel para copiar credenciais.');
  return { text: lines.join('\n') };
}

function formatNoAccess(items) {
  if (!items.length) return { text: '✅ Todos os clientes ativos possuem acesso principal.' };
  const lines = [`🚫 *${items.length} cliente(s) ativo(s) sem acesso principal*`, ''];
  for (const c of items) lines.push(`• ${c.name} (${c.phone})`);
  lines.push('');
  lines.push('Vincule um servidor em Clientes → Gerenciar acesso.');
  return { text: lines.join('\n') };
}

function formatLowCredentials(items) {
  if (!items.length) return { text: '✅ Todos os acessos principais estão com credenciais completas.' };
  const lines = [`🔑 *${items.length} acesso(s) com credenciais incompletas*`, ''];
  for (const t of items) lines.push(`• ${t.customers?.name} (${t.customers?.phone}) · servidor ${t.cinehub_servers?.name || '—'} · ${t.external_username ? 'faltam senha' : 'faltam usuário/senha'}`);
  lines.push('');
  lines.push('Preencha em Clientes → Gerenciar acesso.');
  return { text: lines.join('\n') };
}

function formatSemCheckout(items) {
  if (!items.length) return { text: '✅ Todos os clientes ativos possuem checkout vinculado.' };
  const lines = [`🛒 *${items.length} cliente(s) ativo(s) sem checkout*`, ''];
  for (const c of items) lines.push(`• ${c.name} (${c.phone}) · R$ ${Number(c.value || 0).toFixed(2).replace('.', ',')}${c.due_day ? ` · dia ${c.due_day}` : ''}`);
  lines.push('');
  lines.push('Cadastre um checkout em Clientes → Gerenciar acesso.');
  return { text: lines.join('\n') };
}

function formatHoje(data) {
  const reminders = data.reminders || [];
  const renewal = data.renewals || [];
  const recovery = data.recovery || [];
  const baixa = data.baixa_count || 0;
  const lines = ['🗓️ *Hoje no Horizons*', '', `💬 Lembretes planejados/aprovados: ${reminders.length}`, `💳 Comprovantes aguardando baixa: ${baixa}`, `🔄 Baixas confirmadas aguardando renovação: ${renewal.length}`, `♻️ Clientes em recuperação: ${recovery.length}`, ''];
  if (reminders.length) {
    lines.push('--- Lembretes ---');
    for (const r of reminders.slice(0, 5)) lines.push(`• ${r.customers?.name} (${r.customers?.phone}) · ${r.stage} · ${r.status} · ${r.payment_method}`);
    if (reminders.length > 5) lines.push(`… e mais ${reminders.length - 5}`);
  }
  return { text: lines.join('\n') };
}

function helpText() {
  return [
    'Comandos disponíveis:',
    '/baixa — comprovantes aguardando revisão',
    '/recuperacao — clientes em recuperação',
    '/renovacoes — baixas confirmadas para renovar',
    '/lembretes — lembretes de cobrança planejados',
    '/digest — resumo diário',
    '/hoje — resumo do dia',
    '/semacesso — clientes ativos sem acesso principal',
    '/semcheckout — clientes ativos sem checkout',
    '/semcredenciais — acessos com credenciais incompletas',
    '/aprovar <id> — aprovar lembrete de cobrança (confirmação)',
    '/rejeitar <id> — cancelar lembrete de cobrança (confirmação)',
    '/recuperar <id> — marcar cliente como recuperado (confirmação)',
    '/wplay — status e catálogo do painel WPlay (somente leitura)',
  ].join('\n');
}

export async function runTelegramCommand(supabase, config, name, args = []) {
  const ownerId = config.horizonsOwnerUserId;
  switch (name) {
    case 'baixa': return formatBaixa(await loadLowQueue(supabase, ownerId));
    case 'aprovacoes':
    case 'recuperacao': return formatRecovery(await loadRecovery(supabase, ownerId));
    case 'lembretes': return formatReminders(await loadReminders(supabase, ownerId));
    case 'renovacoes': return formatRenewals(await loadRenewalsForPanel(supabase, ownerId));
    case 'digest': return { text: await composeDailyDigest(supabase, ownerId) };
    case 'semacesso': return formatNoAccess(await loadNoAccess(supabase, ownerId));
    case 'semcheckout': return formatSemCheckout(await loadSemCheckout(supabase, ownerId));
    case 'hoje': return formatHoje(await loadHoje(supabase, ownerId));
    case 'semcredenciais': return formatLowCredentials(await loadLowCredentials(supabase, ownerId));
    case 'aprovar': {
      const id = args[0];
      if (!id) return { text: '❌ Use /aprovar <id-do-lembrete>. Liste com /lembretes.' };
      const reminder = await supabase.from('billing_reminder_queue').select('id,status,due_date').eq('id', id).eq('user_id', ownerId).maybeSingle();
      if (reminder.error || !reminder.data) return { text: '❌ Lembrete não encontrado.' };
      if (reminder.data.status !== 'planned') return { text: `❌ Lembrete está em status ${reminder.data.status}.` };
      return { text: `📝 Aprovar lembrete ${id.slice(0, 8)} (vencimento ${reminder.data.due_date})?`, confirmation: { tool: 'billing_reminder_decision', args: { id, status: 'approved' } } };
    }
    case 'rejeitar': {
      const id = args[0];
      if (!id) return { text: '❌ Use /rejeitar <id-do-lembrete>. Liste com /lembretes.' };
      const reminder = await supabase.from('billing_reminder_queue').select('id,status').eq('id', id).eq('user_id', ownerId).maybeSingle();
      if (reminder.error || !reminder.data) return { text: '❌ Lembrete não encontrado.' };
      if (reminder.data.status !== 'planned') return { text: `❌ Lembrete está em status ${reminder.data.status}.` };
      return { text: `📝 Cancelar lembrete ${id.slice(0, 8)}?`, confirmation: { tool: 'billing_reminder_decision', args: { id, status: 'cancelled' } } };
    }
    case 'recuperar': {
      const id = args[0];
      if (!id) return { text: '❌ Use /recuperar <id-da-recuperacao>. Liste no /baixa para localizar.' };
      const row = await supabase.from('customer_recovery_queue').select('id,status,customers(id,name,phone)').eq('id', id).eq('user_id', ownerId).maybeSingle();
      if (row.error || !row.data) return { text: '❌ Recuperação não encontrada.' };
      if (!['pending', 'reminded'].includes(row.data.status)) return { text: `❌ Recuperação está em status ${row.data.status}.` };
      return { text: `📝 Marcar ${row.data.customers?.name} como recuperado?`, confirmation: { tool: 'recovery_decision', args: { id, status: 'recovered' } } };
    }
    case 'wplay': {
      const configured = Boolean(config.wwpanelApiKey);
      const writes = Boolean(config.wwpanelWritesEnabled);
      return { text: [
        '🎬 *Painel WPlay (wwpanel)*',
        `Chave: ${configured ? '✅ configurada' : '❌ ausente'}`,
        `Escritas reais: ${writes ? '✅ habilitadas' : '⛔ desativadas'}`,
        'Durações de teste: 1h, 2h, 4h, 8h, 12h, 24h',
        `Planos: ${WWPANEL_PLANS.map(([, nome]) => nome).join(' · ')}`,
        `Pacotes IPTV: ${WWPANEL_IPTV_PACKAGES.length} · Apps: ${WWPANEL_APPS.join(', ')}`,
        '',
        'Operações de escrita consomem créditos e são feitas pelo painel (/wplay), não pelo bot.',
      ].join('\n') };
    }
    default: return { text: helpText() };
  }
}

export function parseTelegramCommand(text) {
  const match = text.match(/^\/([a-záéíóúçãõâêôà]+)(?:[ ]+(.+))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const args = (match[2] || '').trim().split(/\s+/).filter(Boolean);
  return { name, args };
}
