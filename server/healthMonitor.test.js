import test from 'node:test';
import assert from 'node:assert/strict';
import { collectHealthSignals, composeAlertMessage, planAlerts, runHealthMonitor } from './healthMonitor.js';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-13T15:00:00Z');
const settings = { inboundSilenceHours: 6, receiptFailureMin: 3, remindEveryHours: 12, instances: [] };
const config = { evolutionApiUrl: 'http://evo.test', evolutionApiKey: 'k', horizonsOwnerUserId: 'owner-1', telegramAdminAllowedUserIds: ['42'] };

function supabaseWith({ lastInbound, failed = 0, total = 0 }) {
  return {
    from(table) {
      const filters = {};
      const api = {
        select() { return api; }, order() { return api; }, limit() { return api; },
        eq(column, value) { filters[column] = value; return api; }, gte() { return api; },
        maybeSingle: async () => ({ data: table === 'lead_events' && lastInbound ? { created_at: lastInbound } : null, error: null }),
        then(resolve) { return Promise.resolve({ count: filters.extraction_status === 'failed' ? failed : total, error: null }).then(resolve); },
      };
      return api;
    },
  };
}
const evolution = (items) => async () => new Response(JSON.stringify(items), { status: 200 });
const aiSettings = (configured) => ({ resolve: async () => (configured ? { apiKey: 'k', baseUrl: 'u', models: { fast: 'm' } } : { models: {} }) });

test('detecta instância fechada, entrada parada, comprovantes falhando e IA sem chave', async () => {
  const signals = await collectHealthSignals({
    config, settings, now: NOW, aiSettings: aiSettings(false),
    supabase: supabaseWith({ lastInbound: new Date(NOW - 30 * HOUR).toISOString(), failed: 5, total: 6 }),
    fetchImpl: evolution([{ name: 'Meu numero', connectionStatus: 'close' }, { name: 'Horizons Typebot', connectionStatus: 'open' }]),
  });
  assert.deepEqual(signals.problems.map((item) => item.key).sort(), ['ai:not_configured', 'evolution:Meu numero', 'inbound:silent', 'receipts:failing']);
});

test('tudo saudável não gera problema', async () => {
  const signals = await collectHealthSignals({
    config, settings, now: NOW, aiSettings: aiSettings(true),
    supabase: supabaseWith({ lastInbound: new Date(NOW - HOUR).toISOString(), failed: 1, total: 10 }),
    fetchImpl: evolution([{ name: 'Horizons Typebot', connectionStatus: 'open' }]),
  });
  assert.deepEqual(signals.problems, []);
});

test('avisa só o que é novo, lembra a cada 12 h e informa o que resolveu', () => {
  const problem = { key: 'evolution:A', text: 'A fechada' };
  const first = planAlerts([problem], {}, { now: NOW });
  assert.equal(first.opened.length, 1);
  const quiet = planAlerts([problem], first.state, { now: NOW + HOUR });
  assert.equal(quiet.opened.length + quiet.reminded.length + quiet.resolved.length, 0);
  assert.equal(composeAlertMessage(quiet), '');
  const remind = planAlerts([problem], first.state, { now: NOW + 13 * HOUR });
  assert.equal(remind.reminded.length, 1);
  const done = planAlerts([], remind.state, { now: NOW + 14 * HOUR });
  assert.equal(done.resolved.length, 1);
  assert.match(composeAlertMessage(done), /Resolvido/);
});

test('não grava estado quando o Telegram falha, para tentar de novo', async () => {
  const store = new Map();
  const redis = { get: async (key) => store.get(key) || null, set: async (key, value) => { store.set(key, value); } };
  const args = {
    config, settings, now: NOW, aiSettings: aiSettings(true), redis,
    supabase: supabaseWith({ lastInbound: new Date(NOW - HOUR).toISOString() }),
    fetchImpl: evolution([{ name: 'A', connectionStatus: 'close' }]),
  };
  const failed = await runHealthMonitor({ ...args, sendTelegramMessage: async () => ({ ok: false, status: 500 }) });
  assert.equal(failed.plan.opened.length, 1);
  assert.equal(store.size, 0);
  let sentText;
  await runHealthMonitor({ ...args, sendTelegramMessage: async (_config, chatId, text) => { sentText = `${chatId}:${text}`; return { ok: true }; } });
  assert.match(sentText, /^42:.*A/s);
  assert.equal(JSON.parse(store.values().next().value)['evolution:A'].text.includes('A'), true);
});


test('banco indisponível gera alerta sem fingir contagens zero ou chave ausente', async () => {
  for (const rejected of [false, true]) {
    const unavailable = { from() {
      const api = {
        select() { return api; }, eq() { return api; }, order() { return api; }, limit() { return api; }, gte() { return api; },
        maybeSingle() { return rejected ? Promise.reject(new Error('private connection details')) : Promise.resolve({ error: { code: 'db_down' } }); },
        then(resolve, reject) { return (rejected ? Promise.reject(new Error('private connection details')) : Promise.resolve({ error: { code: 'db_down' } })).then(resolve, reject); },
      };
      return api;
    } };
    const signals = await collectHealthSignals({ config, settings, now: NOW, supabase: unavailable,
      aiSettings: { resolve: async () => { throw new Error('private secret'); } },
      fetchImpl: evolution([{ name: 'Horizons Typebot', connectionState: 'open' }]),
    });
    assert.equal(signals.database.status, 'error');
    assert.deepEqual(signals.receipts_24h, { failed: null, total: null });
    assert.equal(signals.ai_configured, null);
    assert.deepEqual(signals.problems.map(p => p.key), ['database:unavailable']);
    assert.ok(!JSON.stringify(signals).includes('private'));
  }
});
