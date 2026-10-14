import { looksLikeGroupPhone } from '../evolutionMedia.js';

// Manutenção do backlog de comprovantes (agosto/2026): reprocessa leituras que
// falharam e arquiva ocorrências abertas por imagens de grupos do WhatsApp.
// Tudo começa em dry_run=true; nada é enviado a clientes.
export function registerReceiptMaintenanceRoutes(app, {
  supabase, requireOwnerUser, z, ownerUserId, aiSettings,
  fetchMediaBase64, extractPixReceipt, receiptExtractorIsConfigured, validateReceipt,
}) {
  const reprocessSchema = z.object({
    dry_run: z.boolean().default(true),
    limit: z.number().int().min(1).max(50).default(10),
    scope: z.enum(['known_customers', 'all_private']).default('known_customers'),
  }).strict();

  async function failedCandidates(scope, limit) {
    let query = supabase.from('pix_receipts')
      .select('id,whatsapp_message_id,media_type,created_at,renewal_request_id,renewal_requests!inner(id,customer_id,phone,expected_amount,status)')
      .eq('user_id', ownerUserId).eq('extraction_status', 'failed')
      .not('validation_flags', 'cs', '["media_unavailable"]')
      .order('created_at', { ascending: false }).limit(Math.min(limit * 5, 500));
    if (scope === 'known_customers') query = query.not('renewal_requests.customer_id', 'is', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).filter((row) => !looksLikeGroupPhone(row.renewal_requests?.phone)).slice(0, limit);
  }

  app.post('/payments/receipts/reprocess', requireOwnerUser, async (request, response) => {
    const parsed = reprocessSchema.safeParse(request.body || {});
    if (!parsed.success) return response.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten() });
    const { dry_run: dryRun, limit, scope } = parsed.data;
    const ai = await aiSettings.resolve();
    try {
      const candidates = await failedCandidates(scope, limit);
      if (dryRun) {
        return response.json({ dry_run: true, scope, ai_configured: receiptExtractorIsConfigured(ai), candidates: candidates.length, sample: candidates.slice(0, 5).map((row) => ({ id: row.id, created_at: row.created_at, has_customer: Boolean(row.renewal_requests?.customer_id) })) });
      }
      if (!receiptExtractorIsConfigured(ai)) return response.status(503).json({ error: 'Configure a IA (modelo de visão) em Configurações antes de reprocessar.' });
      const results = { completed: 0, media_unavailable: 0, extraction_failed: 0 };
      for (const row of candidates) {
        const mimeType = row.media_type === 'pdf' ? 'application/pdf' : 'image/jpeg';
        let base64;
        try {
          base64 = await fetchMediaBase64(row.whatsapp_message_id);
        } catch {
          base64 = null;
        }
        if (!base64) {
          results.media_unavailable += 1;
          await supabase.from('pix_receipts').update({ validation_flags: ['extraction_failed', 'media_unavailable'] }).eq('id', row.id);
          continue;
        }
        try {
          const extracted = await extractPixReceipt(ai, { base64, mimeType });
          const validation = validateReceipt(extracted, { amount: row.renewal_requests?.expected_amount });
          await supabase.from('pix_receipts').update({
            extraction_status: 'completed',
            extracted_data: { ...extracted, intake: { source: 'reprocess', reprocessed_at: new Date().toISOString() } },
            confidence: extracted.confidence, end_to_end_id: extracted.end_to_end_id, amount: extracted.amount,
            paid_at: extracted.paid_at, payer_name: extracted.payer_name, recipient_name: extracted.recipient_name,
            bank_name: extracted.bank_name, is_scheduled: extracted.is_scheduled, validation_flags: validation.flags,
          }).eq('id', row.id);
          results.completed += 1;
        } catch (error) {
          results.extraction_failed += 1;
          console.error('Falha ao reprocessar comprovante', error.message);
        }
      }
      return response.json({ dry_run: false, scope, processed: candidates.length, ...results });
    } catch (error) {
      return response.status(500).json({ error: 'Falha ao reprocessar comprovantes.', detail: error.message });
    }
  });

  // Ocorrências abertas por imagem recebida em GRUPO não são renovação de cliente.
  app.post('/payments/receipts/dismiss-groups', requireOwnerUser, async (request, response) => {
    const dryRun = request.body?.dry_run !== false;
    const { data, error } = await supabase.from('renewal_requests').select('id,phone')
      .eq('user_id', ownerUserId).eq('source', 'whatsapp_finance_unsolicited')
      .in('status', ['receipt_received', 'awaiting_bank_review']).limit(1000);
    if (error) return response.status(500).json({ error: error.message });
    const ids = (data || []).filter((row) => looksLikeGroupPhone(row.phone)).map((row) => row.id);
    if (dryRun || !ids.length) return response.json({ dry_run: dryRun, renewals: ids.length });
    const now = new Date().toISOString();
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      const { error: renewalError } = await supabase.from('renewal_requests').update({ status: 'rejected', updated_at: now }).in('id', chunk);
      if (renewalError) return response.status(500).json({ error: renewalError.message });
      await supabase.from('pix_receipts').update({ review_status: 'rejected', reviewed_by: request.horizonsUser.id, reviewed_at: now })
        .in('renewal_request_id', chunk).eq('review_status', 'pending');
    }
    console.info(JSON.stringify({ event: 'receipts_group_dismissed', renewals: ids.length, request_id: request.requestId }));
    return response.json({ dry_run: false, renewals: ids.length });
  });
}
