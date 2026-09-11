import test from 'node:test';
import assert from 'node:assert/strict';
import { financialScenarios, validateReceiptScenario } from './financialSimulator.js';
import { webhookRateLimit } from './routes/audit.js';

test('financial simulator builds masked payloads for homologation', () => {
  const scenarios = financialScenarios();
  assert.ok(scenarios.paggpay_callback.event_id.startsWith('txn_simulado_'));
  assert.equal(scenarios.paggpay_callback.status, 'paid');
  assert.equal(scenarios.efi_callback.status, 'CONCLUIDA');
  assert.ok(scenarios.pix_receipt.end_to_end_id.startsWith('E0000'));
  assert.equal(scenarios.pix_receipt.amount, 39.9);
});

test('financial simulator flags divergent receipt', () => {
  const result = validateReceiptScenario({ amount: 19.9, end_to_end_id: 'E1' }, 39.9);
  assert.ok(Array.isArray(result.flags));
  assert.ok(result.flags.length > 0);
});

test('webhook rate limit returns 429 above the threshold', () => {
  const guard = webhookRateLimit({ windowMs: 60_000, max: 2 });
  const request = { method: 'POST', path: '/webhooks/paggpay' };
  let nextCalls = 0;
  const next = () => { nextCalls += 1; };
  const response = { status(code) { assert.equal(code, 429); return this; }, json() { return this; } };
  guard(request, response, next);
  guard(request, response, next);
  guard(request, response, next);
  assert.equal(nextCalls, 2);
});
