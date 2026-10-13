import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPixReceipt, receiptExtractorIsConfigured, receiptExtractorModel } from './receiptExtractor.js';

const ai = {
  baseUrl: 'https://omniroute.test/v1', apiKey: 'test-key-123456',
  models: { vision: 'claude/sonnet' }, fallbackModels: ['codex/gpt-5'], timeoutMs: 1000,
};
const reply = (content, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
  status, headers: { 'content-type': 'application/json' },
});
const valid = {
  amount: 30, paid_at: '2026-08-05T10:00:00-03:00', payer_name: 'Cliente',
  recipient_name: 'Empresa', bank_name: 'Banco', end_to_end_id: 'E123',
  is_scheduled: false, confidence: 0.97,
};

test('extracts a structured Pix receipt through OmniRoute vision', async () => {
  let request;
  const extracted = await extractPixReceipt(ai, { base64: 'cG5n', mimeType: 'image/png' }, {
    fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body), auth: options.headers.authorization }; return reply(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``); },
  });
  assert.equal(request.url, 'https://omniroute.test/v1/chat/completions');
  assert.equal(request.auth, 'Bearer test-key-123456');
  assert.equal(request.body.model, 'claude/sonnet');
  assert.equal(request.body.messages[0].content[1].type, 'image_url');
  assert.equal(extracted.amount, 30);
  assert.equal(extracted.end_to_end_id, 'E123');
  assert.equal(extracted.model, 'claude/sonnet');
  assert.equal(receiptExtractorModel(ai), 'claude/sonnet');
});

test('falls back to the next model when the first returns invalid confidence', async () => {
  const models = [];
  const extracted = await extractPixReceipt(ai, { base64: 'cG5n', mimeType: 'image/jpeg' }, {
    fetchImpl: async (_url, options) => {
      const { model } = JSON.parse(options.body);
      models.push(model);
      return reply(JSON.stringify(model === 'claude/sonnet' ? { ...valid, confidence: 4 } : valid));
    },
  });
  assert.deepEqual(models, ['claude/sonnet', 'codex/gpt-5']);
  assert.equal(extracted.model, 'codex/gpt-5');
});

test('rejects invalid confidence when no model returns valid data', async () => {
  await assert.rejects(() => extractPixReceipt({ ...ai, fallbackModels: [] }, { base64: 'cG5n', mimeType: 'image/png' }, {
    fetchImpl: async () => reply(JSON.stringify({ ...valid, amount: null, confidence: 4 })),
  }), /Confiança/);
});

test('sends PDFs as file parts and rejects unsupported formats', async () => {
  let part;
  await extractPixReceipt(ai, { base64: 'cGRm', mimeType: 'application/pdf' }, {
    fetchImpl: async (_url, options) => { part = JSON.parse(options.body).messages[0].content[1]; return reply(JSON.stringify(valid)); },
  });
  assert.equal(part.type, 'file');
  await assert.rejects(() => extractPixReceipt(ai, { base64: 'eA==', mimeType: 'text/plain' }), /Formato/);
});

test('is not configured without a vision model or key', () => {
  assert.equal(receiptExtractorIsConfigured({ ...ai, models: {}, fallbackModels: [] }), false);
  assert.equal(receiptExtractorIsConfigured({ ...ai, apiKey: null }), false);
  assert.equal(receiptExtractorIsConfigured(ai), true);
});
