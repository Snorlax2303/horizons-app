import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { registerReceiptMaintenanceRoutes } from './routes/receiptMaintenance.js';

function setup(rows, { configured = true, media = 'cG5n' } = {}) {
  const routes = {}; const updates = [];
  const app = { post(path, ...handlers) { routes[path] = handlers; } };
  const supabase = {
    from(table) {
      const api = {
        select() { return api; }, eq() { return api; }, not() { return api; }, order() { return api; }, limit() { return api; }, in() { return api; },
        update(value) { updates.push({ table, value }); return api; },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return api;
    },
  };
  registerReceiptMaintenanceRoutes(app, {
    supabase, z, requireOwnerUser: 'guard', ownerUserId: 'owner-1',
    aiSettings: { resolve: async () => ({}) },
    receiptExtractorIsConfigured: () => configured,
    fetchMediaBase64: async () => media,
    extractPixReceipt: async () => ({ amount: 30, confidence: 0.9, end_to_end_id: 'E1', paid_at: null, payer_name: null, recipient_name: null, bank_name: null, is_scheduled: false, model: 'm' }),
    validateReceipt: () => ({ flags: [] }),
  });
  const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  return { routes, updates, res };
}
const row = (phone, customer = 'c1') => ({ id: `r-${phone}`, whatsapp_message_id: 'm', media_type: 'image', renewal_requests: { customer_id: customer, phone, expected_amount: 30 } });

test('dry run conta candidatos e ignora grupos', async () => {
  const { routes, res } = setup([row('5516999999999'), row('120363025246125486')]);
  assert.equal(routes['/payments/receipts/reprocess'][0], 'guard');
  const out = res();
  await routes['/payments/receipts/reprocess'].at(-1)({ body: {} }, out);
  assert.equal(out.body.dry_run, true);
  assert.equal(out.body.candidates, 1);
});

test('reprocessa com IA e marca mídia indisponível', async () => {
  const ok = setup([row('5516999999999')]);
  const out = ok.res();
  await ok.routes['/payments/receipts/reprocess'].at(-1)({ body: { dry_run: false } }, out);
  assert.equal(out.body.completed, 1);
  assert.equal(ok.updates[0].value.extraction_status, 'completed');
  const gone = setup([row('5516999999999')], { media: null });
  const out2 = gone.res();
  await gone.routes['/payments/receipts/reprocess'].at(-1)({ body: { dry_run: false } }, out2);
  assert.equal(out2.body.media_unavailable, 1);
  assert.deepEqual(gone.updates[0].value.validation_flags, ['extraction_failed', 'media_unavailable']);
});

test('sem IA configurada não reprocessa', async () => {
  const { routes, res } = setup([row('5516999999999')], { configured: false });
  const out = res();
  await routes['/payments/receipts/reprocess'].at(-1)({ body: { dry_run: false } }, out);
  assert.equal(out.statusCode, 503);
});

test('arquivar grupos é dry run por padrão', async () => {
  const { routes, res, updates } = setup([{ id: 'g', phone: '120363025246125486' }, { id: 'p', phone: '5516999999999' }]);
  const out = res();
  await routes['/payments/receipts/dismiss-groups'].at(-1)({ body: {} }, out);
  assert.deepEqual(out.body, { dry_run: true, renewals: 1 });
  assert.equal(updates.length, 0);
});
