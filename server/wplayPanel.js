// Cliente da API do painel WPlay (wwpanel.link).
//
// Documentação: https://docs.wplay.com.br
// Base padrão: https://mcapi.knewcms.com:2087 — JSON sobre HTTPS, autenticação
// por API key no header de autorização.
//
// Este módulo apenas faz chamadas HTTPS de saída. Ele nunca armazena nem
// registra a chave, e nunca imprime payloads. Todo endpoint de escrita é uma
// operação real no painel externo (clientes, testes e renovações consomem
// créditos); portanto quem chama deve exigir confirmação explícita do operador
// antes de executar.
import { assertKnownValue, WWPANEL_IPTV_PACKAGES, WWPANEL_P2P_PACKAGES } from './wplayCatalog.js';

const DEFAULT_BASE_URL = 'https://mcapi.knewcms.com:2087';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const SCHEME = 'Bearer';

export function wwpanelConfigured(config) {
  return Boolean(config?.wwpanelApiKey);
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function errorMessage(payload, status) {
  if (payload && Array.isArray(payload.message)) return payload.message.join('; ');
  if (payload && typeof payload.message === 'string' && payload.message) return payload.message;
  if (payload && typeof payload.error === 'string' && payload.error) return payload.error;
  return `WPlay respondeu ${status}.`;
}

export function createWwpanelClient(config, options = {}) {
  const apiKey = String(config?.wwpanelApiKey || '').trim();
  if (!apiKey) throw new Error('WPlay não está configurado: defina WWPANEL_API_KEY no ambiente protegido.');
  const baseUrl = normalizeBaseUrl(config?.wwpanelApiUrl);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível no runtime.');
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : MAX_RETRIES;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const authHeader = [SCHEME, apiKey].join(' ');

  async function call(method, path, body) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            authorization: authHeader,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        clearTimeout(timer);
        if (attempt < maxRetries) {
          attempt += 1;
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new Error(`Falha de rede ao chamar o painel WPlay: ${error.message}`);
      }
      clearTimeout(timer);

      const raw = await response.text();
      let payload;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = { raw };
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxRetries) {
        attempt += 1;
        const headerValue = Number(response.headers?.get?.('retry-after'));
        const delay = Number.isFinite(headerValue) && headerValue > 0 ? headerValue * 1000 : 400 * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        const error = new Error(errorMessage(payload, response.status));
        error.statusCode = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    }
  }

  return {
    // Testes / trials.
    createTest: (input) => call('POST', '/lines/test', input),
    createKratorTest: (input) => call('POST', '/lines/krator/test', input),
    createNexusTest: (input) => call('POST', '/lines/nexus/test', input),

    // Serviços do painel (obrigatório para teste Krator+: informa o serviceId).
    services: () => call('GET', '/lines/wapp/services'),

    // Clientes.
    createCustomer: (input) => call('POST', '/lines/v2', input),
    activateTrial: (id, input) => call('PATCH', `/lines/v2/active/${encodeURIComponent(id)}`, input),
    extend: (id, input) => call('PATCH', `/lines/v2/extend/${encodeURIComponent(id)}`, input),
    add48h: (id) => call('PATCH', `/lines/48-add/${encodeURIComponent(id)}`),
    managePlan: (id, input) => call('PATCH', `/lines/manage-plan/${encodeURIComponent(id)}`, input),
    editCustomer: (id, input) => call('PATCH', `/lines/${encodeURIComponent(id)}`, input),
    block: (id) => call('PATCH', `/lines/${encodeURIComponent(id)}`, { status: 0 }),
    unblock: (id) => call('PATCH', `/lines/${encodeURIComponent(id)}`, { status: 1 }),
    recreate: (id, input) => call('PATCH', `/lines/recreate/${encodeURIComponent(id)}`, input),
    deleteCustomer: (id) => call('DELETE', `/lines/${encodeURIComponent(id)}`),

    // Apps licenciados.
    activateApp: (input) => call('POST', '/lines/active/app', input),
    activateAppXstream: (input) => call('POST', '/lines/active/app/xstream', input),

    // Revendedores.
    createReseller: (input) => call('POST', '/users', input),
    rechargeReseller: (id, input) => call('PATCH', `/users/credits/${encodeURIComponent(id)}`, input),
    editReseller: (id, input) => call('PATCH', `/users/${encodeURIComponent(id)}`, input),
    deleteReseller: (id) => call('DELETE', `/users/${encodeURIComponent(id)}`),

    // Validação local do catálogo antes de chamar o painel.
    validateIptvPackage: (value) => assertKnownValue(WWPANEL_IPTV_PACKAGES, value, 'package_iptv'),
    validateP2pPackage: (value) => assertKnownValue(WWPANEL_P2P_PACKAGES, value, 'package_p2p'),
  };
}
