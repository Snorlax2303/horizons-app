import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReceipt } from './receiptValidation.js';

test('accepts a complete settled receipt for human review', () => {
  const result = validateReceipt({ amount: 30, end_to_end_id: 'E123', paid_at: '2026-08-03T12:00:00Z', confidence: 0.95, is_scheduled: false }, { amount: 30 });
  assert.deepEqual(result.flags, []);
  assert.equal(result.eligibleForReview, true);
});

test('flags scheduled and mismatched receipts', () => {
  const result = validateReceipt({ amount: 20, end_to_end_id: 'E456', paid_at: '2026-08-03T12:00:00Z', confidence: 0.9, is_scheduled: true }, { amount: 30 });
  assert.ok(result.flags.includes('amount_mismatch'));
  assert.ok(result.flags.includes('scheduled_payment'));
  assert.equal(result.eligibleForReview, false);
});

test('flags incomplete low-confidence extraction', () => {
  const result = validateReceipt({ confidence: 0.4 }, { amount: 30 });
  assert.deepEqual(result.flags.sort(), ['amount_missing', 'date_missing', 'e2e_missing', 'low_confidence'].sort());
});
