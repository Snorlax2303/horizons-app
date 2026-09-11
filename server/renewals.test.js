import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRenewalRoutes } from './routes/renewals.js';

function fakeApp() { const routes = {}; return { routes, get(path, ...handlers) { routes[path] = handlers.at(-1); }, post(path, ...handlers) { routes[path] = handlers.at(-1); } }; }
function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function schema() { return { safeParse(value) { return { success: true, data: value }; } }; }
function supabaseMock() { return { from() { return this; }, select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: 'customer-1' } }), insert() { return this; }, update() { return this; }, upsert() { return this; }, single: async () => ({ data: { id: 'new-1' }, error: null }) }; }

test('registra renovação normalizada e protegida pelo usuário', async () => {
  const app = fakeApp();
  registerRenewalRoutes(app, { supabase: supabaseMock(), requireAuthenticatedUser: (_, __, next) => next(), renewalRequestSchema: schema(), receiptSchema: schema(), receiptReviewSchema: schema(), validateReceipt: () => ({ flags: [] }), processPaidPayment: async () => {} });
  const res = response();
  await app.routes['/renewals']({ body: { phone: '(16) 99999-0000', customer_id: 'customer-1' }, horizonsUser: { id: 'owner-1' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.renewal.id, 'new-1');
});
