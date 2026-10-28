// Regras de entrada de mídia da Evolution como possível comprovante Pix.
// Antes, sem instância financeira configurada, QUALQUER imagem do número
// pessoal (inclusive de grupos e enviadas pelo próprio dono) virava
// comprovante e abria renovação. Agora a regra é fechada por padrão.

const NON_PERSON_SUFFIXES = ['@g.us', '@broadcast', '@newsletter'];

export function evolutionInboundMedia(body) {
  const data = body?.data || body;
  const message = data?.message || {};
  const media = message.imageMessage || message.documentMessage;
  if (!media) return null;
  const remoteJid = String(data?.key?.remoteJid || data?.sender || '');
  return {
    phone: remoteJid.replace(/@.+$/, '').replace(/\D/g, ''),
    remoteJid,
    fromMe: data?.key?.fromMe === true,
    messageId: data?.key?.id || data?.id,
    mimeType: media.mimetype || (message.imageMessage ? 'image/jpeg' : 'application/pdf'),
    message,
    instanceName: String(body?.instance || data?.instance || body?.instanceName || data?.instanceName || '').trim(),
    caption: String(media.caption || '').trim().slice(0, 2000) || null,
  };
}

export function receiptInstances(config) {
  const instances = Array.isArray(config.evolutionReceiptInstances)
    ? config.evolutionReceiptInstances
    : [config.evolutionFinanceInstance, config.evolutionSalesInstance];
  return instances
    .map((instance) => String(instance || '').trim()).filter(Boolean);
}

// Retorna o motivo da recusa, ou null quando a mídia pode ser um comprovante.
export function receiptRejectionReason(media, config) {
  if (!media) return 'not_media';
  if (!media.messageId) return 'missing_message_id';
  if (media.fromMe) return 'from_me';
  if (NON_PERSON_SUFFIXES.some((suffix) => media.remoteJid.endsWith(suffix))) return 'not_private_chat';
  if (media.phone.length < 10 || media.phone.length > 15) return 'invalid_phone';
  const allowed = receiptInstances(config);
  if (!allowed.length) return 'no_receipt_instance_configured';
  if (!allowed.includes(media.instanceName)) return 'instance_not_allowed';
  return null;
}

// Telefones de grupo do WhatsApp têm 18+ dígitos; telefones reais, até 15.
export function looksLikeGroupPhone(phone) {
  return String(phone || '').replace(/\D/g, '').length > 15;
}
