import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPixReceipt, receiptExtractorModel } from './receiptExtractor.js';

const config = {
  receiptAiProvider: 'minimax',
  minimaxApiKey: 'test-key',
  minimaxApiUrl: 'https://api.minimax.test/v1/chat/completions',
  minimaxVisionModel: 'MiniMax-M3',
  minimaxTimeoutMs: 1000,
};

test('extracts a structured Pix receipt with MiniMax Vision', async () => {
  let requestBody;
  const extracted = await extractPixReceipt(config, { base64: 'cG5n', mimeType: 'image/png' }, {
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        amount: 30, paid_at: '2026-08-05T10:00:00-03:00', payer_name: 'Cliente',
        recipient_name: 'Empresa', bank_name: 'Banco', end_to_end_id: 'E123',
        is_scheduled: false, confidence: 0.97,
      }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(requestBody.model, 'MiniMax-M3');
  assert.equal(requestBody.messages[0].content[1].type, 'image_url');
  assert.equal(extracted.amount, 30);
  assert.equal(extracted.end_to_end_id, 'E123');
  assert.equal(receiptExtractorModel(config), 'MiniMax-M3');
});

test('rejects invalid confidence returned by the visual model', async () => {
  await assert.rejects(() => extractPixReceipt(config, { base64: 'cG5n', mimeType: 'image/png' }, {
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      amount: null, paid_at: null, payer_name: null, recipient_name: null,
      bank_name: null, end_to_end_id: null, is_scheduled: null, confidence: 4,
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }), /Confiança/);
});

test('does not send PDFs to MiniMax chat vision without a configured fallback', async () => {
  await assert.rejects(() => extractPixReceipt(config, { base64: 'cGRm', mimeType: 'application/pdf' }), /Fallback/);
});
