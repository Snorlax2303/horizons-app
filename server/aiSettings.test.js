import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAiSettingsStore, keyHint } from './aiSettings.js';
import { registerAiSettingsRoutes } from './routes/aiSettings.js';

const config = {
  webhookSharedSecret: 'vault-secret-for-tests',
  omnirouteBaseUrl: 'http://host.docker.internal:20129/v1', omnirouteApiKey: null,
  aiModelFast: 'env/fast', aiModelSmart: null, aiModelVision: null, aiFallbackModels: [],
};

function memorySupabase({ missingTable = false } = {}) {
  const rows = new Map();
  return {
    rows,
    from() {
      const api = {
        select() { return api; },
        eq(_column, value) { api.key = value; return api; },
        maybeSingle() {
          if (missingTable) return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'missing' } });
          return Promise.resolve({ data: rows.get(api.key) || null, error: null });
        },
        upsert(row) { rows.set(row.key, { ...row }); return Promise.resolve({ error: null }); },
      };
      return api;
    },
  };
}

test('stores the key encrypted and never returns it to the browser', async () => {
  const supabase = memorySupabase();
  const store = createAiSettingsStore({ supabase, config });
  const view = await store.save({ apiKey: 'sk-omniroute-abcdef1234', models: { smart: 'claude/sonnet' } }, 'owner-1');
  const row = [...supabase.rows.values()][0];
  assert.ok(row.secret_ciphertext.startsWith('v1.'));
  assert.ok(!JSON.stringify(row).includes('sk-omniroute-abcdef1234'));
  assert.ok(!JSON.stringify(view).includes('sk-omniroute-abcdef1234'));
  assert.equal(view.key_hint, '••••1234');
  assert.equal(view.source, 'panel');
  const ai = await store.resolve();
  assert.equal(ai.apiKey, 'sk-omniroute-abcdef1234');
  assert.equal(ai.models.smart, 'claude/sonnet');
  assert.equal(ai.models.fast, 'env/fast');
});

test('keeps the saved key when only models change, and clears it on request', async () => {
  const supabase = memorySupabase();
  const store = createAiSettingsStore({ supabase, config });
  await store.save({ apiKey: 'sk-first-key-9999' }, 'owner-1');
  await store.save({ models: { vision: 'codex/gpt-5' } }, 'owner-1');
  assert.equal((await store.resolve()).apiKey, 'sk-first-key-9999');
  const cleared = await store.save({ clearKey: true }, 'owner-1');
  assert.equal(cleared.has_key, false);
  assert.equal(cleared.source, 'none');
});

test('falls back to environment settings when the table does not exist yet', async () => {
  const store = createAiSettingsStore({ supabase: memorySupabase({ missingTable: true }), config: { ...config, omnirouteApiKey: 'env-key-12345678' } });
  const ai = await store.resolve();
  assert.equal(ai.source, 'env');
  assert.equal(ai.apiKey, 'env-key-12345678');
  assert.equal(keyHint('abc'), '••••');
});

function fakeApp() {
  const routes = {};
  const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers; };
  return { routes, get: record('GET'), put: record('PUT'), post: record('POST') };
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('routes are owner-guarded, validate input and test the connection', async () => {
  const app = fakeApp();
  const guard = () => {};
  const store = createAiSettingsStore({ supabase: memorySupabase(), config });
  const calls = [];
  registerAiSettingsRoutes(app, {
    requireOwnerUser: guard, aiSettings: store, z,
    fetchImpl: async (url, options) => {
      calls.push({ url, auth: options.headers.authorization });
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'claude/sonnet' }] }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    },
  });
  for (const key of ['GET /settings/ai', 'PUT /settings/ai', 'POST /settings/ai/test']) assert.equal(app.routes[key][0], guard);

  const bad = response();
  await app.routes['PUT /settings/ai'].at(-1)({ body: { base_url: 'ftp://x', unknown: 1 }, horizonsUser: { id: 'owner-1' } }, bad);
  assert.equal(bad.statusCode, 400);

  const saved = response();
  await app.routes['PUT /settings/ai'].at(-1)({ body: { api_key: 'sk-route-key-5678', models: { smart: 'claude/sonnet' } }, horizonsUser: { id: 'owner-1' } }, saved);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.key_hint, '••••5678');

  const tested = response();
  await app.routes['POST /settings/ai/test'].at(-1)({ body: { model: 'claude/sonnet' } }, tested);
  assert.equal(tested.body.ok, true);
  assert.deepEqual(tested.body.models, ['claude/sonnet']);
  assert.equal(tested.body.chat.ok, true);
  assert.equal(calls[0].auth, 'Bearer sk-route-key-5678');
});


test('falha de navegador retorna resultado legível sem dados internos e sem 502 substituível pelo proxy', async () => {
  const app = fakeApp();
  const store = createAiSettingsStore({ supabase: memorySupabase(), config });
  await store.save({ apiKey: 'sk-test-private-key', models: { fast: 'gemini-web/test' } }, 'owner-1');
  registerAiSettingsRoutes(app, { requireOwnerUser: () => {}, aiSettings: store, z,
    fetchImpl: async url => url.endsWith('/models')
      ? new Response(JSON.stringify({ data: [{ id: 'gemini-web/test' }] }))
      : new Response(JSON.stringify({ error: { message: "Cannot find module '/private/node_modules/playwright-core/browsers.json'" } }), { status: 500 }),
  });
  const result = response();
  await app.routes['POST /settings/ai/test'].at(-1)({ body: { model: 'gemini-web/test' } }, result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.upstream_status, 500);
  assert.match(result.body.error, /Playwright/);
  assert.ok(!JSON.stringify(result.body).includes('/private'));
  assert.ok(!JSON.stringify(result.body).includes('sk-test-private-key'));
});
