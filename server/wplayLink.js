// server/wplayLink.js — vínculo cliente Horizons ↔ linha WPlay (id_user) e
// validação de pagamento (Opção B: sempre validar antes de criar/renovar).
//
// Tudo aqui é tolerante a falha e NUNCA lança: operações de painel reais já
// consumiram crédito quando começamos a vincular; um erro de banco não pode
// esconder o resultado do painel. Os retornos trazem `{ ok|linked|recorded }`
// para o chamador decidir o que logar.

const LINE_ID_KEYS = ['id_user', 'id', '_id', 'lineId', 'line_id'];
const LINE_USERNAME_KEYS = ['username', 'user', 'login'];

function pick(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return undefined;
}

function lineCandidates(result) {
  if (!result || typeof result !== 'object') return [];
  const list = [result, result.line, result.data, result.customer, result.user];
  for (const value of [result.data, result.user, result.lines, result.results]) {
    if (Array.isArray(value)) list.push(value[0]);
  }
  return list.filter((item) => item && typeof item === 'object');
}

// Extrai o id da linha (id_user) de qualquer formato de resposta do painel.
export function extractLineId(result) {
  for (const candidate of lineCandidates(result)) {
    const id = pick(candidate, LINE_ID_KEYS);
    if (id) return id;
  }
  return null;
}

export function extractLineUsername(result) {
  for (const candidate of lineCandidates(result)) {
    const user = pick(candidate, LINE_USERNAME_KEYS);
    if (user) return user;
  }
  return null;
}

// Opção B — o cliente Horizons precisa ter pagamento confirmado: flag
// `paid` no cadastro OU um payment_event 'paid' dentro da janela.
export async function assertCustomerPaid(supabase, { userId, customerId, windowDays = 14 } = {}) {
  if (!customerId) {
    return { ok: false, status: 400, reason: 'customer_missing', error: 'Vincule um cliente do Horizons (customerId) — pagamento deve ser validado antes da operação no painel.' };
  }
  try {
    const { data: customer, error } = await supabase.from('customers')
      .select('id,paid,user_id').eq('id', customerId).maybeSingle();
    if (error) return { ok: false, status: 500, reason: 'lookup_failed', error: 'Não foi possível consultar o cliente.' };
    if (!customer) return { ok: false, status: 404, reason: 'customer_not_found', error: 'Cliente não encontrado no Horizons.' };
    if (userId && customer.user_id && customer.user_id !== userId) {
      return { ok: false, status: 403, reason: 'customer_foreign', error: 'Cliente pertence a outra conta.' };
    }
    if (customer.paid === true) return { ok: true, via: 'customer_paid' };
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const { data: events } = await supabase.from('payment_events')
      .select('id,paid_at').eq('customer_id', customerId).eq('status', 'paid').gte('paid_at', since).limit(1);
    if (events?.length) return { ok: true, via: 'payment_event' };
    return {
      ok: false, status: 402, reason: 'payment_unconfirmed',
      error: 'Pagamento não confirmado. Registre e confirme o pagamento do cliente antes de criar ou renovar no painel WPlay.',
    };
  } catch {
    return { ok: false, status: 500, reason: 'lookup_failed', error: 'Não foi possível validar o pagamento.' };
  }
}

