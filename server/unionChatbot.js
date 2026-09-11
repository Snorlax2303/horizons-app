export function unionDirectTestIsConfigured(config) {
  return Boolean(config.unionTestUrlDefault || config.cinehubTestEndpointsJson);
}

export const cinehubDirectTestIsConfigured = unionDirectTestIsConfigured;

export function isUsableCinehubCheckoutUrl(value) {
  try {
    const url = new URL(value);
    const allowedHosts = new Set(['union.meugestor.top', 'painelcinehub.top', 'revenda-eliteiptv.online']);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) return false;
    const hashCheckout = /^#\/checkout\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.hash);
    return hashCheckout || url.pathname !== '/' || url.searchParams.size > 0;
  } catch {
    return false;
  }
}

function testCatalog(config) {
  if (!config.cinehubTestEndpointsJson) return {};
  try {
    const parsed = JSON.parse(config.cinehubTestEndpointsJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('Catálogo de endpoints CineHub inválido.');
  }
}

export function testUrl(config, selection = {}) {
  const key = selection.server && selection.duration_hours && selection.content
    ? `${selection.server}:${selection.duration_hours}:${selection.content}`
    : null;
  const catalog = testCatalog(config);
  if (key && typeof catalog[key] === 'string') return catalog[key];
  if (key && Object.keys(catalog).length) throw new Error('Variação de teste CineHub não configurada.');
  return config.unionTestUrlDefault;
}

export function resolveCinehubAccessDns(structuredDns, reply) {
  const raw = String(structuredDns || '').trim();
  const text = String(reply || '');
  let structuredHost = '';
  try { structuredHost = new URL(raw).hostname.toLowerCase(); } catch { structuredHost = ''; }
  if (structuredHost && text.toLowerCase().includes(structuredHost)) {
    return { dns: raw, source: 'provider_confirmed', provider_dns: raw, warning: null };
  }
  const candidates = text.match(/https?:\/\/[^\s<>]+/gi) || [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ''));
      const accessLike = url.pathname.endsWith('/get.php')
        || /\/(?:p\/)?[^/]+\/[^/]+\/(?:m3u|hls|ssiptv)\/?$/i.test(url.pathname);
      if (accessLike) {
        return {
          dns: url.origin, source: 'reply_access_url', provider_dns: raw || null,
          warning: raw ? 'CINEHUB_DNS_CONFLICT' : null,
        };
      }
    } catch { /* ignore malformed provider URLs */ }
  }
  return { dns: raw || null, source: raw ? 'provider_unconfirmed' : 'missing', provider_dns: raw || null, warning: raw ? 'CINEHUB_DNS_UNCONFIRMED' : 'CINEHUB_DNS_MISSING' };
}

export function extractCinehubDeliveryProfile(reply) {
  const text = String(reply || '');
  const providerCodes = [...text.matchAll(/(?:provedor|provider)\s*:\s*(\d{3,12})/gi)].map((match) => match[1]);
  const uniqueProviderCodes = [...new Set(providerCodes)];
  const iboSection = text.match(/IBO\s*4K\s*PLUS([\s\S]*?)(?=\n\s*[☑✅]|$)/i)?.[1] || '';
  const downloaderCode = iboSection.match(/Downloader\s*:\s*(\d{3,12})/i)?.[1] || null;
  const ntdownCode = iboSection.match(/NTd?o?nw?\s*:\s*(\d{3,12})/i)?.[1] || null;
  const browserLink = iboSection.match(/Link(?:\s+Celular\s+ou\s+Navegador|\s+Navegador)?\s*:\s*(https?:\/\/\S+)/i)?.[1]?.replace(/[),.;]+$/, '') || null;
  return {
    partner_provider_code: uniqueProviderCodes.length === 1 ? uniqueProviderCodes[0] : null,
    partner_provider_code_status: uniqueProviderCodes.length === 1 ? 'confirmed' : uniqueProviderCodes.length ? 'ambiguous' : 'missing',
    android_app: downloaderCode || ntdownCode ? 'IBO 4K PLUS' : null,
    android_downloader_code: downloaderCode,
    android_ntdown_code: ntdownCode,
    android_browser_link: browserLink,
  };
}

export async function createUnionDirectTest(config, contact = {}, selection = {}) {
  if (!unionDirectTestIsConfigured(config)) throw new Error('URL de teste direto do CineHub não configurada.');
  const url = new URL(testUrl(config, selection));
  const allowedHosts = new Set(['union.meugestor.top', 'painelcinehub.top', 'revenda-eliteiptv.online']);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || !url.pathname.startsWith('/api/chatbot/')) {
    throw new Error('URL de teste direto do CineHub inválida.');
  }
  const phone = String(contact.phone || '').replace(/\D/g, '');
  url.searchParams.set('Content-Type', 'application/json');
  url.searchParams.set('senderPhone', phone);
  const result = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      phone,
      name: String(contact.name || '').trim() || undefined,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok && result.status === 400) throw new Error('CINEHUB_PHONE_ALREADY_TESTED');
  if (!result.ok) throw new Error(payload?.message || payload?.error || `CineHub respondeu ${result.status}`);
  const required = ['username', 'password', 'dns', 'package', 'expiresAt', 'reply'];
  if (!required.every((field) => typeof payload?.[field] === 'string' && payload[field])) {
    throw new Error('CineHub não retornou um acesso de teste completo.');
  }
  const resolvedDns = resolveCinehubAccessDns(payload.dns, payload.reply);
  const deliveryProfile = extractCinehubDeliveryProfile(payload.reply);
  return {
    username: payload.username,
    password: payload.password,
    dns: resolvedDns.dns,
    provider_dns: resolvedDns.provider_dns,
    dns_source: resolvedDns.source,
    dns_warning: resolvedDns.warning,
    delivery_profile: deliveryProfile,
    connections: Number(payload.connections || 1),
    package: payload.package,
    created_at: payload.createdAt || null,
    expires_at: payload.expiresAt,
    payment_url: isUsableCinehubCheckoutUrl(payload.payUrl) ? payload.payUrl : null,
    reply: payload.reply,
  };
}

export const createCinehubDirectTest = createUnionDirectTest;
