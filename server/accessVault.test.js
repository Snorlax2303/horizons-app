import assert from 'node:assert/strict';
import test from 'node:test';
import { openAccessValue, sealAccessValue } from './accessVault.js';

test('cifra e recupera dados de acesso sem armazenar o texto original', () => {
  const encrypted = sealAccessValue('senha-temporaria', 'segredo-de-teste');
  assert.ok(encrypted.startsWith('v1.'));
  assert.ok(!encrypted.includes('senha-temporaria'));
  assert.equal(openAccessValue(encrypted, 'segredo-de-teste'), 'senha-temporaria');
});

test('rejeita chave incorreta', () => {
  const encrypted = sealAccessValue('mensagem completa', 'segredo-correto');
  assert.throws(() => openAccessValue(encrypted, 'segredo-incorreto'));
});
