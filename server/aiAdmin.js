import { z } from 'zod';
import { aiIsConfigured, chatJson } from './llm.js';

export const readOnlyAdminIntentSchema = z.object({
  tool: z.enum([
    'help',
    'find_customer',
    'get_customer_summary',
    'get_checkout',
    'get_unpaid_customers',
    'get_business_metrics',
    'list_plans',
    'create_assisted_test',
    'send_whatsapp',
    'create_customer',
    'update_customer',
    'set_customer_payment_status',
    'register_customer_access',
    'prepare_customer_charge',
  ]),
  arguments: z.object({
    query: z.string().trim().max(200).optional(),
    customer_id: z.string().uuid().optional(),
    period: z.enum(['today', 'week', 'month', 'custom']).optional(),
    date_from: z.string().date().optional(),
    date_to: z.string().date().optional(),
    beneficiary_name: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(8).max(32).optional(),
    message: z.string().trim().min(1).max(3500).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    plan: z.string().trim().min(1).max(160).optional(),
    value: z.number().nonnegative().max(100000).optional(),
    quantity_screens: z.number().int().min(1).max(99).optional(),
    due_day: z.number().int().min(1).max(31).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    paid: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
    external_username: z.string().trim().min(1).max(160).optional(),
    password: z.string().max(500).optional(),
    external_plan: z.string().trim().max(160).optional(),
    screens: z.number().int().min(1).max(99).optional(),
    dns: z.string().trim().max(500).optional(),
    checkout_url: z.string().url().max(2000).optional(),
    valid_until: z.string().trim().max(50).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    access_message: z.string().max(12000).optional(),
    amount: z.number().positive().max(100000).optional(),
    description: z.string().trim().max(140).optional(),
    server: z.enum(['kyros', 'vornak', 'kronos', 'zeus', 'fenix', 'p2p']).optional(),
    duration_hours: z.union([z.literal(6), z.literal(12)]).optional(),
    content: z.enum(['complete', 'no_adults']).optional(),
    device_category: z.enum(['smart_tv', 'android_tv', 'tv_box', 'mobile', 'computer', 'console', 'other']).optional(),
    manufacturer: z.string().trim().max(100).optional(),
  }).strict(),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
  clarification_question: z.string().trim().max(300).nullable(),
}).strict().superRefine((value, context) => {
  if (value.needs_clarification && !value.clarification_question) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['clarification_question'], message: 'Pergunta obrigatória.' });
  }
  if (value.tool === 'get_business_metrics' && value.arguments.period === 'custom'
    && (!value.arguments.date_from || !value.arguments.date_to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Período personalizado incompleto.' });
  }
  if (value.tool === 'create_assisted_test' && (!value.arguments.beneficiary_name || !value.arguments.phone)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Nome e telefone do beneficiário são obrigatórios.' });
  }
  if (value.tool === 'send_whatsapp' && (!value.arguments.phone || !value.arguments.message)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Telefone e mensagem são obrigatórios.' });
  }
  if (value.tool === 'create_customer' && (!value.arguments.name || !value.arguments.phone || !value.arguments.plan)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Nome, telefone e plano são obrigatórios.' });
  }
  if (value.tool === 'update_customer' && !value.arguments.query) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Cliente é obrigatório.' });
  }
  if (value.tool === 'set_customer_payment_status' && (!value.arguments.query || value.arguments.paid === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Cliente e situação de pagamento são obrigatórios.' });
  }
  if (value.tool === 'register_customer_access' && (!value.arguments.query || !value.arguments.server
    || !value.arguments.external_username || !value.arguments.screens || !value.arguments.reason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Cliente, servidor, usuário, telas e motivo são obrigatórios.' });
  }
  if (value.tool === 'prepare_customer_charge' && !value.arguments.query) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['arguments'], message: 'Cliente é obrigatório.' });
  }
});

