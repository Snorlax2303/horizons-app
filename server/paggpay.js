import crypto from 'node:crypto';

const BASE_URLS = {
  production: 'https://api.paggpay.com/v1',
  sandbox: 'https://sandbox-api.paggpay.com/v1',
};

export function paggpayIsConfigured(config) {
  return Boolean(config.paggpayApiKey && BASE_URLS[config.paggpayEnvironment]);
}

export function createPaggpayClient(config) {
  if (!paggpayIsConfigured(config)) throw new Error('PaggPay ainda não está configurada.');
  const baseUrl = BASE_URLS[config.paggpayEnvironment];

  async function request(path, options = {}) {
    const result = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${config.paggpayApiKey}`,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(payload?.message || `PaggPay respondeu ${result.status}`);
    return payload?.data ?? payload;
  }

  return {
    createPix(input) {
      return request('/pix', { method: 'POST', body: JSON.stringify(input) });
    },
    getTransaction(id) {
      return request(`/transactions/${encodeURIComponent(id)}`);
    },
  };
}

export function paggpayWebhookTransactionId(body) {
  const candidates = [
    body?.data?.transaction?.id,
    body?.data?.id,
    body?.transaction?.id,
    body?.transaction_id,
    body?.id,
  ];
  return candidates.find((value) => typeof value === 'string' && /^txn_[a-zA-Z0-9_-]+$/.test(value)) || null;
}

export function verifyPaggpayWebhookSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || !signatureHeader || !rawBody) return false;
  const parts = Object.fromEntries(String(signatureHeader).split(',').map((part) => part.trim().split('=', 2)));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1 || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const supplied = String(parts.v1);
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function normalizePaggpayTransaction(transaction) {
  const amountMinor = Number(transaction?.amount);
  const referenceId = transaction?.pix?.reference_id || transaction?.reference_id || null;
  return {
    id: typeof transaction?.id === 'string' ? transaction.id : null,
    referenceId: typeof referenceId === 'string' ? referenceId : null,
    status: transaction?.status,
    amount: Number.isFinite(amountMinor) ? amountMinor / 100 : null,
    amountMinor: Number.isFinite(amountMinor) ? amountMinor : null,
    paidAt: transaction?.paid_at || null,
    payerPhone: transaction?.payer_phone || transaction?.customer?.phone || null,
    endToEndId: transaction?.end_to_end_id || transaction?.pix?.end_to_end_id || null,
    pixCode: transaction?.pix?.code || null,
    qrCode: transaction?.pix?.qr_code || null,
    expiresAt: transaction?.pix?.expiration_date || null,
    raw: transaction,
  };
}
