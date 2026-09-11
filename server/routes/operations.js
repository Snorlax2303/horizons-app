export function registerOperationsRoutes(app, { supabase, requireAuthenticatedUser }) {
  app.post('/operations/refresh', requireAuthenticatedUser, async (request, response) => {
    const { data, error } = await supabase.rpc('refresh_horizons_operations', { p_user_id: request.horizonsUser.id });
    if (error) return response.status(500).json({ error: error.message });
    return response.json(data || {});
  });

  app.get('/operations/overview', requireAuthenticatedUser, async (request, response) => {
    const userId = request.horizonsUser.id;
    const [tasks, reminders, imports, profiles, tutorials, legacyServers, cinehubServers, receipts] = await Promise.all([
      supabase.from('customer_contact_tasks').select('*,customers(id,name,phone)').eq('user_id', userId).eq('status', 'open').order('created_at'),
      supabase.from('billing_reminder_queue').select('*,customers(id,name,phone,value,due_day)').eq('user_id', userId).in('status', ['planned','approved','failed']).order('due_date'),
      supabase.from('customer_access_import_batches').select('id,filename,status,total_rows,ready_rows,blocked_rows,summary,completed_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
      supabase.from('server_delivery_profiles').select('*,servers(name),cinehub_servers(name,code)').eq('user_id', userId).order('valid_until', { ascending: true, nullsFirst: false }),
      supabase.from('tutorial_media_slots').select('*').eq('user_id', userId).order('device_category').order('sort_order'),
      supabase.from('servers').select('id,name').eq('user_id', userId).order('name'),
      supabase.from('cinehub_servers').select('id,name,code').eq('user_id', userId).eq('active', true).order('name'),
      supabase.from('renewal_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'awaiting_bank_review'),
    ]);
    const failed = [tasks, reminders, imports, profiles, tutorials, legacyServers, cinehubServers, receipts].find((result) => result.error);
    if (failed) return response.status(500).json({ error: failed.error.message });
    const expiringProfiles = (profiles.data || []).filter((item) => item.valid_until && new Date(`${item.valid_until}T23:59:59`).getTime() <= Date.now() + 7 * 86400000);
    return response.json({
      tasks: tasks.data || [], reminders: reminders.data || [], imports: imports.data || [], profiles: profiles.data || [], tutorials: tutorials.data || [], expiring_profiles: expiringProfiles,
      servers: { legacy: legacyServers.data || [], cinehub: cinehubServers.data || [] },
      digest: { open_tasks: tasks.data?.length || 0, planned_reminders: reminders.data?.filter((item) => item.status === 'planned').length || 0, receipts_to_review: receipts.count || 0, expiring_codes: expiringProfiles.length },
    });
  });

  app.post('/operations/reminders/:id/decision', requireAuthenticatedUser, async (request, response) => {
    const decision = request.body?.decision;
    if (!['approved', 'cancelled'].includes(decision)) return response.status(400).json({ error: 'Decisão inválida.' });
    const now = new Date().toISOString();
    const changes = decision === 'approved' ? { status: 'approved', approved_by: request.horizonsUser.id, approved_at: now, updated_at: now } : { status: 'cancelled', updated_at: now };
    const { data, error } = await supabase.from('billing_reminder_queue').update(changes).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).eq('status', 'planned').select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!data) return response.status(409).json({ error: 'Lembrete já processado ou inexistente.' });
    return response.json({ reminder: data, sent: false, message: 'Decisão registrada. Nenhuma mensagem foi enviada.' });
  });

  app.post('/operations/tasks/:id/decision', requireAuthenticatedUser, async (request, response) => {
    const status = request.body?.status;
    if (!['resolved', 'ignored'].includes(status)) return response.status(400).json({ error: 'Estado inválido.' });
    const { data, error } = await supabase.from('customer_contact_tasks').update({ status, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ task: data });
  });

  app.get('/operations/imports/:id/errors.csv', requireAuthenticatedUser, async (request, response) => {
    const { data, error } = await supabase.from('customer_access_import_items').select('row_number,validation_errors').eq('batch_id', request.params.id).eq('user_id', request.horizonsUser.id).eq('validation_status', 'blocked').order('row_number');
    if (error) return response.status(500).json({ error: error.message });
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = ['linha;erros', ...(data || []).map((item) => `${item.row_number};${quote((item.validation_errors || []).join(' | '))}`)].join('\n');
    response.set('content-type', 'text/csv; charset=utf-8');
    response.set('content-disposition', `attachment; filename="erros-importacao-${request.params.id}.csv"`);
    return response.send(`\ufeff${csv}`);
  });

}
