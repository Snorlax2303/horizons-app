import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSupportMessage } from './aiSupport.js';

const config = {
  baseUrl: 'https://omniroute.test/v1', apiKey: 'test-key-123456',
  models: { fast: 'claude/haiku' }, fallbackModels: [], timeoutMs: 1000,
};
const response = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
  status: 200, headers: { 'content-type': 'application/json' },
});

test('interprets a natural-language trial request and extracts the device', async () => {
  const result = await interpretSupportMessage(config, 'Quero testar na minha TV Samsung', {
    fetchImpl: async () => response('<think>classificar</think>{"intent":"trial","route":"location","device_category":"smart_tv","manufacturer":"Samsung","confidence":0.98,"needs_clarification":false,"reply":"Entendi: você quer testar em uma Smart TV Samsung."}'),
  });
  assert.equal(result.intent, 'trial');
  assert.equal(result.device_category, 'smart_tv');
  assert.equal(result.manufacturer, 'Samsung');
});

test('rejects an action invented by the model', async () => {
  await assert.rejects(() => interpretSupportMessage(config, 'Crie um Pix', {
    fetchImpl: async () => response('{"intent":"charge","route":"pix","device_category":null,"manufacturer":null,"confidence":1,"needs_clarification":false,"reply":"Pix criado"}'),
  }));
});
