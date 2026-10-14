export function derivePaymentMethod(checkoutUrl, hasTarget) {
  if (checkoutUrl) return 'checkout';
  if (hasTarget) return 'pix';
  return 'manual';
}

function paging(request, defaultLimit = 50, maxLimit = 200) {
  const limit = Math.min(Math.max(Number(request.query.limit) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Number(request.query.offset) || 0, 0);
  return { limit, offset };
}

export function registerBillingRoutes(app, { supabase, requireAuthenticatedUser, requireBotBridge, ownerUserId }) {
  app.get('/billing/trends', requireAuthenticatedUser, async (request, response) => {
    const days = Math.min(Math.max(Number(request.query.days) || 30, 7), 180);
    const since = new Date(); since.setUTCDate(since.getUTCDate() - days); since.setUTCHours(0, 0, 0, 0);
    const { data: events, error } = await supabase.from('payment_events')
      .select('paid_at,amount,status,provider').eq('user_id', request.horizonsUser.id).eq('status', 'paid')
      .gte('paid_at', since.toISOString()).order('paid_at');
    if (error) return response.status(500).json({ error: error.message });
    const daily = new Map();
    for (const ev of events || []) {
      const day = ev.paid_at ? ev.paid_at.slice(0, 10) : null;
      if (!day) continue;
      daily.set(day, (daily.get(day) || 0) + Number(ev.amount || 0));
    }
    const series = Array.from(daily.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, amount]) => ({ day, amount }));
    const total = series.reduce((sum, item) => sum + item.amount, 0);
    return response.json({ days, total, series, count: events?.length || 0 });
  });

  app.get('/billing/overview', requireAuthenticatedUser, async (request, response) => {
    const { data: customers, error: customersError } = await supabase.from('customers')
      .select('id,name,phone,value,due_day,status,paid,plan_id').eq('user_id', request.horizonsUser.id).order('name');
    if (customersError) return response.status(500).json({ error: customersError.message });
    const customerIds = (customers || []).map((item) => item.id);
    const [targetsResult, paymentsResult, recoveryResult] = await Promise.all([
      customerIds.length
        ? supabase.from('customer_panel_targets').select('id,customer_id,cinehub_server_id,server_id,external_username,external_plan,screens,active,is_primary,dns,checkout_url,access_password_ciphertext,valid_until')
          .eq('user_id', request.horizonsUser.id).in('customer_id', customerIds).eq('active', true)
        : Promise.resolve({ data: [], error: null }),
      customerIds.length
        ? supabase.from('payment_events').select('customer_id,status,paid_at').eq('status', 'paid')
          .in('customer_id', customerIds).order('paid_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      customerIds.length
        ? supabase.from('customer_recovery_queue').select('customer_id,status,last_due_date,reason,payment_not_recognized_at,notes,updated_at')
          .eq('user_id', request.horizonsUser.id).in('customer_id', customerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (targetsResult.error || paymentsResult.error || recoveryResult.error) {
      return response.status(500).json({ error: 'Não foi possível montar o resumo financeiro.' });
    }
    const targetsByCustomer = new Map();
    for (const target of targetsResult.data || []) {
      const { access_password_ciphertext: passwordCiphertext, ...safe } = target;
      const current = targetsByCustomer.get(target.customer_id) || [];
      current.push({ ...safe, credentials_complete: Boolean(target.external_username && passwordCiphertext) });
      targetsByCustomer.set(target.customer_id, current);
    }
    const lastPaidByCustomer = new Map((paymentsResult.data || []).map((payment) => [payment.customer_id, payment.paid_at]));
    const recoveryByCustomer = new Map((recoveryResult.data || []).map((item) => [item.customer_id, item]));
    return response.json({
      customers: (customers || []).map((customer) => {
        const targets = targetsByCustomer.get(customer.id) || [];
        const primary = targets.find((target) => target.is_primary) || targets[0] || null;
        const recovery = recoveryByCustomer.get(customer.id) || null;
        return {
          id: customer.id, name: customer.name, phone: customer.phone, value: customer.value,
          due_day: customer.due_day, status: customer.status, paid: customer.paid,
          payment_method: primary ? derivePaymentMethod(primary.checkout_url, true) : 'manual',
          checkout_url: primary?.checkout_url || null,
          server_name: primary?.cinehub_server_id ? 'cinehub' : primary?.server_id ? 'legacy' : null,
          screens: primary?.screens || null,
          credentials_complete: primary?.credentials_complete || false,
          last_paid_at: lastPaidByCustomer.get(customer.id) || null,
          recovery: recovery ? { status: recovery.status, last_due_date: recovery.last_due_date, reason: recovery.reason, updated_at: recovery.updated_at } : null,
        };
      }),
    });
  });

  app.get('/recovery/queue', requireAuthenticatedUser, async (request, response) => {
    const { limit, offset } = paging(request, 50, 200);
    const [rowsResult, countResult] = await Promise.all([
      supabase.from('customer_recovery_queue')
        .select('*,customers(id,name,phone,value,due_day,status,paid)')
        .eq('user_id', request.horizonsUser.id).in('status', ['pending', 'reminded']).order('updated_at', { ascending: false }).range(offset, offset + limit - 1),
      supabase.from('customer_recovery_queue').select('id', { count: 'exact', head: true }).eq('user_id', request.horizonsUser.id).in('status', ['pending', 'reminded']),
    ]);
    if (rowsResult.error) return response.status(500).json({ error: rowsResult.error.message });
    const rows = rowsResult.data || [];
    return response.json({ items: rows, count: countResult.count || 0, limit, offset, has_more: (countResult.count || 0) > offset + rows.length });
  });

  async function listSendable(userId, request, response) {
    const { limit, offset } = paging(request, 50, 200);
    const { data, error } = await supabase.from('billing_reminder_queue')
      .select('id,due_date,stage,payment_method,checkout_url,message_preview,status,customers(id,name,phone)')
      .eq('user_id', userId).eq('status', 'approved').order('due_date').range(offset, offset + limit - 1);
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ items: data || [], count: data?.length || 0, limit, offset, note: 'Somente lembretes aprovados na Central Operacional.' });
  }

  // Marca como enviado apenas o que estava aprovado: evita reenvio e não
  // permite que o bot "envie" um lembrete que ninguém aprovou.
  async function markSent(userId, request, response) {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('billing_reminder_queue')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .eq('id', request.params.id).eq('user_id', userId).eq('status', 'approved').select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!data) return response.status(409).json({ error: 'Lembrete não está aprovado ou já foi enviado.' });
    return response.json({ reminder: data, sent: true, message: 'Lembrete marcado como enviado.' });
  }

  app.get('/billing/reminders/sendable', requireAuthenticatedUser, (request, response) => listSendable(request.horizonsUser.id, request, response));
  app.post('/billing/reminders/:id/sent', requireAuthenticatedUser, (request, response) => markSent(request.horizonsUser.id, request, response));

  // Mesmas operações para o workflow do n8n, autenticado pelo token da ponte do bot.
  if (requireBotBridge && ownerUserId) {
    app.get('/typebot/billing/reminders/sendable', requireBotBridge, (request, response) => listSendable(ownerUserId, request, response));
    app.post('/typebot/billing/reminders/:id/sent', requireBotBridge, (request, response) => markSent(ownerUserId, request, response));
  }

  app.get('/recovery/:id/history', requireAuthenticatedUser, async (request, response) => {
    const { data: row, error: rowError } = await supabase.from('customer_recovery_queue')
      .select('id,user_id').eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (rowError) return response.status(500).json({ error: rowError.message });
    if (!row) return response.status(404).json({ error: 'Registro não encontrado.' });
    const { data, error } = await supabase.from('customer_recovery_audit')
      .select('id,action,previous_status,new_status,notes,notes_length,created_at,changed_by')
      .eq('recovery_id', request.params.id).order('created_at', { ascending: false }).limit(100);
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ history: data || [] });
  });

  app.post('/recovery/:id/notes', requireAuthenticatedUser, async (request, response) => {
    const notes = typeof request.body?.notes === 'string' ? String(request.body.notes).trim().slice(0, 2000) : '';
    const { data: previous } = await supabase.from('customer_recovery_queue')
      .select('notes').eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    const { data, error } = await supabase.from('customer_recovery_queue')
      .update({ notes, updated_at: new Date().toISOString() }).eq('id', request.params.id)
      .eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!data) return response.status(404).json({ error: 'Registro não encontrado.' });
    await supabase.from('customer_recovery_audit').insert({
      user_id: request.horizonsUser.id, customer_id: data.customer_id, recovery_id: data.id,
      action: 'notes', previous_status: data.status, new_status: data.status,
      notes, notes_length: notes.length, changed_by: request.horizonsUser.id,
    });
    return response.json({ item: data });
  });

  app.post('/recovery/:id/decision', requireAuthenticatedUser, async (request, response) => {
    const status = request.body?.status;
    if (!['recovered', 'cancelled', 'lost'].includes(status)) return response.status(400).json({ error: 'Decisão inválida.' });
    const notes = typeof request.body?.notes === 'string' && request.body.notes.trim()
      ? String(request.body.notes).trim().slice(0, 2000) : null;
    const { data: previous } = await supabase.from('customer_recovery_queue')
      .select('status,notes').eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    const changes = { status, updated_at: new Date().toISOString() };
    if (notes !== null) changes.notes = notes;
    const { data, error } = await supabase.from('customer_recovery_queue')
      .update(changes).eq('id', request.params.id)
      .eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!data) return response.status(404).json({ error: 'Registro não encontrado.' });
    await supabase.from('customer_recovery_audit').insert({
      user_id: request.horizonsUser.id, customer_id: data.customer_id, recovery_id: data.id,
      action: 'status', previous_status: previous?.status || null, new_status: status,
      notes: data.notes || null, notes_length: (data.notes || '').length, changed_by: request.horizonsUser.id,
    });
    return response.json({ item: data, sent: false, message: 'Decisão registrada. Nenhuma mensagem foi enviada.' });
  });
}
