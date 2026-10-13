import { z } from 'zod';
import { aiIsConfigured, chatJson } from './llm.js';

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

export function supportAiIsConfigured(ai) {
  return aiIsConfigured(ai, 'fast');
}

// Retorna a interpretação validada; `withMeta` devolve também modelo e fallback.
export async function interpretSupportMessage(ai, message, options = {}) {
  if (!supportAiIsConfigured(ai)) throw new Error('IA (OmniRoute) não configurada.');
  const normalized = String(message || '').trim();
  if (!normalized || normalized.length > 1200) throw new Error('Mensagem de atendimento inválida.');
  const result = await chatJson(ai, {
    profile: 'fast', maxTokens: 800, fetchImpl: options.fetchImpl,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: normalized }],
    parse: (json) => supportInterpretationSchema.parse(json),
  });
  return options.withMeta ? result : result.value;
}
