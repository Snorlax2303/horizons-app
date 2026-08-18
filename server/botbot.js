function baseUrl(config) {
  return String(config.botbotApiUrl || 'https://botbot.chat').replace(/\/$/, '');
}

export function botbotIsConfigured(config) {
  return Boolean(config.botbotAuthKey && config.botbotAppKey);
}

export async function sendBotbotWhatsApp(config, { to, message, typingDelay = 1 }) {
  if (!botbotIsConfigured(config)) throw new Error('BotBot não configurado no Horizons.');
  const result = await fetch(`${baseUrl(config)}/api/v2/messages`, {
    method: 'POST',
    headers: { authKey: config.botbotAuthKey, 'content-type': 'application/json' },
    body: JSON.stringify({ channels: { whatsapp: {
      appKey: config.botbotAppKey, to, message, typingDelay,
    } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (![200, 207].includes(result.status)) {
    const detail = payload?.results?.whatsapp?.error?.message || payload?.message || `BotBot respondeu ${result.status}`;
    const error = new Error(detail); error.status = result.status; throw error;
  }
  const whatsapp = payload?.results?.whatsapp;
  if (!whatsapp || whatsapp.status === 'failed') throw new Error(whatsapp?.error?.message || 'Falha no canal WhatsApp do BotBot.');
  return { status: whatsapp.status, data: whatsapp.data || {} };
}
