import { z } from 'zod';

export const supportInterpretationSchema = z.object({
  intent: z.enum(['trial', 'purchase', 'renewal', 'credentials', 'support', 'finance', 'human', 'unknown']),
  route: z.enum(['location', 'renew', 'access', 'support', 'finance', 'human']),
  device_category: z.enum(['smart_tv', 'android_tv', 'tv_box', 'mobile', 'computer', 'console', 'other']).nullable(),
  manufacturer: z.string().trim().max(80).nullable(),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
  reply: z.string().trim().min(1).max(320),
}).strict();

const SYSTEM_PROMPT = `Você interpreta pedidos de atendimento de uma empresa de IPTV.
Retorne exatamente um JSON, sem markdown e sem texto fora do JSON.
Você apenas classifica e extrai dados; nunca cria teste, acesso, cobrança, Pix ou renovação.
Intenções e rotas permitidas:
- trial ou purchase -> location
- renewal -> renew
- credentials -> access
- support -> support
- finance -> finance
- human ou unknown -> human
device_category pode ser smart_tv, android_tv, tv_box, mobile, computer, console, other ou null.
manufacturer deve conter somente marca/fabricante citado ou null.
Quando faltar informação essencial ou houver ambiguidade, use needs_clarification=true e escreva em reply uma pergunta curta em português brasileiro.
Quando estiver claro, reply deve confirmar brevemente o entendimento, sem prometer resultado.
Schema: {"intent":"...","route":"...","device_category":null,"manufacturer":null,"confidence":0.0,"needs_clarification":false,"reply":"..."}`;

function parseJsonObject(content) {
  if (typeof content !== 'string') throw new Error('MiniMax não retornou texto.');
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('MiniMax não retornou JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function minimaxSupportIsConfigured(config) {
  return Boolean(config.minimaxApiKey && config.minimaxApiUrl && config.minimaxPrimaryModel);
}

export async function interpretSupportMessage(config, message, options = {}) {
  if (!minimaxSupportIsConfigured(config)) throw new Error('MiniMax não configurada.');
  const normalized = String(message || '').trim();
  if (!normalized || normalized.length > 1200) throw new Error('Mensagem de atendimento inválida.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(config.minimaxApiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.minimaxApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.minimaxPrimaryModel,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: normalized }],
      max_completion_tokens: Math.min(config.minimaxMaxCompletionTokens, 800),
      temperature: config.minimaxTemperature,
    }),
    signal: AbortSignal.timeout(config.minimaxTimeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`MiniMax respondeu ${response.status}.`);
  return supportInterpretationSchema.parse(parseJsonObject(payload.choices?.[0]?.message?.content));
}
