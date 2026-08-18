import crypto from 'node:crypto';

const VERSION = 'v1';

function keyFromSecret(secret) {
  if (!secret) throw new Error('Segredo do cofre de acessos não configurado.');
  return crypto.createHash('sha256').update(`horizons-access-vault:${secret}`).digest();
}

export function sealAccessValue(value, secret) {
  if (value === null || value === undefined || value === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function openAccessValue(payload, secret) {
  if (!payload) return null;
  const [version, encodedIv, encodedTag, encodedValue] = String(payload).split('.');
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedValue) throw new Error('Dado de acesso cifrado inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encodedValue, 'base64url')), decipher.final()]).toString('utf8');
}
