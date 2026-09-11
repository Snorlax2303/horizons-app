import crypto from 'node:crypto';

export function registerPaymentWebhookRoute(app, {
  supabase,
  config,
  paymentSchema,
  processReferralFirstPayment,
  enqueueOperation,
  recordWebhookEvent = null,
}) {
  app.post('/webhooks/payments/:provider', async (request, response) => {
    const startedAt = Date.now();
    const provider = request.params.provider;
    const audit = (status) => {
      if (!recordWebhookEvent) return;
      recordWebhookEvent(supabase, {
        user_id: config.horizonsOwnerUserId || null,
        provider, event_id: request.body?.event_id || null,
        status, duration_ms: Date.now() - startedAt,
        metadata: { signature_valid: status < 400 },
      });
    };
    const expected = crypto.createHmac('sha256', config.webhookSharedSecret)
      .update(JSON.stringify(request.body)).digest('hex');
    const received = request.get('x-horizons-signature') || '';
    if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
      audit(401);
      return response.status(401).json({ error: 'Assinatura inválida.' });
    }

    const parsed = paymentSchema.safeParse(request.body);
    if (!parsed.success) { audit(400); return response.status(400).json({ error: 'Payload inválido.', details: parsed.error.flatten() }); }

    const payment = parsed.data;
    const { data: event, error } = await supabase.from('payment_events').upsert({
      provider: request.params.provider,
      provider_event_id: payment.event_id,
      external_payment_id: payment.external_payment_id || null,
      customer_id: payment.customer_id || null,
      status: payment.status,
      amount: payment.amount || null,
      paid_at: payment.paid_at || null,
      payload: payment.raw || request.body,
    }, { onConflict: 'provider,provider_event_id', ignoreDuplicates: true }).select('id,status,customer_id').maybeSingle();

    if (error) {
      console.error('Falha ao registrar webhook de pagamento', error);
      return response.status(500).json({ error: 'Não foi possível registrar o pagamento.' });
    }
    if (event && payment.status === 'paid' && payment.customer_id) {
      const { data: customerOwner, error: customerOwnerError } = await supabase.from('customers')
        .select('user_id').eq('id', payment.customer_id).maybeSingle();
      if (customerOwnerError || !customerOwner?.user_id) {
        console.error('Cliente do pagamento não possui proprietário', customerOwnerError);
        return response.status(422).json({ error: 'Cliente não encontrado para o pagamento.' });
      }
      try {
        await processReferralFirstPayment(payment.customer_id, customerOwner.user_id);
      } catch (rewardError) {
        console.error('Falha ao processar benefícios de indicação', rewardError);
      }
      const { data: automationJob, error: jobError } = await supabase.from('automation_jobs').upsert({
        payment_event_id: event.id, customer_id: payment.customer_id, action: 'renew_customer',
      }, { onConflict: 'payment_event_id', ignoreDuplicates: true }).select('id').maybeSingle();
      if (jobError) return response.status(500).json({ error: 'Não foi possível registrar a renovação.' });

      const { data: targets, error: targetsError } = await supabase.from('customer_panel_targets')
        .select('id,panel_connection_id,panel_connections(id,automation_mode,session_status,capabilities)')
        .eq('customer_id', payment.customer_id).eq('active', true);
      if (targetsError) return response.status(500).json({ error: 'Não foi possível preparar as operações do painel.' });
      if (!targets?.length) {
        await supabase.from('automation_jobs').update({ status: 'manual_review', last_error: 'Cliente sem tela vinculada a um painel.' }).eq('id', automationJob.id);
      }
      for (const target of targets || []) {
        const connection = target.panel_connections;
        const automatic = connection?.automation_mode === 'automatic'
          && connection?.session_status === 'connected' && connection?.capabilities?.renew === true;
        const { data: operation, error: operationError } = await supabase.from('panel_operations').upsert({
          user_id: customerOwner.user_id, payment_event_id: event.id, automation_job_id: automationJob.id,
          customer_id: payment.customer_id, customer_panel_target_id: target.id,
          panel_connection_id: target.panel_connection_id, action: 'renew_customer',
          status: automatic ? 'queued' : 'pending_approval', idempotency_key: `${event.id}:${target.id}:renew_customer`,
        }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id,status').maybeSingle();
        if (operationError) continue;
        if (operation?.status === 'queued') await enqueueOperation(operation.id);
      }
    }
    audit(202);
    return response.status(202).json({ accepted: true });
  });
}
