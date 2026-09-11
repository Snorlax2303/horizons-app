export function registerSystemHealthRoute(app, { requireAuthenticatedUser, config, supabase }) {
  app.get('/health/details', requireAuthenticatedUser, async (request, response) => {
    const { error } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', request.horizonsUser.id);
    response.json({
      api: 'ok', database: error ? 'error' : 'ok',
      integrations: {
        evolution: Boolean(config.evolutionApiUrl && config.evolutionApiKey),
        telegram: Boolean(config.telegramAdminEnabled && config.telegramAdminBotToken),
        minimax: Boolean(config.minimaxApiKey),
        paggpay: Boolean(config.paggpayApiKey),
        efi: Boolean(config.efiClientId && config.efiClientSecret),
      },
    });
  });
}
