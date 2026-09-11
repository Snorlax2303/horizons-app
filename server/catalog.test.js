import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { registerCatalogRoutes } from './routes/catalog.js';

function createApp() {
  const handlers = {};
  const app = { handlers };
  for (const method of ['get', 'post', 'put', 'delete']) {
    app[method] = (path, ...callbacks) => { handlers[`${method.toUpperCase()} ${path}`] = callbacks.at(-1); };
  }
  return app;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function mutationSupabase(result) {
  const state = { payload: null };
  const builder = {
    insert(payload) { state.payload = payload; return this; },
    update(payload) { state.payload = payload; return this; },
    delete() { return this; },
    eq() { return this; },
    select() { return this; },
    single: async () => result,
    maybeSingle: async () => result,
  };
  return { state, supabase: { from() { return builder; } } };
}

test('catálogo registra contrato sem prefixo /api duplicado', () => {
  const app = createApp();
  registerCatalogRoutes(app, { supabase: {}, requireAuthenticatedUser: () => {}, z, config: {} });
  const expected = [
    'GET /operations/delivery-profiles',
    'POST /operations/delivery-profiles',
    'PUT /operations/delivery-profiles/:id',
    'DELETE /operations/delivery-profiles/:id',
    'POST /operations/delivery-profiles/clone',
    'GET /operations/tutorial-slots',
    'POST /operations/tutorial-slots',
    'PUT /operations/tutorial-slots/:id',
    'DELETE /operations/tutorial-slots/:id',
  ];
  for (const route of expected) assert.equal(typeof app.handlers[route], 'function', route);
  assert.equal(Object.keys(app.handlers).some((route) => route.includes(' /api/')), false);
});

test('cadastro de app exige servidor e grava auditoria do proprietário', async () => {
  const app = createApp();
  const { state, supabase } = mutationSupabase({ data: { id: 'profile-1' }, error: null });
  registerCatalogRoutes(app, { supabase, requireAuthenticatedUser: () => {}, z, config: {} });

  const invalidResponse = response();
  await app.handlers['POST /operations/delivery-profiles']({ body: { app_name: 'App', device_category: 'smart_tv' }, horizonsUser: { id: 'owner-1' } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);

  const validResponse = response();
  await app.handlers['POST /operations/delivery-profiles']({ body: { cinehub_server_id: '11111111-1111-4111-8111-111111111111', app_name: ' App ', device_category: 'smart_tv' }, horizonsUser: { id: 'owner-1' } }, validResponse);
  assert.equal(validResponse.statusCode, 201);
  assert.equal(state.payload.app_name, 'App');
  assert.equal(state.payload.user_id, 'owner-1');
  assert.equal(state.payload.changed_by, 'owner-1');
});

test('edição e remoção de app ficam restritas ao proprietário', async () => {
  const app = createApp();
  const { state, supabase } = mutationSupabase({ data: { id: 'profile-1' }, error: null });
  registerCatalogRoutes(app, { supabase, requireAuthenticatedUser: () => {}, z, config: {} });

  const updateResponse = response();
  await app.handlers['PUT /operations/delivery-profiles/:id']({ params: { id: 'profile-1' }, body: { app_name: 'Novo nome' }, horizonsUser: { id: 'owner-1' } }, updateResponse);
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(state.payload.changed_by, 'owner-1');

  const deleteResponse = response();
  await app.handlers['DELETE /operations/delivery-profiles/:id']({ params: { id: 'profile-1' }, horizonsUser: { id: 'owner-1' } }, deleteResponse);
  assert.deepEqual(deleteResponse.body, { deleted: true });
});

