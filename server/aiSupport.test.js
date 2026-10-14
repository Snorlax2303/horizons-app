import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMacFromText, finalizeInterpretation, interpretSupportMessage } from './aiSupport.js';

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

test('MAC vem do texto do cliente, não da IA, e o app é casado com o painel', () => {
  const base = { intent: 'installation', route: 'support', device_category: 'smart_tv', manufacturer: 'LG', app_name: 'xcloud', mac_address: 'AA:AA:AA:AA:AA:AA', confidence: 0.9, needs_clarification: false, reply: 'ok' };
  const out = finalizeInterpretation(base, 'instalei o xcloud, mac 00-1a-2b-3c-4d-5e');
  assert.equal(out.mac_address, '00:1A:2B:3C:4D:5E');
  assert.equal(out.panel_app, 'XCloud');
  assert.equal(out.handoff, false);
  assert.equal(extractMacFromText('Quero testar na minha TV Samsung'), null);
  assert.equal(extractMacFromText('001A2B3C4D5E'), '00:1A:2B:3C:4D:5E');
});

test('confiança baixa vira pergunta; muito baixa vai para humano', () => {
  const base = { intent: 'trial', route: 'location', device_category: null, manufacturer: null, confidence: 0.5, needs_clarification: false, reply: 'ok' };
  assert.equal(finalizeInterpretation(base, 'x').needs_clarification, true);
  const low = finalizeInterpretation({ ...base, confidence: 0.2 }, 'x');
  assert.equal(low.route, 'human');
  assert.equal(low.handoff, true);
});

test('aceita a intenção de instalação e campos novos opcionais', async () => {
  const result = await interpretSupportMessage(config, 'como instalo na lg?', {
    fetchImpl: async () => response('{"intent":"installation","route":"support","device_category":"smart_tv","manufacturer":"LG","confidence":0.9,"needs_clarification":false,"reply":"Vou te ajudar a instalar."}'),
  });
  assert.equal(result.intent, 'installation');
  assert.equal(result.app_name, null);
});
