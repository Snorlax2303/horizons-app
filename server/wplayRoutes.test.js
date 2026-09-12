import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWplayRoutes } from './routes/wplay.js';
import { z } from 'zod';

function fakeApp() {
  const routes = {};
  const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1); };
  return { routes, get: record('GET'), post: record('POST'), patch: record('PATCH') };
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function request(body = {}, params = {}) { return { body, params, horizonsUser: { id: 'owner-1' } }; }
const CID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

function supabaseMock(fixtures = {}) {
  const catalog = {
    customers: { data: { id: CID, paid: true, user_id: 'owner-1' } },
    payment_events: { data: [] },
    customer_panel_targets: { data: null },
    customer_access_credentials: { data: null },
    wplay_operations: { data: null },
    ...fixtures,
  };
  const writes = [];
  function chain(table) {
    const api = {
      select() { return api; },
      eq() { return api; },
      gte() { return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() { return Promise.resolve({ data: catalog[table]?.data ?? null, error: null }); },
      insert(value) { writes.push({ table, op: 'insert', value }); return api; },
      update(value) { writes.push({ table, op: 'update', value }); return api; },
      then(resolve) { return Promise.resolve({ data: catalog[table]?.data ?? null, error: null }).then(resolve); },
    };
    return api;
  }
  return { writes, from: (table) => chain(table) };
}

function setup({ config = { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: true, wwpanelTestsEnabled: true, wwpanelCustomersEnabled: true, wwpanelRenewalsEnabled: true, wwpanelAppActivationEnabled: true }, client, supabase } = {}) {
  const app = fakeApp();
  const calls = [];
  const factory = () => (client || {
    createTest: async (input) => { calls.push(['createTest', input]); return { id: 'line-1' }; },
    createKratorTest: async (input) => { calls.push(['createKratorTest', input]); return { id: 'line-k' }; },
    createNexusTest: async (input) => { calls.push(['createNexusTest', input]); return { id: 'line-n' }; },
    services: async () => { calls.push(['services']); return [{ _id: '672b26efd46f330001c0a590', name: 'Pacote completo' }]; },
    createCustomer: async (input) => { calls.push(['createCustomer', input]); return { id: 'line-2' }; },
    activateApp: async (input) => { calls.push(['activateApp', input]); return { ok: true }; },
    activateAppXstream: async (input) => { calls.push(['activateAppXstream', input]); return { ok: true }; },
    extend: async (id, input) => { calls.push(['extend', id, input]); return { ok: true }; },
    add48h: async (id) => { calls.push(['add48h', id]); return { ok: true }; },
    managePlan: async (id, input) => { calls.push(['managePlan', id, input]); return { ok: true }; },
    activateTrial: async (id, input) => { calls.push(['activateTrial', id, input]); return { ok: true }; },
  });
  registerWplayRoutes(app, { supabase: supabase || supabaseMock(), requireAuthenticatedUser: (_, __, next) => next?.(), config, z, clientFactory: factory });
  return { app, calls };
}

test('status reporta configuração e gate de escrita', async () => {
  const { app } = setup();
  const res = response();
  await app.routes['GET /wplay/status'](request(), res);
  assert.equal(res.body.configured, true);
  assert.equal(res.body.writesEnabled, true);
});

test('catálogo devolve planos, pacotes e apps', async () => {
  const { app } = setup();
  const res = response();
  await app.routes['GET /wplay/catalog'](request(), res);
  assert.ok(res.body.iptvPackages.some(([id]) => id === 30));
  assert.ok(res.body.apps.includes('TVVision'));
});

test('bloqueia escrita quando WWPANEL_WRITES_ENABLED está desligado', async () => {
  const { app, calls } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: false } });
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30 }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 0);
});

test('recusa quando a chave não está configurada', async () => {
  const { app, calls } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelWritesEnabled: true } });
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30 }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(calls.length, 0);
});

test('cria teste com isTrial forçado e valida pacote conhecido', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30, whatsapp: '5516999999999', country: 'br' }), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls[0], ['createTest', { isTrial: 1, package_iptv: 30, whatsapp: '5516999999999', country: 'br' }]);
  assert.equal(res.body.product, 'iptv');
});

