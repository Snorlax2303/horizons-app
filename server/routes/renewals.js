export async function notifyLowToTelegram(config, sendTelegramMessage, customer, renewal, receipt) {
  if (config.horizonsTelegramFinancialAlertsEnabled !== true) return;
  const chatId = config.telegramAdminAllowedUserIds[0];
  if (!chatId || !config.telegramAdminBotToken) return;
  const text = [
    '💰 *Nova baixa aguardando revisão*',
    '',
    `Cliente: ${customer?.name || '—'} (${customer?.phone || '—'})`,
    `Vencimento: ${renewal.due_date ? new Date(`${renewal.due_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}`,
    `Esperado: R$ ${Number(renewal.expected_amount || 0).toFixed(2).replace('.', ',')}`,
    `Recebido: R$ ${Number(receipt.amount || 0).toFixed(2).replace('.', ',')}`,
    `E2E: ${receipt.end_to_end_id || '—'}`,
    '',
    'Acesse /baixa para confirmar.',
  ].join('\n');
  await sendTelegramMessage(config, chatId, text);
}

export async function loadReceiptContext(supabase, userId, renewal, receipt) {
  const customerId = renewal.customer_id;
  const dueDate = renewal.due_date ? new Date(`${renewal.due_date}T12:00:00`) : null;
  const paidAt = receipt.paid_at ? new Date(receipt.paid_at) : null;
  const amountOk = Boolean(renewal.expected_amount && Number(receipt.amount) > 0 && Math.abs(Number(receipt.amount) - Number(renewal.expected_amount)) <= Math.max(1, Number(renewal.expected_amount) * 0.05));
  const dateOk = Boolean(paidAt && dueDate && Math.abs((paidAt - dueDate) / 86400000) <= 14);
  const customerOk = Boolean(customerId && renewal.phone && receipt.payer_name);
  const e2eOk = Boolean(receipt.end_to_end_id && /^\d{12,}$/.test(String(receipt.end_to_end_id).replace(/\D/g, '')));
  const validation = {
    amount_ok: amountOk,
    date_ok: dateOk,
    customer_ok: customerOk,
    e2e_ok: e2eOk,
    confidence: receipt.validation_flags?.length ? 'low' : 'high',
    flags: receipt.validation_flags || [],
  };
  if (!customerId) return { customer: null, primary_target: null, recovery: null, expected_amount: renewal.expected_amount, received_amount: receipt.amount, validation };
  const [customerResult, targetResult, recoveryResult] = await Promise.all([
    supabase.from('customers').select('id,name,phone,value,due_day,status,paid').eq('id', customerId).eq('user_id', userId).maybeSingle(),
    supabase.from('customer_panel_targets').select('id,server_id,cinehub_server_id,external_username,external_plan,screens,dns,checkout_url,access_password_ciphertext,active,is_primary,valid_until').eq('user_id', userId).eq('customer_id', customerId).eq('active', true).eq('is_primary', true).maybeSingle(),
    supabase.from('customer_recovery_queue').select('status,last_due_date,reason').eq('user_id', userId).eq('customer_id', customerId).in('status', ['pending', 'reminded']).maybeSingle(),
  ]);
  return {
    customer: customerResult.data || null,
    primary_target: targetResult.data ? { ...targetResult.data, credentials_complete: Boolean(targetResult.data.external_username && targetResult.data.access_password_ciphertext) } : null,
    recovery: recoveryResult.data || null,
    expected_amount: renewal.expected_amount,
    received_amount: receipt.amount,
    validation,
  };
}

export function registerRenewalRoutes(app, { supabase, requireAuthenticatedUser, renewalRequestSchema, receiptSchema, receiptReviewSchema, validateReceipt, processPaidPayment, config, sendTelegramMessage }) {
  app.post('/renewals', requireAuthenticatedUser, async (request, response) => {
    const parsed = renewalRequestSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Solicitação inválida.', details: parsed.error.flatten() });
    if (parsed.data.customer_id) {
      const { data: customer } = await supabase.from('customers').select('id').eq('id', parsed.data.customer_id).eq('user_id', request.horizonsUser.id).maybeSingle();
      if (!customer) return response.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const { data, error } = await supabase.from('renewal_requests').insert({ ...parsed.data, user_id: request.horizonsUser.id, phone: parsed.data.phone.replace(/\D/g, ''), status: 'awaiting_receipt' }).select().single();
    if (error) return response.status(500).json({ error: 'Não foi possível abrir a renovação.' });
    return response.status(201).json({ renewal: data });
  });

  app.post('/renewals/:id/receipts', requireAuthenticatedUser, async (request, response) => {
    const parsed = receiptSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Comprovante inválido.', details: parsed.error.flatten() });
    const { data: renewal } = await supabase.from('renewal_requests').select('id,expected_amount,status').eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (!renewal) return response.status(404).json({ error: 'Renovação não encontrada.' });
    const validation = validateReceipt(parsed.data, { amount: renewal.expected_amount });
    const { data, error } = await supabase.from('pix_receipts').insert({ ...parsed.data, user_id: request.horizonsUser.id, renewal_request_id: renewal.id, extraction_status: 'completed', validation_flags: validation.flags }).select().single();
    if (error?.code === '23505') return response.status(409).json({ error: 'Este comprovante/E2E já foi utilizado.' });
    if (error) return response.status(500).json({ error: 'Não foi possível registrar o comprovante.' });
    await supabase.from('renewal_requests').update({ status: 'awaiting_bank_review', updated_at: new Date().toISOString() }).eq('id', renewal.id);
    const { data: customer } = await supabase.from('customers').select('id,name,phone').eq('id', renewal.customer_id).eq('user_id', request.horizonsUser.id).maybeSingle();
    notifyLowToTelegram(config, sendTelegramMessage, customer, renewal, data).catch((err) => console.error('Falha ao notificar baixa', err.message));
    return response.status(201).json({ receipt: data, validation });
  });

  app.get('/renewals/:renewalId/receipts/:receiptId', requireAuthenticatedUser, async (request, response) => {
    const { data: renewal, error: renewalError } = await supabase.from('renewal_requests')
      .select('id,customer_id,expected_amount,phone,status,due_date').eq('id', request.params.renewalId).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (renewalError) return response.status(500).json({ error: renewalError.message });
    if (!renewal) return response.status(404).json({ error: 'Renovação não encontrada.' });
    const { data: receipt, error: receiptError } = await supabase.from('pix_receipts')
      .select('id,end_to_end_id,amount,paid_at,bank,payer_name,validation_flags,review_status,created_at').eq('id', request.params.receiptId).eq('renewal_request_id', renewal.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (receiptError) return response.status(500).json({ error: receiptError.message });
    if (!receipt) return response.status(404).json({ error: 'Comprovante não encontrado.' });
    const context = await loadReceiptContext(supabase, request.horizonsUser.id, renewal, receipt);
    return response.json({ renewal, receipt, context });
  });

  app.post('/renewals/:renewalId/receipts/:receiptId/review', requireAuthenticatedUser, async (request, response) => {
    const parsed = receiptReviewSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'Decisão inválida.' });
    const { data: renewal } = await supabase.from('renewal_requests').select('id,customer_id,expected_amount').eq('id', request.params.renewalId).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (!renewal) return response.status(404).json({ error: 'Renovação não encontrada.' });
    const { data: receipt } = await supabase.from('pix_receipts').select('id,end_to_end_id,amount,paid_at').eq('id', request.params.receiptId).eq('renewal_request_id', renewal.id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (!receipt) return response.status(404).json({ error: 'Comprovante não encontrado.' });
    const now = new Date().toISOString();
    await supabase.from('pix_receipts').update({ review_status: parsed.data.decision, reviewed_by: request.horizonsUser.id, reviewed_at: now }).eq('id', receipt.id);
    if (parsed.data.decision !== 'confirmed') {
      const status = parsed.data.decision === 'rejected' ? 'rejected' : 'awaiting_receipt';
      await supabase.from('renewal_requests').update({ status, updated_at: now }).eq('id', renewal.id);
      return response.json({ accepted: true, status, sent: false, message: 'Decisão registrada. Nenhuma mensagem foi enviada.' });
    }
    if (!renewal.customer_id) return response.status(422).json({ error: 'Vincule um cliente antes de confirmar o pagamento.' });
    const eventKey = receipt.end_to_end_id || `receipt:${receipt.id}`;
    const { data: event, error } = await supabase.from('payment_events').upsert({ provider: 'manual_pix', provider_event_id: eventKey, external_payment_id: receipt.end_to_end_id, customer_id: renewal.customer_id, status: 'paid', amount: receipt.amount || renewal.expected_amount, paid_at: receipt.paid_at || now, payload: { receipt_id: receipt.id, human_confirmed: true } }, { onConflict: 'provider,provider_event_id', ignoreDuplicates: true }).select('id,customer_id').maybeSingle();
    if (error) return response.status(500).json({ error: 'Não foi possível confirmar o pagamento.' });
    if (event) await processPaidPayment(event, { customer_id: renewal.customer_id });
    await supabase.from('renewal_requests').update({ status: 'renewal_pending', confirmed_payment_event_id: event?.id || null, updated_at: now }).eq('id', renewal.id);
    return response.json({ accepted: true, status: 'renewal_pending', sent: false, message: 'Pagamento confirmado. Nenhuma mensagem foi enviada.' });
  });
}

export function registerPaymentOverviewRoutes(app, { supabase, requireAuthenticatedUser }) {
  app.get('/payments/overview', requireAuthenticatedUser, async (request, response) => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(request.query.offset) || 0, 0);
    const [renewalsResult, countResult] = await Promise.all([
      supabase.from('renewal_requests')
        .select('id,customer_id,phone,expected_amount,due_date,status,updated_at,customers(id,name,phone)')
        .eq('user_id', request.horizonsUser.id).eq('status', 'awaiting_bank_review').order('updated_at', { ascending: true }).range(offset, offset + limit - 1),
      supabase.from('renewal_requests').select('id', { count: 'exact', head: true }).eq('user_id', request.horizonsUser.id).eq('status', 'awaiting_bank_review'),
    ]);
    if (renewalsResult.error) return response.status(500).json({ error: renewalsResult.error.message });
    const renewals = renewalsResult.data || [];
    const renewalIds = (renewals || []).map((item) => item.id);
    const customerIds = [...new Set((renewals || []).map((item) => item.customer_id).filter(Boolean))];
    const [receiptsResult, recoveryResult] = await Promise.all([
      renewalIds.length
        ? supabase.from('pix_receipts').select('id,renewal_request_id,end_to_end_id,amount,paid_at,bank,payer_name,validation_flags,review_status,created_at')
          .eq('user_id', request.horizonsUser.id).in('renewal_request_id', renewalIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      customerIds.length
        ? supabase.from('customer_recovery_queue').select('customer_id,status,last_due_date').eq('user_id', request.horizonsUser.id).in('customer_id', customerIds).in('status', ['pending', 'reminded'])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (receiptsResult.error || recoveryResult.error) return response.status(500).json({ error: 'Não foi possível montar o resumo da baixa.' });
    const receiptsByRenewal = new Map();
    for (const receipt of receiptsResult.data || []) {
      const list = receiptsByRenewal.get(receipt.receipt.renewal_request_id) || [];
      list.push(receipt);
      receiptsByRenewal.set(receipt.receipt.renewal_request_id, list);
    }
    const recoveryByCustomer = new Map((recoveryResult.data || []).map((item) => [item.customer_id, item]));
    const items = (renewals || []).map((renewal) => ({
      renewal_id: renewal.id,
      due_date: renewal.due_date,
      expected_amount: renewal.expected_amount,
      status: renewal.status,
      updated_at: renewal.updated_at,
      customer: renewal.customers || null,
      recovery: renewal.customer_id ? recoveryByCustomer.get(renewal.customer_id) || null : null,
      receipts: receiptsByRenewal.get(renewal.id) || [],
    }));
    return response.json({ items, count: countResult.count || 0, limit, offset, has_more: (countResult.count || 0) > offset + items.length, note: 'Fila de baixa: comprovantes aguardando revisão humana antes de confirmar o pagamento.' });
  });
}
