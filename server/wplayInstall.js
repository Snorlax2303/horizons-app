// Orientação de instalação do painel WPlay.
//
// O painel mantém o catálogo de instalação em `GET /panel-links` (templates por
// produto/marca, com código Downloader, códigos de Play Store, links e lojas).
// Este módulo é a única ponte para esse catálogo: nada de orientação escrita à
// mão aqui — se o painel mudar, a orientação acompanha.
//
// Somente leitura: nunca cria, renova ou ativa nada.

const DEFAULT_BASE_URL = 'https://mcapi.knewcms.com:2087';
const CACHE_TTL_MS = 10 * 60 * 1000;
const SCHEME = 'Bearer';

export const WPLAY_INSTALL_PRODUCTS = [
  ['iptv', 'IPTV / P2P'],
  ['p2p', 'Somente P2P'],
  ['krator', 'Krator+'],
  ['nexus', 'Nexus'],
  ['whot', 'Whot'],
];

// marca normalizada -> [categoria, nome do template] no catálogo do painel.
const ROUTES = {
  iptv: {
    samsung: ['IPTV', 'LG/Samsung/Roku'],
    lg: ['IPTV', 'LG/Samsung/Roku'],
    roku: ['IPTV', 'LG/Samsung/Roku'],
    android: ['IPTV', 'Android'],
    android_tv: ['IPTV', 'Android'],
    desktop: ['IPTV', 'Desktop'],
    dns: ['IPTV', 'DNS (SmartUP e STB)'],
    other: ['IPTV', 'Completo IPTV'],
  },
  p2p: {
    other: ['IPTV', 'P2P com Aplicativo'],
  },
  krator: {
    other: ['KRATOR', 'Krator+ Completo'],
  },
  nexus: {
    android: ['NEXUS', 'Nexus Completo'],
    android_tv: ['NEXUS', 'Nexus Completo'],
  },
  whot: {
    other: ['WHOT', 'WHOT Padrão'],
  },
};

const BRAND_ALIASES = {
  samsung: 'samsung',
  lg: 'lg',
  roku: 'roku',
  android: 'android',
  androidtv: 'android_tv',
  android_tv: 'android_tv',
  firetv: 'android_tv',
  fire_tv: 'android_tv',
  firestick: 'android_tv',
  fire_stick: 'android_tv',
  tvbox: 'android_tv',
  tv_box: 'android_tv',
  chromecast: 'android_tv',
  android_tv_box: 'android_tv',
  windows: 'desktop',
  mac: 'desktop',
  macos: 'desktop',
  pc: 'desktop',
  computador: 'desktop',
  desktop: 'desktop',
  stb: 'dns',
  smartup: 'dns',
  smart_up: 'dns',
  dns: 'dns',
};

/** Normaliza a marca/aparelho informada pelo cliente. */
export function normalizeBrand(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return 'other';
  return BRAND_ALIASES[raw] || 'other';
}

function templateKey(category, name) {
  return `${String(category || '').toUpperCase()}::${String(name || '').toLowerCase()}`;
}

/** Indexa os templates do catálogo do painel por categoria::nome. */
export function indexTemplates(items) {
  const index = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.is_active === false) continue;
    index.set(templateKey(item.category, item.name), item);
    }
  return index;
}

/** Remove HTML e normaliza espaços de um template do painel. */
export function plainText(html) {
  return String(html == null ? '' : html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fill(text, values = {}) {
  return text
    .replace(/\{\{\s*(usu[aá]rio|user|login)\s*\}\}/gi, values.username ? String(values.username) : '{{usuário}}')
    .replace(/\{\{\s*(senha|password)\s*\}\}/gi, values.password ? String(values.password) : '{{senha}}')
    .replace(/\{\{\s*m3u8\s*\}\}/gi, values.m3u8 ? String(values.m3u8) : '{{m3u8}}');
}

/** Sugestões de apps: linhas de tópico do próprio template do painel. */
export function suggestionsFrom(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[•\-*]\s+/.test(line))
    .map((line) => line.replace(/^[•\-*]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Resolve a orientação de instalação para um produto + marca.
 * Devolve sempre um objeto; `found:false` traz o motivo.
 */
export function resolveInstall(items, { product, brand, username, password, m3u8 } = {}) {
  const productKey = String(product || 'iptv').trim().toLowerCase();
  const routes = ROUTES[productKey];
  if (!routes) return { found: false, reason: 'unknown_product', product: productKey };
  const normalizedBrand = normalizeBrand(brand);

  if (productKey === 'nexus' && !routes[normalizedBrand]) {
    return {
      found: false,
      reason: 'nexus_android_only',
      product: productKey,
      brand: normalizedBrand,
      hint: 'O Nexus só é oferecido em Android (celular, Android TV, Fire Stick ou TV Box).',
    };
  }

  const target = routes[normalizedBrand] || routes.other;
  const index = indexTemplates(items);
  const item = index.get(templateKey(target[0], target[1]));
  if (!item) {
    return { found: false, reason: 'template_not_found', product: productKey, brand: normalizedBrand, template: { category: target[0], name: target[1] } };
  }
  const text = fill(plainText(item.description), { username, password, m3u8 });
  return {
    found: true,
    product: productKey,
    brand: normalizedBrand,
    template: { category: item.category, name: item.name },
    text,
    suggestions: suggestionsFrom(text),
  };
}

let cache = { at: 0, baseUrl: '', items: null };

function baseUrl(config) {
  return String(config?.wwpanelApiUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

/** Lê o catálogo de instalação do painel (com cache curto). Somente leitura. */
export async function fetchWplayLinks(config, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiKey = String(config?.wwpanelApiKey || '').trim();
  if (!apiKey) throw new Error('WPlay não está configurado: defina WWPANEL_API_KEY no ambiente protegido.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível no runtime.');

  const now = typeof options.now === 'function' ? options.now() : Date.now();
  const url = baseUrl(config);
  if (cache.items && cache.baseUrl === url && now - cache.at < (options.ttlMs ?? CACHE_TTL_MS)) return cache.items;

  const headers = Object.create(null);
  headers.authorization = [SCHEME, apiKey].join(' ');
  headers.accept = 'application/json';
  const response = await fetchImpl(`${url}/panel-links`, { headers, signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || `Painel WPlay respondeu ${response.status} ao ler o catálogo de instalação.`);
    error.statusCode = response.status;
    throw error;
  }
  const items = Array.isArray(payload) ? payload : (payload.items || payload.data || []);
  cache = { at: now, baseUrl: url, items };
  return items;
}

export function resetWplayLinksCache() {
  cache = { at: 0, baseUrl: '', items: null };
}