test('roteia teste Krator+ para a rota própria do painel', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/tests'](request({
    product: 'krator', package_krator: '1', serviceId: '672b26efd46f330001c0a590', testDuration: 2,
  }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.product, 'krator');
  assert.deepEqual(calls[0], ['createKratorTest', {
    isTrial: 1, package_krator: '1', serviceId: '672b26efd46f330001c0a590', testDuration: 2,
  }]);
});

test('Krator+ exige pacote e serviceId', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/tests'](request({ product: 'krator', package_krator: '1' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /serviceId/);
  assert.equal(calls.length, 0);
});

test('converte duração em texto (4h) para horas', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30, testDuration: '4h' }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0][1].testDuration, 4);
});

test('roteia teste Nexus e exige package_nexus', async () => {
  const { app, calls } = setup();
  const ok = response();
  await app.routes['POST /wplay/tests'](request({ product: 'nexus', package_nexus: 1 }), ok);
  assert.equal(ok.statusCode, 201);
  assert.deepEqual(calls[0], ['createNexusTest', { isTrial: 1, package_nexus: 1 }]);
  const bad = response();
  await app.routes['POST /wplay/tests'](request({ product: 'nexus' }), bad);
  assert.equal(bad.statusCode, 400);
});

test('lista serviços do painel para obter o serviceId', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['GET /wplay/services'](request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.services[0].name, 'Pacote completo');
  assert.deepEqual(calls[0], ['services']);
});

test('recusa cliente sem nome', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/customers'](request({ planId: 2 }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('renova com extend usando o id da rota', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['PATCH /wplay/customers/:id/extend'](request({ days: 30, customerId: CID }, { id: 'abc' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls[0], ['extend', 'abc', { days: 30 }]);
});

test('mapeia erro de negócio do painel para 400', async () => {
  const failing = { createTest: async () => { const error = new Error('Créditos insuficientes.'); error.statusCode = 403; throw error; } };
  const { app } = setup({ client: failing });
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30 }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Créditos insuficientes.');
});

test('gate granular bloqueia teste quando wwpanelTestsEnabled=false', async () => {
  const { app } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: true, wwpanelTestsEnabled: false, wwpanelCustomersEnabled: true, wwpanelRenewalsEnabled: true, wwpanelAppActivationEnabled: true } });
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30 }), res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Operação 'test' está desativada/);
});

test('gate granular permite teste quando wwpanelTestsEnabled=true', async () => {
  const { app } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: true, wwpanelTestsEnabled: true, wwpanelCustomersEnabled: true, wwpanelRenewalsEnabled: true, wwpanelAppActivationEnabled: true } });
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30 }), res);
  assert.equal(res.statusCode, 201);
});

test('gate granular bloqueia cliente quando wwpanelCustomersEnabled=false', async () => {
  const { app } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: true, wwpanelTestsEnabled: true, wwpanelCustomersEnabled: false, wwpanelRenewalsEnabled: true, wwpanelAppActivationEnabled: true } });
  const res = response();
  await app.routes['POST /wplay/customers'](request({ name: 'Teste' }), res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Operação 'customer' está desativada/);
});

test('gate granular bloqueia renovação quando wwpanelRenewalsEnabled=false', async () => {
  const { app } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: true, wwpanelTestsEnabled: true, wwpanelCustomersEnabled: true, wwpanelRenewalsEnabled: false, wwpanelAppActivationEnabled: true } });
  const res = response();
  await app.routes['PATCH /wplay/customers/:id/extend'](request({ days: 30 }, { id: 'abc' }), res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Operação 'renewal' está desativada/);
});

test('gate granular bloqueia ativação de app quando wwpanelAppActivationEnabled=false', async () => {
  const { app } = setup({ config: { wwpanelApiUrl: 'https://api.test', wwpanelApiKey: 'wz_test', wwpanelWritesEnabled: true, wwpanelTestsEnabled: true, wwpanelCustomersEnabled: true, wwpanelRenewalsEnabled: true, wwpanelAppActivationEnabled: false } });
  const res = response();
  await app.routes['POST /wplay/apps/activate'](request({ nameApp: 'TVVision', mac: 'AA:BB:CC:DD:EE:FF' }), res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Operação 'app_activation' está desativada/);
});

