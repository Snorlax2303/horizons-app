export function registerPaymentReadRoutes(app, { supabase, config, requireAuthenticatedUser, efiIsConfigured, receiptExtractorIsConfigured, receiptExtractorModel }) {
  app.get('/integrations/receipt-extractor', requireAuthenticatedUser, (_, response) => {
    response.json({ configured: receiptExtractorIsConfigured(config), provider: config.receiptAiProvider, model: receiptExtractorModel(config) });
  });

  app.get('/payments/efi', requireAuthenticatedUser, async (request, response) => {
    const { data: customers, error: customersError } = await supabase.from('customers').select('id,name')
      .eq('user_id', request.horizonsUser.id).order('name').limit(1000);
    if (customersError) return response.status(500).json({ error: 'Não foi possível carregar clientes para as cobranças.' });
    const ids = (customers || []).map((customer) => customer.id);
    if (!ids.length) return response.json({ environment: config.efiEnvironment, configured: efiIsConfigured(config), payments: [] });
    const { data: payments, error } = await supabase.from('payment_events')
      .select('id,customer_id,status,amount,external_payment_id,paid_at,created_at')
      .eq('provider', 'efi').in('customer_id', ids).order('created_at', { ascending: false }).limit(100);
    if (error) return response.status(500).json({ error: 'Não foi possível carregar as cobranças.' });
    const names = new Map((customers || []).map((customer) => [customer.id, customer.name]));
    return response.json({
      environment: config.efiEnvironment, configured: efiIsConfigured(config),
      payments: (payments || []).map((payment) => ({ ...payment, customer_name: names.get(payment.customer_id) || 'Cliente removido' })),
    });
  });

  app.get('/renewals', requireAuthenticatedUser, async (request, response) => {
    const { data, error } = await supabase.from('renewal_requests').select('*,pix_receipts(*)')
      .eq('user_id', request.horizonsUser.id).order('created_at', { ascending: false }).limit(200);
    if (error) return response.status(500).json({ error: 'Não foi possível carregar as renovações.' });
    return response.json({ renewals: data || [] });
  });
}
