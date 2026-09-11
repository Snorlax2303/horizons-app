function deliveryProfileSchema(z) {
  return z.object({
    cinehub_server_id: z.string().uuid().nullable().optional(),
    app_name: z.string().trim().min(1).max(160),
    device_category: z.string().trim().min(1).max(40),
    partner_code: z.string().trim().max(160).nullable().optional(),
    downloader_code: z.string().trim().max(160).nullable().optional(),
    ntdown_code: z.string().trim().max(160).nullable().optional(),
    download_url: z.string().trim().max(2000).nullable().optional(),
    dns: z.string().trim().max(2000).nullable().optional(),
    instructions: z.string().trim().max(4000).nullable().optional(),
    valid_from: z.string().trim().max(40).nullable().optional(),
    valid_until: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
    display_order: z.number().int().optional(),
  });
}

function tutorialSlotSchema(z) {
  return z.object({
    device_category: z.string().trim().min(1).max(40),
    manufacturer: z.string().trim().max(80).nullable().optional(),
    title: z.string().trim().min(1).max(160),
    media_type: z.enum(['video', 'image', 'document']).optional(),
    media_url: z.string().trim().max(2000).nullable().optional(),
    script_notes: z.string().trim().max(4000).nullable().optional(),
    status: z.enum(['pending_recording', 'recorded', 'published']).optional(),
    sort_order: z.number().int().optional(),
    server_delivery_profile_id: z.string().uuid().nullable().optional(),
  });
}

import { refreshEliteCatalog } from '../refreshEliteCatalog.js';

