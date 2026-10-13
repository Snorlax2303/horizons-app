import { chatCompletion, listModels } from '../llm.js';

const httpUrl = (z) => z.string().trim().url().max(300).refine((value) => /^https?:\/\//i.test(value), 'Use http(s).');

export function registerAiSettingsRoutes(app, { requireOwnerUser, aiSettings, z, fetchImpl }) {
  const modelField = z.string().trim().max(160).nullable().optional();
  const saveSchema = z.object({
    base_url: httpUrl(z).optional(),
    api_key: z.string().trim().min(8).max(500).optional(),
    clear_key: z.boolean().optional(),
    models: z.object({ fast: modelField, smart: modelField, vision: modelField }).optional(),
    fallback_models: z.array(z.string().trim().min(1).max(160)).max(5).optional(),
  }).strict();
  const testSchema = z.object({
    base_url: httpUrl(z).optional(),
    api_key: z.string().trim().min(8).max(500).optional(),
    model: z.string().trim().min(1).max(160).optional(),
  }).strict();

  app.get('/settings/ai', requireOwnerUser, async (_request, response) => {
    try {
      return response.json(await aiSettings.publicView());
    } catch (error) {
      console.error('Falha ao ler configuração de IA', error.message);
      return response.status(500).json({ error: 'Não foi possível ler a configuração de IA.' });
    }
  });

  app.put('/settings/ai', requireOwnerUser, async (request, response) => {
    const parsed = saveSchema.safeParse(request.body || {});
    if (!parsed.success) return response.status(400).json({ error: 'Configuração de IA inválida.', details: parsed.error.flatten() });
    const body = parsed.data;
    try {
      const view = await aiSettings.save({
        baseUrl: body.base_url, apiKey: body.api_key, clearKey: body.clear_key === true,
        models: body.models, fallbackModels: body.fallback_models,
      }, request.horizonsUser.id);
      console.info(JSON.stringify({ event: 'ai_settings_saved', key_changed: Boolean(body.api_key || body.clear_key), request_id: request.requestId }));
      return response.json(view);
    } catch (error) {
      console.error('Falha ao salvar configuração de IA', error.message);
      return response.status(500).json({ error: 'Não foi possível salvar a configuração de IA.' });
    }
  });

  // Testa a conexão com a chave digitada (antes de salvar) ou com a salva.
  // Com `model`, também faz uma chamada curta de chat para validar o modelo.
  app.post('/settings/ai/test', requireOwnerUser, async (request, response) => {
    const parsed = testSchema.safeParse(request.body || {});
    if (!parsed.success) return response.status(400).json({ error: 'Teste de IA inválido.', details: parsed.error.flatten() });
    const current = await aiSettings.resolve({ fresh: true });
    const baseUrl = parsed.data.base_url || current.baseUrl;
    const apiKey = parsed.data.api_key || current.apiKey;
    if (!baseUrl || !apiKey) return response.status(400).json({ ok: false, error: 'Informe a URL e a chave do OmniRoute.' });
    const startedAt = Date.now();
    try {
      const models = await listModels({ baseUrl, apiKey, fetchImpl });
      let chat = null;
      if (parsed.data.model) {
        const chatStarted = Date.now();
        const reply = await chatCompletion({ ...current, baseUrl, apiKey, timeoutMs: 30_000 }, {
          model: parsed.data.model, maxTokens: 20,
          messages: [{ role: 'user', content: 'Responda somente com a palavra: ok' }],
          fetchImpl,
        });
        chat = { model: parsed.data.model, ok: true, reply: reply.trim().slice(0, 40), latency_ms: Date.now() - chatStarted };
      }
      return response.json({ ok: true, models, model_count: models.length, latency_ms: Date.now() - startedAt, chat });
    } catch (error) {
      return response.status(502).json({ ok: false, error: error.message.slice(0, 300) });
    }
  });
}
