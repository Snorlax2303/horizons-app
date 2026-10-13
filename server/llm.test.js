import test from 'node:test';
import assert from 'node:assert/strict';
import { chatJson, extractJsonObject, listModels, modelChain } from './llm.js';

const ai = {
  baseUrl: 'https://omniroute.test/v1/', apiKey: 'test-key-123456',
  models: { fast: 'claude/haiku', smart: 'claude/sonnet', vision: null },
  fallbackModels: ['codex/gpt-5', 'claude/sonnet'], timeoutMs: 1000,
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('builds a de-duplicated model chain per profile', () => {
  assert.deepEqual(modelChain(ai, 'fast'), ['claude/haiku', 'codex/gpt-5', 'claude/sonnet']);
  assert.deepEqual(modelChain(ai, 'smart'), ['claude/sonnet', 'codex/gpt-5']);
  assert.deepEqual(modelChain(ai, 'vision'), ['codex/gpt-5', 'claude/sonnet']);
});

test('extracts JSON after reasoning blocks and before trailing text', () => {
  assert.deepEqual(extractJsonObject('<think>{"x":0}</think>Resposta: {"a":{"b":"}"}} fim'), { a: { b: '}' } });
  assert.throws(() => extractJsonObject('sem json'), /JSON/);
});

test('falls back on HTTP errors and does not send temperature by default', async () => {
  const calls = [];
  const result = await chatJson(ai, {
    profile: 'smart', messages: [{ role: 'user', content: 'oi' }],
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, model: body.model, temperature: body.temperature });
      if (body.model === 'claude/sonnet') return reply({ error: { message: 'quota' } }, 429);
      return reply({ choices: [{ message: { content: '{"ok":true}' } }] });
    },
  });
  assert.equal(calls[0].url, 'https://omniroute.test/v1/chat/completions');
  assert.equal(calls[0].temperature, undefined);
  assert.deepEqual(calls.map((call) => call.model), ['claude/sonnet', 'codex/gpt-5']);
  assert.deepEqual(result, { model: 'codex/gpt-5', fallback_used: true, value: { ok: true } });
});

test('stops the chain when the key is rejected', async () => {
  let count = 0;
  await assert.rejects(() => chatJson(ai, {
    profile: 'smart', messages: [],
    fetchImpl: async () => { count += 1; return reply({}, 401); },
  }), /Nenhum modelo/);
  assert.equal(count, 1);
});

test('refuses to run without key or models', async () => {
  await assert.rejects(() => chatJson({ ...ai, apiKey: '' }, { profile: 'fast', messages: [] }), /não configurada/);
});

test('lists model ids from the OpenAI-compatible /models endpoint', async () => {
  const models = await listModels({
    baseUrl: 'https://omniroute.test/v1', apiKey: 'k',
    fetchImpl: async (url) => { assert.equal(url, 'https://omniroute.test/v1/models'); return reply({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }); },
  });
  assert.deepEqual(models, ['a', 'b']);
  await assert.rejects(() => listModels({ baseUrl: 'https://x/v1', apiKey: 'k', fetchImpl: async () => reply({}, 401) }), /Chave recusada/);
});
