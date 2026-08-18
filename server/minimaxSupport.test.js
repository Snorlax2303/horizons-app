import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSupportMessage } from './minimaxSupport.js';

const config = {
  minimaxApiKey: 'test-key', minimaxApiUrl: 'https://api.minimax.test/v1/chat/completions',
  minimaxPrimaryModel: 'MiniMax-M2.7', minimaxMaxCompletionTokens: 1200,
  minimaxTemperature: 0.2, minimaxTimeoutMs: 1000,
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