export function registerCatalogRoutes(app, { supabase, requireAuthenticatedUser, z, config }) {
  app.get('/operations/delivery-profiles', requireAuthenticatedUser, async (request, response) => {
    let query = supabase.from('server_delivery_profiles')
      .select('id,cinehub_server_id,device_category,app_name,partner_code,downloader_code,ntdown_code,download_url,dns,instructions,valid_from,valid_until,active,display_order,created_at,updated_at,cinehub_servers(id,name,code)')
      .eq('user_id', request.horizonsUser.id).order('display_order').order('created_at');
    if (request.query.server_id) query = query.eq('cinehub_server_id', request.query.server_id);
    if (request.query.category) query = query.eq('device_category', request.query.category);
    const [{ data, error }, serversResult] = await Promise.all([
      query,
      supabase.from('cinehub_servers').select('id,name,code').eq('user_id', request.horizonsUser.id).eq('active', true).order('name'),
    ]);
    if (error) return response.status(500).json({ error: error.message });
    if (serversResult.error) return response.status(500).json({ error: serversResult.error.message });
    return response.json({ items: data || [], servers: serversResult.data || [] });
  });

  app.post('/operations/delivery-profiles', requireAuthenticatedUser, async (request, response) => {
    const parsed = deliveryProfileSchema(z).safeParse(request.body);
    if (!parsed.success || !parsed.data.cinehub_server_id) return response.status(400).json({ error: 'Informe servidor e aplicativo.', details: parsed.success ? undefined : parsed.error.flatten() });
    const payload = { ...parsed.data, user_id: request.horizonsUser.id, changed_by: request.horizonsUser.id };
    const { data, error } = await supabase.from('server_delivery_profiles').insert(payload).select('*').single();
    if (error) return response.status(500).json({ error: error.message });
    return response.status(201).json({ profile: data });
  });

  app.put('/operations/delivery-profiles/:id', requireAuthenticatedUser, async (request, response) => {
    const parsed = deliveryProfileSchema(z).partial().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    const changes = { ...parsed.data, updated_at: new Date().toISOString(), changed_by: request.horizonsUser.id };
    const { data, error } = await supabase.from('server_delivery_profiles')
      .update(changes).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!data) return response.status(404).json({ error: 'App não encontrado.' });
    return response.json({ profile: data });
  });

  app.delete('/operations/delivery-profiles/:id', requireAuthenticatedUser, async (request, response) => {
    const { error } = await supabase.from('server_delivery_profiles')
      .delete().eq('id', request.params.id).eq('user_id', request.horizonsUser.id);
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ deleted: true });
  });

  app.post('/operations/delivery-profiles/refresh-elite', requireAuthenticatedUser, async (_request, response) => {
    try {
      const result = await refreshEliteCatalog(supabase, config);
      return response.json({ ...result, sent: false, message: 'Catálogo Elite IPTV atualizado. Um teste foi criado no painel.' });
    } catch (error) {
      return response.status(500).json({ error: error.message });
    }
  });

  app.post('/operations/delivery-profiles/clone', requireAuthenticatedUser, async (request, response) => {
    const parsed = z.object({ source_server_id: z.string().uuid(), target_server_id: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.' });
    if (parsed.data.source_server_id === parsed.data.target_server_id) return response.status(400).json({ error: 'Origem e destino iguais.' });
    const { data: sources, error: sourcesError } = await supabase.from('server_delivery_profiles')
      .select('device_category,app_name,partner_code,downloader_code,ntdown_code,download_url,dns,instructions,display_order')
      .eq('user_id', request.horizonsUser.id).eq('cinehub_server_id', parsed.data.source_server_id);
    if (sourcesError) return response.status(500).json({ error: sourcesError.message });
    if (!sources?.length) return response.json({ cloned: 0, note: 'Servidor de origem sem apps cadastrados.' });
    const { data: existing } = await supabase.from('server_delivery_profiles')
      .select('device_category,app_name').eq('user_id', request.horizonsUser.id).eq('cinehub_server_id', parsed.data.target_server_id);
    const exists = new Set((existing || []).map((row) => `${row.device_category}|${row.app_name}`));
    const toCreate = sources.filter((row) => !exists.has(`${row.device_category}|${row.app_name}`)).map((row, index) => ({
      user_id: request.horizonsUser.id, cinehub_server_id: parsed.data.target_server_id,
      device_category: row.device_category, app_name: row.app_name,
      partner_code: row.partner_code, downloader_code: row.downloader_code, ntdown_code: row.ntdown_code,
      download_url: row.download_url, dns: row.dns, instructions: row.instructions,
      active: true, display_order: (row.display_order || 0) + index,
    }));
    if (!toCreate.length) return response.json({ cloned: 0, skipped: sources.length, note: 'Apps já cadastrados no destino.' });
    const { data: created, error } = await supabase.from('server_delivery_profiles').insert(toCreate).select('id');
    if (error) return response.status(500).json({ error: error.message });
    return response.status(201).json({ cloned: (created || []).length, skipped: sources.length - toCreate.length, note: 'Apps clonados a partir do servidor de origem.' });
  });

  app.get('/operations/tutorial-slots', requireAuthenticatedUser, async (request, response) => {
    let query = supabase.from('tutorial_media_slots')
      .select('id,device_category,manufacturer,title,media_type,media_url,script_notes,status,sort_order,server_delivery_profile_id,created_at,updated_at,server_delivery_profiles(id,app_name,cinehub_server_id)')
      .eq('user_id', request.horizonsUser.id).order('sort_order').order('created_at');
    if (request.query.category) query = query.eq('device_category', request.query.category);
    if (request.query.delivery_profile_id) query = query.eq('server_delivery_profile_id', request.query.delivery_profile_id);
    const { data, error } = await query;
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ items: data || [] });
  });

  app.post('/operations/tutorial-slots', requireAuthenticatedUser, async (request, response) => {
    const parsed = tutorialSlotSchema(z).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    const payload = { ...parsed.data, user_id: request.horizonsUser.id, changed_by: request.horizonsUser.id };
    const { data, error } = await supabase.from('tutorial_media_slots').insert(payload).select('*').single();
    if (error) return response.status(500).json({ error: error.message });
    return response.status(201).json({ tutorial: data });
  });

  app.put('/operations/tutorial-slots/:id', requireAuthenticatedUser, async (request, response) => {
    const parsed = tutorialSlotSchema(z).partial().safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    const changes = { ...parsed.data, updated_at: new Date().toISOString(), changed_by: request.horizonsUser.id };
    const { data, error } = await supabase.from('tutorial_media_slots')
      .update(changes).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
    if (error) return response.status(500).json({ error: error.message });
    if (!data) return response.status(404).json({ error: 'Procedimento não encontrado.' });
    return response.json({ tutorial: data });
  });

  app.delete('/operations/tutorial-slots/:id', requireAuthenticatedUser, async (request, response) => {
    const { error } = await supabase.from('tutorial_media_slots')
      .delete().eq('id', request.params.id).eq('user_id', request.horizonsUser.id);
    if (error) return response.status(500).json({ error: error.message });
    return response.json({ deleted: true });
  });
}
