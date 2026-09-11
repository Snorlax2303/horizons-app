const buckets = new Map();

export function webhookRateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (request, response, next) => {
    const key = `${request.method}:${request.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + windowMs; }
    bucket.count += 1; buckets.set(key, bucket);
    if (bucket.count > max) return response.status(429).json({ error: 'Limite de requisições excedido.', retry_in_ms: bucket.resetAt - now });
    next();
  };
}

export function recordWebhookEvent(supabase, payload) {
  return supabase.from('webhook_audit').insert(payload).then(({ error }) => { if (error) console.error('Falha ao auditar webhook', error.message); });
}

export function registerAuditRoute(app, { supabase, requireAuthenticatedUser }) {
  app.get('/audit/webhooks', requireAuthenticatedUser, async (request, response) => {
    const limit = Math.min(Number(request.query.limit) || 50, 200);
    const provider = request.query.provider ? String(request.query.provider) : null;
    let query = supabase.from('webhook_audit').select('id,provider,event_id,status,duration_ms,received_at').order('received_at', { ascending: false }).limit(limit);
    if (provider) query = query.eq('provider', provider);
    const { data, error } = await query;
    if (error) {
      if (String(error.message || '').includes('does not exist')) {
        return response.json({ events: [], warning: 'Tabela de auditoria ainda não aplicada.' });
      }
      return response.status(500).json({ error: error.message });
    }
    return response.json({ events: data || [] });
  });
}
