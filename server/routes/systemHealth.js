import { collectHealthSignals } from '../healthMonitor.js';

export function registerSystemHealthRoute(app, { requireAuthenticatedUser, requireOwnerUser, config, supabase, aiSettings }) {
  app.get('/health/details', requireAuthenticatedUser, async (request, response) => {
    const ai = aiSettings ? await aiSettings.resolve().catch(() => null) : null;
    const { error } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', request.horizonsUser.id);
    response.json({
      api: 'ok', database: error ? 'error' : 'ok',
      integrations: {
        evolution: Boolean(config.evolutionApiUrl && config.evolutionApiKey),
        telegram: Boolean(config.telegramAdminEnabled && config.telegramAdminBotToken),
        ai: Boolean(ai?.apiKey && ai?.baseUrl),
        paggpay: Boolean(config.paggpayApiKey),
        efi: Boolean(config.efiClientId && config.efiClientSecret),
      },
    });
  });

  // Mesmos sinais que o monitor do worker usa para alertar no Telegram.
  if (requireOwnerUser) {
    app.get('/health/monitor', requireOwnerUser, async (_request, response) => {
      try {
        return response.json(await collectHealthSignals({ config, supabase, aiSettings }));
      } catch (error) {
        return response.status(500).json({ error: 'Não foi possível coletar os sinais de saúde.', detail: error.message });
      }
    });
  }
}