// Guarda/Atualiza o vínculo da linha WPlay no cadastro do cliente.
// kind='production' → external_line_id (+ external_customer_id, pois no WPlay a
// linha É o cliente). kind='test' → external_test_line_id.
export async function linkWplayLine(supabase, { userId, customerId, lineId, kind = 'test', username } = {}) {
  if (!customerId || !lineId) return { linked: false, reason: 'incomplete' };
  const stamp = new Date().toISOString();
  const values = kind === 'production'
    ? { external_line_id: String(lineId), external_line_kind: 'production', external_customer_id: String(lineId), updated_at: stamp }
    : { external_test_line_id: String(lineId), external_line_kind: 'test', updated_at: stamp };
  if (username) values.external_username = username;
  try {
    const { data: existing } = await supabase.from('customer_panel_targets')
      .select('id').eq('customer_id', customerId).eq('active', true).order('is_primary', { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      const { error } = await supabase.from('customer_panel_targets').update(values).eq('id', existing.id);
      if (error) return { linked: false, error: error.message };
      return { linked: true, targetId: existing.id, kind };
    }
    if (!userId) return { linked: false, reason: 'no_owner' };
    const { data: created, error } = await supabase.from('customer_panel_targets')
      .insert({ user_id: userId, customer_id: customerId, active: true, ...values })
      .select('id').maybeSingle();
    if (error) return { linked: false, error: error.message };
    return { linked: true, targetId: created?.id ?? null, kind, created: true };
  } catch (error) {
    return { linked: false, error: error?.message ?? 'link_failed' };
  }
}

// Resolve o cliente Horizons a partir de um id de linha do painel (rota de renovação
// usa o :id da URL = id_user/linha). Aceita linha de produção ou vínculo antigo.
export async function resolveCustomerByLine(supabase, lineId) {
  if (!lineId || !/^[\w.-]{1,64}$/.test(lineId)) return null;
  try {
    const { data } = await supabase.from('customer_panel_targets')
      .select('customer_id,user_id').eq('active', true)
      .or(`external_line_id.eq.${lineId},external_customer_id.eq.${lineId}`)
      .limit(1);
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

// Resolve a linha âncora do cliente para ativar app por MAC sem decorar id_user.
export async function resolveWplayLine(supabase, { userId, customerId } = {}) {
  if (!customerId) return null;
  try {
    let query = supabase.from('customer_panel_targets')
      .select('id,external_line_id,external_line_kind,external_test_line_id')
      .eq('customer_id', customerId).eq('active', true).order('updated_at', { ascending: false }).limit(4);
    if (userId) query = query.eq('user_id', userId);
    const { data } = await query;
    const rows = data || [];
    const production = rows.find((row) => row.external_line_id && row.external_line_kind === 'production');
    const anyLine = rows.find((row) => row.external_line_id);
    const testLine = rows.find((row) => row.external_test_line_id);
    const row = production || anyLine || testLine;
    if (!row) return null;
    return { targetId: row.id ?? null, lineId: row.external_line_id || row.external_test_line_id || null };
  } catch {
    return null;
  }
}

// Registra a ativação de app (MAC) na credencial de acesso do cliente.
export async function recordAppActivation(supabase, { userId, customerId, targetId, mac, nameApp } = {}) {
  if (!customerId || !mac) return { recorded: false, reason: 'incomplete' };
  try {
    let resolvedTargetId = targetId || null;
    if (!resolvedTargetId) {
      const { data: target } = await supabase.from('customer_panel_targets')
        .select('id').eq('customer_id', customerId).eq('active', true).order('is_primary', { ascending: false }).limit(1).maybeSingle();
      resolvedTargetId = target?.id ?? null;
    }
    if (!resolvedTargetId) return { recorded: false, reason: 'no_target' };
    const stamp = new Date().toISOString();
    const { data: existing } = await supabase.from('customer_access_credentials')
      .select('id').eq('customer_panel_target_id', resolvedTargetId).eq('mac_address', mac).maybeSingle();
    if (existing) {
      const { error } = await supabase.from('customer_access_credentials')
        .update({ mac_address: mac, app_activated_at: stamp, updated_at: stamp }).eq('id', existing.id);
      if (error) return { recorded: false, error: error.message };
      return { recorded: true, credentialId: existing.id };
    }
    if (!userId) return { recorded: false, reason: 'no_owner' };
    const { data: created, error } = await supabase.from('customer_access_credentials')
      .insert({
        user_id: userId, customer_panel_target_id: resolvedTargetId,
        app_category: 'other', app_name: nameApp || 'WPlay',
        mac_address: mac, app_activated_at: stamp, created_at: stamp, updated_at: stamp,
      }).select('id').maybeSingle();
    if (error) return { recorded: false, error: error.message };
    return { recorded: true, credentialId: created?.id ?? null };
  } catch (error) {
    return { recorded: false, error: error?.message ?? 'record_failed' };
  }
}
