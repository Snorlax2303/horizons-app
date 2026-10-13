import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretAdminIntent } from './minimaxAdmin.js';

const config = {
  minimaxApiKey: 'test-key',
  minimaxApiUrl: 'https://api.minimax.test/v1/chat/completions',
  minimaxPrimaryModel: 'MiniMax-M2.7',
  minimaxFallbackEnabled: true,
  minimaxFallbackModel: 'MiniMax-M3',
  minimaxMaxCompletionTokens: 1200,
  minimaxTemperature: 0.2,
  minimaxTimeoutMs: 1000,
};

const response = (content, status = 200) => new Response(JSON.stringify({
  choices: [{ message: { content } }],
}), { status, headers: { 'content-type': 'application/json' } });

test('interprets a valid read-only administrative request', async () => {
  const result = await interpretAdminIntent(config, 'Quantos clientes entraram este mês?', {
    fetchImpl: async () => response(JSON.stringify({
      tool: 'get_business_metrics', arguments: { period: 'month' }, confidence: 0.98,
      needs_clarification: false, clarification_question: null,
    })),
  });
  assert.equal(result.model, 'MiniMax-M2.7');
  assert.equal(result.fallback_used, false);
  assert.equal(result.intent.tool, 'get_business_metrics');
});

test('uses M3 only when primary output is invalid', async () => {
  const models = [];
  const result = await interpretAdminIntent(config, 'Localize o cliente Rafael', {
    fetchImpl: async (_url, options) => {
      const model = JSON.parse(options.body).model;
      models.push(model);
      if (model === 'MiniMax-M2.7') return response('resposta inválida');
      return response(JSON.stringify({
        tool: 'find_customer', arguments: { query: 'Rafael' }, confidence: 0.9,
        needs_clarification: false, clarification_question: null,
      }));
    },
  });
  assert.deepEqual(models, ['MiniMax-M2.7', 'MiniMax-M3']);
  assert.equal(result.fallback_used, true);
});

test('rejects unsupported write-capable tool names', async () => {
  await assert.rejects(() => interpretAdminIntent({ ...config, minimaxFallbackEnabled: false }, 'Renove o cliente', {
    fetchImpl: async () => response(JSON.stringify({
      tool: 'renew_customer', arguments: {}, confidence: 1,
      needs_clarification: false, clarification_question: null,
    })),
  }));
});

test('accepts an exact WhatsApp draft for later confirmation', async () => {
  const result = await interpretAdminIntent(config, 'Envie uma mensagem para o cliente', {
    fetchImpl: async () => response(JSON.stringify({
      tool: 'send_whatsapp', arguments: { phone: '5516999999999', message: 'Seu teste está pronto.' }, confidence: 0.99,
      needs_clarification: false, clarification_question: null,
    })),
  });
  assert.equal(result.intent.tool, 'send_whatsapp');
  assert.equal(result.intent.arguments.message, 'Seu teste está pronto.');
});

test('rejects a write request without all confirmation fields', async () => {
  await assert.rejects(() => interpretAdminIntent({ ...config, minimaxFallbackEnabled: false }, 'Envie uma mensagem', {
    fetchImpl: async () => response(JSON.stringify({
      tool: 'send_whatsapp', arguments: { phone: '5516999999999' }, confidence: 0.99,
      needs_clarification: false, clarification_question: null,
    })),
  }));
});

test('accepts the first complete JSON object when the model appends text', async () => {
  const result = await interpretAdminIntent(config, 'Mostre as métricas do mês', {
    fetchImpl: async () => response(`${JSON.stringify({
      tool: 'get_business_metrics', arguments: { period: 'month' }, confidence: 0.95,
      needs_clarification: false, clarification_question: null,
    })}\nExplicação adicional que deve ser ignorada.`),
  });
  assert.equal(result.intent.tool, 'get_business_metrics');
});

test('normalizes a human device label returned by the model', async () => {
  const result = await interpretAdminIntent(config, 'Crie um teste para uso em Smart TV Samsung', {
    fetchImpl: async () => response(JSON.stringify({
      tool: 'create_assisted_test',
      arguments: {
        beneficiary_name: 'Cliente Exemplo', phone: '5516999999999', device_category: 'Smart TV',
        manufacturer: 'Samsung', server: 'kyros', duration_hours: 6, content: 'no_adults',
      },
      confidence: 1, needs_clarification: false, clarification_question: null,
    })),
  });
  assert.equal(result.intent.arguments.device_category, 'smart_tv');
  assert.equal(result.intent.arguments.manufacturer, 'Samsung');
});
