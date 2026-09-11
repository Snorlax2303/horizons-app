import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBrand,
  plainText,
  indexTemplates,
  suggestionsFrom,
  resolveInstall,
  fetchWplayLinks,
  resetWplayLinksCache,
} from './wplayInstall.js';

const LINKS = [
  { category: 'IPTV', name: 'LG/Samsung/Roku', type: 'template', is_active: true,
    description: '<p>Bem-vindo</p><p>👤 Usuário: {{usuário}}</p><p>🔒 Senha: {{senha}}</p>'
      + '<p>Aplicativos recomendados:</p><ul><li>• WTV Player</li><li>• Kplay</li><li>• Brasil IPTV: Code: wplay</li></ul>' },
  { category: 'IPTV', name: 'Completo IPTV', type: 'template', is_active: true,
    description: '<p>Completo</p><p>👤 Usuário: {{usuario}}</p><p>🔒 Senha: {{senha}}</p>' },
  { category: 'KRATOR', name: 'Krator+ Completo', type: 'template', is_active: true,
    description: '<p>Krator+</p><p>📺 Roku Store: busque por "Krator+"</p>' },
  { category: 'NEXUS', name: 'Nexus Completo', type: 'template', is_active: true,
    description: '<p>Nexus</p><p>📄 Código Downloader: 9042087</p>' },
  { category: 'WHOT', name: 'WHOT Padrão', type: 'template', is_active: true,
    description: '<p>Whot</p><p>🔗 Link: https://whot.me</p>' },
];

test('normaliza marcas e aparelhos para a chave do catálogo', () => {
  assert.equal(normalizeBrand('Samsung'), 'samsung');
  assert.equal(normalizeBrand('LG'), 'lg');
  assert.equal(normalizeBrand('Fire Stick'), 'android_tv');
  assert.equal(normalizeBrand('firetv'), 'android_tv');
  assert.equal(normalizeBrand('TV Box'), 'android_tv');
  assert.equal(normalizeBrand('macOS'), 'desktop');
  assert.equal(normalizeBrand('SmartUP'), 'dns');
  assert.equal(normalizeBrand(''), 'other');
  assert.equal(normalizeBrand('marca-desconhecida'), 'other');
});

test('remove HTML e lista as sugestões do template', () => {
  const text = plainText(LINKS[0].description);
  assert.match(text, /Aplicativos recomendados/);
  assert.doesNotMatch(text, /<p>/);
  const suggestions = suggestionsFrom(text);
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0], 'WTV Player');
  assert.match(suggestions[2], /Brasil IPTV/);
});

test('indexa templates ativos por categoria e nome', () => {
  const index = indexTemplates([...LINKS, { category: 'IPTV', name: 'Inativo', is_active: false }]);
  assert.ok(index.has('IPTV::lg/samsung/roku'));
  assert.equal(index.has('IPTV::inativo'), false);
});

test('resolve a orientação de TV por marca (LG/Samsung/Roku)', () => {
  const result = resolveInstall(LINKS, { product: 'iptv', brand: 'samsung' });
  assert.equal(result.found, true);
  assert.equal(result.template.name, 'LG/Samsung/Roku');
  assert.equal(result.brand, 'samsung');
  assert.ok(result.suggestions.includes('Kplay'));
});

test('preenche usuário e senha quando informados', () => {
  const result = resolveInstall(LINKS, { product: 'iptv', brand: 'lg', username: 'cliente1', password: 'segredo' });
  assert.match(result.text, /cliente1/);
  assert.match(result.text, /segredo/);
  assert.doesNotMatch(result.text, /\{\{/);
});

test('mantém o placeholder quando as credenciais não vêm', () => {
  const result = resolveInstall(LINKS, { product: 'iptv', brand: 'roku' });
  assert.match(result.text, /\{\{usuário\}\}/);
});

test('Nexus só é oferecido em Android', () => {
  const android = resolveInstall(LINKS, { product: 'nexus', brand: 'android' });
  assert.equal(android.found, true);
  const tv = resolveInstall(LINKS, { product: 'nexus', brand: 'samsung' });
  assert.equal(tv.found, false);
  assert.equal(tv.reason, 'nexus_android_only');
});

test('Krator+ e Whot caem no template certo', () => {
  assert.equal(resolveInstall(LINKS, { product: 'krator', brand: 'roku' }).template.category, 'KRATOR');
  assert.equal(resolveInstall(LINKS, { product: 'whot' }).template.category, 'WHOT');
});

test('marca desconhecida cai no template completo do produto', () => {
  const result = resolveInstall(LINKS, { product: 'iptv', brand: 'marca-x' });
  assert.equal(result.found, true);
  assert.equal(result.template.name, 'Completo IPTV');
});

test('produto desconhecido não resolve', () => {
  const result = resolveInstall(LINKS, { product: 'inexistente', brand: 'samsung' });
  assert.equal(result.found, false);
  assert.equal(result.reason, 'unknown_product');
});

test('lê o catálogo do painel com autenticação e usa cache', async () => {
  resetWplayLinksCache();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, auth: options.headers.authorization });
    return { ok: true, status: 200, json: async () => ({ items: LINKS }) };
  };
  const config = { wwpanelApiUrl: 'https://painel.test', wwpanelApiKey: 'chave-de-teste' };
  const first = await fetchWplayLinks(config, { fetchImpl });
  const second = await fetchWplayLinks(config, { fetchImpl });
  assert.equal(first.length, LINKS.length);
  assert.equal(second.length, LINKS.length);
  assert.equal(calls.length, 1, 'a segunda leitura deve vir do cache');
  assert.equal(calls[0].url, 'https://painel.test/panel-links');
  assert.match(calls[0].auth, /^Bearer /);
});

test('erro do painel vira erro com statusCode', async () => {
  resetWplayLinksCache();
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ message: 'sem permissão' }) });
  await assert.rejects(
    () => fetchWplayLinks({ wwpanelApiUrl: 'https://painel.test', wwpanelApiKey: 'chave' }, { fetchImpl }),
    (error) => error.statusCode === 403,
  );
});
