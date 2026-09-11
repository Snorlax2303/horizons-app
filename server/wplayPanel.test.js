import test from 'node:test';
import assert from 'node:assert/strict';
import { createWwpanelClient, wwpanelConfigured } from './wplayPanel.js';

function fakeResponse(status, body, headers = {}) {
  return {
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

function capture() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return fakeResponse(200, { ok: true });
  };
  return { calls, fetchImpl };
}

test('reconhece configuração pela presença da chave', () => {
  assert.equal(wwpanelConfigured({ wwpanelApiKey: 'wz_x' }), true);
  assert.equal(wwpanelConfigured({}), false);
});

test('recusa criar cliente sem chave configurada', () => {
  assert.throws(() => createWwpanelClient({}), /WWPANEL_API_KEY/);
});

test('envia teste para POST /lines/test com autorização e corpo JSON', async () => {
  const { calls, fetchImpl } = capture();
  const client = createWwpanelClient({ wwpanelApiKey: 'wz_test', wwpanelApiUrl: 'https://api.example.com/' }, { fetchImpl });
  await client.createTest({ isTrial: 1, package_iptv: 30, whatsapp: '5516999999999', country: 'br' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.com/lines/test');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers.authorization, /^Bearer /);
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { isTrial: 1, package_iptv: 30, whatsapp: '5516999999999', country: 'br' });
});

test('estende cliente com PATCH no caminho correto', async () => {
  const { calls, fetchImpl } = capture();
  const client = createWwpanelClient({ wwpanelApiKey: 'wz_test' }, { fetchImpl });
  await client.extend(12345, { days: 30 });
  assert.equal(calls[0].url, 'https://mcapi.knewcms.com:2087/lines/v2/extend/12345');
  assert.equal(calls[0].options.method, 'PATCH');
});

test('mapeia erro de validação do painel com statusCode', async () => {
  const fetchImpl = async () => fakeResponse(400, { message: ['campo a', 'campo b'], error: 'Bad Request' });
  const client = createWwpanelClient({ wwpanelApiKey: 'wz_test' }, { fetchImpl });
  await assert.rejects(() => client.createCustomer({}), (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, 'campo a; campo b');
    return true;
  });
});

test('honra 429 com retry-after antes de repetir', async () => {
  const delays = [];
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return fakeResponse(429, { message: 'slow down' }, { 'retry-after': '1' });
    return fakeResponse(200, { ok: true });
  };
  const client = createWwpanelClient({ wwpanelApiKey: 'wz_test' }, { fetchImpl, sleep: async (ms) => delays.push(ms) });
  const result = await client.add48h('abc');
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1000]);
});

test('valida IDs do catálogo local', () => {
  const client = createWwpanelClient({ wwpanelApiKey: 'wz_test' }, { fetchImpl: async () => fakeResponse(200, {}) });
  assert.equal(client.validateIptvPackage(30), 30);
  assert.throws(() => client.validateIptvPackage(999999), /não reconhecido/);
});
