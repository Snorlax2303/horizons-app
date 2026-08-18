import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnionDirectTest, extractCinehubDeliveryProfile, isUsableCinehubCheckoutUrl, resolveCinehubAccessDns } from './unionChatbot.js';

test('rejects a panel homepage as checkout and accepts a referenced payment URL', () => {
  assert.equal(isUsableCinehubCheckoutUrl('https://painelcinehub.top/'), false);
  assert.equal(isUsableCinehubCheckoutUrl('https://painelcinehub.top/#/checkout/example-order/example-token'), true);
  assert.equal(isUsableCinehubCheckoutUrl('https://painelcinehub.top/checkout/order-123'), true);
  assert.equal(isUsableCinehubCheckoutUrl('https://painelcinehub.top/?reference=order-123'), true);
  assert.equal(isUsableCinehubCheckoutUrl('https://example.com/checkout/order-123'), false);
});

test('keeps provider DNS when the reply confirms the same host', () => {
  assert.deepEqual(resolveCinehubAccessDns('http://stream.example', 'Use a DNS http://stream.example no aplicativo.'), {
    dns: 'http://stream.example', source: 'provider_confirmed', provider_dns: 'http://stream.example', warning: null,
  });
});

test('uses access URL origin when provider DNS conflicts with the reply', () => {
  assert.deepEqual(resolveCinehubAccessDns(
    'http://unexpected.example',
    'Lista: http://access.example/get.php?username=user&password=secret&type=m3u_plus',
  ), {
    dns: 'http://access.example', source: 'reply_access_url', provider_dns: 'http://unexpected.example', warning: 'CINEHUB_DNS_CONFLICT',
  });
});

test('extracts server-specific partner and Android app codes from the test reply', () => {
  const profile = extractCinehubDeliveryProfile(`
    Vizzion Play\nProvedor: 00906\nFun Play\nProvedor: 00906
    IBO 4K PLUS\nLink Celular ou Navegador: https://app.example/install\nDownloader: 7654321\nNTdonw: 23456
    ☑️ XC LITE\nDownloader: 1111111
  `);
  assert.deepEqual(profile, {
    partner_provider_code: '00906', partner_provider_code_status: 'confirmed',
    android_app: 'IBO 4K PLUS', android_downloader_code: '7654321', android_ntdown_code: '23456',
    android_browser_link: 'https://app.example/install',
  });
});

test('createUnionDirectTest forwards normalized phone in query and body', async () => {
  const previousFetch = globalThis.fetch;
  let received;
  globalThis.fetch = async (url, options) => {
    received = { url: String(url), options };
    return new Response(JSON.stringify({
      username: 'trial-user', password: 'transient-password', dns: 'http://example.test',
      package: 'TRIAL', expiresAt: '2026-08-05T00:00:00.000Z', reply: 'Temporary reply',
      connections: 1, createdAt: '2026-08-04T00:00:00.000Z', payUrl: 'https://example.test/pay',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await createUnionDirectTest(
      { unionTestUrlDefault: 'https://painelcinehub.top/api/chatbot/public/token' },
      { phone: '+55 (11) 99999-0000', name: 'Cliente Teste' },
    );
    const receivedUrl = new URL(received.url);
    assert.equal(`${receivedUrl.origin}${receivedUrl.pathname}`, 'https://painelcinehub.top/api/chatbot/public/token');
    assert.equal(receivedUrl.searchParams.get('Content-Type'), 'application/json');
    assert.equal(receivedUrl.searchParams.get('senderPhone'), '5511999990000');
    assert.deepEqual(JSON.parse(received.options.body), { phone: '5511999990000', name: 'Cliente Teste' });
    assert.equal(result.username, 'trial-user');
    assert.equal(result.password, 'transient-password');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('createUnionDirectTest selects the protected CineHub catalog variant', async () => {
  const previousFetch = globalThis.fetch;
  let receivedUrl;
  globalThis.fetch = async (url) => {
    receivedUrl = new URL(String(url));
    return new Response(JSON.stringify({
      username: 'trial-user', password: 'transient-password', dns: 'http://example.test',
      package: 'TRIAL', expiresAt: '2026-08-05T00:00:00.000Z', reply: 'Temporary reply',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await createUnionDirectTest({
      cinehubTestEndpointsJson: JSON.stringify({
        'zeus:12:no_adults': 'https://painelcinehub.top/api/chatbot/public/zeus-token',
      }),
    }, { phone: '16988302020' }, { server: 'zeus', duration_hours: 12, content: 'no_adults' });
    assert.equal(receivedUrl.pathname, '/api/chatbot/public/zeus-token');
    assert.equal(receivedUrl.searchParams.get('senderPhone'), '16988302020');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
