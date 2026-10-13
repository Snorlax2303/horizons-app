import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuthenticatedUser, createRequireHorizonsOwner, createRequireOwnerUser } from './auth.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('requires a bearer token before querying Supabase', async () => {
  let calls = 0;
  const middleware = createRequireAuthenticatedUser({ auth: { getUser: async () => { calls += 1; } } });
  const res = response();
  await middleware({ get: () => '' }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Autenticação obrigatória.' });
  assert.equal(calls, 0);
});

test('attaches the verified user and continues for a valid bearer token', async () => {
  const user = { id: 'user-1' };
  const middleware = createRequireAuthenticatedUser({ auth: { getUser: async (token) => ({ data: { user }, error: token !== 'valid-token' }) } });
  const req = { get: () => 'Bearer valid-token' };
  let continued = false;
  await middleware(req, response(), () => { continued = true; });
  assert.equal(req.horizonsUser, user);
  assert.equal(continued, true);
});

test('rejects invalid or expired bearer tokens', async () => {
  const middleware = createRequireAuthenticatedUser({ auth: { getUser: async () => ({ data: { user: null }, error: new Error('invalid') }) } });
  const res = response();
  await middleware({ get: () => 'Bearer bad-token' }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Sessão inválida ou expirada.' });
});

test('owner guard rejects authenticated non-owner users', async () => {
  const guard = createRequireOwnerUser(
    createRequireAuthenticatedUser({ auth: { getUser: async () => ({ data: { user: { id: 'stranger' } }, error: null }) } }),
    createRequireHorizonsOwner('owner-1'),
  );
  const res = response();
  await guard({ get: () => 'Bearer t' }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 403);
});

test('owner guard allows the owner and rejects missing owner config', async () => {
  const auth = createRequireAuthenticatedUser({ auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }) } });
  let continued = false;
  await createRequireOwnerUser(auth, createRequireHorizonsOwner('owner-1'))({ get: () => 'Bearer t' }, response(), () => { continued = true; });
  assert.equal(continued, true);
  const res = response();
  await createRequireOwnerUser(auth, createRequireHorizonsOwner(undefined))({ get: () => 'Bearer t' }, res, () => assert.fail('must not continue'));
  assert.equal(res.statusCode, 403);
});