const SYSTEM_PROMPT = `Você é o interpretador administrativo do Horizons.
Converta o pedido em exatamente um JSON, sem markdown e sem texto adicional.
Você NÃO executa ações e NÃO inventa IDs, clientes, valores ou datas.
Ferramentas de leitura:
help, find_customer, get_customer_summary, get_checkout,
get_unpaid_customers, get_business_metrics e list_plans.
Ferramentas de escrita que exigem confirmação posterior pelo sistema:
create_assisted_test, send_whatsapp, create_customer, update_customer e
set_customer_payment_status, register_customer_access e prepare_customer_charge.
Para create_assisted_test extraia beneficiary_name, phone, device_category e,
quando informados, manufacturer, server, duration_hours e content. Use kyros, 6
e no_adults como padrão. Se o aparelho/local de uso não estiver claro, marque
needs_clarification=true e pergunte se será Smart TV, Android/Google TV, TV Box,
celular, computador, console ou outro.
Nunca pergunte servidor, duração ou conteúdo quando não forem informados: use
obrigatoriamente kyros, 6 e no_adults.
Para send_whatsapp extraia phone e a mensagem EXATA solicitada. Nunca complete,
reescreva ou invente o texto da mensagem.
Para create_customer exija name, phone e plan; extraia value, quantity_screens,
due_day, status, paid e notes quando informados.
Para update_customer use query para identificar o cliente e inclua somente os
campos explicitamente solicitados. Para set_customer_payment_status use query e
paid. Nunca invente dados ausentes. Senhas, migração de servidor, renovação e
Para register_customer_access extraia query, server, external_username, screens e
reason; extraia password, external_plan, dns, checkout_url, valid_until e
access_message apenas quando informados. Esta ferramenta registra o acesso no
Horizons e nunca opera o painel do servidor.
Para prepare_customer_charge use query e, se informados, amount e description.
Ela procura checkout existente antes de criar Pix. Exclusão e operação direta
no painel do servidor continuam indisponíveis: retorne help com
needs_clarification=true.
Schema: {"tool":"...","arguments":{},"confidence":0.0,
"needs_clarification":false,"clarification_question":null}.`;

function normalizeDevice(parsed) {
  const rawDevice = parsed?.arguments?.device_category;
  if (typeof rawDevice === 'string') {
    const device = rawDevice.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').trim();
    const aliases = {
      'smart tv': 'smart_tv', 'tv smart': 'smart_tv', samsung: 'smart_tv', lg: 'smart_tv',
      'android tv': 'android_tv', 'google tv': 'android_tv', 'fire tv': 'android_tv',
      'tv box': 'tv_box', box: 'tv_box', celular: 'mobile', smartphone: 'mobile', android: 'mobile',
      iphone: 'mobile', ipad: 'mobile', ios: 'mobile', computador: 'computer', notebook: 'computer', pc: 'computer',
      videogame: 'console', console: 'console', outro: 'other', other: 'other',
    };
    parsed.arguments.device_category = aliases[device] || rawDevice;
  }
  return parsed;
}

export function adminAiIsConfigured(ai) {
  return aiIsConfigured(ai, 'smart');
}

// Usa o perfil `smart` e cai para os modelos de fallback quando a resposta
// falha ou não passa no schema (nenhuma ferramenta inventada é aceita).
export async function interpretAdminIntent(ai, message, options = {}) {
  if (!adminAiIsConfigured(ai)) throw new Error('IA (OmniRoute) não configurada.');
  const normalized = String(message || '').trim();
  if (!normalized || normalized.length > 2000) throw new Error('Comando administrativo inválido.');
  const result = await chatJson(ai, {
    profile: 'smart', fetchImpl: options.fetchImpl,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: normalized }],
    parse: (json) => readOnlyAdminIntentSchema.parse(normalizeDevice(json)),
  });
  return { model: result.model, fallback_used: result.fallback_used, intent: result.value };
}
