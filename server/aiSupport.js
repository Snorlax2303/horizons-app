import { z } from 'zod';
import { aiIsConfigured, chatJson } from './llm.js';
import { matchPanelApp } from './wplayBotFlow.js';

export const supportInterpretationSchema = z.object({
  intent: z.enum(['trial', 'purchase', 'renewal', 'credentials', 'installation', 'support', 'finance', 'human', 'unknown']),
  route: z.enum(['location', 'renew', 'access', 'support', 'finance', 'human']),
  device_category: z.enum(['smart_tv', 'android_tv', 'tv_box', 'mobile', 'computer', 'console', 'other']).nullable(),
  manufacturer: z.string().trim().max(80).nullable(),
  app_name: z.string().trim().max(80).nullable().optional().default(null),
  mac_address: z.string().trim().max(32).nullable().optional().default(null),
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
- installation (instalar/configurar app, ativar por MAC) -> support
- support -> support
- finance -> finance
- human ou unknown -> human
device_category pode ser smart_tv, android_tv, tv_box, mobile, computer, console, other ou null.
manufacturer deve conter somente marca/fabricante citado ou null.
app_name: nome do aplicativo citado (ex.: XCloud, IPTV Smarters, WTV Player) ou null.
mac_address: endereço MAC citado (ex.: 00:1A:2B:3C:4D:5E) ou null. Nunca invente.
Nunca peça nem repita senha, usuário ou credenciais.
Quando faltar informação essencial ou houver ambiguidade, use needs_clarification=true e escreva em reply uma pergunta curta em português brasileiro.
Quando estiver claro, reply deve confirmar brevemente o entendimento, sem prometer resultado.
Schema: {"intent":"...","route":"...","device_category":null,"manufacturer":null,"app_name":null,"mac_address":null,"confidence":0.0,"needs_clarification":false,"reply":"..."}`;

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

const MAC_PATTERN = /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b|\b[0-9A-F]{12}\b/i;

export function extractMacFromText(text) {
  const match = String(text || '').match(MAC_PATTERN);
  if (!match) return null;
  const hex = match[0].toUpperCase().replace(/[^0-9A-F]/g, '');
  return hex.match(/.{2}/g).join(':');
}

// Regras determinísticas aplicadas depois da IA: o MAC vem do texto (não da
// IA), o app é casado com a lista real do painel e baixa confiança vira
// pergunta (ou atendimento humano, se muito baixa).
export function finalizeInterpretation(result, message, { clarifyBelow = 0.6, humanBelow = 0.35 } = {}) {
  const output = { ...result };
  output.mac_address = extractMacFromText(message);
  const app = output.app_name ? matchPanelApp(output.app_name) : null;
  output.panel_app = app?.app || null;
  if (output.confidence < humanBelow) output.route = 'human';
  else if (output.confidence < clarifyBelow) output.needs_clarification = true;
  output.handoff = output.route === 'human';
  return output;
}
