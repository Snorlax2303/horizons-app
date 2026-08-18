export function evolutionIsConfigured(config) {
  return Boolean(config.evolutionApiUrl && config.evolutionApiKey && config.evolutionInstance);
}

export async function sendEvolutionText(config, phone, message, options = {}) {
  if (!evolutionIsConfigured(config)) throw new Error('Evolution API não configurada.');
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
  const instance = encodeURIComponent(options.instance || config.evolutionInstance);
  const result = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { apikey: config.evolutionApiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ number: phone, text: message, delay: 1200 }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload?.message || payload?.error || `Evolution respondeu ${result.status}`);
  return payload;
}
