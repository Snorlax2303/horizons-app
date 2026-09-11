import { openAccessValue } from '../accessVault.js';

export function composeRenewalListMessage(items) {
  if (!items.length) return null;
  const lines = ['🔔 *Baixas confirmadas — renovar no painel*', ''];
  items.forEach((item, index) => {
    const customer = item.customer?.name || 'Cliente';
    const phone = item.customer?.phone || '';
    const screens = item.target?.screens || '?';
    const serverName = item.server_name || 'servidor';
    lines.push(`${index + 1}. *${customer}* (${phone}) · ${screens} tela(s)`);
    lines.push(`   Servidor: ${serverName}`);
    if ((item.target?.apps || []).length) {
      item.target.apps.forEach((app) => {
        lines.push(`   • [${app.app_category}] ${app.app_name}${app.code ? ` — código: ${app.code}` : ''}${app.username ? ` — usuário: ${app.username}` : ''}${app.password ? ` — senha: ${app.password}` : ''}${app.install_url ? ` — instalar: ${app.install_url}` : ''}`);
        if (app.notes) lines.push(`     obs: ${app.notes}`);
      });
    } else {
      lines.push('   (sem apps cadastrados para este acesso)');
    }
    lines.push(`   Valor recebido: R$ ${Number(item.received_amount || 0).toFixed(2).replace('.', ',')} · Esperado: R$ ${Number(item.expected_amount || 0).toFixed(2).replace('.', ',')}`);
    lines.push('');
  });
  lines.push('Acesse o painel do servidor e renove cada cliente usando os dados acima.');
  return lines.join('\n');
}

export async function loadWhatsappRenewalItems(supabase, config, userId) {
  return loadRenewalItems(supabase, config, userId);
}

async function loadRenewalItems(supabase, config, userId, renewalIds) {
  const renewalsResult = await supabase.from('renewal_requests')
    .select('id,customer_id,phone,expected_amount,due_date,customers(id,name,phone)').eq('user_id', userId).eq('status', 'renewal_pending').order('updated_at').limit(200);
  const renewals = renewalIds ? (renewalsResult.data || []).filter((r) => renewalIds.includes(r.id)) : (renewalsResult.data || []);
  const customerIds = [...new Set(renewals.map((r) => r.customer_id).filter(Boolean))];
  const targets = customerIds.length
    ? (await supabase.from('customer_panel_targets').select('id,customer_id,cinehub_server_id,server_id,external_username,external_plan,screens,checkout_url,valid_until').eq('user_id', userId).in('customer_id', customerIds).eq('active', true).eq('is_primary', true)).data || []
    : [];
  const targetIds = targets.map((t) => t.id);
  const apps = targetIds.length
    ? (await supabase.from('customer_access_credentials').select('id,customer_panel_target_id,app_category,app_name,install_url,code,username,password_ciphertext,notes,display_order').eq('user_id', userId).in('customer_panel_target_id', targetIds).order('display_order')).data || []
    : [];
  const cinehub = customerIds.length
    ? (await supabase.from('cinehub_servers').select('id,name').eq('user_id', userId).in('id', [...new Set(targets.map((t) => t.cinehub_server_id).filter(Boolean))])).data || []
    : [];
  const targetsByCustomer = new Map(targets.map((t) => [t.customer_id, t]));
  const cinehubMap = new Map(cinehub.map((s) => [s.id, s]));
  const appsByTarget = new Map();
  for (const app of apps) {
    const { password_ciphertext, ...rest } = app;
    const list = appsByTarget.get(app.customer_panel_target_id) || [];
    list.push({ ...rest, password: password_ciphertext ? openAccessValue(password_ciphertext, config.webhookSharedSecret) : null });
    appsByTarget.set(app.customer_panel_target_id, list);
  }
  return renewals.map((renewal) => {
    const target = targetsByCustomer.get(renewal.customer_id);
    return {
      renewal_id: renewal.id, customer: renewal.customers, expected_amount: renewal.expected_amount, received_amount: renewal.expected_amount,
      target: target ? { ...target, apps: appsByTarget.get(target.id) || [] } : null,
      server_name: target?.cinehub_server_id ? cinehubMap.get(target.cinehub_server_id)?.name : (target?.server_id ? 'legacy' : null),
    };
  });
}

export function registerRenewalListRoutes(app, { supabase, requireAuthenticatedUser, config }) {
  app.get('/operations/renewal-list', requireAuthenticatedUser, async (request, response) => {
    const items = await loadRenewalItems(supabase, config, request.horizonsUser.id);
    return response.json({ items, count: items.length, note: 'Lista de clientes com baixa confirmada aguardando renovação no painel. Apps decriptados para o operador.' });
  });

  app.post('/operations/renewal-list/send', requireAuthenticatedUser, async (request, response) => {
    if (config.horizonsWhatsappRenewalEnabled !== true) {
      return response.status(503).json({ error: 'Envio da lista de renovação por WhatsApp está desligado (HORIZONS_WHATSAPP_RENEWAL_ENABLED).' });
    }
    if (!config.evolutionApiUrl || !config.evolutionFinanceInstance || !config.horizonsWhatsappRenewalNumber) {
      return response.status(503).json({ error: 'Evolution financeira ou número de destino não configurados.' });
    }
    const items = await loadRenewalItems(supabase, config, request.horizonsUser.id);
    const text = composeRenewalListMessage(items);
    if (!text) return response.json({ sent: false, count: 0, message: 'Nenhuma baixa confirmada aguardando renovação.' });
    const phone = String(config.horizonsWhatsappRenewalNumber).replace(/\D/g, '');
    const url = `${String(config.evolutionApiUrl).replace(/\/$/, '')}/message/sendText/${encodeURIComponent(config.evolutionFinanceInstance)}`;
    const response_telegram = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
      body: JSON.stringify({ number: phone, text, delay: 500 }),
      signal: AbortSignal.timeout(30_000),
    });
    return response.json({ sent: response_telegram.ok, count: items.length, status: response_telegram.status });
  });
}
