import { openAccessValue, sealAccessValue } from '../accessVault.js';

function credentialSchema(z) {
  return z.object({
    customer_panel_target_id: z.string().uuid(),
    app_category: z.enum(['smart_tv', 'android_tv', 'tv_box', 'android', 'ios', 'computer', 'fire_tv', 'console', 'other']),
    app_name: z.string().trim().min(1).max(160),
    install_url: z.string().trim().max(2000).optional().nullable(),
    code: z.string().trim().max(160).optional().nullable(),
    username: z.string().trim().max(160).optional().nullable(),
    password: z.string().trim().max(400).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    display_order: z.number().int().optional(),
  });
}

export function registerCustomerServerRoutes(app, { supabase, requireAuthenticatedUser, customerServerMigrationSchema, z, sealAccessValue, config }) {
  app.get('/customers/:id/server-accesses', requireAuthenticatedUser, async (request, response) => {
    const { data: customer, error: customerError } = await supabase.from('customers').select('id,name')
      .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (customerError) return response.status(500).json({ error: 'Não foi possível consultar o cliente.' });
    if (!customer) return response.status(404).json({ error: 'Cliente não encontrado.' });
    const [serversResult, legacyServersResult, accessesResult, historyResult, credentialsResult] = await Promise.all([
      supabase.from('cinehub_servers').select('id,code,name,active,is_default_trial').eq('user_id', request.horizonsUser.id).order('name'),
      supabase.from('servers').select('id,name').eq('user_id', request.horizonsUser.id).order('name'),
      supabase.from('customer_panel_targets').select('id,server_id,cinehub_server_id,external_username,external_plan,screens,active,is_primary,checkout_url,access_password_ciphertext,valid_until,deactivated_at,replaced_by_target_id,created_at')
        .eq('user_id', request.horizonsUser.id).eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('customer_server_history').select('id,customer_panel_target_id,from_server_id,to_server_id,reason,source,metadata,created_at')
        .eq('user_id', request.horizonsUser.id).eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('customer_panel_targets').select('id').eq('user_id', request.horizonsUser.id).eq('customer_id', customer.id),
    ]);
    if (serversResult.error || legacyServersResult.error || accessesResult.error || historyResult.error || credentialsResult.error) {
      return response.status(500).json({ error: 'Não foi possível consultar os acessos e o histórico do cliente.' });
    }
    const targetIds = (credentialsResult.data || []).map((t) => t.id);
    const credentialsByTarget = new Map();
    if (targetIds.length) {
      const { data: appCreds, error: appCredsError } = await supabase.from('customer_access_credentials')
        .select('id,customer_panel_target_id,app_category,app_name,install_url,code,username,password_ciphertext,notes,display_order,changed_by,created_at,updated_at')
        .eq('user_id', request.horizonsUser.id).in('customer_panel_target_id', targetIds).order('display_order');
      if (appCredsError) return response.status(500).json({ error: 'Não foi possível consultar os apps.' });
      for (const item of appCreds || []) {
        const { password_ciphertext, ...rest } = item;
        const list = credentialsByTarget.get(item.customer_panel_target_id) || [];
        list.push({ ...rest, password: password_ciphertext ? openAccessValue(password_ciphertext, config.webhookSharedSecret) : null });
        credentialsByTarget.set(item.customer_panel_target_id, list);
      }
    }
    const serverMap = new Map((serversResult.data || []).map((server) => [server.id, server]));
    const legacyServerMap = new Map((legacyServersResult.data || []).map((server) => [server.id, server]));
    return response.json({
      customer,
      servers: serversResult.data || [],
      accesses: (accessesResult.data || []).map((access) => {
        const { access_password_ciphertext: passwordCiphertext, ...safeAccess } = access;
        return {
          ...safeAccess,
          server: serverMap.get(access.cinehub_server_id) || legacyServerMap.get(access.server_id) || null,
          server_type: access.cinehub_server_id ? 'cinehub' : access.server_id ? 'legacy' : null,
          legacy_credentials: { username: access.external_username || null, password: passwordCiphertext ? openAccessValue(passwordCiphertext, config.webhookSharedSecret) : null },
          apps: credentialsByTarget.get(access.id) || [],
        };
      }),
      history: (historyResult.data || []).map((entry) => ({
        ...entry,
        from_server: serverMap.get(entry.from_server_id) || null,
        to_server: serverMap.get(entry.to_server_id) || null,
      })),
    });
  });

  app.post('/customers/:id/server-accesses/credentials/from-catalog/:targetId', requireAuthenticatedUser, async (request, response) => {
    const { data: target, error: targetError } = await supabase.from('customer_panel_targets')
      .select('id,customer_id,cinehub_server_id').eq('id', request.params.targetId).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (targetError) return response.status(500).json({ error: targetError.message });
    if (!target) return response.status(404).json({ error: 'Acesso não encontrado.' });
    if (target.customer_id !== request.params.id) return response.status(400).json({ error: 'Acesso não pertence ao cliente.' });
    if (!target.cinehub_server_id) return response.status(400).json({ error: 'Acesso sem servidor CineHub/Elite vinculado.' });
    const [profilesResult, existingResult] = await Promise.all([
      supabase.from('server_delivery_profiles')
        .select('id,device_category,app_name,partner_code,downloader_code,ntdown_code,download_url,instructions')
        .eq('user_id', request.horizonsUser.id).eq('cinehub_server_id', target.cinehub_server_id).eq('active', true).order('display_order'),
      supabase.from('customer_access_credentials').select('app_category,app_name').eq('user_id', request.horizonsUser.id).eq('customer_panel_target_id', target.id),
    ]);
    if (profilesResult.error || existingResult.error) return response.status(500).json({ error: 'Não foi possível montar a partir do catálogo.' });
    const profiles = profilesResult.data || [];
    const existing = new Set((existingResult.data || []).map((row) => `${row.app_category}|${row.app_name}`));
    const toCreate = profiles.filter((p) => !existing.has(`${p.device_category}|${p.app_name}`));
    if (!toCreate.length) return response.json({ created: 0, skipped: profiles.length, note: 'Os apps deste servidor já estão cadastrados para este acesso.' });
    const rows = toCreate.map((p, index) => ({
      user_id: request.horizonsUser.id,
      customer_panel_target_id: target.id,
      app_category: p.device_category,
      app_name: p.app_name,
      install_url: p.download_url,
      code: p.partner_code || p.downloader_code || p.ntdown_code || null,
      username: null,
      password_ciphertext: null,
      notes: p.instructions || null,
      display_order: index,
      changed_by: request.horizonsUser.id,
    }));
    const { data: created, error } = await supabase.from('customer_access_credentials').insert(rows).select('id');
    if (error) return response.status(500).json({ error: error.message });
    return response.status(201).json({ created: (created || []).length, skipped: profiles.length - toCreate.length, credential_ids: (created || []).map((row) => row.id), note: 'Os apps foram criados a partir do catálogo. Preencha usuário e senha em cada um.' });
  });

  app.post('/customers/:id/server-accesses/credentials', requireAuthenticatedUser, async (request, response) => {
    const parsed = credentialSchema(z).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados do app inválidos.', details: parsed.error.flatten() });
    const data = parsed.data;
    const { data: target, error: targetError } = await supabase.from('customer_panel_targets')
      .select('id').eq('id', data.customer_panel_target_id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (targetError) return response.status(500).json({ error: targetError.message });
    if (!target) return response.status(404).json({ error: 'Acesso não encontrado.' });
    const { data: row, error } = await supabase.from('customer_access_credentials').insert({
      user_id: request.horizonsUser.id,
      customer_panel_target_id: data.customer_panel_target_id,
      app_category: data.app_category,
      app_name: data.app_name,
      install_url: data.install_url || null,
      code: data.code || null,
      username: data.username || null,
      password_ciphertext: data.password ? sealAccessValue(data.password, config.webhookSharedSecret) : null,
      notes: data.notes || null,
      display_order: data.display_order || 0,
      changed_by: request.horizonsUser.id,
    }).select('*').single();
    if (error) return response.status(500).json({ error: error.message });
    const { password_ciphertext, ...safe } = row;
    return response.status(201).json({ credential: { ...safe, password: null } });
  });

  app.put('/customers/:id/server-accesses/credentials/:credId', requireAuthenticatedUser, async (request, response) => {
    const parsed = credentialSchema(z).partial({ customer_panel_target_id: true }).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados do app inválidos.', details: parsed.error.flatten() });
    const data = parsed.data;
    const changes = {};
    if (data.app_category) changes.app_category = data.app_category;
    if (data.app_name) changes.app_name = data.app_name;
    if (data.install_url !== undefined) changes.install_url = data.install_url || null;
    if (data.code !== undefined) changes.code = data.code || null;
    if (data.username !== undefined) changes.username = data.username || null;
    if (data.password) changes.password_ciphertext = sealAccessValue(data.password, config.webhookSharedSecret);
    if (data.notes !== undefined) changes.notes = data.notes || null;
    if (data.display_order !== undefined) changes.display_order = data.display_order;
    changes.changed_by = request.horizonsUser.id;
    changes.updated_at = new Date().toISOString();
    const { data: row, error } = await supabase.from('customer_access_credentials')
      .update(changes).eq('id', request.params.credId).eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!row) return response.status(404).json({ error: 'Credencial não encontrada.' });
    const { password_ciphertext, ...safe } = row;
    return response.json({ credential: { ...safe, password: null } });
  });

  app.delete('/customers/:id/server-accesses/credentials/:credId', requireAuthenticatedUser, async (request, response) => {
    const { error } = await supabase.from('customer_access_credentials')
      .delete().eq('id', request.params.credId).eq('user_id', request.horizonsUser.id);
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ deleted: true });
  });

  app.post('/customers/:id/server-migrations', requireAuthenticatedUser, async (request, response) => {
    const parsed = customerServerMigrationSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados do novo acesso inválidos.', details: parsed.error.flatten() });
    const data = parsed.data;
    const { data: result, error } = await supabase.rpc('migrate_customer_server_access', {
      p_user_id: request.horizonsUser.id,
      p_customer_id: request.params.id,
      p_to_server_id: data.to_server_id,
      p_reason: data.reason,
      p_external_username: data.external_username,
      p_external_plan: data.external_plan || null,
      p_screens: data.screens,
      p_dns: data.dns || null,
      p_checkout_url: data.checkout_url || null,
      p_access_password_ciphertext: sealAccessValue(data.password, config.webhookSharedSecret),
      p_access_message_ciphertext: sealAccessValue(data.access_message, config.webhookSharedSecret),
      p_valid_until: data.valid_until || null,
      p_changed_by: request.horizonsUser.id,
      p_source: 'manual',
    });
    if (error) return response.status(500).json({ error: error.message || 'Não foi possível trocar o servidor do cliente.' });
    return response.status(201).json({ migrated: true, result });
  });
}