// ---------- Opção B: pagamento sempre validado antes de criar/renovar ----------

test('Opção B: criação de cliente pago sem vínculo é recusada (400)', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/customers'](request({ name: 'Fulano', isTrial: 0 }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.reason, 'customer_missing');
  assert.equal(calls.length, 0);
});

test('Opção B: criação de cliente pago sem pagamento confirmado é recusada (402)', async () => {
  const supabase = supabaseMock({ customers: { data: { id: CID, paid: false, user_id: 'owner-1' } } });
  const { app, calls } = setup({ supabase });
  const res = response();
  await app.routes['POST /wplay/customers'](request({ name: 'Fulano', isTrial: 0, customerId: CID }), res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.reason, 'payment_unconfirmed');
  assert.equal(calls.length, 0);
});

test('Opção B: aceita cliente pago com payment_event recente e vincula produção', async () => {
  const supabase = supabaseMock({
    customers: { data: { id: CID, paid: false, user_id: 'owner-1' } },
    payment_events: { data: [{ id: 'pe-1' }] },
  });
  const { app, calls } = setup({ supabase });
  const res = response();
  await app.routes['POST /wplay/customers'](request({ name: 'Fulano', isTrial: 0, customerId: CID }), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls[0], ['createCustomer', { isTrial: 0, name: 'Fulano' }]);
  const link = supabase.writes.find((w) => w.table === 'customer_panel_targets');
  assert.ok(link, 'vínculo deveria ter sido gravado');
  assert.equal(link.value.external_line_id, 'line-2');
  assert.equal(link.value.external_line_kind, 'production');
});

test('renovação sem vínculo e sem customerId é recusada (400)', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['PATCH /wplay/customers/:id/extend'](request({ days: 30 }, { id: 'abc' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.reason, 'customer_missing');
  assert.equal(calls.length, 0);
});

test('renovação bloqueada sem pagamento confirmado (402)', async () => {
  const supabase = supabaseMock({ customers: { data: { id: CID, paid: false, user_id: 'owner-1' } } });
  const { app, calls } = setup({ supabase });
  const res = response();
  await app.routes['PATCH /wplay/customers/:id/extend'](request({ days: 30, customerId: CID }, { id: 'abc' }), res);
  assert.equal(res.statusCode, 402);
  assert.equal(calls.length, 0);
});

test('trial com customerId vincula linha de teste', async () => {
  const supabase = supabaseMock();
  const { app } = setup({ supabase });
  const res = response();
  await app.routes['POST /wplay/tests'](request({ package_iptv: 30, customerId: CID }), res);
  assert.equal(res.statusCode, 201);
  const link = supabase.writes.find((w) => w.table === 'customer_panel_targets');
  assert.ok(link, 'vínculo de teste deveria ter sido gravado');
  assert.equal(link.value.external_test_line_id, 'line-1');
  assert.equal(link.value.external_line_kind, 'test');
});

test('app resolve id_user pelo vínculo do cliente e registra MAC', async () => {
  const supabase = supabaseMock({
    customer_panel_targets: { data: [{ id: 't-1', external_line_id: '777', external_line_kind: 'production', external_test_line_id: null }] },
  });
  const { app, calls } = setup({ supabase });
  const res = response();
  await app.routes['POST /wplay/apps/activate'](request({ nameApp: 'TVVision', mac: 'AA:BB:CC:DD:EE:FF', customerId: CID }), res);
  assert.equal(res.statusCode, 200);
  const activate = calls.find(([op]) => op === 'activateApp');
  assert.equal(activate[1].id_user, '777');
  const cred = supabase.writes.find((w) => w.table === 'customer_access_credentials');
  assert.ok(cred && cred.value.mac_address === 'AA:BB:CC:DD:EE:FF');
});

test('app sem id_user e sem vínculo é recusado (400)', async () => {
  const { app, calls } = setup();
  const res = response();
  await app.routes['POST /wplay/apps/activate'](request({ nameApp: 'TVVision', mac: 'AA:BB:CC:DD:EE:FF' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.reason, 'missing_id_user');
  assert.equal(calls.length, 0);
});
