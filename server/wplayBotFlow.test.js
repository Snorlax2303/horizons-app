import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wplayBotStatus,
  resolveBotInstall,
  createWplayTrial,
  activateWplayApp,
  normalizeTrialResult,
  matchPanelApp,
  extractMac,
  WPLAY_TRIAL_PRODUCTS,
} from './wplayBotFlow.js';
import { resetWplayLinksCache } from './wplayInstall.js';

const LINKS = [
  { category: 'IPTV', name: 'LG/Samsung/Roku', is_active: true,
    description: '<p>Apps recomendados:</p><ul><li>• WTV Player</li><li>• Kplay</li></ul><p>👤 {{usuário}} / 🔒 {{senha}}</p>' },
  { category: 'IPTV', name: 'Completo IPTV', is_active: true, description: '<p>Completo</p>' },
];

function clientSpy(calls, extra = {}) {
  return {
    createTest: async (input) => { calls.push(['createTest', input]); return { id: 105393227, username: 'pg89992', password: 'y33u475', accessCode: '835266' }; },
    createKratorTest: async (input) => { calls.push(['createKratorTest', input]); return { id: 105393228, username: 'kr1', password: 'kr2' }; },
    createNexusTest: async (input) => { calls.push(['createNexusTest', input]); return { id: 105393229 }; },
    activateApp: async (input) => { calls.push(['activateApp', input]); return { msg: 'App ativado' }; },
    ...extra,
  };
}

const ON = { wwpanelApiUrl: 'https://painel.test', wwpanelApiKey: 'k', wwpanelWritesEnabled: true };
const OFF = { wwpanelApiUrl: 'https://painel.test', wwpanelApiKey: 'k', wwpanelWritesEnabled: false };

test('status informa configuração e gate', () => {
  assert.deepEqual(wplayBotStatus(ON), { configured: true, enabled: true, products: WPLAY_TRIAL_PRODUCTS });
  assert.equal(wplayBotStatus(OFF).enabled, false);
});

test('resolveBotInstall lê o catálogo do painel (sem escrita)', async () => {
  resetWplayLinksCache();
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ items: LINKS }) });
  const result = await resolveBotInstall(ON, { product: 'iptv', brand: 'samsung', username: 'cli', password: '***' }, { fetchImpl });
  assert.equal(result.found, true);
  assert.match(result.text, /cli/);
  assert.ok(result.suggestions.includes('Kplay'));
});

test('createWplayTrial não chama o painel quando a escrita está desligada', async () => {
  const calls = [];
  const result = await createWplayTrial(OFF, { product: 'iptv', package_iptv: 30 }, { clientFactory: () => clientSpy(calls) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'writes_disabled');
  assert.equal(calls.length, 0);
});

test('createWplayTrial recusa Krator+ sem pacote e serviceId', async () => {
  const calls = [];
  const result = await createWplayTrial(ON, { product: 'krator' }, { clientFactory: () => clientSpy(calls) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_krator_fields');
  assert.equal(calls.length, 0);
});

test('createWplayTrial cria teste IPTV e normaliza as credenciais', async () => {
  const calls = [];
  const result = await createWplayTrial(ON, { product: 'iptv', package_iptv: 30, testDuration: 4, whatsapp: '5516999999999' }, { clientFactory: () => clientSpy(calls) });
  assert.equal(result.ok, true);
  assert.equal(result.product, 'iptv');
  assert.equal(result.trial.lineId, 105393227);
  assert.equal(result.trial.username, 'pg89992');
  assert.equal(result.trial.accessCode, '835266');
  assert.deepEqual(calls[0], ['createTest', { isTrial: 1, package_iptv: 30, testDuration: 4, whatsapp: '5516999999999' }]);
});

test('createWplayTrial roteia Krator+ e ativa o app no próprio teste', async () => {
  const calls = [];
  const result = await createWplayTrial(ON, {
    product: 'krator', package_krator: '1', serviceId: '672b26efd46f330001c0a590', testDuration: 1,
    mac: 'AA:BB:CC:DD:EE:FF', nameApp: 'TVVision', name: 'Cliente',
  }, { clientFactory: () => clientSpy(calls) });
  assert.equal(result.ok, true);
  assert.equal(result.product, 'krator');
  assert.equal(calls[0][0], 'createKratorTest');
  assert.deepEqual(calls[1], ['activateApp', { nameApp: 'TVVision', mac: 'AA:BB:CC:DD:EE:FF', namePlaylist: 'Cliente', id_user: 105393228 }]);
  assert.ok(result.activated);
});

test('createWplayTrial não ativa app sem MAC', async () => {
  const calls = [];
  await createWplayTrial(ON, { product: 'iptv', package_iptv: 30, nameApp: 'TVVision' }, { clientFactory: () => clientSpy(calls) });
  assert.equal(calls.length, 1);
});

test('activateWplayApp exige MAC e id da linha', async () => {
  const calls = [];
  const missing = await activateWplayApp(ON, { mac: 'AA', nameApp: 'TVVision' }, { clientFactory: () => clientSpy(calls) });
  assert.equal(missing.reason, 'missing_fields');
  const ok = await activateWplayApp(ON, { mac: 'AA:BB:CC:DD:EE:FF', nameApp: 'TVVision', id_user: 10 }, { clientFactory: () => clientSpy(calls) });
  assert.equal(ok.ok, true);
  assert.deepEqual(calls[0], ['activateApp', { nameApp: 'TVVision', mac: 'AA:BB:CC:DD:EE:FF', namePlaylist: undefined, id_user: 10 }]);
});

test('matchPanelApp casa o que o cliente digitou com a lista real do painel', () => {
  assert.deepEqual(matchPanelApp('brasil iptv'), { app: 'BrasilIPTV', kind: 'common' });
  assert.deepEqual(matchPanelApp('TVVision'), { app: 'TVVision', kind: 'common' });
  assert.deepEqual(matchPanelApp('k play'), { app: 'Kplay', kind: 'xstream' });
  assert.deepEqual(matchPanelApp('WTV Player'), { app: 'WTV Player/Wapp', kind: 'xstream' });
  assert.equal(matchPanelApp('aplicativo desconhecido'), null);
});

test('extractMac normaliza o MAC em qualquer formato', () => {
  assert.equal(extractMac('aa:bb:cc:dd:ee:ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(extractMac('aabbccddeeff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(extractMac('AA-BB-CC-DD-EE-FF'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(extractMac('123'), null);
});

test('activateWplayApp ativa pelo texto do app e recusa app de login', async () => {
  const calls = [];
  const byText = await activateWplayApp(ON, { appText: 'brasil iptv', mac: 'aabbccddeeff', id_user: 7 }, { clientFactory: () => clientSpy(calls) });
  assert.equal(byText.ok, true);
  assert.equal(calls[0][1].nameApp, 'BrasilIPTV');
  assert.equal(calls[0][1].mac, 'AA:BB:CC:DD:EE:FF');
  const login = await activateWplayApp(ON, { nameApp: 'Kplay', mac: 'aabbccddeeff', id_user: 7 }, { clientFactory: () => clientSpy(calls) });
  assert.equal(login.reason, 'app_requires_login');
});

test('normalizeTrialResult aceita formatos alternativos', () => {
  assert.equal(normalizeTrialResult({ data: { _id: 'x1', user: 'u', senha: 's' } }).lineId, 'x1');
  assert.equal(normalizeTrialResult({ data: { _id: 'x1', user: 'u', senha: 's' } }).password, 's');
  assert.equal(normalizeTrialResult(null).lineId, null);
});
