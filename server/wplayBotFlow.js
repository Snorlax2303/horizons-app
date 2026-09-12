// Fluxo guiado do cliente (bot do WhatsApp, rodando no n8n) contra o painel WPlay.
//
// O n8n nunca fala com o painel: ele chama estas funções via rotas
// `/api/typebot/wplay/*`, que autenticam pela ponte do bot. A chave do painel
// continua só no `.env` protegido do Horizons.
//
// Regras do dono (2026-09-11):
//   - O teste roda no WPlay (substituiu o teste antigo).
//   - Ativar app EM TESTE não consome crédito → o cliente já assiste no trial.
//   - Só depois do pagamento a linha de produção é ativada no painel.
//
// Escrever no painel continua atrás de WWPANEL_WRITES_ENABLED: sem a flag, nada
// é criado e a função devolve `enabled:false` em vez de tentar.

import { createWwpanelClient, wwpanelConfigured } from './wplayPanel.js';
import { fetchWplayLinks, resolveInstall } from './wplayInstall.js';
import { WWPANEL_APPS, WWPANEL_XSTREAM_APPS } from './wplayCatalog.js';

export const WPLAY_TRIAL_PRODUCTS = ['iptv', 'p2p', 'krator', 'nexus'];

/** Extrai o primeiro campo presente, sem depender do nome exato da resposta do painel. */
function pick(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

/** Normaliza a resposta do painel para o que o bot precisa entregar. */
export function normalizeTrialResult(result) {
  const line = result?.line || result?.data || result || {};
  const nested = line && typeof line === 'object' ? line : {};
  return {
    lineId: pick(nested, ['id', '_id', 'id_user', 'lineId', 'line_id']),
    username: pick(nested, ['username', 'user', 'login']),
    password: pick(nested, ['password', 'senha']),
    accessCode: pick(nested, ['accessCode', 'access_code', 'code', 'codigo']),
    expiresAt: pick(nested, ['expiresAt', 'expires_at', 'expire_at', 'validade']),
    raw: result ?? null,
  };
}

/** Estado do fluxo para o bot decidir se oferece o teste. */
export function wplayBotStatus(config) {
  return {
    configured: wwpanelConfigured(config),
    enabled: Boolean(config?.wwpanelWritesEnabled && config?.wwpanelTestsEnabled),
    products: WPLAY_TRIAL_PRODUCTS,
  };
}

/** Orientação de instalação (somente leitura) para um produto + marca. */
export async function resolveBotInstall(config, input = {}, deps = {}) {
  const items = await fetchWplayLinks(config, deps);
  return resolveInstall(items, {
    product: input.product,
    brand: input.brand ?? input.device,
    username: input.username,
    password: input.password,
  });
}

function trialPayload(input) {
  const payload = { isTrial: 1 };
  for (const key of ['package_iptv', 'package_p2p', 'package_krator', 'package_nexus', 'serviceId', 'testDuration', 'whatsapp', 'country', 'notes', 'mac']) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') payload[key] = input[key];
  }
  return payload;
}

/**
 * Cria o teste no WPlay e, se o MAC vier junto, já ativa o app nesse teste
 * (ativar app em teste não consome crédito).
 */
export async function createWplayTrial(config, input = {}, deps = {}) {
  if (!wwpanelConfigured(config)) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!config?.wwpanelWritesEnabled || !config?.wwpanelTestsEnabled) {
    return { ok: false, reason: 'writes_disabled' };
  }

  const product = WPLAY_TRIAL_PRODUCTS.includes(input.product) ? input.product : 'iptv';
  if (product === 'krator' && (!input.package_krator || !input.serviceId)) {
    return { ok: false, reason: 'missing_krator_fields' };
  }
  if (product === 'nexus' && input.package_nexus === undefined) {
    return { ok: false, reason: 'missing_nexus_package' };
  }

  const client = (deps.clientFactory || createWwpanelClient)(config);
  const payload = trialPayload(input);
  const result = product === 'krator'
    ? await client.createKratorTest(payload)
    : product === 'nexus'
      ? await client.createNexusTest(payload)
      : await client.createTest(payload);

  const trial = normalizeTrialResult(result);
  let activated = null;
  if (input.mac && input.nameApp && trial.lineId !== null) {
    activated = await client.activateApp({
      nameApp: input.nameApp,
      mac: input.mac,
      namePlaylist: input.namePlaylist || input.name || undefined,
      id_user: trial.lineId,
    });
  }
  return { ok: true, product, trial, activated };
}

