import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePaymentMethod, registerBillingRoutes } from './routes/billing.js';

test('deriva método de pagamento por checkout, Pix ou manual', () => {
  assert.equal(derivePaymentMethod('https://elite/checkout/abc', true), 'checkout');
  assert.equal(derivePaymentMethod('https://elite/checkout/abc', false), 'checkout');
  assert.equal(derivePaymentMethod(null, true), 'pix');
  assert.equal(derivePaymentMethod(null, false), 'manual');
});

test('decisão de recuperação registra sem enviar mensagem', async () => {
  const app = { get(path, ...handlers) { this.handlers = this.handlers || {}; this.handlers[path] = handlers.at(-1); }, post(path, ...handlers) { this.handlers = this.handlers || {}; this.handlers[path] = handlers.at(-1); } };
  let updated;
  const supabase = {
    from() { return this; }, update(changes) { updated = changes; return this; },
    eq() { return this; }, select() { return this; }, insert() { return this; },
    maybeSingle: async () => ({ data: { id: 'rec-1', status: 'recovered' }, error: null }),
  };
  registerBillingRoutes(app, { supabase, requireAuthenticatedUser: (_, __, next) => next() });
  const res = { body: null, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await app.handlers['/recovery/:id/decision']({ params: { id: 'rec-1' }, body: { status: 'recovered' }, horizonsUser: { id: 'owner-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.status, 'recovered');
  assert.equal(res.body.sent, false);
  assert.equal(updated.status, 'recovered');
});

test('nota de recuperação é salva sem alterar decisão', async () => {
  const app = { get(path, ...handlers) { this.handlers = this.handlers || {}; this.handlers[path] = handlers.at(-1); }, post(path, ...handlers) { this.handlers = this.handlers || {}; this.handlers[path] = handlers.at(-1); } };
  let updated;
  const supabase = {
    from() { return this; }, update(changes) { updated = changes; return this; },
    eq() { return this; }, select() { return this; }, insert() { return this; },
    maybeSingle: async () => ({ data: { id: 'rec-1', notes: 'vai pagar sexta' }, error: null }),
  };
  registerBillingRoutes(app, { supabase, requireAuthenticatedUser: (_, __, next) => next() });
  const res = { body: null, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await app.handlers['/recovery/:id/notes']({ params: { id: 'rec-1' }, body: { notes: 'vai pagar sexta' }, horizonsUser: { id: 'owner-1' } }, res);
  assert.equal(updated.notes, 'vai pagar sexta');
  assert.equal(updated.status, undefined);
});

test('marcar lembrete como enviado altera status e sent_at', async () => {
  const app = { get(path, ...handlers) { this.handlers = this.handlers || {}; this.handlers[path] = handlers.at(-1); }, post(path, ...handlers) { this.handlers = this.handlers || {}; this.handlers[path] = handlers.at(-1); } };
  let updated;
  const supabase = {
    from() { return this; }, update(changes) { updated = changes; return this; },
    eq() { return this; }, select() { return this; }, maybeSingle: async () => ({ data: { id: 'rem-1', status: 'sent' }, error: null }),
  };
  registerBillingRoutes(app, { supabase, requireAuthenticatedUser: (_, __, next) => next() });
  const res = { body: null, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await app.handlers['/billing/reminders/:id/sent']({ params: { id: 'rem-1' }, body: {}, horizonsUser: { id: 'owner-1' } }, res);
  assert.equal(updated.status, 'sent');
  assert.ok(typeof updated.sent_at === 'string');
});

test('rotas do bot usam o token da ponte, o dono fixo e só enviam lembretes aprovados', async () => {
  const routes = {};
  const app = { get(path, ...handlers) { routes[`GET ${path}`] = handlers; }, post(path, ...handlers) { routes[`POST ${path}`] = handlers; } };
  const filters = [];
  const supabase = {
    from() { return this; }, update() { return this; }, select() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const bridge = (_, __, next) => next();
  registerBillingRoutes(app, { supabase, requireAuthenticatedUser: (_, __, next) => next(), requireBotBridge: bridge, ownerUserId: 'owner-1' });
  assert.equal(routes['GET /typebot/billing/reminders/sendable'][0], bridge);
  assert.equal(routes['POST /typebot/billing/reminders/:id/sent'][0], bridge);
  const res = { body: null, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await routes['POST /typebot/billing/reminders/:id/sent'].at(-1)({ params: { id: 'rem-1' }, body: {} }, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(filters, [['id', 'rem-1'], ['user_id', 'owner-1'], ['status', 'approved']]);
});

test('sem ponte configurada as rotas do bot não são registradas', () => {
  const routes = {};
  const app = { get(path) { routes[path] = true; }, post(path) { routes[path] = true; } };
  registerBillingRoutes(app, { supabase: {}, requireAuthenticatedUser: () => {} });
  assert.equal(routes['/typebot/billing/reminders/sendable'], undefined);
});
