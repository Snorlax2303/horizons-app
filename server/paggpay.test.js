import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { normalizePaggpayTransaction, paggpayWebhookTransactionId, verifyPaggpayWebhookSignature } from './paggpay.js';

test('extrai o identificador de formatos comuns de callback', () => {
  assert.equal(paggpayWebhookTransactionId({ data: { id: 'txn_123' } }), 'txn_123');
  assert.equal(paggpayWebhookTransactionId({ transaction: { id: 'txn_abc-9' } }), 'txn_abc-9');
  assert.equal(paggpayWebhookTransactionId({ id: 'renewal-id' }), null);
});

test('normaliza transação Pix confirmada', () => {
  const normalized = normalizePaggpayTransaction({
    id: 'txn_123', status: 'succeeded', amount: 4990, paid_at: '2026-08-04T12:00:00Z', payer_phone: '5511999999999',
    pix: { reference_id: 'renewal-uuid', end_to_end_id: 'E123', code: 'pix-code' },
  });
  assert.deepEqual({ ...normalized, raw: undefined }, {
    id: 'txn_123', referenceId: 'renewal-uuid', status: 'succeeded', amount: 49.9, amountMinor: 4990,
    paidAt: '2026-08-04T12:00:00Z', payerPhone: '5511999999999', endToEndId: 'E123', pixCode: 'pix-code',
    qrCode: null, expiresAt: null, raw: undefined,
  });
});

test('valida assinatura oficial do webhook com tolerância de cinco minutos', () => {
  const body = '{"id":"evt_123"}';
  const timestamp = 1_800_000_000;
  const secret = 'whsec_test';
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  assert.equal(verifyPaggpayWebhookSignature(body, `t=${timestamp},v1=${digest}`, secret, timestamp + 60), true);
  assert.equal(verifyPaggpayWebhookSignature(body, `t=${timestamp},v1=${digest}`, secret, timestamp + 301), false);
});
