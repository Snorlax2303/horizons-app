export async function composeDailyDigest(supabase, userId) {
  const [remindersResult, recoveryResult, receiptsResult, profilesResult] = await Promise.all([
    supabase.from('billing_reminder_queue').select('id,stage,payment_method,due_date,status').eq('user_id', userId).in('status', ['planned', 'approved']).limit(50),
    supabase.from('customer_recovery_queue').select('id,status,last_due_date').eq('user_id', userId).in('status', ['pending', 'reminded']).limit(50),
    supabase.from('renewal_requests').select('id,status,customer_id').eq('user_id', userId).eq('status', 'awaiting_bank_review').limit(50),
    supabase.from('server_delivery_profiles').select('id,valid_until').eq('user_id', userId).eq('active', true).not('valid_until', 'is', null).limit(200),
  ]);
  const reminders = remindersResult.data || [];
  const recovery = recoveryResult.data || [];
  const receipts = receiptsResult.data || [];
  const today = new Date().toISOString().slice(0, 10);
  const expiringSoon = (profilesResult.data || []).filter((item) => item.valid_until && item.valid_until <= today).length;
  const plannedCheckout = reminders.filter((item) => item.status === 'planned' && item.payment_method === 'checkout').length;
  const plannedPix = reminders.filter((item) => item.status === 'planned' && item.payment_method === 'pix').length;
  const approvedCount = reminders.filter((item) => item.status === 'approved').length;
  return [
    '📊 Digest diário Horizons',
    '',
    `Lembretes planejados (hoje): ${plannedCheckout} checkout · ${plannedPix} Pix`,
    `Lembretes aprovados: ${approvedCount}`,
    `Comprovantes aguardando baixa: ${receipts.length}`,
    `Clientes em recuperação: ${recovery.length}`,
    `Códigos de servidor vencidos: ${expiringSoon}`,
    '',
    'Acesse o painel para revisar.',
  ].join('\n');
}

export async function sendTelegramMessage(config, chatId, text) {
  if (!config.telegramAdminBotToken || !chatId) return { skipped: true, reason: 'missing_token_or_chat' };
  const response = await fetch(`https://api.telegram.org/bot${config.telegramAdminBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20_000),
  });
  return { ok: response.ok, status: response.status };
}