// O cliente diz o nome do app que instalou; casamos com a lista real do painel.
// Apps "xstream" (WTV Player/Wapp, XCloud, Kplay) usam login/senha, não MAC —
// esses não entram na ativação por MAC.
const APP_ALIASES = [
  [/brasil\s*iptv|brasiliptv/i, 'BrasilIPTV'],
  [/easy\s*player/i, 'EasyPlayer'],
  [/iptv\s*plus/i, 'IPTVPlus'],
  [/iptv\s*next/i, 'IPTVNextPlayer'],
  [/iptv\s*player\s*io|playerio/i, 'IPTVPlayerio'],
  [/iptv\s*pro/i, 'IPTVProPlayer'],
  [/iptv\s*star/i, 'IPTVStarPlayer'],
  [/tv\s*vision|tvvision/i, 'TVVision'],
  [/tivi/i, 'TiviPlayerIPTV'],
  [/iptv\s*4k|4k\s*player/i, 'IPTV4K'],
  [/ottplayer|ott\s*player/i, 'OttPlayer'],
  [/^iplayer$|\biplayer\b/i, 'IPlayer'],
  [/wtv|wapp/i, 'WTV Player/Wapp'],
  [/xcloud/i, 'XCloud'],
  [/k\s*play|kplay/i, 'Kplay'],
];

/** Casa o texto do cliente com um app real do painel. */
export function matchPanelApp(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const exactCommon = WWPANEL_APPS.find((app) => app.toLowerCase() === raw.toLowerCase());
  if (exactCommon) return { app: exactCommon, kind: 'common' };
  const exactXstream = WWPANEL_XSTREAM_APPS.find((app) => app.toLowerCase() === raw.toLowerCase());
  if (exactXstream) return { app: exactXstream, kind: 'xstream' };
  for (const [pattern, app] of APP_ALIASES) {
    if (pattern.test(raw)) {
      return { app, kind: WWPANEL_XSTREAM_APPS.includes(app) ? 'xstream' : 'common' };
    }
  }
  return null;
}

/** Extrai MAC de um texto livre (com ou sem separadores). */
export function extractMac(value) {
  const hex = String(value || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

/** Ativa o app de um teste já existente (cliente mandou o MAC depois). */
export async function activateWplayApp(config, input = {}, deps = {}) {
  if (!wwpanelConfigured(config)) return { ok: false, reason: 'not_configured' };
  if (!config?.wwpanelWritesEnabled) return { ok: false, reason: 'writes_disabled' };
  if (!config?.wwpanelAppActivationEnabled) return { ok: false, reason: 'writes_disabled' };
  const mac = input.mac ? (extractMac(input.mac) || String(input.mac).trim()) : null;
  const match = input.nameApp ? { app: input.nameApp, kind: WWPANEL_XSTREAM_APPS.includes(input.nameApp) ? 'xstream' : 'common' } : matchPanelApp(input.appText);
  if (!mac || !match || input.id_user === undefined || input.id_user === null) {
    return { ok: false, reason: 'missing_fields' };
  }
  if (match.kind === 'xstream') {
    return { ok: false, reason: 'app_requires_login', app: match.app };
  }
  const client = (deps.clientFactory || createWwpanelClient)(config);
  const result = await client.activateApp({
    nameApp: match.app,
    mac,
    namePlaylist: input.namePlaylist || undefined,
    id_user: input.id_user,
  });
  return { ok: true, app: match.app, result };
}
