import fs from 'node:fs';
import https from 'node:https';

const BASE_URLS = {
  homologation: 'https://pix-h.api.efipay.com.br',
  production: 'https://pix.api.efipay.com.br',
};

function configured(config) {
  return Boolean(config.efiClientId && config.efiClientSecret && config.efiPixKey && config.efiCertPath);
}

function requestJson(url, { method = 'GET', headers = {}, body, agent }) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method, headers, agent, timeout: 20_000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const payload = raw ? JSON.parse(raw) : {};
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(payload.mensagem || payload.message || `Efí respondeu ${response.statusCode}.`);
          error.statusCode = response.statusCode;
          error.payload = payload;
          reject(error);
          return;
        }
        resolve(payload);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Tempo esgotado ao chamar Efí.')));
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

export function efiIsConfigured(config) {
  return configured(config);
}

export function createEfiPixClient(config) {
  if (!configured(config)) throw new Error('Efí Pix não está configurado neste ambiente.');
  const baseUrl = BASE_URLS[config.efiEnvironment];
  if (!baseUrl) throw new Error('EFI_ENVIRONMENT deve ser homologation ou production.');
  if (!fs.existsSync(config.efiCertPath)) throw new Error('Certificado Efí não encontrado no container API.');

  const agent = new https.Agent({ pfx: fs.readFileSync(config.efiCertPath), rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  let token = null;
  let tokenExpiresAt = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExpiresAt) return token;
    const credentials = Buffer.from(`${config.efiClientId}:${config.efiClientSecret}`).toString('base64');
    const response = await requestJson(`${baseUrl}/oauth/token`, {
      method: 'POST', agent,
      headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/json', accept: 'application/json' },
      body: { grant_type: 'client_credentials' },
    });
    if (!response.access_token) throw new Error('Efí não retornou access_token.');
    token = response.access_token;
    tokenExpiresAt = Date.now() + Math.max(30, Number(response.expires_in || 300) - 30) * 1000;
    return token;
  }

  async function call(path, options = {}) {
    const bearer = await accessToken();
    return requestJson(`${baseUrl}${path}`, {
      ...options, agent,
      headers: { authorization: `Bearer ${bearer}`, accept: 'application/json', 'content-type': 'application/json', ...(options.headers || {}) },
    });
  }

  return {
    async createImmediateCharge({ amount, expiresIn, debtor, description }) {
      return call('/v2/cob', {
        method: 'POST',
        body: {
          calendario: { expiracao: expiresIn },
          valor: { original: amount.toFixed(2) },
          chave: config.efiPixKey,
          ...(debtor ? { devedor: debtor } : {}),
          ...(description ? { solicitacaoPagador: description } : {}),
        },
      });
    },
    async configureWebhook() {
      if (!config.efiWebhookUrl || !config.efiWebhookToken) throw new Error('URL e token do webhook Efí são obrigatórios para cadastrá-lo.');
      const url = new URL(config.efiWebhookUrl);
      url.searchParams.set('token', config.efiWebhookToken);
      url.searchParams.set('ignorar', '');
      return call(`/v2/webhook/${encodeURIComponent(config.efiPixKey)}`, {
        method: 'PUT', headers: { 'x-skip-mtls-checking': 'true' }, body: { webhookUrl: url.toString() },
      });
    },
  };
}
