import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getConfig } from './config.js';
import { botbotIsConfigured, sendBotbotWhatsApp } from './botbot.js';
import { createCinehubDirectTest, cinehubDirectTestIsConfigured, extractCinehubDeliveryProfile, isUsableCinehubCheckoutUrl, unionDirectTestIsConfigured } from './unionChatbot.js';
import { createEfiPixClient, efiIsConfigured } from './efiPix.js';
import { createQueue } from './queue.js';
import { validateReceipt } from './receiptValidation.js';
import { extractPixReceipt, receiptExtractorIsConfigured, receiptExtractorModel } from './receiptExtractor.js';
import { createPaggpayClient, normalizePaggpayTransaction, paggpayIsConfigured, paggpayWebhookTransactionId, verifyPaggpayWebhookSignature } from './paggpay.js';
import { openAccessValue, sealAccessValue } from './accessVault.js';
import { interpretAdminIntent, adminAiIsConfigured } from './aiAdmin.js';
import { interpretSupportMessage, supportAiIsConfigured } from './aiSupport.js';
import { modelChain } from './llm.js';
import { createAiSettingsStore } from './aiSettings.js';
import { registerAiSettingsRoutes } from './routes/aiSettings.js';
import { executeReadOnlyAdminTool } from './adminReadTools.js';
import { evolutionIsConfigured, sendEvolutionText } from './evolution.js';
import { classifyCustomerIdentity } from './customerIdentity.js';
import { normalizeImportText, parseCustomerAccessFile } from './customerAccessImport.js';
import { registerHealthRoute } from './routes/health.js';
import { registerPaymentWebhookRoute } from './routes/paymentWebhook.js';
import { registerPaymentReadRoutes } from './routes/paymentRead.js';
import { registerOperationsRoutes } from './routes/operations.js';
import { registerRenewalRoutes } from './routes/renewals.js';
import { registerSystemHealthRoute } from './routes/systemHealth.js';
import { registerCustomerServerRoutes } from './routes/customerServer.js';
import { registerSimulatorRoutes } from './routes/simulator.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerPaymentOverviewRoutes } from './routes/renewals.js';
import { registerRenewalListRoutes } from './routes/renewalList.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerWplayRoutes } from './routes/wplay.js';
import { resolveBotInstall, createWplayTrial, activateWplayApp, wplayBotStatus } from './wplayBotFlow.js';
import { linkWplayLine, recordAppActivation, resolveWplayLine } from './wplayLink.js';
import { WWPANEL_APPS } from './wplayCatalog.js';
import { runTelegramCommand, parseTelegramCommand } from './telegramCommands.js';
import { sendTelegramMessage } from './telegramDigest.js';
import { registerAuditRoute, webhookRateLimit, recordWebhookEvent } from './routes/audit.js';
import { createRequireAuthenticatedUser, createRequireHorizonsOwner, createRequireOwnerUser } from './auth.js';

const paymentSchema = z.object({
  event_id: z.string().min(1),
  status: z.enum(['paid', 'pending', 'failed', 'refunded']),
  customer_id: z.string().uuid().optional(),
  external_payment_id: z.string().min(1).optional(),
  amount: z.number().nonnegative().optional(),
  paid_at: z.string().datetime().optional(),
  raw: z.record(z.unknown()).optional(),
});

const efiPixChargeSchema = z.object({
  customer_id: z.string().uuid(),
  amount: z.number().positive().max(100000).optional(),
  expires_in: z.number().int().min(60).max(86400).default(3600),
  description: z.string().trim().min(1).max(140).optional(),
});

const paggpayPixChargeSchema = z.object({
  customer_id: z.string().uuid(),
  amount: z.number().positive().max(100000).optional(),
  description: z.string().trim().min(1).max(140).optional(),
  plan_name: z.string().trim().max(160).nullable().optional(),
  external_username: z.string().trim().max(160).nullable().optional(),
  payer_pays_fee: z.boolean().default(false),
});

const typebotPaggpayChargeSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/),
  phone: z.string().trim().min(8).max(32),
  amount: z.number().positive().max(100000).optional(),
  description: z.string().trim().min(1).max(140).optional(),
  plan_name: z.string().trim().max(160).nullable().optional(),
  external_username: z.string().trim().max(160).nullable().optional(),
  payer_pays_fee: z.boolean().default(false),
});

const whatsappMessageSchema = z.object({
  phone: z.string().trim().min(8).max(32),
  message: z.string().trim().min(1).max(4096),
});

const botbotMessageSchema = z.object({
  phone: z.string().trim().min(8).max(32),
  message: z.string().trim().min(1).max(3500),
  typing_delay: z.number().int().min(1).max(30).default(1),
});

const unionDirectTestSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/),
  phone: z.string().trim().min(8).max(32),
  name: z.string().trim().min(1).max(160).optional(),
  prospect_id: z.string().uuid().optional(),
  server: z.enum(['kyros', 'vornak', 'kronos', 'zeus', 'fenix', 'p2p']),
  duration_hours: z.coerce.number().int().refine((value) => value === 6 || value === 12),
  content: z.enum(['complete', 'no_adults']),
  reuse_existing_checkout: z.boolean().default(false),
  // Trusted orchestration may replay this phone's own last test for QA without
  // creating another external CineHub access.
  qa_replay_existing_test: z.boolean().default(false),
});

const assistedCinehubTestSchema = z.object({
  request_id: z.string().uuid(),
  requester_phone: z.string().trim().min(8).max(32),
  beneficiary_phone: z.string().trim().min(8).max(32),
  beneficiary_name: z.string().trim().min(2).max(160),
  server: z.enum(['kyros', 'vornak', 'kronos', 'zeus', 'fenix', 'p2p']),
  duration_hours: z.coerce.number().int().refine((value) => value === 6 || value === 12),
  content: z.enum(['complete', 'no_adults']),
  confirm_external_creation: z.literal(true),
});

const assistedTestRequestSchema = z.object({
  request_key: z.string().trim().min(8).max(180).regex(/^[a-zA-Z0-9:_-]+$/),
  session_key: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
  requester_phone: z.string().trim().min(8).max(32),
  beneficiary_phone: z.string().trim().min(8).max(32),
  beneficiary_name: z.string().trim().min(2).max(160),
});

const typebotIntentSchema = z.enum(['trial', 'renewal', 'purchase', 'support', 'finance', 'human']);
const typebotIntakeSchema = z.object({
  session_key: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
  phone: z.string().trim().min(8).max(32),
  name: z.string().trim().min(1).max(160).optional(),
  intent: typebotIntentSchema.optional(),
  current_step: z.string().trim().max(120).optional(),
  profile: z.object({
    installation_location: z.string().trim().max(160).nullable().optional(),
    device_category: z.string().trim().max(80).nullable().optional(),
    device_brand: z.string().trim().max(80).nullable().optional(),
    device_model_hint: z.string().trim().max(160).nullable().optional(),
    app_installed: z.string().trim().max(120).nullable().optional(),
    recommended_app: z.string().trim().max(120).nullable().optional(),
    requested_screens: z.coerce.number().int().min(1).max(99).nullable().optional(),
    simultaneous_screens: z.coerce.number().int().min(1).max(99).nullable().optional(),
    plan_term: z.string().trim().max(80).nullable().optional(),
    control_media_refs: z.array(z.string().url().max(2000)).max(3).optional(),
    answers: z.record(z.unknown()).optional(),
  }).optional(),
});

const typebotHandoffSchema = z.object({
  session_key: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
  department: z.enum(['sales', 'support', 'finance', 'general']),
  reason: z.string().trim().min(2).max(240),
  summary: z.string().trim().max(3000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

const typebotGuideSchema = z.object({
  device_category: z.enum(['smart_tv', 'android_tv', 'tv_box', 'mobile', 'computer', 'console', 'other']),
  manufacturer: z.string().trim().max(80).optional(),
  platform: z.string().trim().max(120).optional(),
});

const typebotOrderSchema = z.object({
  session_key: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
  purpose: z.enum(['new_subscription', 'trial_conversion', 'renewal']),
  plan_id: z.string().uuid(),
  simultaneous_screens: z.coerce.number().int().min(1).max(99),
  test_request_id: z.string().uuid().optional(),
  union_direct_test_event_id: z.string().uuid().optional(),
});

const typebotAccessLookupSchema = z.object({
  session_key: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
});

const typebotCustomerInstallationSchema = typebotAccessLookupSchema.extend({
  device_category: z.enum(['smart_tv', 'android_tv', 'tv_box', 'mobile', 'computer', 'console', 'other']),
  manufacturer: z.string().trim().max(80).optional(),
});

const typebotCheckoutLookupSchema = z.object({
  session_key: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
});

const typebotAiInterpretSchema = z.object({
  message: z.string().trim().min(1).max(1200),
});

const renewalRequestSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(), phone: z.string().trim().min(8).max(32),
  external_username: z.string().trim().max(160).nullable().optional(), payment_url: z.string().url().max(2000).nullable().optional(),
  plan_name: z.string().trim().max(160).nullable().optional(), expected_amount: z.number().positive().max(100000).nullable().optional(),
});
const receiptSchema = z.object({
  whatsapp_message_id: z.string().trim().max(300).nullable().optional(), media_type: z.enum(['image', 'pdf']),
  media_reference: z.string().trim().min(1).max(2000), extracted_data: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).nullable().optional(), end_to_end_id: z.string().trim().max(80).nullable().optional(),
  amount: z.number().positive().max(100000).nullable().optional(), paid_at: z.string().datetime().nullable().optional(),
  payer_name: z.string().trim().max(200).nullable().optional(), recipient_name: z.string().trim().max(200).nullable().optional(),
  bank_name: z.string().trim().max(120).nullable().optional(), is_scheduled: z.boolean().nullable().optional(),
});
const receiptReviewSchema = z.object({ decision: z.enum(['confirmed', 'rejected', 'needs_new_receipt']) });
const adminAssistantCommandSchema = z.object({ command: z.string().trim().min(2).max(2000) });

const customerServerMigrationSchema = z.object({
  to_server_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  external_username: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(500),
  external_plan: z.string().trim().max(160).nullable().optional(),
  screens: z.coerce.number().int().min(1).max(99),
  dns: z.string().trim().max(500).nullable().optional(),
  checkout_url: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
  access_message: z.string().max(20000).nullable().optional(),
  valid_until: z.union([z.string().datetime(), z.literal(''), z.null()]).optional(),
});

const panelConnectionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  provider: z.string().trim().min(2).max(60),
  base_url: z.string().url().max(500),
  server_id: z.string().uuid().nullable().optional(),
  automation_mode: z.enum(['manual', 'automatic']).default('manual'),
  capabilities: z.object({
    lookup: z.boolean().default(true),
    create_test: z.boolean().default(false),
    renew: z.boolean().default(false),
  }).default({ lookup: true, create_test: false, renew: false }),
  proxy_label: z.string().trim().max(120).nullable().optional(),
  browser_location: z.enum(['vps', 'local_agent']).default('vps'),
  agent_id: z.string().uuid().nullable().optional(),
});

const panelAgentSchema = z.object({ name: z.string().trim().min(2).max(120) });
const captureEventsSchema = z.object({
  capture_session_id: z.string().uuid(),
  events: z.array(z.object({
    sequence: z.number().int().nonnegative(), event_type: z.enum(['page', 'click', 'error']),
    page_url: z.string().max(2000).nullable().optional(), page_title: z.string().max(500).nullable().optional(),
    selector: z.string().max(2000).nullable().optional(), element_text: z.string().max(1000).nullable().optional(),
    dom_outline: z.array(z.record(z.unknown())).max(300).default([]), screenshot_base64: z.string().max(180000).nullable().optional(),
  })).min(1).max(20),
});

const operationSchema = z.object({
  action: z.enum(['create_test', 'renew_customer', 'lookup_customer']),
  customer_id: z.string().uuid().nullable().optional(),
  customer_panel_target_id: z.string().uuid().nullable().optional(),
  panel_connection_id: z.string().uuid(),
  input: z.record(z.unknown()).default({}),
});

const leadSchema = z.object({
  owner_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(8).max(32),
  consent: z.literal(true),
  source: z.enum(['landing_page', 'ad_lead', 'referral']).default('landing_page'),
  source_metadata: z.record(z.unknown()).default({}),
  referral_code: z.string().trim().max(80).optional(),
});

const config = getConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { automationQueue } = createQueue(config.redisUrl);
const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: false }));
app.use(express.json({ limit: '256kb', verify: (request, _, buffer) => { request.rawBody = buffer.toString('utf8'); } }));
app.use((request, response, next) => {
  const requestId = request.get('x-request-id') || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  request.requestId = requestId;
  response.set('x-request-id', requestId);
  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (!request.path.startsWith('/webhooks/')) console.info(JSON.stringify({ event: 'http_request', request_id: requestId, method: request.method, path: request.path, status: response.statusCode, duration_ms: Math.round(durationMs) }));
  });
  next();
});
// Guards precisam existir antes do registro dos módulos de rota (const não sofre hoisting).
const requireAuthenticatedUser = createRequireAuthenticatedUser(supabase);
const requireHorizonsOwner = createRequireHorizonsOwner(config.horizonsOwnerUserId, 'Assistente administrativo restrito ao proprietário.');
const requireOwnerUser = createRequireOwnerUser(requireAuthenticatedUser, createRequireHorizonsOwner(config.horizonsOwnerUserId));
const aiSettings = createAiSettingsStore({ supabase, config });
registerHealthRoute(app);
registerSystemHealthRoute(app, { requireAuthenticatedUser, config, supabase, aiSettings });
registerAuditRoute(app, { supabase, requireAuthenticatedUser });
registerSimulatorRoutes(app, { requireAuthenticatedUser });
registerBillingRoutes(app, { supabase, requireAuthenticatedUser });
registerPaymentOverviewRoutes(app, { supabase, requireAuthenticatedUser });
registerRenewalListRoutes(app, { supabase, requireAuthenticatedUser, config });
registerCatalogRoutes(app, { supabase, requireAuthenticatedUser, z, config });
// WPlay consome crédito real: somente o proprietário pode usar estas rotas.
registerWplayRoutes(app, { supabase, requireAuthenticatedUser: requireOwnerUser, config, z });
registerAiSettingsRoutes(app, { requireOwnerUser, aiSettings, z });
const webhookGuard = webhookRateLimit({ windowMs: 60_000, max: 60 });

async function auditAdminAssistant(entry, channel = 'web') {
  const { error } = await supabase.from('admin_assistant_audit').insert({
    user_id: config.horizonsOwnerUserId,
    channel,
    ...entry,
  });
  if (error) console.error('Falha ao auditar assistente administrativo', error.message);
}

function protectedAdminArguments(tool, args = {}) {
  if (tool !== 'register_customer_access') return args;
  const protectedArgs = { ...args };
  if (protectedArgs.password) {
    protectedArgs.password_ciphertext = sealAccessValue(protectedArgs.password, config.webhookSharedSecret);
    delete protectedArgs.password;
  }
  if (protectedArgs.access_message) {
    protectedArgs.access_message_ciphertext = sealAccessValue(protectedArgs.access_message, config.webhookSharedSecret);
    delete protectedArgs.access_message;
  }
  return protectedArgs;
}

function openedAdminArguments(tool, args = {}) {
  if (tool !== 'register_customer_access') return args;
  const opened = { ...args };
  if (opened.password_ciphertext) opened.password = openAccessValue(opened.password_ciphertext, config.webhookSharedSecret);
  if (opened.access_message_ciphertext) opened.access_message = openAccessValue(opened.access_message_ciphertext, config.webhookSharedSecret);
  delete opened.password_ciphertext;
  delete opened.access_message_ciphertext;
  return opened;
}

function protectedAdminRequestText(tool, command) {
  return tool === 'register_customer_access' ? '[comando de acesso protegido]' : command;
}

async function runAdminAssistantCommand(command, { channel = 'web', senderReference = null, messageId = null } = {}) {
  let interpreted;
  try {
    interpreted = await interpretAdminIntent(await aiSettings.resolve(), command);
    if (interpreted.intent.tool === 'create_assisted_test' && !interpreted.intent.arguments.device_category) {
      const question = 'Reenvie o pedido completo informando onde o teste será usado: Smart TV, Android/Google TV, TV Box, celular, computador, console ou outro. Informe também a marca, se souber.';
      await auditAdminAssistant({
        sender_reference: senderReference, message_id: messageId, request_text: command,
        tool_name: interpreted.intent.tool, tool_arguments: interpreted.intent.arguments,
        model: interpreted.model, fallback_used: interpreted.fallback_used, status: 'clarification',
        result_summary: { question, missing: 'device_category' },
      }, channel);
      return { needs_clarification: true, question };
    }
    if (interpreted.intent.needs_clarification || interpreted.intent.confidence < 0.7) {
      await auditAdminAssistant({
        sender_reference: senderReference, message_id: messageId, request_text: protectedAdminRequestText(interpreted.intent.tool, command),
        tool_name: interpreted.intent.tool, tool_arguments: protectedAdminArguments(interpreted.intent.tool, interpreted.intent.arguments),
        model: interpreted.model, fallback_used: interpreted.fallback_used, status: 'clarification',
        result_summary: { question: interpreted.intent.clarification_question, confidence: interpreted.intent.confidence },
      }, channel);
      return { needs_clarification: true, question: interpreted.intent.clarification_question || 'Pode detalhar o pedido?' };
    }
    if (['create_assisted_test', 'send_whatsapp', 'create_customer', 'update_customer', 'set_customer_payment_status', 'register_customer_access', 'prepare_customer_charge'].includes(interpreted.intent.tool)) {
      if (!config.adminAssistantWritesEnabled) {
        return { needs_clarification: true, question: 'As ações administrativas ainda estão desativadas no ambiente.' };
      }
      await auditAdminAssistant({
        sender_reference: senderReference, message_id: messageId, request_text: protectedAdminRequestText(interpreted.intent.tool, command),
        tool_name: interpreted.intent.tool, tool_arguments: protectedAdminArguments(interpreted.intent.tool, interpreted.intent.arguments),
        model: interpreted.model, fallback_used: interpreted.fallback_used, status: 'interpreted',
        result_summary: { confidence: interpreted.intent.confidence, confirmation_required: true },
      }, channel);
      return { needs_confirmation: true, tool: interpreted.intent.tool, arguments: interpreted.intent.arguments };
    }
    const result = await executeReadOnlyAdminTool(supabase, config.horizonsOwnerUserId, interpreted.intent);
    await auditAdminAssistant({
      sender_reference: senderReference, message_id: messageId, request_text: protectedAdminRequestText(interpreted?.intent?.tool, command),
      tool_name: interpreted.intent.tool, tool_arguments: interpreted.intent.arguments,
      model: interpreted.model, fallback_used: interpreted.fallback_used, status: 'completed',
      result_summary: { confidence: interpreted.intent.confidence },
    }, channel);
    return { tool: interpreted.intent.tool, model: interpreted.model, fallback_used: interpreted.fallback_used, result };
  } catch (error) {
    await auditAdminAssistant({
      sender_reference: senderReference, message_id: messageId, request_text: command,
      tool_name: interpreted?.intent?.tool, tool_arguments: protectedAdminArguments(interpreted?.intent?.tool, interpreted?.intent?.arguments || {}),
      model: interpreted?.model, fallback_used: interpreted?.fallback_used || false,
      status: 'failed', error_code: 'admin_query_failed', result_summary: {},
    }, channel);
    throw error;
  }
}

app.get('/admin-assistant/status', requireAuthenticatedUser, requireHorizonsOwner, async (_, response) => {
  const ai = await aiSettings.resolve();
  const chain = modelChain(ai, 'smart');
  response.json({
    provider: 'omniroute',
    configured: adminAiIsConfigured(ai),
    primary_model: chain[0] || null,
    fallback_enabled: chain.length > 1,
    fallback_model: chain[1] || null,
    mode: config.adminAssistantWritesEnabled ? 'confirmed_writes' : 'read_only',
    whatsapp_connected: config.adminAssistantWhatsappEnabled && config.adminAssistantAllowedPhones.length > 0,
    whatsapp_allowlist_count: config.adminAssistantAllowedPhones.length,
    telegram_connected: config.telegramAdminEnabled && Boolean(config.telegramAdminBotToken && config.telegramAdminWebhookSecret)
      && config.telegramAdminAllowedUserIds.length > 0,
    telegram_allowlist_count: config.telegramAdminAllowedUserIds.length,
  });
});

app.post('/admin-assistant/query', requireAuthenticatedUser, requireHorizonsOwner, async (request, response) => {
  const parsed = adminAssistantCommandSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Comando administrativo inválido.' });
  try {
    const result = await runAdminAssistantCommand(parsed.data.command);
    return response.json(result);
  } catch (error) {
    return response.status(500).json({ error: String(error.message || 'Falha administrativa').slice(0, 300) });
  }
});

function evolutionBaseUrl() {
  return config.evolutionApiUrl.replace(/\/$/, '');
}

function evolutionInstancePath() {
  return encodeURIComponent(config.evolutionInstance);
}

async function evolutionMediaBase64(message, instanceName = null) {
  const instancePath = encodeURIComponent(instanceName || config.evolutionInstance);
  const result = await fetch(`${evolutionBaseUrl()}/chat/getBase64FromMediaMessage/${instancePath}`, {
    method: 'POST', headers: { apikey: config.evolutionApiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ message, convertToMp4: false }), signal: AbortSignal.timeout(30_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload?.message || `Evolution respondeu ${result.status}`);
  return String(payload.base64 || payload.data?.base64 || '').replace(/^data:[^;]+;base64,/, '');
}

function evolutionInboundMedia(body) {
  const data = body?.data || body;
  const message = data?.message || {};
  const media = message.imageMessage || message.documentMessage;
  if (!media) return null;
  const remote = data?.key?.remoteJid || data?.sender || '';
  return { phone: String(remote).replace(/@.+$/, '').replace(/\D/g, ''), messageId: data?.key?.id || data?.id,
    mimeType: media.mimetype || (message.imageMessage ? 'image/jpeg' : 'application/pdf'), message,
    instanceName: String(body?.instance || data?.instance || body?.instanceName || data?.instanceName || '').trim(),
    caption: String(media.caption || '').trim().slice(0, 2000) || null };
}

async function notifyPanelDisconnected(connectionId) {
  const { data: connection } = await supabase.from('panel_connections').select('id,name,provider')
    .eq('id', connectionId).maybeSingle();
  if (!connection) return;
  const { data: setting } = await supabase.from('panel_notification_settings').select('whatsapp_number')
    .eq('panel_connection_id', connection.id).eq('enabled', true).maybeSingle();
  if (!setting?.whatsapp_number) return;
  const message = `⚠️ Horizons: o painel ${connection.name} desconectou. Entre em Conexões de Painéis e refaça o login para retomar a automação.`;
  try { await sendEvolutionText(config, setting.whatsapp_number, message); }
  catch (error) { console.error('Falha ao enviar alerta de desconexão do painel', error.message); }
}

function isLikelyPanelSessionFailure(error) {
  return /sess[aã]o expirada|sess[aã]o inv[aá]lida|login necess[aá]rio|n[aã]o autenticad|unauthori[sz]ed/i.test(String(error || ''));
}

function connectionFields() {
  return 'id,user_id,server_id,name,provider,base_url,automation_mode,capabilities,session_status,proxy_label,browser_location,agent_id,session_metadata,last_checked_at,last_error,created_at,updated_at';
}

function agentFields() {
  return 'id,user_id,name,status,last_seen_at,metadata,created_at,updated_at';
}

function agentTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function secretMatches(supplied, expected) {
  const left = String(supplied || ''); const right = String(expected || '');
  return Boolean(right) && left.length === right.length
    && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 32);
}

function evolutionTextEvent(body) {
  const data = body?.data || body || {};
  const remoteJid = data?.key?.remoteJid || data?.remoteJid || '';
  const content = data?.message?.conversation || data?.message?.extendedTextMessage?.text || data?.text || '';
  const externalMessageId = data?.key?.id || data?.id || '';
  const instanceName = String(body?.instance || data?.instance || body?.instanceName || data?.instanceName || '').trim();
  return {
    instanceName,
    externalMessageId: String(externalMessageId).slice(0, 300),
    contactPhone: String(remoteJid).replace(/@.+$/, '').replace(/\D/g, '').slice(0, 32),
    direction: data?.key?.fromMe ? 'outbound' : 'inbound',
    content: String(content || '').trim().slice(0, 12000),
    occurredAt: data?.messageTimestamp
      ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString(),
  };
}

async function archiveSupportConversation(body) {
  if (!config.supportConversationCaptureEnabled || !config.evolutionSupportInstance) return false;
  const event = evolutionTextEvent(body);
  if (event.instanceName !== config.evolutionSupportInstance || !event.externalMessageId
    || !event.contactPhone || !event.content) return false;
  const { error } = await supabase.from('support_conversation_messages').upsert({
    user_id: config.horizonsOwnerUserId,
    instance_name: event.instanceName,
    external_message_id: event.externalMessageId,
    contact_phone: event.contactPhone,
    direction: event.direction,
    message_type: 'text',
    content: event.content,
    occurred_at: event.occurredAt,
    metadata: {},
  }, { onConflict: 'user_id,instance_name,external_message_id', ignoreDuplicates: true });
  if (error) throw error;
  return true;
}

function requireTypebotBridge(request, response) {
  const supplied = request.get('x-horizons-bot-token') || '';
  if (!secretMatches(supplied, config.botbotWebhookToken)) {
    response.status(401).json({ error: 'Ponte Typebot não autorizada.' });
    return false;
  }
  if (!config.horizonsOwnerUserId) {
    response.status(503).json({ error: 'Proprietário do Horizons não configurado.' });
    return false;
  }
  return true;
}

async function phoneMatches(table, phone, fields) {
  const { data, error } = await supabase.from(table).select(fields)
    .eq('user_id', config.horizonsOwnerUserId).limit(2000);
  if (error) throw error;
  return (data || []).filter((item) => normalizedPhone(item.phone) === phone);
}

function botbotInboundFields(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : body;
  const rawPhone = data?.phone || data?.from || data?.sender || data?.contact?.phone
    || data?.key?.remoteJid || body?.phone || body?.from || '';
  const rawMessage = typeof data?.message === 'string' ? data.message
    : data?.message?.conversation || data?.message?.extendedTextMessage?.text
      || data?.text || body?.text || '';
  const phone = String(rawPhone).replace(/@.+$/, '').replace(/\D/g, '').slice(0, 32);
  const message = String(rawMessage || '').trim().slice(0, 4000);
  const suppliedId = data?.id || data?.messageId || data?.key?.id || body?.id || body?.event_id;
  const eventKey = suppliedId
    ? `botbot:${String(suppliedId).slice(0, 300)}`
    : `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
  return { phone: phone || null, message: message || null, eventKey };
}

async function requirePanelAgent(request, response, next) {
  const agentId = request.get('x-horizons-agent-id') || '';
  const authorization = request.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!z.string().uuid().safeParse(agentId).success || token.length < 32) return response.status(401).json({ error: 'Agente não autenticado.' });
  const { data: agent, error } = await supabase.from('panel_agents').select('id,user_id,agent_key_hash,status')
    .eq('id', agentId).maybeSingle();
  const suppliedHash = agentTokenHash(token);
  const valid = !error && agent?.status === 'active' && agent.agent_key_hash.length === suppliedHash.length
    && crypto.timingSafeEqual(Buffer.from(agent.agent_key_hash), Buffer.from(suppliedHash));
  if (!valid) return response.status(401).json({ error: 'Agente não autenticado.' });
  request.panelAgent = agent;
  return next();
}

function capabilityForAction(action) {
  return action === 'renew_customer' ? 'renew' : action === 'create_test' ? 'create_test' : 'lookup';
}

function panelBrowserIsConfigured() {
  return Boolean(config.panelBrowserBridgeUrl && config.panelBrowserBridgeToken);
}

async function panelBrowserRequest(path, options = {}) {
  if (!panelBrowserIsConfigured()) throw new Error('Navegador remoto não está configurado nesta VPS.');
  const bridgeUrl = config.panelBrowserBridgeUrl.replace(/\/$/, '');
  const result = await fetch(`${bridgeUrl}${path}`, {
    ...options,
    headers: {
      'x-horizons-bridge-token': config.panelBrowserBridgeToken,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload.error || `Ponte do navegador respondeu ${result.status}.`);
  return payload;
}

async function enqueueOperation(operationId) {
  await automationQueue.add('panel-operation', { operationId }, {
    // BullMQ does not permit ':' in custom job IDs.
    jobId: `panel-operation-${operationId}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  });
}

async function processReferralFirstPayment(customerId, userId) {
  const { data: rewards, error: rewardsError } = await supabase.from('referral_rewards')
    .select('id,referral_link_id,reward_value').eq('referred_customer_id', customerId).eq('status', 'pending');
  if (rewardsError) throw rewardsError;
  await supabase.from('customer_referral_offers').update({ status: 'used', used_at: new Date().toISOString() })
    .eq('customer_id', customerId).eq('status', 'pending');
  if (!rewards?.length) return;

  const cycleMonth = new Date();
  const cycleStart = new Date(Date.UTC(cycleMonth.getUTCFullYear(), cycleMonth.getUTCMonth(), 1));
  const nextCycle = new Date(Date.UTC(cycleMonth.getUTCFullYear(), cycleMonth.getUTCMonth() + 1, 1));
  const cycleDate = cycleStart.toISOString().slice(0, 10);
  const { data: configuredSettings } = await supabase.from('referral_program_settings').select('*').eq('user_id', userId).maybeSingle();
  const settings = configuredSettings || { referral_credit: 15, milestone_referrals: 3 };

  for (const reward of rewards) {
    const { data: link } = await supabase.from('referral_links').select('customer_id').eq('id', reward.referral_link_id).maybeSingle();
    if (!link?.customer_id) continue;
    await supabase.from('referral_rewards').update({ status: 'eligible', eligible_at: new Date().toISOString() }).eq('id', reward.id).eq('status', 'pending');
    const { count } = await supabase.from('referral_rewards').select('*', { count: 'exact', head: true })
      .eq('referral_link_id', reward.referral_link_id).in('status', ['eligible', 'granted'])
      .gte('eligible_at', cycleStart.toISOString()).lt('eligible_at', nextCycle.toISOString());
    const validReferrals = count || 0;
    const { data: referrer } = await supabase.from('customers').select('value').eq('id', link.customer_id).maybeSingle();
    const monthlyValue = Number(referrer?.value || 0);
    if (validReferrals === Number(settings.milestone_referrals)) {
      await supabase.from('referral_benefits').update({ status: 'cancelled', notes: 'Substituído pelo mês grátis da meta mensal.' })
        .eq('beneficiary_customer_id', link.customer_id).eq('cycle_month', cycleDate).eq('benefit_type', 'credit').eq('status', 'eligible');
      const { data: existingFreeMonth } = await supabase.from('referral_benefits').select('id').eq('beneficiary_customer_id', link.customer_id)
        .eq('cycle_month', cycleDate).eq('benefit_type', 'free_month').maybeSingle();
      if (!existingFreeMonth) await supabase.from('referral_benefits').insert({
        user_id: userId, beneficiary_customer_id: link.customer_id, referral_reward_id: reward.id,
        benefit_type: 'free_month', amount: monthlyValue, cycle_month: cycleDate,
        notes: `${validReferrals} indicações com primeiro pagamento confirmado no ciclo.`,
      });
    } else if (validReferrals < Number(settings.milestone_referrals)) {
      const { data: benefits } = await supabase.from('referral_benefits').select('amount,status').eq('beneficiary_customer_id', link.customer_id)
        .eq('cycle_month', cycleDate).eq('benefit_type', 'credit').in('status', ['eligible', 'applied']);
      const alreadyEarned = (benefits || []).reduce((sum, benefit) => sum + Number(benefit.amount || 0), 0);
      const amount = Math.max(0, Math.min(Number(settings.referral_credit), monthlyValue - alreadyEarned));
      if (amount > 0) await supabase.from('referral_benefits').insert({
        user_id: userId, beneficiary_customer_id: link.customer_id, referral_reward_id: reward.id,
        benefit_type: 'credit', amount, cycle_month: cycleDate,
        notes: `Indicação ${validReferrals} confirmada no ciclo.`,
      });
    }
  }
}

async function processPaidPayment(event, payment) {
  if (!event || !payment.customer_id) return;
  const { data: customerOwner, error: customerOwnerError } = await supabase.from('customers')
    .select('user_id').eq('id', payment.customer_id).maybeSingle();
  if (customerOwnerError || !customerOwner?.user_id) throw new Error('Cliente não encontrado para o pagamento.');
  try {
    await processReferralFirstPayment(payment.customer_id, customerOwner.user_id);
  } catch (rewardError) {
    console.error('Falha ao processar benefícios de indicação', rewardError);
  }
  const { data: automationJob, error: jobError } = await supabase.from('automation_jobs').upsert({
    payment_event_id: event.id, customer_id: payment.customer_id, action: 'renew_customer',
  }, { onConflict: 'payment_event_id', ignoreDuplicates: true }).select('id').maybeSingle();
  if (jobError) throw new Error('Não foi possível registrar a renovação.');
  const { data: targets, error: targetsError } = await supabase.from('customer_panel_targets')
    .select('id,panel_connection_id,panel_connections(id,automation_mode,session_status,capabilities)')
    .eq('customer_id', payment.customer_id).eq('active', true);
  if (targetsError) throw new Error('Não foi possível preparar as operações do painel.');
  if (!targets?.length) {
    await supabase.from('automation_jobs').update({ status: 'manual_review', last_error: 'Cliente sem tela vinculada a um painel.' }).eq('id', automationJob.id);
  }
  for (const target of targets || []) {
    const connection = target.panel_connections;
    const automatic = connection?.automation_mode === 'automatic' && connection?.session_status === 'connected' && connection?.capabilities?.renew === true;
    const { data: operation, error: operationError } = await supabase.from('panel_operations').upsert({
      user_id: customerOwner.user_id, payment_event_id: event.id, automation_job_id: automationJob.id,
      customer_id: payment.customer_id, customer_panel_target_id: target.id, panel_connection_id: target.panel_connection_id,
      action: 'renew_customer', status: automatic ? 'queued' : 'pending_approval',
      idempotency_key: `${event.id}:${target.id}:renew_customer`,
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id,status').maybeSingle();
    if (operationError) {
      console.error('Falha ao criar operação de painel', operationError);
      continue;
    }
    if (operation?.status === 'queued') await enqueueOperation(operation.id);
  }
}

app.get('/whatsapp/status', requireAuthenticatedUser, async (_, response) => {
  if (!evolutionIsConfigured(config)) return response.json({ configured: false, connected: false });

  try {
    const evolutionResponse = await fetch(`${evolutionBaseUrl()}/instance/connectionState/${evolutionInstancePath()}`, {
      headers: { apikey: config.evolutionApiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!evolutionResponse.ok) throw new Error(`Evolution respondeu ${evolutionResponse.status}`);
    const payload = await evolutionResponse.json();
    const state = payload?.instance?.state || payload?.state || payload?.status || payload?.instance?.connectionStatus || 'unknown';
    return response.json({ configured: true, connected: state === 'open', state });
  } catch (error) {
    console.error('Falha ao consultar Evolution API', error.message);
    return response.status(503).json({ configured: true, connected: false, state: 'unavailable' });
  }
});

app.post('/whatsapp/messages', requireAuthenticatedUser, async (request, response) => {
  if (!evolutionIsConfigured(config)) return response.status(503).json({ error: 'Evolution API não configurada.' });
  const parsed = whatsappMessageSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Mensagem inválida.', details: parsed.error.flatten() });

  try {
    const payload = await sendEvolutionText(config, parsed.data.phone, parsed.data.message);
    return response.status(202).json({ accepted: true, messageId: payload?.key?.id || payload?.id || payload?.messageId || null });
  } catch (error) {
    console.error('Falha de rede Evolution', error.message);
    return response.status(503).json({ error: 'Evolution API indisponível.' });
  }
});

app.get('/panel-connections', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('panel_connections').select(connectionFields())
    .eq('user_id', request.horizonsUser.id).order('created_at', { ascending: false });
  if (error) return response.status(500).json({ error: 'Não foi possível carregar conexões.' });
  return response.json({ connections: data || [] });
});

app.post('/panel-connections', requireAuthenticatedUser, async (request, response) => {
  const parsed = panelConnectionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Conexão inválida.', details: parsed.error.flatten() });
  if (parsed.data.browser_location === 'local_agent') {
    if (!parsed.data.agent_id) return response.status(400).json({ error: 'Selecione o computador que executará o navegador.' });
    const { data: agent } = await supabase.from('panel_agents').select('id').eq('id', parsed.data.agent_id)
      .eq('user_id', request.horizonsUser.id).eq('status', 'active').maybeSingle();
    if (!agent) return response.status(400).json({ error: 'Computador local inválido ou revogado.' });
  }
  const { data, error } = await supabase.from('panel_connections').insert({
    ...parsed.data,
    user_id: request.horizonsUser.id,
    session_status: 'reconnect_required',
  }).select(connectionFields()).single();
  if (error) return response.status(500).json({ error: 'Não foi possível salvar a conexão.' });
  return response.status(201).json({ connection: data });
});

app.get('/panel-agents', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('panel_agents').select(agentFields())
    .eq('user_id', request.horizonsUser.id).order('created_at', { ascending: false });
  if (error) return response.status(500).json({ error: 'Não foi possível carregar os computadores.' });
  return response.json({ agents: data || [] });
});

app.post('/panel-agents', requireAuthenticatedUser, async (request, response) => {
  const parsed = panelAgentSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Nome do computador inválido.' });
  const enrollmentToken = crypto.randomBytes(32).toString('base64url');
  const { data, error } = await supabase.from('panel_agents').insert({
    user_id: request.horizonsUser.id, name: parsed.data.name, agent_key_hash: agentTokenHash(enrollmentToken),
  }).select(agentFields()).single();
  if (error) return response.status(500).json({ error: 'Não foi possível cadastrar o computador.' });
  return response.status(201).json({ agent: data, enrollment_token: enrollmentToken });
});

app.post('/panel-agents/:id/revoke', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('panel_agents').update({ status: 'revoked' })
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).select(agentFields()).maybeSingle();
  if (error || !data) return response.status(404).json({ error: 'Computador não encontrado.' });
  await supabase.from('panel_agent_commands').update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('agent_id', data.id).in('status', ['queued', 'running']);
  return response.json({ agent: data });
});

app.post('/panel-connections/:id/request-reconnect', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('panel_connections').update({
    session_status: 'reconnect_required', last_error: null,
  }).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).select(connectionFields()).maybeSingle();
  if (error || !data) return response.status(404).json({ error: 'Conexão não encontrada.' });
  // The actual browser handoff is deliberately separate: it requires a user to
  // authenticate manually and never attempts to defeat a panel challenge.
  return response.status(202).json({ connection: data, action: 'manual_browser_login_required' });
});

app.post('/panel-connections/:id/start-browser', requireAuthenticatedUser, async (request, response) => {
  const { data: connection, error } = await supabase.from('panel_connections').select(connectionFields())
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (error || !connection) return response.status(404).json({ error: 'Conexão não encontrada.' });
  if (connection.browser_location === 'local_agent') {
    if (!connection.agent_id) return response.status(409).json({ error: 'Esta conexão não possui um computador local vinculado.' });
    const { data: agent } = await supabase.from('panel_agents').select('id,status,last_seen_at')
      .eq('id', connection.agent_id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (!agent || agent.status !== 'active') return response.status(409).json({ error: 'O computador local foi revogado ou não existe.' });
    const { data: command, error: commandError } = await supabase.from('panel_agent_commands').insert({
      agent_id: agent.id, panel_connection_id: connection.id, action: 'open_browser', payload: { base_url: connection.base_url },
    }).select('id').single();
    if (commandError) return response.status(500).json({ error: 'Não foi possível enviar o comando ao computador.' });
    await supabase.from('panel_connections').update({
      session_status: 'reconnect_required', last_error: null,
      session_metadata: { ...(connection.session_metadata || {}), browser_active: true, browser_location: 'local_agent', browser_command_id: command.id, browser_started_at: new Date().toISOString() },
    }).eq('id', connection.id);
    return response.status(202).json({ mode: 'local_agent', command_id: command.id, agent_last_seen_at: agent.last_seen_at });
  }
  try {
    const accessToken = crypto.randomBytes(32).toString('base64url');
    await panelBrowserRequest('/sessions', {
      method: 'POST', body: JSON.stringify({ connection_id: connection.id, base_url: connection.base_url, access_token: accessToken }),
    });
    await supabase.from('panel_connections').update({
      session_status: 'reconnect_required',
      session_metadata: { ...(connection.session_metadata || {}), browser_active: true, browser_started_at: new Date().toISOString() },
      last_error: null,
    }).eq('id', connection.id);
    return response.status(201).json({
      // noVNC forwards the query string contained in `path`; a separate
      // `token` query parameter is not forwarded to websockify.
      vnc_path: `/panel-browser/vnc.html?autoconnect=true&resize=remote&path=${encodeURIComponent(`websockify?token=${accessToken}`)}`,
    });
  } catch (bridgeError) {
    console.error('Falha ao iniciar navegador do painel', bridgeError.message);
    return response.status(503).json({ error: bridgeError.message });
  }
});

app.post('/panel-connections/:id/confirm-browser-login', requireAuthenticatedUser, async (request, response) => {
  const { data: existing, error: lookupError } = await supabase.from('panel_connections').select(connectionFields())
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (lookupError || !existing) return response.status(404).json({ error: 'Conexão não encontrada.' });
  const { data, error } = await supabase.from('panel_connections').update({
    session_status: 'connected', last_error: null, last_checked_at: new Date().toISOString(),
    session_metadata: { ...(existing.session_metadata || {}), browser_active: true, session_confirmed_at: new Date().toISOString() },
  }).eq('id', existing.id).select(connectionFields()).single();
  if (error) return response.status(500).json({ error: 'Não foi possível confirmar a sessão.' });
  return response.json({ connection: data });
});

app.post('/panel-connections/:id/stop-browser', requireAuthenticatedUser, async (request, response) => {
  const { data: existing, error: lookupError } = await supabase.from('panel_connections').select(connectionFields())
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (lookupError || !existing) return response.status(404).json({ error: 'Conexão não encontrada.' });
  if (existing.browser_location === 'local_agent' && existing.agent_id) {
    await supabase.from('panel_agent_commands').insert({ agent_id: existing.agent_id, panel_connection_id: existing.id, action: 'close_browser' });
  } else {
    try { await panelBrowserRequest(`/sessions/${existing.id}`, { method: 'DELETE' }); }
    catch (bridgeError) { console.error('Falha ao encerrar navegador do painel', bridgeError.message); }
  }
  const { data, error } = await supabase.from('panel_connections').update({
    session_metadata: { ...(existing.session_metadata || {}), browser_active: false, browser_stopped_at: new Date().toISOString() },
  }).eq('id', existing.id).select(connectionFields()).single();
  if (error) return response.status(500).json({ error: 'Não foi possível atualizar a conexão.' });
  return response.json({ connection: data });
});

app.delete('/panel-connections/:id', requireAuthenticatedUser, async (request, response) => {
  const { data: existing, error: lookupError } = await supabase.from('panel_connections').select(connectionFields())
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (lookupError || !existing) return response.status(404).json({ error: 'Conexão não encontrada.' });
  if (existing.browser_location === 'local_agent' && existing.agent_id) {
    await supabase.from('panel_agent_commands').insert({ agent_id: existing.agent_id, panel_connection_id: existing.id, action: 'close_browser' });
  } else {
    try { await panelBrowserRequest(`/sessions/${existing.id}`, { method: 'DELETE' }); }
    catch (bridgeError) { console.error('Falha ao encerrar navegador ao excluir conexão', bridgeError.message); }
  }
  await supabase.from('panel_agent_commands').update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('panel_connection_id', existing.id).in('status', ['queued', 'running']);
  const { error } = await supabase.from('panel_connections').delete().eq('id', existing.id).eq('user_id', request.horizonsUser.id);
  if (error) return response.status(500).json({ error: 'Não foi possível excluir a conexão.' });
  return response.status(204).end();
});

app.post('/panel-connections/:id/start-capture', requireAuthenticatedUser, async (request, response) => {
  const { data: connection, error } = await supabase.from('panel_connections').select(connectionFields())
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (error || !connection) return response.status(404).json({ error: 'Conexão não encontrada.' });
  if (connection.browser_location !== 'local_agent' || !connection.agent_id) return response.status(400).json({ error: 'A captura requer um computador local vinculado.' });
  const { data: agent } = await supabase.from('panel_agents').select('id,status').eq('id', connection.agent_id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (!agent || agent.status !== 'active') return response.status(409).json({ error: 'Computador local indisponível.' });
  await supabase.from('panel_capture_sessions').update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('panel_connection_id', connection.id).eq('status', 'active');
  const { data: session, error: sessionError } = await supabase.from('panel_capture_sessions').insert({
    user_id: request.horizonsUser.id, panel_connection_id: connection.id, agent_id: agent.id,
  }).select('id,status,created_at').single();
  if (sessionError) return response.status(500).json({ error: 'Não foi possível iniciar a captura.' });
  await supabase.from('panel_agent_commands').insert([
    { agent_id: agent.id, panel_connection_id: connection.id, action: 'open_browser', payload: { base_url: connection.base_url } },
    { agent_id: agent.id, panel_connection_id: connection.id, action: 'start_capture', payload: { capture_session_id: session.id } },
  ]);
  return response.status(201).json({ capture: session });
});

app.post('/panel-captures/:id/stop', requireAuthenticatedUser, async (request, response) => {
  const { data: session, error } = await supabase.from('panel_capture_sessions').select('id,agent_id,panel_connection_id,status')
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (error || !session) return response.status(404).json({ error: 'Captura não encontrada.' });
  if (session.status === 'active') {
    await supabase.from('panel_capture_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session.id);
    await supabase.from('panel_agent_commands').insert({ agent_id: session.agent_id, panel_connection_id: session.panel_connection_id, action: 'stop_capture', payload: { capture_session_id: session.id } });
  }
  const { count } = await supabase.from('panel_capture_events').select('*', { count: 'exact', head: true }).eq('capture_session_id', session.id);
  return response.json({ capture: { ...session, status: 'completed', events_count: count || 0 } });
});

app.get('/panel-captures/:id', requireAuthenticatedUser, async (request, response) => {
  const { data: session, error } = await supabase.from('panel_capture_sessions').select('id,status,created_at,completed_at,panel_connections(name)')
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (error || !session) return response.status(404).json({ error: 'Captura não encontrada.' });
  const { data: events, error: eventsError } = await supabase.from('panel_capture_events').select('*')
    .eq('capture_session_id', session.id).order('sequence');
  if (eventsError) return response.status(500).json({ error: 'Não foi possível carregar a captura.' });
  return response.json({ capture: session, events: events || [] });
});

app.post('/agent/heartbeat', requirePanelAgent, async (request, response) => {
  const metadata = z.object({ platform: z.string().max(40).nullable().optional(), hostname: z.string().max(120).nullable().optional() })
    .safeParse(request.body);
  await supabase.from('panel_agents').update({ last_seen_at: new Date().toISOString(), metadata: metadata.success ? metadata.data : {} })
    .eq('id', request.panelAgent.id);
  return response.json({ ok: true });
});

app.get('/agent/commands/next', requirePanelAgent, async (request, response) => {
  const { data: queued, error } = await supabase.from('panel_agent_commands').select('id,action,payload,panel_connection_id')
    .eq('agent_id', request.panelAgent.id).eq('status', 'queued').order('created_at').limit(1).maybeSingle();
  if (error) return response.status(500).json({ error: 'Não foi possível consultar comandos.' });
  if (!queued) return response.json({ command: null });
  const { data: command } = await supabase.from('panel_agent_commands').update({ status: 'running', claimed_at: new Date().toISOString() })
    .eq('id', queued.id).eq('agent_id', request.panelAgent.id).eq('status', 'queued').select('id,action,payload,panel_connection_id').maybeSingle();
  return response.json({ command: command || null });
});

app.post('/agent/commands/:id/result', requirePanelAgent, async (request, response) => {
  const parsed = z.object({ ok: z.boolean(), result: z.record(z.unknown()).optional(), error: z.string().max(1000).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Resultado inválido.' });
  const extractedResult = parsed.data.result?.extracted && typeof parsed.data.result.extracted === 'object' ? parsed.data.result.extracted : {};
  const { password: _password, ...safeExtractedResult } = extractedResult;
  const safeExecutionResult = { ...(parsed.data.result || {}) };
  if (Object.keys(safeExtractedResult).length) safeExecutionResult.extracted = safeExtractedResult;
  else delete safeExecutionResult.extracted;
  const { data, error } = await supabase.from('panel_agent_commands').update({
    status: parsed.data.ok ? 'completed' : 'failed', result: safeExecutionResult, last_error: parsed.data.ok ? null : (parsed.data.error || 'Falha local.'), completed_at: new Date().toISOString(),
  }).eq('id', request.params.id).eq('agent_id', request.panelAgent.id).eq('status', 'running').select('id,panel_connection_id,status,last_error').maybeSingle();
  if (error || !data) return response.status(409).json({ error: 'Comando não está disponível.' });
  const { data: command } = await supabase.from('panel_agent_commands').select('payload,action').eq('id', data.id).maybeSingle();
  const operationId = command?.payload?.operation_id;
  if (typeof operationId === 'string' && z.string().uuid().safeParse(operationId).success) {
    const operationUpdate = parsed.data.ok ? {
      status: 'completed', completed_at: new Date().toISOString(), result: { automated: true, ...safeExecutionResult }, last_error: null,
    } : { status: 'failed', last_error: parsed.data.error || 'Falha no executor local.' };
    await supabase.from('panel_operations').update(operationUpdate).eq('id', operationId).eq('status', 'processing');
    const { data: completedOperation } = await supabase.from('panel_operations').select('action').eq('id', operationId).maybeSingle();
    const testRequestId = command?.payload?.test_request_id;
    if (typeof testRequestId === 'string' && z.string().uuid().safeParse(testRequestId).success) {
      const testUpdate = parsed.data.ok
        ? completedOperation?.action === 'renew_customer' ? { status: 'converted' }
          : completedOperation?.action === 'create_test' ? { status: 'sent', external_username: typeof extractedResult.username === 'string' ? extractedResult.username.slice(0, 300) : null }
            : null
        : completedOperation?.action === 'create_test' ? { status: 'pending' } : null;
      if (testUpdate) await supabase.from('test_requests').update(testUpdate).eq('id', testRequestId).eq('panel_connection_id', data.panel_connection_id);
    }
  }
  if (!parsed.data.ok) {
    const failure = data.last_error || 'Falha no executor local.';
    await supabase.from('panel_connections').update({ last_error: failure }).eq('id', data.panel_connection_id);
    if (!isLikelyPanelSessionFailure(failure)) return response.json({ ok: true });
    const { data: disconnected } = await supabase.from('panel_connections').update({ session_status: 'reconnect_required' })
      .eq('id', data.panel_connection_id).neq('session_status', 'reconnect_required').select('id').maybeSingle();
    if (disconnected) await notifyPanelDisconnected(disconnected.id);
  }
  return response.json({ ok: true });
});

app.post('/agent/capture-events', requirePanelAgent, async (request, response) => {
  const parsed = captureEventsSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Eventos de captura inválidos.' });
  const { data: session, error } = await supabase.from('panel_capture_sessions').select('id,status,agent_id')
    .eq('id', parsed.data.capture_session_id).eq('agent_id', request.panelAgent.id).maybeSingle();
  if (error || !session || session.status !== 'active') return response.status(409).json({ error: 'Captura não está ativa.' });
  const rows = parsed.data.events.map((event) => ({ capture_session_id: session.id, ...event }));
  const { error: insertError } = await supabase.from('panel_capture_events').upsert(rows, { onConflict: 'capture_session_id,sequence', ignoreDuplicates: true });
  if (insertError) return response.status(500).json({ error: 'Não foi possível salvar a captura.' });
  return response.status(202).json({ accepted: true });
});

app.get('/panel-operations', requireAuthenticatedUser, async (request, response) => {
  const status = request.query.status;
  let query = supabase.from('panel_operations').select('*, panel_connections(name,provider), customers(name,phone)')
    .eq('user_id', request.horizonsUser.id).order('created_at', { ascending: false }).limit(200);
  if (typeof status === 'string' && status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return response.status(500).json({ error: 'Não foi possível carregar operações.' });
  return response.json({ operations: data || [] });
});

app.post('/panel-operations', requireAuthenticatedUser, async (request, response) => {
  const parsed = operationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Operação inválida.', details: parsed.error.flatten() });
  const input = parsed.data;
  const { data: connection, error: connectionError } = await supabase.from('panel_connections')
    .select(connectionFields()).eq('id', input.panel_connection_id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (connectionError || !connection) return response.status(404).json({ error: 'Conexão de painel não encontrada.' });
  const allowed = Boolean(connection.capabilities?.[capabilityForAction(input.action)]);
  if (!allowed) return response.status(400).json({ error: 'Esta conexão não suporta essa operação.' });
  const automatic = connection.automation_mode === 'automatic' && connection.session_status === 'connected';
  const operation = {
    user_id: request.horizonsUser.id,
    ...input,
    requested_by: request.horizonsUser.id,
    status: automatic ? 'queued' : 'pending_approval',
    idempotency_key: crypto.randomUUID(),
  };
  const { data, error } = await supabase.from('panel_operations').insert(operation).select().single();
  if (error) return response.status(500).json({ error: 'Não foi possível criar a operação.' });
  if (automatic) await enqueueOperation(data.id);
  return response.status(201).json({ operation: data });
});

app.post('/panel-operations/:id/approve', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('panel_operations').update({
    status: 'queued', approved_by: request.horizonsUser.id, approved_at: new Date().toISOString(), last_error: null,
  }).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).eq('status', 'pending_approval').select().maybeSingle();
  if (error || !data) return response.status(409).json({ error: 'Operação não está disponível para aprovação.' });
  await enqueueOperation(data.id);
  return response.json({ operation: data });
});

app.post('/panel-operations/:id/complete-manually', requireAuthenticatedUser, async (request, response) => {
  const result = z.object({ notes: z.string().trim().max(2000).optional() }).safeParse(request.body);
  if (!result.success) return response.status(400).json({ error: 'Resultado inválido.' });
  const { data, error } = await supabase.from('panel_operations').update({
    status: 'completed', completed_at: new Date().toISOString(), result: { manual: true, notes: result.data.notes || '' },
  }).eq('id', request.params.id).eq('user_id', request.horizonsUser.id).in('status', ['pending_approval', 'queued']).select().maybeSingle();
  if (error || !data) return response.status(409).json({ error: 'Operação não pode ser concluída manualmente.' });
  return response.json({ operation: data });
});

app.post('/public/leads', async (request, response) => {
  const parsed = leadSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Lead inválido ou sem consentimento.' });
  const lead = parsed.data;
  const phone = lead.phone.replace(/\D/g, '');
  let referralLinkId = null;
  if (lead.referral_code) {
    const { data: referralLink } = await supabase.from('referral_links').select('id')
      .eq('user_id', lead.owner_id).eq('code', lead.referral_code.toUpperCase()).eq('active', true).maybeSingle();
    referralLinkId = referralLink?.id || null;
  }
  const { data: existing } = await supabase.from('prospects').select('id').eq('user_id', lead.owner_id).eq('phone', phone).maybeSingle();
  const payload = {
    user_id: lead.owner_id, name: lead.name, phone, lifecycle_stage: 'new', source: lead.source,
    source_metadata: { ...lead.source_metadata, referral_code: lead.referral_code || null }, referral_link_id: referralLinkId,
    consent_at: new Date().toISOString(), opt_out_at: null,
  };
  const { data, error } = existing
    ? await supabase.from('prospects').update(payload).eq('id', existing.id).select('id').single()
    : await supabase.from('prospects').insert(payload).select('id').single();
  if (error) return response.status(500).json({ error: 'Não foi possível registrar o interesse.' });
  await supabase.from('lead_events').insert({ user_id: lead.owner_id, prospect_id: data.id, event_type: 'lead_received', payload: { source: lead.source } });
  return response.status(201).json({ accepted: true, prospect_id: data.id });
});

function formatAdminAssistantWhatsapp(payload) {
  if (payload.needs_clarification) return `Preciso confirmar uma informação:\n\n${payload.question}`;
  const result = payload.result || {};
  if (payload.tool === 'help') return '🤖 *Assistente Horizons*\n\nPosso localizar clientes, resumir cadastro e acessos, consultar checkout, listar inadimplentes, mostrar métricas e consultar planos. No Telegram também posso, mediante confirmação, cadastrar ou alterar clientes, marcar pagamento, criar teste e enviar uma mensagem exata pelo WhatsApp.';
  if (payload.tool === 'list_plans') {
    const plans = (result.plans || []).map((item) => `• ${item.name} — R$ ${Number(item.value || 0).toFixed(2).replace('.', ',')} — ${item.quantity_screens || 1} tela(s)`);
    return `📦 *Planos cadastrados: ${result.count || 0}*\n\n${plans.join('\n') || 'Nenhum plano cadastrado.'}`;
  }
  if (payload.tool === 'find_customer') {
    if (!result.count) return 'Nenhum cliente foi encontrado.';
    return `Encontrei ${result.count} cliente(s):\n\n${result.customers.map((item) => `• ${item.name || 'Sem nome'} — ${item.phone || 'sem telefone'}`).join('\n')}`;
  }
  if (payload.tool === 'get_unpaid_customers') {
    const rows = (result.customers || []).slice(0, 30).map((item) => `• ${item.name || 'Sem nome'} — R$ ${Number(item.monthly_value || 0).toFixed(2).replace('.', ',')}`);
    return `📋 *Clientes pendentes: ${result.count || 0}*\nTotal mensal esperado: R$ ${Number(result.expected_monthly_total || 0).toFixed(2).replace('.', ',')}\n\n${rows.join('\n') || 'Nenhum cliente pendente.'}`;
  }
  if (payload.tool === 'get_business_metrics') {
    return `📊 *Métricas do período*\n\nNovos clientes: ${result.new_customers || 0}\nNovos possíveis clientes: ${result.new_prospects || 0}\nPagamentos: ${result.payments_count || 0}\nClientes pagantes: ${result.paying_customers || 0}\nRecebido: R$ ${Number(result.received_total || 0).toFixed(2).replace('.', ',')}`;
  }
  if (payload.tool === 'get_customer_summary' || payload.tool === 'get_checkout') {
    if (result.ambiguous) return `Encontrei mais de um resultado:\n\n${(result.matches || []).map((item) => `• ${item.name || 'Sem nome'} — ${item.phone || 'sem telefone'}`).join('\n')}\n\nInforme nome ou telefone com mais detalhes.`;
    const customer = result.customer || {};
    const accesses = result.accesses || [];
    const lines = accesses.map((access) => {
      const checkout = payload.tool === 'get_checkout' && access.checkout_url ? `\nCheckout: ${access.checkout_url}` : '';
      return `• ${access.external_plan || 'Plano não informado'} — ${access.active ? 'ativo' : 'inativo'}\nUsuário: ${access.external_username || 'não informado'}\nValidade: ${access.valid_until ? new Date(access.valid_until).toLocaleDateString('pt-BR') : 'não informada'}${checkout}`;
    });
    return `👤 *${customer.name || 'Cliente'}*\nTelefone: ${customer.phone || 'não informado'}\nMensalidade: R$ ${Number(customer.monthly_value || 0).toFixed(2).replace('.', ',')}\n\n${lines.join('\n\n') || 'Nenhum acesso cadastrado.'}`;
  }
  return JSON.stringify(result).slice(0, 3500);
}

async function processAdminAssistantWhatsapp({ phone, text, messageId }) {
  if (messageId) {
    const { data: duplicate } = await supabase.from('admin_assistant_audit').select('id')
      .eq('user_id', config.horizonsOwnerUserId).eq('channel', 'whatsapp').eq('message_id', messageId).maybeSingle();
    if (duplicate) return;
  }
  const result = await runAdminAssistantCommand(text, { channel: 'whatsapp', senderReference: phone, messageId });
  await sendEvolutionText(config, phone, formatAdminAssistantWhatsapp(result));
}

async function sendTelegramAdminMessage(chatId, text, replyMarkup = undefined) {
  const result = await fetch(`https://api.telegram.org/bot${config.telegramAdminBotToken}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok || !payload.ok) throw new Error(`Telegram respondeu ${result.status}.`);
}

async function downloadTelegramAdminDocument(document) {
  if (!document?.file_id || Number(document.file_size || 0) > 5 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 5 MB.');
  const metadataResponse = await fetch(`https://api.telegram.org/bot${config.telegramAdminBotToken}/getFile?file_id=${encodeURIComponent(document.file_id)}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const metadata = await metadataResponse.json().catch(() => ({}));
  if (!metadataResponse.ok || !metadata.ok || !metadata.result?.file_path) throw new Error('Não foi possível obter o arquivo no Telegram.');
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${config.telegramAdminBotToken}/${metadata.result.file_path}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!fileResponse.ok) throw new Error('Não foi possível baixar o arquivo no Telegram.');
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.length > 5 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 5 MB.');
  return buffer;
}

function importNumber(value) {
  const normalized = String(value || '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  return normalized ? Number(normalized) : null;
}

async function createCustomerAccessImportBatch({ document, messageId }) {
  await supabase.from('customer_access_import_batches').delete()
    .eq('user_id', config.horizonsOwnerUserId).eq('status', 'pending_confirmation')
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  const filename = String(document.file_name || '').slice(0, 240);
  if (!/\.csv$/i.test(filename)) throw new Error('Envie CSV UTF-8. No Excel, use Salvar como CSV UTF-8.');
  const buffer = await downloadTelegramAdminDocument(document);
  const rows = await parseCustomerAccessFile(buffer, filename);
  const [{ data: customers }, { data: phones }, { data: legacyServers }, { data: cinehubServers }, { data: plans }] = await Promise.all([
    supabase.from('customers').select('id,name,phone,plan_id,value,quantity_screens,due_day').eq('user_id', config.horizonsOwnerUserId),
    supabase.from('customer_phones').select('customer_id,phone'),
    supabase.from('servers').select('id,name').eq('user_id', config.horizonsOwnerUserId),
    supabase.from('cinehub_servers').select('id,code,name').eq('user_id', config.horizonsOwnerUserId).eq('active', true),
    supabase.from('plans').select('id,name').eq('user_id', config.horizonsOwnerUserId),
  ]);
  const normalizedPhone = (value) => String(value || '').replace(/\D/g, '').slice(0, 32);
  const customerPhones = new Map();
  for (const customer of customers || []) {
    for (const phone of [customer.phone, ...(phones || []).filter((item) => item.customer_id === customer.id).map((item) => item.phone)]) {
      const normalized = normalizedPhone(phone); if (!normalized) continue;
      const matches = customerPhones.get(normalized) || []; if (!matches.some((item) => item.id === customer.id)) matches.push(customer);
      customerPhones.set(normalized, matches);
    }
  }
  const serverCandidates = [...(legacyServers || []).map((server) => ({ ...server, type: 'legacy', match: normalizeImportText(server.name) })),
    ...(cinehubServers || []).map((server) => ({ ...server, type: 'cinehub', match: normalizeImportText(server.code || server.name) }))];
  const filePhoneCounts = rows.reduce((counts, row) => {
    const phone = normalizedPhone(row.phone); if (phone) counts.set(phone, (counts.get(phone) || 0) + 1); return counts;
  }, new Map());
  const items = rows.map((row) => {
    const errors = []; const phone = normalizedPhone(row.phone); const nameKey = normalizeImportText(row.name);
    if (phone.length < 10) errors.push('telefone inválido');
    if ((filePhoneCounts.get(phone) || 0) > 1) errors.push('telefone duplicado no arquivo');
    const phoneMatches = customerPhones.get(phone) || [];
    if (phoneMatches.length > 1) errors.push('telefone pertence a mais de um cliente');
    let customer = phoneMatches.length === 1 ? phoneMatches[0] : null;
    if (!customer) {
      const sameName = (customers || []).filter((item) => normalizeImportText(item.name) === nameKey);
      if (sameName.length === 1 && normalizedPhone(sameName[0].phone) !== phone) errors.push('nome já existe com telefone diferente');
      else if (sameName.length > 1) errors.push('nome duplicado no Horizon');
    }
    const serverKey = normalizeImportText(row.server);
    const matchedServers = serverCandidates.filter((server) => server.match === serverKey || normalizeImportText(server.name) === serverKey);
    if (matchedServers.length !== 1) errors.push(matchedServers.length ? 'servidor ambíguo' : 'servidor não encontrado');
    const server = matchedServers.length === 1 ? matchedServers[0] : null;
    const planMatches = row.plan ? (plans || []).filter((plan) => normalizeImportText(plan.name) === normalizeImportText(row.plan)) : [];
    if (row.plan && planMatches.length !== 1) errors.push('plano não encontrado ou ambíguo');
    const screens = row.screens ? importNumber(row.screens) : 1;
    if (!Number.isInteger(screens) || screens < 1 || screens > 99) errors.push('quantidade de telas inválida');
    const value = importNumber(row.value);
    if (row.value && (!Number.isFinite(value) || value < 0)) errors.push('valor inválido');
    const dueDay = row.due_day ? Number(String(row.due_day).replace(/\D/g, '')) : null;
    if (row.due_day && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) errors.push('dia de vencimento inválido');
    let validUntil = '';
    if (row.valid_until) {
      const brDate = String(row.valid_until).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      const date = brDate
        ? new Date(Number(brDate[3]), Number(brDate[2]) - 1, Number(brDate[1]), Number(brDate[4] || 23), Number(brDate[5] || 59), Number(brDate[6] || 59))
        : new Date(row.valid_until);
      if (Number.isNaN(date.getTime())) errors.push('validade inválida'); else validUntil = date.toISOString();
    }
    if (!row.name) errors.push('nome ausente'); if (!row.username) errors.push('usuário ausente'); if (!row.password) errors.push('senha ausente');
    if (row.checkout_url && !/^https:\/\//i.test(row.checkout_url)) errors.push('checkout precisa usar HTTPS');
    const safeRow = { ...row };
    delete safeRow.password;
    delete safeRow.access_message;
    return {
      row_number: row.row_number, customer_id: customer?.id || null,
      legacy_server_id: server?.type === 'legacy' ? server.id : null,
      cinehub_server_id: server?.type === 'cinehub' ? server.id : null,
      plan_id: planMatches[0]?.id || null,
      normalized_data: { ...safeRow, phone, screens: String(screens || ''), value: value == null ? '' : String(value), due_day: dueDay == null ? '' : String(dueDay), valid_until: validUntil },
      password_ciphertext: sealAccessValue(row.password, config.webhookSharedSecret),
      access_message_ciphertext: row.access_message ? sealAccessValue(row.access_message, config.webhookSharedSecret) : null,
      validation_status: errors.length ? 'blocked' : 'ready', validation_errors: errors,
    };
  });
  const ready = items.filter((item) => item.validation_status === 'ready');
  const summary = {
    existing_customers: ready.filter((item) => item.customer_id).length,
    new_customers: ready.filter((item) => !item.customer_id).length,
    profile_updates: ready.filter((item) => {
      if (!item.customer_id) return false;
      const customer = (customers || []).find((candidate) => candidate.id === item.customer_id);
      const row = item.normalized_data;
      return normalizeImportText(customer?.name) !== normalizeImportText(row.name)
        || (item.plan_id && item.plan_id !== customer?.plan_id)
        || (row.value !== '' && Number(row.value) !== Number(customer?.value))
        || (row.screens !== '' && Number(row.screens) !== Number(customer?.quantity_screens))
        || (row.due_day !== '' && Number(row.due_day) !== Number(customer?.due_day));
    }).length,
    blocked_reasons: items.filter((item) => item.validation_status === 'blocked').flatMap((item) => item.validation_errors)
      .reduce((counts, reason) => ({ ...counts, [reason]: (counts[reason] || 0) + 1 }), {}),
  };
  const { data: batch, error: batchError } = await supabase.from('customer_access_import_batches').insert({
    user_id: config.horizonsOwnerUserId, source_channel: 'telegram', source_message_id: messageId,
    filename, total_rows: items.length, ready_rows: ready.length, blocked_rows: items.length - ready.length, summary,
  }).select('id,filename,total_rows,ready_rows,blocked_rows,summary').single();
  if (batchError) throw batchError;
  const { error: itemsError } = await supabase.from('customer_access_import_items').insert(items.map((item) => ({
    ...item, batch_id: batch.id, user_id: config.horizonsOwnerUserId,
  })));
  if (itemsError) { await supabase.from('customer_access_import_batches').delete().eq('id', batch.id); throw itemsError; }
  return batch;
}

function adminActionSummary(tool, args) {
  if (tool === 'import_customer_access_batch') return `Importar arquivo de clientes e acessos\n\nArquivo: ${args.filename}\nLinhas: ${args.total_rows}\nProntas: ${args.ready_rows}\nBloqueadas: ${args.blocked_rows}\nClientes existentes: ${args.existing_customers}\nClientes novos: ${args.new_customers}\nCadastros com nome/plano/valor/telas/vencimento a atualizar: ${args.profile_updates || 0}\n\nSomente as linhas prontas serão importadas. Nenhum painel externo ou WhatsApp será acionado.`;
  if (tool === 'send_whatsapp') return `Enviar pelo WhatsApp de vendas\n\nDestino: +${normalizedPhone(args.phone)}\n\nMensagem exata:\n${args.message}`;
  if (tool === 'create_customer') return `Cadastrar cliente no Horizons\n\nNome: ${args.name}\nWhatsApp: +${normalizedPhone(args.phone)}\nPlano: ${args.plan}\nVencimento: dia ${args.due_day || 'não informado'}\nSituação: ${args.status || 'active'} / ${args.paid ? 'pago' : 'pendente'}`;
  if (tool === 'update_customer') return `Alterar cliente no Horizons\n\nCliente procurado: ${args.query}\nCampos: ${JSON.stringify(Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'query')))}`;
  if (tool === 'set_customer_payment_status') return `Alterar situação de pagamento\n\nCliente procurado: ${args.query}\nNova situação: ${args.paid ? 'pago' : 'pendente'}`;
  if (tool === 'register_customer_access') return `Registrar acesso somente no Horizons\n\nCliente procurado: ${args.query}\nServidor: ${String(args.server).toUpperCase()}\nUsuário: ${args.external_username}\nPlano: ${args.external_plan || 'não informado'}\nTelas: ${args.screens}\nValidade: ${args.valid_until || 'não informada'}\nMotivo: ${args.reason}\n\nEsta ação não acessa nem altera o painel do servidor.`;
  if (tool === 'prepare_customer_charge') return `Preparar cobrança do cliente\n\nCliente procurado: ${args.query}\nValor: ${args.amount ? `R$ ${Number(args.amount).toFixed(2).replace('.', ',')}` : 'mensalidade cadastrada'}\n\nSerá usado o checkout ativo existente; somente se não houver checkout será criado um Pix PaggPay. Nada será enviado ao WhatsApp.`;
  if (tool === 'billing_reminder_decision') return `Decidir lembrete de cobrança\n\nID: ${(args.id || '').slice(0, 8)}\nAção: ${args.status === 'approved' ? 'Aprovar (envio NÃO ocorre automaticamente)' : 'Cancelar lembrete'}`;
  if (tool === 'recovery_decision') return `Marcar cliente como recuperado\n\nID: ${(args.id || '').slice(0, 8)}\nAção: marcar como recuperado (sair da fila de recuperação)`;
  const content = args.content === 'complete' ? 'Completo' : 'Sem adultos';
  return `Criar teste CineHub para terceiro\n\nNome: ${args.beneficiary_name}\nWhatsApp: +${normalizedPhone(args.phone)}\nUso: ${args.device_category || 'não informado'}${args.manufacturer ? ` / ${args.manufacturer}` : ''}\nServidor: ${(args.server || 'kyros').toUpperCase()}\nDuração: ${args.duration_hours || 6} horas\nConteúdo: ${content}`;
}

function testUsageInstructions(args, profile = {}) {
  const category = args.device_category;
  const manufacturer = String(args.manufacturer || '').toLowerCase();
  const providerCode = profile.partner_provider_code;
  const partnerAccess = providerCode ? `No aplicativo, informe o código do provedor ${providerCode} e depois o usuário e a senha abaixo.` : 'O servidor não devolveu um código de provedor único e confirmado. Não conclua a configuração automática; solicite a revisão do suporte.';
  if (category === 'smart_tv' && manufacturer.includes('samsung')) return `Na Samsung, abra Apps pelo botão Home/Smart Hub, procure Vizzion Play e instale. ${partnerAccess}`;
  if (category === 'smart_tv' && manufacturer.includes('lg')) return `Na LG, abra a LG Content Store pelo botão Home, procure Vizzion Play e instale. ${partnerAccess}`;
  if (category === 'smart_tv') return 'Na loja de aplicativos da Smart TV, procure Vizzion Play. Se não estiver disponível, fale conosco informando a marca e o modelo da TV para indicarmos o aplicativo correto.';
  const androidCodes = profile.android_downloader_code || profile.android_ntdown_code
    ? `No Downloader, digite ${profile.android_downloader_code || 'o código específico não informado'}; no NTdown, digite ${profile.android_ntdown_code || 'o código específico não informado'}.`
    : 'O servidor não devolveu códigos confirmados para o aplicativo Android; solicite a revisão do suporte.';
  if (category === 'android_tv' || category === 'tv_box') return `1. Abra a Play Store e instale o Downloader ou o NTdown.\n2. Abra o aplicativo instalado.\n3. ${androidCodes}\n4. Instale ${profile.android_app || 'o aplicativo indicado pelo suporte'}. Se o aparelho pedir, autorize a instalação desta fonte.\n5. Abra o aplicativo e entre com o usuário, a senha e a DNS abaixo.`;
  if (category === 'mobile' && (manufacturer.includes('apple') || manufacturer.includes('iphone') || manufacturer.includes('ios'))) return 'No iPhone/iPad, instale o Smarters Player Lite pela App Store, escolha Xtream Codes e entre com usuário, senha e DNS abaixo.';
  if (category === 'mobile') return `1. No Android, abra a Play Store e instale o Downloader ou o NTdown.\n2. Abra o aplicativo instalado.\n3. ${androidCodes}\n4. Instale ${profile.android_app || 'o aplicativo indicado pelo suporte'}. Se o celular pedir, autorize a instalação desta fonte.\n5. Abra o aplicativo e entre com o usuário, a senha e a DNS abaixo.`;
  if (category === 'computer') return 'No computador, instale o IPTV Smarters Pro ou use um player compatível com Xtream Codes. Entre com usuário, senha e DNS abaixo.';
  if (category === 'console') return 'O uso em console depende do navegador e do modelo. Envie o modelo do videogame para confirmarmos o procedimento compatível antes da instalação.';
  return 'Envie a marca e o modelo do aparelho para receber o procedimento correto de instalação.';
}

function customerTestMessage(created, args) {
  const test = created.test;
  const profile = test.delivery_profile || extractCinehubDeliveryProfile(test.reply);
  const manufacturer = String(args.manufacturer || '').toLowerCase();
  const appUsesProviderCode = args.device_category === 'smart_tv'
    && (manufacturer.includes('samsung') || manufacturer.includes('lg'));
  const dnsLine = !appUsesProviderCode && test.dns ? `\nDNS: ${test.dns}` : '';
  return `Olá, ${created.beneficiaryName}! Seu teste foi liberado.\n\n${testUsageInstructions(args, profile)}\n\nUsuário: ${test.username || 'não informado'}\nSenha: ${test.password || 'não informada'}${dnsLine}\nValidade: ${test.expires_at || 'não informada'}${isUsableCinehubCheckoutUrl(test.payment_url) ? `\nCheckout: ${test.payment_url}` : ''}\n\nSe tiver dificuldade, envie uma foto da tela e informe a marca e o modelo do aparelho.`;
}

async function uniqueAdminCustomer(query) {
  const normalized = normalizedPhone(query);
  let request = supabase.from('customers').select('id,name,phone,plan_id,value,quantity_screens,due_day,status,paid,notes')
    .eq('user_id', config.horizonsOwnerUserId).limit(10);
  request = normalized.length >= 8 ? request.ilike('phone', `%${normalized}%`) : request.ilike('name', `%${String(query).trim()}%`);
  const { data, error } = await request;
  if (error) throw error;
  if (!data?.length) throw new Error('Cliente não encontrado.');
  if (data.length !== 1) throw new Error('Mais de um cliente corresponde à busca; informe o telefone completo.');
  return data[0];
}

async function uniqueAdminPlan(planName) {
  const { data, error } = await supabase.from('plans').select('id,name,value,quantity_screens')
    .eq('user_id', config.horizonsOwnerUserId).ilike('name', String(planName).trim()).limit(2);
  if (error) throw error;
  if (!data?.length) throw new Error('Plano não encontrado no Horizons. Consulte os planos disponíveis.');
  if (data.length !== 1) throw new Error('Nome de plano ambíguo. Informe o nome exato.');
  return data[0];
}

async function createCustomerFromTelegram(args) {
  const phone = normalizedPhone(args.phone);
  if (phone.length < 10) throw new Error('Telefone do cliente inválido.');
  const existing = await phoneMatches('customers', phone, 'id');
  if (existing.length) throw new Error('Já existe um cliente com esse telefone.');
  const plan = await uniqueAdminPlan(args.plan);
  const { data, error } = await supabase.rpc('create_customer_with_primary_phone', {
    p_user_id: config.horizonsOwnerUserId, p_name: args.name.trim(), p_phone: phone, p_plan_id: plan.id,
    p_value: args.value ?? plan.value ?? 0,
    p_quantity_screens: args.quantity_screens ?? plan.quantity_screens ?? 1,
    p_due_day: args.due_day ?? new Date().getDate(), p_status: args.status || 'active',
    p_paid: args.paid ?? false, p_notes: args.notes || null,
  });
  if (error) throw error;
  return data;
}

async function updateCustomerFromTelegram(args) {
  const customer = await uniqueAdminCustomer(args.query);
  const allowed = ['name', 'value', 'quantity_screens', 'due_day', 'status', 'paid', 'notes'];
  const changes = Object.fromEntries(allowed.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
  if (args.phone !== undefined) {
    const phone = normalizedPhone(args.phone);
    if (phone.length < 10) throw new Error('Novo telefone inválido.');
    const conflicts = (await phoneMatches('customers', phone, 'id')).filter((item) => item.id !== customer.id);
    if (conflicts.length) throw new Error('O novo telefone já pertence a outro cliente.');
    changes.phone = phone;
  }
  if (args.plan !== undefined) changes.plan_id = (await uniqueAdminPlan(args.plan)).id;
  if (!Object.keys(changes).length) throw new Error('Nenhuma alteração foi informada.');
  const { data, error } = await supabase.rpc('update_customer_with_primary_phone', {
    p_user_id: config.horizonsOwnerUserId, p_customer_id: customer.id,
    p_changes: changes, p_sync_phone: Boolean(changes.phone),
  });
  if (error) throw error;
  return data;
}

async function registerCustomerAccessFromTelegram(args) {
  const customer = await uniqueAdminCustomer(args.query);
  const { data: server, error: serverError } = await supabase.from('cinehub_servers').select('id,name')
    .eq('user_id', config.horizonsOwnerUserId).eq('code', args.server).eq('active', true).maybeSingle();
  if (serverError || !server) throw new Error('Servidor não encontrado ou inativo no Horizons.');
  let validUntil = null;
  if (args.valid_until) {
    const parsed = new Date(args.valid_until);
    if (Number.isNaN(parsed.getTime())) throw new Error('Validade do acesso inválida.');
    validUntil = parsed.toISOString();
  }
  const { data, error } = await supabase.rpc('migrate_customer_server_access', {
    p_user_id: config.horizonsOwnerUserId, p_customer_id: customer.id, p_to_server_id: server.id,
    p_reason: args.reason, p_external_username: args.external_username,
    p_external_plan: args.external_plan || null, p_screens: args.screens,
    p_dns: args.dns || null, p_checkout_url: args.checkout_url || null,
    p_access_password_ciphertext: sealAccessValue(args.password, config.webhookSharedSecret),
    p_access_message_ciphertext: sealAccessValue(args.access_message, config.webhookSharedSecret),
    p_valid_until: validUntil, p_changed_by: config.horizonsOwnerUserId, p_source: 'admin_assistant',
  });
  if (error) throw error;
  return { customer, server, access: data };
}

async function prepareCustomerChargeFromTelegram(args) {
  const customer = await uniqueAdminCustomer(args.query);
  const { data: accesses, error: accessError } = await supabase.from('customer_panel_targets')
    .select('checkout_url').eq('user_id', config.horizonsOwnerUserId).eq('customer_id', customer.id)
    .eq('active', true).eq('is_primary', true).order('created_at', { ascending: false }).limit(1);
  if (accessError) throw accessError;
  const checkout = accesses?.[0]?.checkout_url;
  if (checkout && /^https:\/\//i.test(checkout)) return { customer, mode: 'checkout', checkout };
  if (!paggpayIsConfigured(config)) throw new Error('Cliente sem checkout e PaggPay não configurada.');
  const amount = args.amount ?? Number(customer.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Cliente sem mensalidade válida; informe o valor.');
  const phone = normalizedPhone(customer.phone);
  if (phone.length < 8) throw new Error('Cliente sem telefone válido.');
  const { data: renewal, error: renewalError } = await supabase.from('renewal_requests').insert({
    user_id: config.horizonsOwnerUserId, customer_id: customer.id, phone,
    expected_amount: amount, status: 'awaiting_payment', source: 'telegram_admin_assistant',
    source_idempotency_key: `admin-charge:${crypto.randomUUID()}`,
  }).select('id').single();
  if (renewalError || !renewal) throw renewalError || new Error('Não foi possível abrir a cobrança.');
  try {
    const charge = normalizePaggpayTransaction(await createPaggpayClient(config).createPix({
      reference_id: renewal.id, value: Math.round(amount * 100), payer_name: customer.name,
      payer_phone: phone, payer_pays_fee: false,
      description: args.description || `Mensalidade Horizons — ${customer.name}`,
    }));
    if (!charge.id || !charge.pixCode) throw new Error('PaggPay não retornou Pix completo.');
    const { error } = await supabase.rpc('record_paggpay_charge', {
      p_user_id: config.horizonsOwnerUserId, p_renewal_id: renewal.id,
      p_customer_id: customer.id, p_provider_event_id: charge.id,
      p_amount: amount, p_payload: charge.raw,
    });
    if (error) {
      console.error('Pix PaggPay aceito, mas pendente de reconciliação no Horizons', renewal.id);
      return { customer, mode: 'pix_reconciliation_pending', amount, charge };
    }
    return { customer, mode: 'pix', amount, charge };
  } catch (error) {
    await supabase.from('renewal_requests').update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', renewal.id).eq('status', 'awaiting_payment');
    throw error;
  }
}

async function createAdminConfirmation(tool, args, userId) {
  const code = crypto.randomBytes(24).toString('hex');
  const storedArgs = protectedAdminArguments(tool, args);
  const { data, error } = await supabase.from('admin_assistant_confirmations').insert({
    user_id: config.horizonsOwnerUserId, channel: 'telegram', sender_reference: String(userId),
    tool_name: tool, tool_arguments: storedArgs, summary: adminActionSummary(tool, args),
    confirmation_code_hash: crypto.createHash('sha256').update(code).digest('hex'),
    status: 'pending', expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).select('id,summary,expires_at').single();
  if (error) throw error;
  return data;
}

async function createAssistedTestFromTelegram(args, confirmationId) {
  if (!cinehubDirectTestIsConfigured(config)) throw new Error('Teste direto CineHub não configurado.');
  const beneficiaryPhone = normalizedPhone(args.phone);
  if (beneficiaryPhone.length < 10) throw new Error('Telefone do beneficiário inválido.');
  const beneficiaryName = String(args.beneficiary_name || '').trim();
  const [customers, prospects] = await Promise.all([
    phoneMatches('customers', beneficiaryPhone, 'id'), phoneMatches('prospects', beneficiaryPhone, 'id,name,phone'),
  ]);
  if (customers.length) throw new Error('O beneficiário já possui cadastro de cliente.');
  if (prospects.length > 1) throw new Error('O telefone do beneficiário possui cadastros duplicados.');
  const { data: previous, error: previousError } = await supabase.from('union_direct_test_events').select('id')
    .eq('user_id', config.horizonsOwnerUserId).eq('phone', beneficiaryPhone).eq('status', 'completed').limit(1).maybeSingle();
  if (previousError) throw previousError;
  if (previous) throw new Error('O telefone do beneficiário já utilizou um teste.');
  let prospect = prospects[0] || null;
  if (!prospect) {
    const { data, error } = await supabase.from('prospects').insert({
      user_id: config.horizonsOwnerUserId, name: beneficiaryName, phone: beneficiaryPhone,
      source: 'telegram_admin_assistant', lifecycle_stage: 'in_service',
      source_metadata: { admin_confirmation_id: confirmationId },
    }).select('id,name,phone').single();
    if (error) throw error;
    prospect = data;
  }
  const { data: reservation, error: reservationError } = await supabase.from('union_direct_test_events').insert({
    user_id: config.horizonsOwnerUserId, idempotency_key: `admin-assisted:${confirmationId}`,
    phone: beneficiaryPhone, prospect_id: prospect.id, contact_name: beneficiaryName,
    status: 'processing', assisted: true, created_by_user_id: config.horizonsOwnerUserId,
  }).select('id').single();
  if (reservationError?.code === '23505') throw new Error('Esta confirmação já foi processada.');
  if (reservationError || !reservation) throw reservationError || new Error('Falha ao reservar teste assistido.');
  const selection = { server: args.server || 'kyros', duration_hours: args.duration_hours || 6, content: args.content || 'no_adults' };
  try {
    const test = await createCinehubDirectTest(config, { phone: beneficiaryPhone, name: beneficiaryName }, selection);
    await supabase.from('union_direct_test_events').update({
      status: 'completed', external_username: test.username, package: test.package, dns: test.dns,
      expires_at: test.expires_at, payment_url: test.payment_url,
      access_password_ciphertext: sealAccessValue(test.password, config.webhookSharedSecret),
      access_reply_ciphertext: sealAccessValue(test.reply, config.webhookSharedSecret),
      completed_at: new Date().toISOString(), error: null,
    }).eq('id', reservation.id);
    await supabase.from('prospects').update({ lifecycle_stage: 'test_sent' }).eq('id', prospect.id);
    await supabase.from('lead_events').insert({
      user_id: config.horizonsOwnerUserId, prospect_id: prospect.id, event_type: 'assisted_test_created',
      payload: { union_direct_test_event_id: reservation.id, admin_confirmation_id: confirmationId, channel: 'telegram', ...selection },
    });
    return { beneficiaryName, beneficiaryPhone, testEventId: reservation.id, test };
  } catch (error) {
    await supabase.from('union_direct_test_events').update({
      status: 'failed', error: String(error.message || 'Falha CineHub').slice(0, 1000), completed_at: new Date().toISOString(),
    }).eq('id', reservation.id);
    throw error;
  }
}

async function executeAdminConfirmation(confirmation) {
  const args = openedAdminArguments(confirmation.tool_name, confirmation.tool_arguments || {});
  if (confirmation.tool_name === 'send_whatsapp') {
    const phone = normalizedPhone(args.phone);
    if (phone.length < 10 || !String(args.message || '').trim()) throw new Error('Destino ou mensagem inválidos.');
    await sendEvolutionText(config, phone, String(args.message).trim(), { instance: config.evolutionSalesInstance });
    return { text: `✅ Mensagem enviada pelo WhatsApp de vendas para +${phone}.` };
  }
  if (confirmation.tool_name === 'create_assisted_test') {
    const created = await createAssistedTestFromTelegram(args, confirmation.id);
    return { text: `✅ Teste criado para ${created.beneficiaryName}.\n\nMensagem padronizada para copiar e enviar:\n\n${customerTestMessage(created, args)}${created.test.dns_warning ? '\n\n⚠️ A DNS divergente devolvida pelo provedor foi substituída pelo host confirmado nos links de acesso.' : ''}` };
  }
  if (confirmation.tool_name === 'create_customer') {
    const customer = await createCustomerFromTelegram(args);
    return { text: `✅ Cliente ${customer.name} cadastrado no Horizons com o telefone +${customer.phone}.` };
  }
  if (confirmation.tool_name === 'update_customer') {
    const customer = await updateCustomerFromTelegram(args);
    return { text: `✅ Cadastro de ${customer.name} atualizado no Horizons.` };
  }
  if (confirmation.tool_name === 'set_customer_payment_status') {
    const customer = await updateCustomerFromTelegram({ query: args.query, paid: args.paid });
    return { text: `✅ ${customer.name} foi marcado como ${customer.paid ? 'pago' : 'pendente'} no Horizons.` };
  }
  if (confirmation.tool_name === 'register_customer_access') {
    const registered = await registerCustomerAccessFromTelegram(args);
    return { text: `✅ Acesso de ${registered.customer.name} registrado no Horizons em ${registered.server.name}.\n\nNenhuma ação foi executada no painel do servidor.` };
  }
  if (confirmation.tool_name === 'prepare_customer_charge') {
    const prepared = await prepareCustomerChargeFromTelegram(args);
    if (prepared.mode === 'checkout') return { text: `✅ Checkout existente localizado para ${prepared.customer.name}:\n\n${prepared.checkout}\n\nNada foi enviado ao WhatsApp.` };
    if (prepared.mode === 'pix_reconciliation_pending') return { text: `⚠️ A PaggPay criou o Pix para ${prepared.customer.name}, mas o registro interno ficou pendente de reconciliação.\n\nPix copia e cola:\n${prepared.charge.pixCode}\n\nNão gere outra cobrança para este cliente antes da conferência.` };
    return { text: `✅ Cobrança Pix criada para ${prepared.customer.name}.\nValor: R$ ${Number(prepared.amount).toFixed(2).replace('.', ',')}\n\nPix copia e cola:\n${prepared.charge.pixCode}\n\nNada foi enviado ao WhatsApp.` };
  }
  if (confirmation.tool_name === 'billing_reminder_decision') {
    const { error: reminderError } = await supabase.from('billing_reminder_queue')
      .update({ status: args.status, approved_by: config.horizonsOwnerUserId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', args.id).eq('user_id', config.horizonsOwnerUserId).eq('status', 'planned');
    if (reminderError) throw reminderError;
    return { text: `✅ Lembrete ${args.id.slice(0, 8)} marcado como ${args.status === 'approved' ? 'aprovado (envio NÃO ocorre automaticamente)' : 'cancelado'}.` };
  }
  if (confirmation.tool_name === 'recovery_decision') {
    const { error: recoveryError } = await supabase.from('customer_recovery_queue')
      .update({ status: args.status, updated_at: new Date().toISOString() })
      .eq('id', args.id).eq('user_id', config.horizonsOwnerUserId).in('status', ['pending', 'reminded']);
    if (recoveryError) throw recoveryError;
    return { text: `✅ Cliente ${args.id.slice(0, 8)} marcado como recuperado. Nenhuma mensagem foi enviada.` };
  }
  if (confirmation.tool_name === 'import_customer_access_batch') {
    const { data, error } = await supabase.rpc('execute_customer_access_import_batch', {
      p_user_id: config.horizonsOwnerUserId, p_batch_id: args.batch_id,
    });
    if (error) throw error;
    return { text: `✅ Importação concluída.\n\nLinhas importadas: ${data.imported_rows}\nLinhas bloqueadas: ${data.blocked_rows}\n\nNenhum painel externo ou WhatsApp foi acionado.` };
  }
  throw new Error('Ação administrativa não autorizada.');
}

async function processAdminAssistantTelegram({ userId, chatId, text, messageId }) {
  if (messageId) {
    const { data: duplicate } = await supabase.from('admin_assistant_audit').select('id')
      .eq('user_id', config.horizonsOwnerUserId).eq('channel', 'telegram').eq('message_id', messageId).maybeSingle();
    if (duplicate) return;
  }
  // Atalho para comandos financeiros diretos (sem passar pela IA).
  const parsed = parseTelegramCommand(text);
  if (parsed) {
    const known = ['baixa', 'aprovacoes', 'recuperacao', 'renovacoes', 'digest', 'lembretes', 'semacesso', 'semcheckout', 'semcredenciais', 'aprovar', 'rejeitar', 'recuperar', 'hoje'];
    if (known.includes(parsed.name)) {
      const result = await runTelegramCommand(supabase, config, parsed.name, parsed.args);
      if (result.confirmation) {
        const confirmation = await createAdminConfirmation(result.confirmation.tool, result.confirmation.args, userId);
        await sendTelegramAdminMessage(chatId, `⚠️ CONFIRMAÇÃO OBRIGATÓRIA\n\n${confirmation.summary}\n\nExpira em 10 minutos.`, {
          inline_keyboard: [[{ text: '✅ Confirmar', callback_data: `confirm:${confirmation.id}` }, { text: '❌ Cancelar', callback_data: `cancel:${confirmation.id}` }]],
        });
        await auditAdminAssistant({ sender_reference: String(userId), message_id: messageId, request_text: text, tool_name: result.confirmation.tool, tool_arguments: result.confirmation.args, model: 'direct', status: 'clarification', result_summary: { confirmation_required: true } }, 'telegram');
        return;
      }
      await sendTelegramAdminMessage(chatId, result.text);
      await auditAdminAssistant({ sender_reference: String(userId), message_id: messageId, request_text: text, tool_name: 'telegram_command', tool_arguments: { name: parsed.name, args: parsed.args }, model: 'direct', status: 'completed', result_summary: { reply: result.text } }, 'telegram');
      return;
    }
  }
  const exactWhatsapp = text.match(/(?:envie|enviar|mande|mandar)[\s\S]*?whatsapp[\s\S]*?para\s*\+?(\d[\d\s().-]{7,})[\s\S]*?mensagem\s+exata\s*:\s*([\s\S]+)/i);
  if (exactWhatsapp) {
    const result = {
      needs_confirmation: true, tool: 'send_whatsapp',
      arguments: { phone: normalizedPhone(exactWhatsapp[1]), message: exactWhatsapp[2].trim() },
    };
    await auditAdminAssistant({
      sender_reference: String(userId), message_id: messageId, request_text: text,
      tool_name: result.tool, tool_arguments: result.arguments, status: 'interpreted',
      result_summary: { confirmation_required: true, deterministic_parser: true },
    }, 'telegram');
    const confirmation = await createAdminConfirmation(result.tool, result.arguments, userId);
    await sendTelegramAdminMessage(chatId, `⚠️ CONFIRMAÇÃO OBRIGATÓRIA\n\n${confirmation.summary}\n\nExpira em 10 minutos.`, {
      inline_keyboard: [[{ text: '✅ Confirmar', callback_data: `confirm:${confirmation.id}` }, { text: '❌ Cancelar', callback_data: `cancel:${confirmation.id}` }]],
    });
    return;
  }
  const command = /^\/(start|help)(?:@\w+)?$/i.test(text)
    ? 'Quais consultas administrativas estão disponíveis?'
    : text;
  const result = await runAdminAssistantCommand(command, {
    channel: 'telegram', senderReference: String(userId), messageId,
  });
  if (result.needs_confirmation) {
    const confirmation = await createAdminConfirmation(result.tool, result.arguments, userId);
    await sendTelegramAdminMessage(chatId, `⚠️ CONFIRMAÇÃO OBRIGATÓRIA\n\n${confirmation.summary}\n\nExpira em 10 minutos.`, {
      inline_keyboard: [[
        { text: '✅ Confirmar', callback_data: `confirm:${confirmation.id}` },
        { text: '❌ Cancelar', callback_data: `cancel:${confirmation.id}` },
      ]],
    });
    return;
  }
  await sendTelegramAdminMessage(chatId, formatAdminAssistantWhatsapp(result));
}

async function answerTelegramCallback(callbackId, text) {
  await fetch(`https://api.telegram.org/bot${config.telegramAdminBotToken}/answerCallbackQuery`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text: String(text).slice(0, 180) }),
    signal: AbortSignal.timeout(15_000),
  });
}

async function processTelegramAdminCallback(callback) {
  const userId = String(callback.from?.id || '');
  const chatId = String(callback.message?.chat?.id || '');
  const match = String(callback.data || '').match(/^(confirm|cancel):([0-9a-f-]{36})$/i);
  if (!match || !config.telegramAdminAllowedUserIds.includes(userId)) return;
  const [, action, confirmationId] = match;
  const { data: confirmation, error } = await supabase.from('admin_assistant_confirmations').select('*')
    .eq('id', confirmationId).eq('user_id', config.horizonsOwnerUserId).eq('channel', 'telegram')
    .eq('sender_reference', userId).maybeSingle();
  if (error || !confirmation) return answerTelegramCallback(callback.id, 'Confirmação não encontrada.');
  if (confirmation.status !== 'pending') return answerTelegramCallback(callback.id, 'Esta confirmação já foi processada.');
  if (new Date(confirmation.expires_at).getTime() <= Date.now()) {
    await supabase.from('admin_assistant_confirmations').update({ status: 'expired' }).eq('id', confirmation.id).eq('status', 'pending');
    if (confirmation.tool_name === 'import_customer_access_batch' && confirmation.tool_arguments?.batch_id) {
      await supabase.from('customer_access_import_batches').delete()
        .eq('id', confirmation.tool_arguments.batch_id).eq('user_id', config.horizonsOwnerUserId).eq('status', 'pending_confirmation');
    }
    return answerTelegramCallback(callback.id, 'Confirmação expirada.');
  }
  if (action === 'cancel') {
    await supabase.from('admin_assistant_confirmations').update({ status: 'cancelled' }).eq('id', confirmation.id).eq('status', 'pending');
    if (confirmation.tool_name === 'import_customer_access_batch' && confirmation.tool_arguments?.batch_id) {
      await supabase.from('customer_access_import_batches').delete()
        .eq('id', confirmation.tool_arguments.batch_id).eq('user_id', config.horizonsOwnerUserId).eq('status', 'pending_confirmation');
    }
    await answerTelegramCallback(callback.id, 'Ação foi cancelada.');
    await sendTelegramAdminMessage(chatId, '❌ Ação cancelada. Nenhuma alteração externa foi realizada.');
    return;
  }
  const { data: claimed } = await supabase.from('admin_assistant_confirmations').update({
    status: 'confirmed', confirmed_at: new Date().toISOString(),
  }).eq('id', confirmation.id).eq('status', 'pending').select('*').maybeSingle();
  if (!claimed) return answerTelegramCallback(callback.id, 'Esta confirmação já foi processada.');
  await answerTelegramCallback(callback.id, 'Confirmação recebida. Executando…');
  try {
    const result = await executeAdminConfirmation(claimed);
    await supabase.from('admin_assistant_confirmations').update({ status: 'executed', executed_at: new Date().toISOString() }).eq('id', claimed.id);
    await auditAdminAssistant({
      sender_reference: userId, request_text: claimed.summary, tool_name: claimed.tool_name,
      tool_arguments: claimed.tool_arguments, status: 'completed', result_summary: { confirmation_id: claimed.id, executed: true },
    }, 'telegram');
    await sendTelegramAdminMessage(chatId, result.text);
  } catch (error) {
    await supabase.from('admin_assistant_confirmations').update({ status: 'failed', executed_at: new Date().toISOString() }).eq('id', claimed.id);
    await auditAdminAssistant({
      sender_reference: userId, request_text: claimed.summary, tool_name: claimed.tool_name,
      tool_arguments: claimed.tool_arguments, status: 'failed', error_code: 'confirmed_action_failed',
      result_summary: { confirmation_id: claimed.id },
    }, 'telegram');
    await sendTelegramAdminMessage(chatId, `❌ Não foi possível concluir a ação: ${String(error.message || 'falha operacional').slice(0, 300)}`);
  }
}

app.post('/webhooks/telegram/admin', (request, response) => {
  if (!config.telegramAdminEnabled || !config.telegramAdminBotToken || !config.telegramAdminWebhookSecret) {
    return response.status(503).json({ error: 'Assistente Telegram não configurado.' });
  }
  const supplied = request.get('x-telegram-bot-api-secret-token') || '';
  if (!secretMatches(supplied, config.telegramAdminWebhookSecret)) {
    return response.status(401).json({ error: 'Webhook Telegram não autorizado.' });
  }
  const callback = request.body?.callback_query;
  if (callback) {
    response.json({ ok: true });
    setImmediate(() => processTelegramAdminCallback(callback)
      .catch((error) => console.error('Falha na confirmação Telegram', error.message)));
    return;
  }
  const message = request.body?.message;
  const userId = String(message?.from?.id || '');
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || '').trim();
  const document = message?.document;
  if (!userId || !chatId || (!text && !document) || message?.chat?.type !== 'private') {
    return response.status(200).json({ ok: true, ignored: true });
  }
  if (!config.telegramAdminAllowedUserIds.includes(userId)) {
    return response.status(200).json({ ok: true, ignored: true });
  }
  const messageId = `tg:${request.body?.update_id || message.message_id}`;
  response.json({ ok: true });
  if (document) {
    setImmediate(async () => {
      try {
        const batch = await createCustomerAccessImportBatch({ document, messageId });
        const args = {
          batch_id: batch.id, filename: batch.filename, total_rows: batch.total_rows,
          ready_rows: batch.ready_rows, blocked_rows: batch.blocked_rows,
          existing_customers: batch.summary?.existing_customers || 0,
          new_customers: batch.summary?.new_customers || 0,
          profile_updates: batch.summary?.profile_updates || 0,
        };
        const reasons = Object.entries(batch.summary?.blocked_reasons || {}).map(([reason, count]) => `• ${reason}: ${count}`).join('\n');
        if (!batch.ready_rows) {
          await supabase.from('customer_access_import_batches').delete().eq('id', batch.id);
          await sendTelegramAdminMessage(chatId, `❌ Nenhuma linha está pronta para importação.\n\nArquivo: ${batch.filename}\nLinhas bloqueadas: ${batch.blocked_rows}${reasons ? `\n\nMotivos:\n${reasons}` : ''}\n\nCorrija o arquivo e envie novamente.`);
          return;
        }
        const confirmation = await createAdminConfirmation('import_customer_access_batch', args, userId);
        await sendTelegramAdminMessage(chatId, `📄 PRÉVIA DO ARQUIVO\n\n${confirmation.summary}${reasons ? `\n\nLinhas bloqueadas:\n${reasons}` : ''}\n\nConfira os números antes de confirmar. Expira em 10 minutos.`, {
          inline_keyboard: [[
            { text: '✅ Confirmar importação', callback_data: `confirm:${confirmation.id}` },
            { text: '❌ Cancelar', callback_data: `cancel:${confirmation.id}` },
          ]],
        });
      } catch (error) {
        console.error('Falha ao preparar importação Telegram', error.message);
        await sendTelegramAdminMessage(chatId, `❌ Não foi possível preparar o arquivo: ${String(error.message).slice(0, 300)}`);
      }
    });
    return;
  }
  setImmediate(() => processAdminAssistantTelegram({ userId, chatId, text: text.slice(0, 2000), messageId })
    .catch(async (error) => {
      console.error('Falha no assistente administrativo Telegram', error.message);
      try { await sendTelegramAdminMessage(chatId, '❌ Não consegui interpretar esse comando. Tente novamente com o destino e o texto completos.'); }
      catch (sendError) { console.error('Falha ao avisar erro no Telegram', sendError.message); }
    }));
});

app.post('/webhooks/evolution', webhookGuard, async (request, response) => {
  if (!config.evolutionWebhookToken || !config.horizonsOwnerUserId) {
    return response.status(503).json({ error: 'Webhook de entrada não configurado.' });
  }
  const headerToken = request.get('x-horizons-webhook-token') || request.get('x-horizons-evolution-token') || request.query.token || '';
  const headerMatches = headerToken.length === config.evolutionWebhookToken.length
    && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(config.evolutionWebhookToken));
  if (!headerMatches) {
    return response.status(401).json({ error: 'Assinatura inválida.' });
  }
  try {
    await archiveSupportConversation(request.body || {});
  } catch (error) {
    console.error('Falha ao arquivar conversa de suporte', error.message);
  }
  const inboundMedia = evolutionInboundMedia(request.body || {});
  const receiptInstances = [config.evolutionFinanceInstance, config.evolutionSalesInstance]
    .filter((instance) => instance && String(instance).trim());
  const isFinanceMedia = inboundMedia && (receiptInstances.length === 0
    || receiptInstances.includes(inboundMedia.instanceName));
  if (inboundMedia?.phone && inboundMedia?.messageId && isFinanceMedia) {
    response.status(202).json({ accepted: true, media: true });
    setImmediate(() => processEvolutionReceipt(inboundMedia).catch((error) => console.error('Falha no webhook Evolution', error.message)));
    return;
  }
  const data = request.body?.data || request.body;
  const remoteJid = data?.key?.remoteJid || data?.remoteJid || '';
  const phone = String(remoteJid).replace(/@.+$/, '').replace(/\D/g, '');
  const text = data?.message?.conversation || data?.message?.extendedTextMessage?.text || data?.text || '';
  if (!phone || !text || data?.key?.fromMe) return response.status(202).json({ accepted: true, ignored: true });
  if (config.adminAssistantWhatsappEnabled && config.adminAssistantAllowedPhones.includes(phone)) {
    const messageId = data?.key?.id || data?.id || null;
    response.status(202).json({ accepted: true, admin_assistant: true });
    setImmediate(() => processAdminAssistantWhatsapp({ phone, text: String(text).slice(0, 2000), messageId })
      .catch((error) => console.error('Falha no assistente administrativo WhatsApp', error.message)));
    return;
  }
  const couponMatch = String(text).match(/\b(?:cupom|c[oó]digo)\s*[:\-]?\s*([a-z0-9-]{4,})\b/i);
  let referralLinkId = null;
  if (couponMatch) {
    const { data: referralLink } = await supabase.from('referral_links').select('id')
      .eq('user_id', config.horizonsOwnerUserId).eq('code', couponMatch[1].toUpperCase()).eq('active', true).maybeSingle();
    referralLinkId = referralLink?.id || null;
  }
  const { data: existing, error: lookupError } = await supabase.from('prospects').select('id,referral_link_id')
    .eq('user_id', config.horizonsOwnerUserId).eq('phone', phone).maybeSingle();
  if (lookupError) return response.status(500).json({ error: 'Falha ao localizar prospect.' });
  let prospectId = existing?.id;
  if (!prospectId) {
    const { data: prospect, error: createError } = await supabase.from('prospects').insert({
      user_id: config.horizonsOwnerUserId, name: 'Contato WhatsApp', phone, source: 'whatsapp_inbound', lifecycle_stage: 'new', referral_link_id: referralLinkId,
    }).select('id').single();
    if (createError) return response.status(500).json({ error: 'Falha ao registrar contato.' });
    prospectId = prospect.id;
  } else if (referralLinkId && !existing.referral_link_id) {
    await supabase.from('prospects').update({ referral_link_id: referralLinkId }).eq('id', prospectId);
  }
  await supabase.from('lead_events').insert({
    user_id: config.horizonsOwnerUserId, prospect_id: prospectId, event_type: 'whatsapp_inbound', payload: { text: String(text).slice(0, 4000), coupon: couponMatch?.[1]?.toUpperCase() || null, coupon_valid: Boolean(referralLinkId) },
  });
  // No automatic reply is emitted here. Outbound templates require an explicit
  // campaign/bot activation and a consent-aware review.
  return response.status(202).json({ accepted: true, prospect_id: prospectId });
});

app.get('/integrations/botbot', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('botbot_webhook_events')
    .select('id,event_key,phone,message,status,error,created_at,processed_at')
    .eq('user_id', request.horizonsUser.id).order('created_at', { ascending: false }).limit(50);
  if (error) return response.status(500).json({ error: 'Não foi possível carregar os eventos do BotBot.' });
  return response.json({
    configured: botbotIsConfigured(config),
    union_direct_test_configured: unionDirectTestIsConfigured(config),
    webhook_configured: Boolean(config.botbotWebhookToken && config.horizonsOwnerUserId),
    typebot_configured: Boolean(config.typebotApiUrl && config.typebotPublicId),
    events: data || [],
  });
});

app.post('/integrations/botbot/messages', requireAuthenticatedUser, async (request, response) => {
  if (!botbotIsConfigured(config)) return response.status(503).json({ error: 'BotBot ainda não está configurado no Horizons.' });
  const parsed = botbotMessageSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Mensagem BotBot inválida.', details: parsed.error.flatten() });
  try {
    const result = await sendBotbotWhatsApp(config, {
      to: parsed.data.phone.replace(/\D/g, ''), message: parsed.data.message, typingDelay: parsed.data.typing_delay,
    });
    return response.status(result.status === 'queued' ? 202 : 200).json({ accepted: true, channel: 'whatsapp', status: result.status });
  } catch (error) {
    console.error('Falha ao enviar mensagem pelo BotBot', error.message);
    return response.status(502).json({ error: 'Não foi possível enviar a mensagem pelo BotBot.' });
  }
});

// Endpoint para um bloco HTTP do Typebot. O segredo fica no header e nunca no
// fluxo público, URL ou corpo persistido. Ele envia somente mensagens; ações de
// painel permanecem em endpoints próprios depois de homologadas.
app.post('/typebot/botbot/messages', async (request, response) => {
  const supplied = request.get('x-horizons-bot-token') || '';
  if (!secretMatches(supplied, config.botbotWebhookToken)) return response.status(401).json({ error: 'Ponte Typebot não autorizada.' });
  if (!botbotIsConfigured(config)) return response.status(503).json({ error: 'BotBot ainda não está configurado no Horizons.' });
  const parsed = botbotMessageSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Mensagem inválida.', details: parsed.error.flatten() });
  try {
    const result = await sendBotbotWhatsApp(config, {
      to: parsed.data.phone.replace(/\D/g, ''), message: parsed.data.message, typingDelay: parsed.data.typing_delay,
    });
    return response.status(result.status === 'queued' ? 202 : 200).json({ accepted: true, status: result.status });
  } catch (error) {
    console.error('Falha na ponte Typebot/BotBot', error.message);
    return response.status(502).json({ error: 'Falha temporária no envio.' });
  }
});

// Interpreta texto livre para o bot (n8n). A IA (OmniRoute) só classifica e extrai
// contexto; este endpoint não executa qualquer ação comercial ou financeira.
app.post('/typebot/ai/interpret', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const ai = await aiSettings.resolve();
  if (!supportAiIsConfigured(ai)) return response.status(503).json({ error: 'IA (OmniRoute) não configurada.', route: 'human' });
  const parsed = typebotAiInterpretSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Mensagem inválida.', details: parsed.error.flatten() });
  try {
    const interpretation = await interpretSupportMessage(ai, parsed.data.message);
    return response.json(interpretation);
  } catch (error) {
    console.error('Falha ao interpretar atendimento com IA', error.message);
    return response.status(502).json({ error: 'Não consegui interpretar a mensagem agora.', route: 'human' });
  }
});

// Bloco HTTP do Typebot para criar um teste pela URL nativa do Union. Cada
// idempotency_key pode criar no máximo um acesso. A senha e a mensagem completa
// são devolvidas somente nesta resposta e nunca são persistidas pelo Horizons.
app.post('/typebot/intake', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotIntakeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Triagem inválida.', details: parsed.error.flatten() });
  const phone = normalizedPhone(parsed.data.phone);
  try {
    const prospects = await phoneMatches('prospects', phone, 'id,name,phone,lifecycle_stage');
    if (prospects.length > 1) return response.status(409).json({ error: 'Mais de um possível cliente possui este telefone.' });
    let prospect = prospects[0];
    if (!prospect) {
      const { data, error } = await supabase.from('prospects').insert({
        user_id: config.horizonsOwnerUserId,
        name: parsed.data.name || 'Contato Typebot',
        phone,
        source: 'typebot',
        lifecycle_stage: parsed.data.intent === 'trial' ? 'in_service' : 'new',
        source_metadata: { first_session_key: parsed.data.session_key },
      }).select('id,name,phone,lifecycle_stage').single();
      if (error) throw error;
      prospect = data;
    } else {
      const updates = {};
      if (parsed.data.name && (!prospect.name || prospect.name === 'Contato Typebot' || prospect.name === 'Contato WhatsApp')) {
        updates.name = parsed.data.name;
      }
      if (parsed.data.intent === 'trial' && prospect.lifecycle_stage === 'new') updates.lifecycle_stage = 'in_service';
      if (Object.keys(updates).length) {
        const { data, error } = await supabase.from('prospects').update(updates).eq('id', prospect.id)
          .select('id,name,phone,lifecycle_stage').single();
        if (error) throw error;
        prospect = data;
      }
    }

    const customers = await phoneMatches('customers', phone, 'id,name,phone,value,plan_id,due_day,quantity_screens,status,paid');
    const customer = customers.length === 1 ? customers[0] : null;
    let customerAccesses = [];
    if (customer) {
      const { data, error } = await supabase.from('customer_panel_targets')
        .select('id,external_plan,screens,active,valid_until,checkout_url')
        .eq('user_id', config.horizonsOwnerUserId).eq('customer_id', customer.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      customerAccesses = data || [];
    }
    const { data: completedTrials, error: completedTrialsError } = await supabase.from('union_direct_test_events')
      .select('id,package,expires_at,payment_url,created_at').eq('user_id', config.horizonsOwnerUserId)
      .eq('phone', phone).eq('status', 'completed').order('created_at', { ascending: false }).limit(25);
    if (completedTrialsError) throw completedTrialsError;
    const latestCompletedTrial = completedTrials?.[0] || null;
    const latestTrialWithCheckout = completedTrials?.find((trial) => isUsableCinehubCheckoutUrl(trial.payment_url)) || null;
    const priorTrial = latestCompletedTrial ? {
      ...latestCompletedTrial,
      payment_url: latestTrialWithCheckout?.payment_url || latestCompletedTrial.payment_url,
    } : null;
    const activeAccesses = customerAccesses.filter((access) => access.active !== false);
    const latestValidity = activeAccesses.map((access) => access.valid_until).filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
    const { identityState, trialEligible } = classifyCustomerIdentity({
      customerMatches: customers.length, customer, latestValidity, priorTrial,
    });
    const sessionValues = {
      user_id: config.horizonsOwnerUserId,
      session_key: parsed.data.session_key,
      phone,
      prospect_id: prospect.id,
      customer_id: customer?.id || null,
      intent: parsed.data.intent || null,
      current_step: parsed.data.current_step || null,
      identity_verified: true,
      identity_provider: 'evolution_whatsapp',
      last_seen_at: new Date().toISOString(),
    };
    const { data: session, error: sessionError } = await supabase.from('typebot_conversation_sessions')
      .upsert(sessionValues, { onConflict: 'user_id,session_key' }).select('id,status').single();
    if (sessionError) throw sessionError;

    if (parsed.data.profile || parsed.data.intent) {
      const { data: previous, error: profileLookupError } = await supabase.from('lead_qualification_profiles')
        .select('answers,control_media_refs').eq('user_id', config.horizonsOwnerUserId).eq('prospect_id', prospect.id).maybeSingle();
      if (profileLookupError) throw profileLookupError;
      const profile = parsed.data.profile || {};
      const profileValues = {
        user_id: config.horizonsOwnerUserId,
        prospect_id: prospect.id,
        primary_intent: parsed.data.intent || undefined,
        ...Object.fromEntries(Object.entries(profile).filter(([key]) => !['answers', 'control_media_refs'].includes(key))),
        answers: { ...(previous?.answers || {}), ...(profile.answers || {}) },
        control_media_refs: profile.control_media_refs || previous?.control_media_refs || [],
      };
      Object.keys(profileValues).forEach((key) => profileValues[key] === undefined && delete profileValues[key]);
      const { error } = await supabase.from('lead_qualification_profiles')
        .upsert(profileValues, { onConflict: 'user_id,prospect_id' });
      if (error) throw error;
    }

    await supabase.from('lead_events').insert({
      user_id: config.horizonsOwnerUserId,
      prospect_id: prospect.id,
      event_type: 'typebot_intake',
      payload: { session_key: parsed.data.session_key, intent: parsed.data.intent || null, current_step: parsed.data.current_step || null },
    });
    return response.json({
      session_id: session.id,
      prospect_id: prospect.id,
      prospect_name: prospect.name,
      customer_match: customers.length === 1 ? 'found' : customers.length > 1 ? 'ambiguous' : 'not_found',
      customer: customer ? {
        id: customer.id, name: customer.name, value: customer.value, plan_id: customer.plan_id,
        due_day: customer.due_day, simultaneous_screens: customer.quantity_screens,
        status: customer.status, paid: customer.paid, valid_until: latestValidity,
        access_count: activeAccesses.length,
      } : null,
      identity_state: identityState,
      trial_eligible: trialEligible,
      prior_trial: priorTrial ? {
        id: priorTrial.id,
        package: priorTrial.package,
        expires_at: priorTrial.expires_at,
        checkout_available: isUsableCinehubCheckoutUrl(priorTrial.payment_url),
        checkout_url: isUsableCinehubCheckoutUrl(priorTrial.payment_url) ? priorTrial.payment_url : null,
      } : null,
      requires_human: customers.length > 1,
    });
  } catch (error) {
    console.error('Falha na triagem Typebot', error.message);
    return response.status(500).json({ error: 'Não foi possível salvar a triagem.' });
  }
});

app.post('/typebot/handoffs', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotHandoffSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Encaminhamento inválido.', details: parsed.error.flatten() });
  const { data: session, error: sessionError } = await supabase.from('typebot_conversation_sessions')
    .select('id,prospect_id,customer_id,phone').eq('user_id', config.horizonsOwnerUserId)
    .eq('session_key', parsed.data.session_key).maybeSingle();
  if (sessionError) return response.status(500).json({ error: 'Não foi possível localizar a conversa.' });
  if (!session) return response.status(404).json({ error: 'Conversa não encontrada.' });
  const assignedPhone = {
    sales: config.typebotSalesPhone,
    support: config.typebotSupportPhone,
    finance: config.typebotFinancePhone,
    general: config.typebotGeneralPhone,
  }[parsed.data.department] || null;
  const { data: handoff, error } = await supabase.from('conversation_handoffs').insert({
    user_id: config.horizonsOwnerUserId,
    session_id: session.id,
    prospect_id: session.prospect_id,
    customer_id: session.customer_id,
    department: parsed.data.department,
    reason: parsed.data.reason,
    summary: parsed.data.summary || null,
    priority: parsed.data.priority,
    assigned_phone: assignedPhone ? normalizedPhone(assignedPhone) : null,
  }).select('id,department,status').single();
  if (error) return response.status(500).json({ error: 'Não foi possível encaminhar o atendimento.' });
  await supabase.from('typebot_conversation_sessions').update({ status: 'waiting_human' }).eq('id', session.id);
  return response.status(201).json({
    handoff_id: handoff.id, department: handoff.department, status: handoff.status,
    assigned_phone: assignedPhone ? normalizedPhone(assignedPhone) : null,
    phone_configured: Boolean(assignedPhone),
  });
});

app.post('/typebot/guides/recommend', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotGuideSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Consulta de manual inválida.', details: parsed.error.flatten() });
  const { data, error } = await supabase.from('installation_guides')
    .select('id,title,device_category,manufacturer,model_hint,platform,app_name,instructions,media_urls')
    .eq('user_id', config.horizonsOwnerUserId).eq('active', true).eq('device_category', parsed.data.device_category).limit(100);
  if (error) return response.status(500).json({ error: 'Não foi possível consultar os manuais.' });
  const wantedManufacturer = String(parsed.data.manufacturer || '').toLowerCase();
  const wantedPlatform = String(parsed.data.platform || '').toLowerCase();
  const genericManufacturer = !wantedManufacturer || ['generic', 'other', 'unknown'].includes(wantedManufacturer);
  const ranked = (data || []).map((guide) => {
    let score = 1;
    const guideManufacturer = String(guide.manufacturer || '').toLowerCase();
    const manufacturerMatch = Boolean(wantedManufacturer && (guideManufacturer === wantedManufacturer
      || guideManufacturer.split(/\s*\/\s*/).includes(wantedManufacturer)));
    if (manufacturerMatch) score += 4;
    // A generic request must prefer the category's generic guide. Without this,
    // insertion order could route Android TV to Fire TV or mobile to Android.
    if (genericManufacturer && !guideManufacturer) score += 4;
    if (wantedPlatform && String(guide.platform || '').toLowerCase().includes(wantedPlatform)) score += 2;
    return { guide, score, manufacturerMatch };
  }).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return response.json({ found: false, requires_human: true, reason: 'guide_not_found' });
  if (!genericManufacturer && !best.manufacturerMatch) {
    return response.json({ found: false, requires_human: true, reason: 'manufacturer_not_supported' });
  }
  const mediaUrl = Array.isArray(best.guide.media_urls) ? best.guide.media_urls[0] || null : null;
  const manufacturer = String(best.guide.manufacturer || '').toLowerCase();
  const category = String(best.guide.device_category || '').toLowerCase();
  if (manufacturer === 'roku') {
    return response.json({
      found: false,
      requires_human: true,
      reason: 'roku_package_not_configured',
      guide_title: best.guide.title,
    });
  }
  const apps = 'Vizzion Play (preferencial). Se não aparecer na loja, tente Fun Play, Lazer Player, Super Play, Smartcpp, Play Sim, Epic Play, Power Play, Magic Player, Box Player ou Blessed Player';
  const chatInstructions = manufacturer === 'lg'
    ? `Na TV LG, pressione Home e abra LG Content Store → Apps. Pesquise e instale um destes aplicativos: ${apps}. O código do provedor será obtido do servidor que criou o teste; use depois o login e a senha enviados.`
    : manufacturer === 'samsung'
      ? `Na TV Samsung, pressione Home ou Smart Hub e abra Apps. Pesquise e instale um destes aplicativos: ${apps}. O código do provedor será obtido do servidor que criou o teste; use depois o login e a senha enviados.`
      : manufacturer === 'amazon'
        ? 'No Fire TV, instale o Downloader pela loja Amazon. Os códigos e o aplicativo serão obtidos da resposta do servidor que criar o teste. Depois use o login, a senha e o DNS enviados.'
        : category === 'android_tv'
          ? 'Na Play Store da TV, instale Downloader ou NTdown. Os códigos e o aplicativo serão obtidos da resposta do servidor que criar o teste. Depois use o login, a senha e o DNS enviados.'
          : category === 'tv_box'
            ? 'Na TV Box, abra a Play Store e instale Downloader ou NTdown. Os códigos e o aplicativo serão obtidos da resposta do servidor que criar o teste. Depois use o login, a senha e o DNS enviados.'
            : manufacturer === 'android'
              ? 'No celular Android, instale Downloader ou NTdown pela Play Store. Os códigos e o aplicativo serão obtidos da resposta do servidor que criar o teste. Depois use o login, a senha e o DNS enviados.'
              : manufacturer === 'apple'
                ? 'No iPhone ou iPad, instale Smarters Player Lite pela App Store: https://apps.apple.com/br/app/smarters-player-lite/id1628995509. Abra o aplicativo, escolha entrar com Xtream Codes e use o login, a senha e o DNS enviados abaixo.'
                : category === 'computer'
                  ? 'No computador, use o Web Player em http://webtv.iptvblinkplayer.com/xtream-code ou instale o 9Xtream 4K Player pela Microsoft Store: https://apps.microsoft.com/detail/9nhmwqsp9pj7. Informe o login, a senha e o DNS enviados abaixo.'
      : String(best.guide.instructions || '')
        .replace(/\[(?:USUÁRIO|SENHA)\]/gi, 'os dados enviados abaixo')
        .replace(/#{1,6}\s*/g, '').replace(/\|[-: |]+\|/g, '').trim().slice(0, 2200);
  return response.json({
    found: true,
    confidence: best.score >= 5 ? 'high' : 'generic',
    requires_human: false,
    guide_title: best.guide.title,
    guide_instructions: best.guide.instructions,
    guide_media_url: mediaUrl,
    guide_chat_instructions: chatInstructions,
    provider_code: null,
    codes_source: 'cinehub_test_server_response',
    guide: best.guide,
  });
});

app.get('/typebot/wplay/status', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  return response.json(wplayBotStatus(config));
});

// Orientação de instalação vinda do catálogo do próprio painel (somente leitura).
app.post('/typebot/wplay/install', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = z.object({
    product: z.enum(['iptv', 'p2p', 'krator', 'nexus', 'whot']).optional(),
    brand: z.string().trim().max(40).optional(),
    device: z.string().trim().max(40).optional(),
    username: z.string().trim().max(80).optional(),
    password: z.string().trim().max(80).optional(),
  }).safeParse(request.body ?? {});
  if (!parsed.success) return response.status(400).json({ error: 'Consulta de instalação inválida.', details: parsed.error.flatten() });
  try {
    const result = await resolveBotInstall(config, parsed.data);
    return response.json({ ...result, source: 'panel-links' });
  } catch (error) {
    return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
  }
});

// Cria o teste no WPlay e, se o MAC vier junto, já ativa o app nesse teste.
// Ativar app em teste não consome crédito; criar o teste continua atrás do gate.
app.post('/typebot/wplay/trials', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = z.object({
    product: z.enum(['iptv', 'p2p', 'krator', 'nexus']).optional(),
    package_iptv: z.number().int().optional(),
    package_p2p: z.string().trim().max(64).optional(),
    package_krator: z.string().trim().max(64).optional(),
    package_nexus: z.number().int().optional(),
    serviceId: z.string().trim().max(64).optional(),
    testDuration: z.number().int().min(1).max(72).optional(),
    whatsapp: z.string().trim().max(32).optional(),
    country: z.string().trim().max(4).optional(),
    notes: z.string().trim().max(500).optional(),
    mac: z.string().trim().max(64).optional(),
    nameApp: z.enum(WWPANEL_APPS).optional(),
    namePlaylist: z.string().trim().max(120).optional(),
    name: z.string().trim().max(120).optional(),
    customerId: z.string().trim().max(64).optional(),
  }).safeParse(request.body ?? {});
  if (!parsed.success) return response.status(400).json({ error: 'Pedido de teste inválido.', details: parsed.error.flatten() });
  try {
    const { customerId, ...trialInput } = parsed.data;
    const result = await createWplayTrial(config, trialInput);
    if (!result.ok) {
      const status = result.reason === 'not_configured' || result.reason === 'writes_disabled' ? 503 : 400;
      const message = result.reason === 'writes_disabled'
        ? 'Teste automático indisponível agora; um atendente continua o pedido.'
        : result.reason === 'not_configured'
          ? 'Teste automático indisponível agora; um atendente continua o pedido.'
          : 'Não foi possível montar o teste com os dados recebidos.';
      return response.status(status).json({ error: message, reason: result.reason });
    }
    if (customerId && result.trial?.lineId) {
      const link = await linkWplayLine(supabase, {
        userId: config.horizonsOwnerUserId ?? null, customerId,
        lineId: result.trial.lineId, username: result.trial.username, kind: 'test',
      });
      return response.status(201).json({ ...result, link });
    }
    return response.status(201).json(result);
  } catch (error) {
    return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
  }
});

// Ativa o app de um teste já criado (o cliente mandou o MAC depois).
app.post('/typebot/wplay/app', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = z.object({
    nameApp: z.enum(WWPANEL_APPS).optional(),
    appText: z.string().trim().max(60).optional(),
    mac: z.string().trim().min(1).max(64),
    namePlaylist: z.string().trim().max(120).optional(),
    id_user: z.union([z.string().trim().max(64), z.number().int()]).optional(),
    customerId: z.string().trim().max(64).optional(),
  }).safeParse(request.body ?? {});
  if (!parsed.success) return response.status(400).json({ error: 'Pedido de ativação inválido.', details: parsed.error.flatten() });
  try {
    let { id_user: idUser, customerId } = parsed.data;
    let targetId = null;
    if ((idUser === undefined || idUser === null) && customerId) {
      const resolved = await resolveWplayLine(supabase, { userId: config.horizonsOwnerUserId ?? null, customerId });
      if (resolved) { idUser = resolved.lineId; targetId = resolved.targetId; }
    }
    const result = await activateWplayApp(config, { ...parsed.data, id_user: idUser });
    if (!result.ok) {
      const message = result.reason === 'app_requires_login'
        ? 'Esse aplicativo entra com usuário e senha, não por MAC; um atendente vai concluir.'
        : result.reason === 'missing_fields'
          ? 'Não reconheci o aplicativo ou o MAC; um atendente vai continuar.'
          : 'Não foi possível ativar o aplicativo agora; um atendente vai continuar.';
      return response.status(result.reason === 'missing_fields' ? 400 : 503).json({ error: message, reason: result.reason });
    }
    if (customerId) {
      result.recorded = await recordAppActivation(supabase, {
        userId: config.horizonsOwnerUserId ?? null, customerId, targetId,
        mac: parsed.data.mac, nameApp: result.app,
      });
    }
    return response.json(result);
  } catch (error) {
    return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
  }
});

app.get('/typebot/offers', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const { data, error } = await supabase.from('plans').select('id,name,description,value,quantity_screens')
    .eq('user_id', config.horizonsOwnerUserId).order('value', { ascending: true }).limit(100);
  if (error) return response.status(500).json({ error: 'Não foi possível carregar os planos.' });
  return response.json({
    plans: (data || []).map((plan) => ({
      id: plan.id, name: plan.name, description: plan.description,
      amount: Number(plan.value), included_screens: Math.min(Number(plan.quantity_screens || 1), 3),
    })),
    max_screens_per_account: 3,
  });
});

app.post('/typebot/orders', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotOrderSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Pedido inválido.', details: parsed.error.flatten() });
  const { data: session, error: sessionError } = await supabase.from('typebot_conversation_sessions')
    .select('id,prospect_id,customer_id,phone').eq('user_id', config.horizonsOwnerUserId)
    .eq('session_key', parsed.data.session_key).maybeSingle();
  if (sessionError) return response.status(500).json({ error: 'Não foi possível localizar a conversa.' });
  if (!session?.prospect_id) return response.status(404).json({ error: 'Faça a triagem antes de criar o pedido.' });
  const { data: plan, error: planError } = await supabase.from('plans')
    .select('id,name,value,quantity_screens').eq('id', parsed.data.plan_id)
    .eq('user_id', config.horizonsOwnerUserId).maybeSingle();
  if (planError || !plan) return response.status(404).json({ error: 'Plano não encontrado.' });
  const requiredAccounts = Math.ceil(parsed.data.simultaneous_screens / 3);
  const needsHuman = requiredAccounts > 1;
  let checkoutUrl = null;
  if (parsed.data.union_direct_test_event_id) {
    const { data: trial, error: trialError } = await supabase.from('union_direct_test_events')
      .select('id,prospect_id,phone,payment_url,status').eq('id', parsed.data.union_direct_test_event_id)
      .eq('user_id', config.horizonsOwnerUserId).maybeSingle();
    const sameProspect = Boolean(trial?.prospect_id && trial.prospect_id === session.prospect_id);
    const samePhone = Boolean(trial?.phone && session.phone && normalizedPhone(trial.phone) === normalizedPhone(session.phone));
    if (trialError || !trial || (!sameProspect && !samePhone) || trial.status !== 'completed') {
      return response.status(422).json({ error: 'O teste informado não corresponde a esta conversa.' });
    }
    checkoutUrl = isUsableCinehubCheckoutUrl(trial.payment_url) ? trial.payment_url : null;
  }
  const { data: order, error } = await supabase.from('sales_orders').insert({
    user_id: config.horizonsOwnerUserId,
    prospect_id: session.prospect_id,
    customer_id: session.customer_id,
    test_request_id: parsed.data.test_request_id || null,
    union_direct_test_event_id: parsed.data.union_direct_test_event_id || null,
    session_id: session.id,
    purpose: parsed.data.purpose,
    plan_name: plan.name,
    simultaneous_screens: parsed.data.simultaneous_screens,
    required_accounts: requiredAccounts,
    amount: needsHuman ? null : Number(plan.value),
    status: needsHuman || !checkoutUrl ? 'manual_review' : 'waiting_payment',
    checkout_url: checkoutUrl,
    metadata: { plan_id: plan.id, plan_included_screens: plan.quantity_screens },
  }).select('id,status,plan_name,simultaneous_screens,required_accounts,amount,checkout_url').single();
  if (error) return response.status(500).json({ error: 'Não foi possível criar o pedido.' });
  return response.status(201).json({
    order,
    requires_human: needsHuman || !checkoutUrl,
    message_code: needsHuman ? 'more_than_three_simultaneous_screens' : checkoutUrl ? 'checkout_ready' : 'checkout_unavailable',
  });
});

const handleCinehubTest = async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  if (!config.horizonsOwnerUserId || !cinehubDirectTestIsConfigured(config)) {
    return response.status(503).json({ error: 'Teste direto CineHub ainda não está configurado.' });
  }
  const parsed = unionDirectTestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Solicitação de teste inválida.', details: parsed.error.flatten() });
  const phone = parsed.data.phone.replace(/\D/g, '');
  let prospect = null;
  if (parsed.data.prospect_id) {
    const { data, error } = await supabase.from('prospects').select('id,name,phone')
      .eq('id', parsed.data.prospect_id).eq('user_id', config.horizonsOwnerUserId).maybeSingle();
    if (error || !data || normalizedPhone(data.phone) !== phone) {
      return response.status(422).json({ error: 'Possível cliente não corresponde ao telefone informado.' });
    }
    prospect = data;
  } else {
    try {
      const matches = await phoneMatches('prospects', phone, 'id,name,phone');
      if (matches.length > 1) return response.status(409).json({ error: 'Telefone duplicado em possíveis clientes.' });
      prospect = matches[0] || null;
    } catch {
      return response.status(500).json({ error: 'Não foi possível localizar o possível cliente.' });
    }
  }
  if (!prospect) return response.status(422).json({ error: 'Faça a triagem do possível cliente antes de criar o teste.' });
  const { data: reusableTrials, error: reusableError } = await supabase.from('union_direct_test_events')
    .select('id,external_username,package,dns,expires_at,payment_url,access_password_ciphertext,access_reply_ciphertext')
    .eq('user_id', config.horizonsOwnerUserId).eq('phone', phone).eq('status', 'completed')
    .order('created_at', { ascending: false }).limit(1);
  if (reusableError) return response.status(500).json({ error: 'Não foi possível verificar testes ativos.' });
  const latestCompleted = reusableTrials?.[0];
  const reusable = latestCompleted && (
    parsed.data.qa_replay_existing_test
    ||
    parsed.data.reuse_existing_checkout
    || (latestCompleted.expires_at && new Date(latestCompleted.expires_at).getTime() > Date.now())
  ) ? latestCompleted : null;
  if (reusable) {
    const checkoutOnly = parsed.data.reuse_existing_checkout && !parsed.data.qa_replay_existing_test;
    const reusableReply = checkoutOnly ? null : openAccessValue(reusable.access_reply_ciphertext, config.webhookSharedSecret);
    const reusableTest = checkoutOnly ? {
      package: reusable.package,
      expires_at: reusable.expires_at,
      payment_url: reusable.payment_url,
    } : {
      username: reusable.external_username,
      password: openAccessValue(reusable.access_password_ciphertext, config.webhookSharedSecret),
      dns: reusable.dns,
      package: reusable.package,
      expires_at: reusable.expires_at,
      payment_url: reusable.payment_url,
      reply: reusableReply,
      delivery_profile: extractCinehubDeliveryProfile(reusableReply),
    };
    return response.status(200).json({
      accepted: true,
      reused: true,
      reused_for_checkout: Boolean(checkoutOnly),
      qa_replay: Boolean(parsed.data.qa_replay_existing_test),
      test_event_id: reusable.id,
      test: reusableTest,
    });
  }
  const { data: reservation, error: reservationError } = await supabase.from('union_direct_test_events').insert({
    user_id: config.horizonsOwnerUserId,
    idempotency_key: parsed.data.idempotency_key,
    phone,
    prospect_id: prospect.id,
    contact_name: parsed.data.name || prospect.name || null,
    status: 'processing',
  }).select('id').single();
  if (reservationError?.code === '23505') {
    const { data: previous } = await supabase.from('union_direct_test_events')
      .select('status,error').eq('user_id', config.horizonsOwnerUserId)
      .eq('idempotency_key', parsed.data.idempotency_key).maybeSingle();
    if (previous?.status === 'failed' && ['CINEHUB_PHONE_ALREADY_TESTED', 'Union respondeu 400'].includes(previous.error)) {
      return response.status(409).json({
        error: 'Este número já efetuou um teste em nosso servidor.',
        code: 'phone_already_tested',
      });
    }
    return response.status(409).json({ error: 'Esta solicitação de teste já foi processada.' });
  }
  if (reservationError || !reservation) return response.status(500).json({ error: 'Não foi possível reservar a criação do teste.' });
  try {
    const selection = {
      server: parsed.data.server,
      duration_hours: parsed.data.duration_hours,
      content: parsed.data.content,
    };
    const test = await createCinehubDirectTest(config, { phone, name: parsed.data.name || prospect.name }, selection);
    await supabase.from('union_direct_test_events').update({
      status: 'completed', external_username: test.username, package: test.package,
      dns: test.dns, expires_at: test.expires_at, payment_url: test.payment_url,
      access_password_ciphertext: sealAccessValue(test.password, config.webhookSharedSecret),
      access_reply_ciphertext: sealAccessValue(test.reply, config.webhookSharedSecret),
      completed_at: new Date().toISOString(), error: null,
    }).eq('id', reservation.id);
    await supabase.from('prospects').update({ lifecycle_stage: 'test_sent' }).eq('id', prospect.id);
    await supabase.from('lead_events').insert({
      user_id: config.horizonsOwnerUserId, prospect_id: prospect.id, event_type: 'test_created',
      payload: { union_direct_test_event_id: reservation.id, package: test.package, expires_at: test.expires_at, ...selection },
    });
    await automationQueue.add('trial-follow-up', { trialEventId: reservation.id }, {
      delay: 60 * 60 * 1000,
      jobId: `trial-follow-up-${reservation.id}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    const responseTest = parsed.data.reuse_existing_checkout ? {
      package: test.package,
      expires_at: test.expires_at,
      payment_url: test.payment_url,
    } : test;
    return response.status(201).json({ accepted: true, test_event_id: reservation.id, test: responseTest });
  } catch (error) {
    await supabase.from('union_direct_test_events').update({
      status: 'failed', error: String(error.message || 'Falha CineHub').slice(0, 1000), completed_at: new Date().toISOString(),
    }).eq('id', reservation.id);
    console.error('Falha ao criar teste pela API direta do CineHub', error.message);
    if (error.message === 'CINEHUB_PHONE_ALREADY_TESTED') {
      return response.status(409).json({
        error: 'Este número já efetuou um teste em nosso servidor.',
        code: 'phone_already_tested',
      });
    }
    return response.status(502).json({ error: 'Não foi possível criar o teste no CineHub.' });
  }
};

app.post('/typebot/cinehub/tests', handleCinehubTest);
// Compatibilidade temporária com fluxos Typebot antigos, atualmente desativados.
app.post('/typebot/union/tests', handleCinehubTest);

app.post('/typebot/assisted-test-requests', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = assistedTestRequestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Solicitação de teste assistido inválida.' });
  const requesterPhone = normalizedPhone(parsed.data.requester_phone);
  const beneficiaryPhone = normalizedPhone(parsed.data.beneficiary_phone);
  if (requesterPhone === beneficiaryPhone) {
    return response.status(422).json({ error: 'Informe o telefone próprio da outra pessoa.' });
  }
  try {
    const payload = {
      user_id: config.horizonsOwnerUserId,
      request_key: parsed.data.request_key,
      session_key: parsed.data.session_key,
      requester_phone: requesterPhone,
      beneficiary_phone: beneficiaryPhone,
      beneficiary_name: parsed.data.beneficiary_name,
      server: 'kyros',
      duration_hours: 6,
      content: 'no_adults',
      status: 'pending',
      error: null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('assisted_test_requests').insert(payload)
      .select('id,status,beneficiary_name,beneficiary_phone,created_at').single();
    if (error?.code === '23505') {
      const { data: existing, error: existingError } = await supabase.from('assisted_test_requests')
        .select('id,status,beneficiary_name,beneficiary_phone,created_at')
        .eq('user_id', config.horizonsOwnerUserId).eq('request_key', parsed.data.request_key).single();
      if (existingError) throw existingError;
      return response.status(200).json({ request: existing, duplicate: true });
    }
    if (error) throw error;
    return response.status(201).json({ request: data });
  } catch (error) {
    console.error('Falha ao registrar solicitação de teste assistido', error.message);
    return response.status(500).json({ error: 'Não foi possível registrar a solicitação para revisão.' });
  }
});

app.post('/integrations/cinehub/assisted-tests', requireAuthenticatedUser, async (request, response) => {
  if (!cinehubDirectTestIsConfigured(config)) return response.status(503).json({ error: 'Teste direto CineHub ainda não está configurado.' });
  const parsed = assistedCinehubTestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Solicitação assistida inválida.', details: parsed.error.flatten() });
  const requesterPhone = normalizedPhone(parsed.data.requester_phone);
  const beneficiaryPhone = normalizedPhone(parsed.data.beneficiary_phone);
  if (requesterPhone === beneficiaryPhone) {
    return response.status(422).json({ error: 'Para o próprio telefone, use o fluxo normal. O teste assistido exige outro beneficiário.' });
  }
  try {
    const { data: pendingRequest, error: pendingRequestError } = await supabase.from('assisted_test_requests')
      .select('id,status,requester_phone,beneficiary_phone,beneficiary_name')
      .eq('id', parsed.data.request_id).eq('user_id', request.horizonsUser.id).maybeSingle();
    if (pendingRequestError) throw pendingRequestError;
    if (pendingRequest) {
      if (pendingRequest.status !== 'pending') return response.status(409).json({ error: 'Esta solicitação já foi revisada.' });
      if (normalizedPhone(pendingRequest.requester_phone) !== requesterPhone
        || normalizedPhone(pendingRequest.beneficiary_phone) !== beneficiaryPhone
        || pendingRequest.beneficiary_name.trim() !== parsed.data.beneficiary_name.trim()) {
        return response.status(409).json({ error: 'Os dados informados divergem da solicitação recebida pelo WhatsApp.' });
      }
    }
    const [beneficiaryCustomers, beneficiaryProspects] = await Promise.all([
      phoneMatches('customers', beneficiaryPhone, 'id'),
      phoneMatches('prospects', beneficiaryPhone, 'id,name,phone'),
    ]);
    if (beneficiaryCustomers.length) return response.status(409).json({ error: 'O beneficiário já possui cadastro de cliente.' });
    if (beneficiaryProspects.length > 1) return response.status(409).json({ error: 'O telefone do beneficiário possui cadastros duplicados.' });
    const { data: previousTrial, error: previousError } = await supabase.from('union_direct_test_events')
      .select('id').eq('user_id', request.horizonsUser.id).eq('phone', beneficiaryPhone)
      .eq('status', 'completed').limit(1).maybeSingle();
    if (previousError) throw previousError;
    if (previousTrial) return response.status(409).json({ error: 'O telefone do beneficiário já utilizou um teste.' });

    let prospect = beneficiaryProspects[0] || null;
    if (!prospect) {
      const { data, error } = await supabase.from('prospects').insert({
        user_id: request.horizonsUser.id,
        name: parsed.data.beneficiary_name,
        phone: beneficiaryPhone,
        source: 'assisted_test',
        lifecycle_stage: 'in_service',
        source_metadata: { assisted_request_id: parsed.data.request_id },
      }).select('id,name,phone').single();
      if (error) throw error;
      prospect = data;
    }

    const idempotencyKey = `assisted:${parsed.data.request_id}`;
    const { data: reservation, error: reservationError } = await supabase.from('union_direct_test_events').insert({
      user_id: request.horizonsUser.id,
      idempotency_key: idempotencyKey,
      phone: beneficiaryPhone,
      prospect_id: prospect.id,
      contact_name: parsed.data.beneficiary_name,
      status: 'processing',
      assisted: true,
      requested_by_phone: requesterPhone,
      created_by_user_id: request.horizonsUser.id,
    }).select('id').single();
    if (reservationError?.code === '23505') return response.status(409).json({ error: 'Esta solicitação assistida já foi processada.' });
    if (reservationError || !reservation) throw reservationError || new Error('Falha ao reservar teste assistido.');

    try {
      const selection = { server: parsed.data.server, duration_hours: parsed.data.duration_hours, content: parsed.data.content };
      const test = await createCinehubDirectTest(config, { phone: beneficiaryPhone, name: parsed.data.beneficiary_name }, selection);
      await supabase.from('union_direct_test_events').update({
        status: 'completed', external_username: test.username, package: test.package,
        dns: test.dns, expires_at: test.expires_at, payment_url: test.payment_url,
        access_password_ciphertext: sealAccessValue(test.password, config.webhookSharedSecret),
        access_reply_ciphertext: sealAccessValue(test.reply, config.webhookSharedSecret),
        completed_at: new Date().toISOString(), error: null,
      }).eq('id', reservation.id);
      await supabase.from('prospects').update({ lifecycle_stage: 'test_sent' }).eq('id', prospect.id);
      await supabase.from('lead_events').insert({
        user_id: request.horizonsUser.id, prospect_id: prospect.id, event_type: 'assisted_test_created',
        payload: { union_direct_test_event_id: reservation.id, request_id: parsed.data.request_id, ...selection },
      });
      if (pendingRequest) {
        await supabase.from('assisted_test_requests').update({
          status: 'completed', test_event_id: reservation.id, reviewed_by: request.horizonsUser.id,
          reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
        }).eq('id', pendingRequest.id).eq('user_id', request.horizonsUser.id).eq('status', 'pending');
      }
      return response.status(201).json({
        test_event_id: reservation.id,
        beneficiary: { prospect_id: prospect.id, name: parsed.data.beneficiary_name, phone: beneficiaryPhone },
        requester_phone: requesterPhone,
        test: {
          username: test.username, password: test.password, dns: test.dns, package: test.package,
          expires_at: test.expires_at, checkout_url: isUsableCinehubCheckoutUrl(test.payment_url) ? test.payment_url : null,
        },
      });
    } catch (error) {
      await supabase.from('union_direct_test_events').update({
        status: 'failed', error: String(error.message || 'Falha CineHub').slice(0, 1000), completed_at: new Date().toISOString(),
      }).eq('id', reservation.id);
      if (pendingRequest) {
        await supabase.from('assisted_test_requests').update({
          error: String(error.message || 'Falha CineHub').slice(0, 1000), updated_at: new Date().toISOString(),
        }).eq('id', pendingRequest.id).eq('user_id', request.horizonsUser.id);
      }
      throw error;
    }
  } catch (error) {
    console.error('Falha no teste assistido CineHub', error.message);
    return response.status(502).json({ error: 'Não foi possível criar o teste assistido no CineHub.' });
  }
});

app.post('/typebot/access/lookup', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotAccessLookupSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Consulta de acesso inválida.' });
  const { data: session, error: sessionError } = await supabase.from('typebot_conversation_sessions')
    .select('id,customer_id,identity_verified,identity_provider').eq('user_id', config.horizonsOwnerUserId)
    .eq('session_key', parsed.data.session_key).maybeSingle();
  if (sessionError) return response.status(500).json({ error: 'Não foi possível validar a conversa.' });
  if (!session?.identity_verified || !session.customer_id) {
    return response.status(403).json({ error: 'Confirme sua identidade pelo WhatsApp para consultar os dados de acesso.' });
  }
  const { data: accesses, error } = await supabase.from('customer_panel_targets')
    .select('id,external_username,external_plan,screens,dns,checkout_url,access_password_ciphertext,access_message_ciphertext,valid_until')
    .eq('user_id', config.horizonsOwnerUserId).eq('customer_id', session.customer_id).eq('active', true)
    .order('created_at', { ascending: true });
  if (error) return response.status(500).json({ error: 'Não foi possível consultar os acessos.' });
  const safeAccesses = (accesses || []).map((access) => ({
    id: access.id,
    username: access.external_username,
    password: openAccessValue(access.access_password_ciphertext, config.webhookSharedSecret),
    plan: access.external_plan,
    screens: access.screens,
    dns: access.dns,
    checkout_url: access.checkout_url,
    message: openAccessValue(access.access_message_ciphertext, config.webhookSharedSecret),
    valid_until: access.valid_until,
  }));
  return response.json({
    found: Boolean(safeAccesses.length),
    primary_access: safeAccesses[0] || null,
    accesses: safeAccesses,
  });
});

app.post('/typebot/customer-installation', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotCustomerInstallationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Consulta de instalação inválida.' });
  const { data: session, error: sessionError } = await supabase.from('typebot_conversation_sessions')
    .select('id,customer_id,identity_verified').eq('user_id', config.horizonsOwnerUserId)
    .eq('session_key', parsed.data.session_key).maybeSingle();
  if (sessionError) return response.status(500).json({ error: 'Não foi possível validar a conversa.' });
  if (!session?.identity_verified || !session.customer_id) {
    return response.status(403).json({ error: 'Confirme sua identidade pelo WhatsApp antes de consultar o acesso.' });
  }
  const { data: accesses, error: accessError } = await supabase.from('customer_panel_targets')
    .select('id,external_username,external_plan,screens,dns,access_password_ciphertext,access_message_ciphertext,valid_until,is_primary,created_at')
    .eq('user_id', config.horizonsOwnerUserId).eq('customer_id', session.customer_id).eq('active', true)
    .order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(10);
  if (accessError) return response.status(500).json({ error: 'Não foi possível consultar o acesso.' });
  const access = accesses?.[0];
  if (!access) return response.status(404).json({ error: 'Cliente sem acesso ativo cadastrado no Horizons.', code: 'access_not_registered' });
  const password = openAccessValue(access.access_password_ciphertext, config.webhookSharedSecret);
  const accessMessage = openAccessValue(access.access_message_ciphertext, config.webhookSharedSecret);
  if (!access.external_username || !password) {
    return response.status(409).json({ error: 'O acesso cadastrado não possui credenciais completas.', code: 'access_credentials_incomplete' });
  }
  const profile = extractCinehubDeliveryProfile(accessMessage);
  const device = { device_category: parsed.data.device_category, manufacturer: parsed.data.manufacturer || '' };
  const manufacturer = String(device.manufacturer).toLowerCase();
  const usesProviderCode = device.device_category === 'smart_tv'
    && (manufacturer.includes('samsung') || manufacturer.includes('lg'));
  const usesAndroidCodes = device.device_category === 'android_tv' || device.device_category === 'tv_box'
    || (device.device_category === 'mobile' && !/(apple|iphone|ios)/i.test(manufacturer));
  if (usesProviderCode && !profile.partner_provider_code) {
    return response.status(409).json({ error: 'O servidor deste acesso não possui código de provedor confirmado.', code: 'provider_code_missing' });
  }
  if (usesAndroidCodes && !profile.android_downloader_code && !profile.android_ntdown_code) {
    return response.status(409).json({ error: 'O servidor deste acesso não possui códigos Android confirmados.', code: 'android_codes_missing' });
  }
  if (!usesProviderCode && device.device_category !== 'console' && device.device_category !== 'other' && !access.dns) {
    return response.status(409).json({ error: 'O acesso não possui DNS confirmado para este aplicativo.', code: 'dns_missing' });
  }

  const { data: guides, error: guideError } = await supabase.from('installation_guides')
    .select('id,title,manufacturer,media_urls').eq('user_id', config.horizonsOwnerUserId)
    .eq('active', true).eq('device_category', device.device_category).limit(100);
  if (guideError) return response.status(500).json({ error: 'Não foi possível consultar as mídias de instalação.' });
  const wantedManufacturer = manufacturer;
  const guide = (guides || []).find((item) => {
    const candidates = String(item.manufacturer || '').toLowerCase().split(/\s*\/\s*/);
    return wantedManufacturer && candidates.includes(wantedManufacturer);
  }) || (guides || []).find((item) => !item.manufacturer) || null;
  const mediaUrls = Array.isArray(guide?.media_urls)
    ? guide.media_urls.filter((url) => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 4)
    : [];
  const instructions = testUsageInstructions(device, profile);
  const dnsLine = !usesProviderCode && access.dns ? `\nDNS: ${access.dns}` : '';
  return response.json({
    found: true,
    access_id: access.id,
    guide_title: guide?.title || null,
    media_urls: mediaUrls,
    message: `📲 INSTALAÇÃO EM OUTRO APARELHO\n\n${instructions}\n\n🔐 DADOS DO ACESSO\nUsuário: ${access.external_username}\nSenha: ${password}${dnsLine}\nPlano: ${access.external_plan || 'não informado'}\nValidade: ${access.valid_until || 'não informada'}\n\nSe aparecer qualquer erro, não altere o acesso: envie uma foto da tela ao suporte.`,
  });
});

app.post('/typebot/cinehub/checkout', async (request, response) => {
  if (!requireTypebotBridge(request, response)) return;
  const parsed = typebotCheckoutLookupSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Consulta de checkout inválida.' });
  const { data: session, error: sessionError } = await supabase.from('typebot_conversation_sessions')
    .select('id,phone,prospect_id,customer_id').eq('user_id', config.horizonsOwnerUserId)
    .eq('session_key', parsed.data.session_key).maybeSingle();
  if (sessionError) return response.status(500).json({ error: 'Não foi possível validar a conversa.' });
  if (!session) return response.status(404).json({ error: 'Conversa não encontrada.' });

  let trialsQuery = supabase.from('union_direct_test_events')
    .select('payment_url,package,expires_at').eq('user_id', config.horizonsOwnerUserId)
    .eq('status', 'completed').not('payment_url', 'is', null);
  const sessionPhone = normalizedPhone(session.phone);
  trialsQuery = session.prospect_id
    ? trialsQuery.or(`prospect_id.eq.${session.prospect_id},phone.eq.${sessionPhone}`)
    : trialsQuery.eq('phone', sessionPhone);
  const { data: trials, error: trialError } = await trialsQuery
    .order('created_at', { ascending: false }).limit(25);
  if (trialError) return response.status(500).json({ error: 'Não foi possível consultar o checkout do CineHub.' });
  const trial = trials?.find((candidate) => isUsableCinehubCheckoutUrl(candidate.payment_url)) || null;
  if (!isUsableCinehubCheckoutUrl(trial?.payment_url)) return response.status(404).json({
    error: 'Não encontramos um link de renovação do CineHub para este telefone.',
    code: 'checkout_not_found',
  });
  return response.json({
    found: true, checkout_url: trial.payment_url, source: 'cinehub_test_payment_url',
    test_package: trial.package || null, test_expires_at: trial.expires_at || null,
  });
});

app.get('/integrations/union/direct-tests', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('union_direct_test_events')
    .select('id,idempotency_key,phone,status,external_username,package,dns,expires_at,payment_url,error,created_at,completed_at')
    .eq('user_id', request.horizonsUser.id).order('created_at', { ascending: false }).limit(100);
  if (error) return response.status(500).json({ error: 'Não foi possível carregar os testes diretos do Union.' });
  return response.json({ configured: unionDirectTestIsConfigured(config), tests: data || [] });
});

// Customer server access routes moved to server/routes/customerServer.js
registerCustomerServerRoutes(app, { supabase, requireAuthenticatedUser, customerServerMigrationSchema, sealAccessValue, config, z });

// Configure respostas URL do BotBot para este callback. A primeira chamada é
// armazenada integralmente para homologar o formato real antes de qualquer
// encaminhamento automático ao Typebot ou operação no painel.
app.post('/webhooks/botbot', async (request, response) => {
  const supplied = request.get('x-horizons-bot-token') || request.query.token || '';
  if (!secretMatches(supplied, config.botbotWebhookToken)) return response.status(401).json({ error: 'Webhook BotBot não autorizado.' });
  if (!config.horizonsOwnerUserId) return response.status(503).json({ error: 'Proprietário do Horizons não configurado.' });
  const fields = botbotInboundFields(request.body || {});
  const status = fields.phone && fields.message ? 'received' : 'ignored';
  const { data, error } = await supabase.from('botbot_webhook_events').upsert({
    user_id: config.horizonsOwnerUserId,
    event_key: fields.eventKey,
    phone: fields.phone,
    message: fields.message,
    payload: request.body || {},
    status,
  }, { onConflict: 'user_id,event_key', ignoreDuplicates: true }).select('id,status').maybeSingle();
  if (error) {
    console.error('Falha ao registrar evento BotBot', error.message);
    return response.status(500).json({ error: 'Falha temporária ao registrar evento.' });
  }
  return response.status(202).json({ accepted: true, event_id: data?.id || null, status: data?.status || 'duplicate' });
});

async function processEvolutionReceipt(media) {
  const { data: duplicate } = await supabase.from('pix_receipts').select('id')
    .eq('user_id', config.horizonsOwnerUserId).eq('whatsapp_message_id', media.messageId).maybeSingle();
  if (duplicate) return;
  let { data: renewal } = await supabase.from('renewal_requests').select('id,user_id,customer_id,expected_amount')
    .eq('user_id', config.horizonsOwnerUserId).eq('phone', media.phone)
    .in('status', ['awaiting_payment', 'awaiting_receipt', 'receipt_received', 'awaiting_bank_review'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  let customerMatch = renewal?.customer_id ? 'existing_renewal' : 'unmatched';
  if (!renewal) {
    const customers = await phoneMatches('customers', media.phone, 'id,name,phone,value');
    const customer = customers.length === 1 ? customers[0] : null;
    customerMatch = customer ? 'unique_phone' : customers.length > 1 ? 'ambiguous_phone' : 'unmatched';
    const { data: created, error: renewalError } = await supabase.from('renewal_requests').insert({
      user_id: config.horizonsOwnerUserId, customer_id: customer?.id || null, phone: media.phone,
      expected_amount: customer?.value == null ? null : Number(customer.value), status: 'receipt_received',
      source: 'whatsapp_finance_unsolicited', source_idempotency_key: `finance-receipt:${media.messageId}`,
    }).select('id,user_id,customer_id,expected_amount').single();
    if (renewalError || !created) throw renewalError || new Error('Falha ao abrir ocorrência financeira.');
    renewal = created;
  }
  const mediaType = media.mimeType === 'application/pdf' ? 'pdf' : 'image';
  const { data: receipt, error } = await supabase.from('pix_receipts').insert({
    renewal_request_id: renewal.id, user_id: renewal.user_id, whatsapp_message_id: media.messageId,
    media_type: mediaType, media_reference: `evolution:${media.messageId}`, extraction_status: 'processing',
  }).select('id').single();
  if (error?.code === '23505') return;
  if (error || !receipt) throw error || new Error('Falha ao registrar mídia Evolution.');
  await supabase.from('renewal_requests').update({ status: 'receipt_received', updated_at: new Date().toISOString() }).eq('id', renewal.id);
  try {
    const base64 = await evolutionMediaBase64(media.message, media.instanceName);
    if (!base64) throw new Error('Evolution não retornou o conteúdo da mídia.');
    const extracted = await extractPixReceipt(await aiSettings.resolve(), { base64, mimeType: media.mimeType });
    const validation = validateReceipt(extracted, { amount: renewal.expected_amount });
    await supabase.from('pix_receipts').update({
      extraction_status: 'completed', extracted_data: {
        ...extracted,
        intake: { source: 'whatsapp_finance', customer_match: customerMatch, caption: media.caption },
      }, confidence: extracted.confidence,
      end_to_end_id: extracted.end_to_end_id, amount: extracted.amount, paid_at: extracted.paid_at,
      payer_name: extracted.payer_name, recipient_name: extracted.recipient_name, bank_name: extracted.bank_name,
      is_scheduled: extracted.is_scheduled, validation_flags: validation.flags,
    }).eq('id', receipt.id);
    await supabase.from('renewal_requests').update({ status: 'awaiting_bank_review', updated_at: new Date().toISOString() }).eq('id', renewal.id);
  } catch (error) {
    await supabase.from('pix_receipts').update({ extraction_status: 'failed', validation_flags: ['extraction_failed'] }).eq('id', receipt.id);
    await supabase.from('renewal_requests').update({ status: 'awaiting_bank_review', updated_at: new Date().toISOString() }).eq('id', renewal.id);
    console.error('Falha ao processar comprovante Evolution', error.message);
  }
}

// Rotas de leitura de pagamentos e renovações registradas por módulo.
registerPaymentReadRoutes(app, {
  supabase,
  config,
  requireAuthenticatedUser,
  efiIsConfigured,
  aiSettings,
  receiptExtractorIsConfigured,
  receiptExtractorModel,
});

/* operations routes moved to server/routes/operations.js */
/*
app.post('/operations/refresh', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.rpc('refresh_horizons_operations', { p_user_id: request.horizonsUser.id });
  if (error) return response.status(500).json({ error: error.message });
  return response.json(data || {});
});

app.get('/operations/overview', requireAuthenticatedUser, async (request, response) => {
  const userId = request.horizonsUser.id;
  const [tasks, reminders, imports, profiles, tutorials, legacyServers, cinehubServers, receipts] = await Promise.all([
    supabase.from('customer_contact_tasks').select('*,customers(id,name,phone)').eq('user_id', userId).eq('status', 'open').order('created_at'),
    supabase.from('billing_reminder_queue').select('*,customers(id,name,phone,value,due_day)').eq('user_id', userId).in('status', ['planned','approved','failed']).order('due_date'),
    supabase.from('customer_access_import_batches').select('id,filename,status,total_rows,ready_rows,blocked_rows,summary,completed_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    supabase.from('server_delivery_profiles').select('*,servers(name),cinehub_servers(name,code)').eq('user_id', userId).order('valid_until', { ascending: true, nullsFirst: false }),
    supabase.from('tutorial_media_slots').select('*').eq('user_id', userId).order('device_category').order('sort_order'),
    supabase.from('servers').select('id,name').eq('user_id', userId).order('name'),
    supabase.from('cinehub_servers').select('id,name,code').eq('user_id', userId).eq('active', true).order('name'),
    supabase.from('renewal_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'awaiting_bank_review'),
  ]);
  const failed = [tasks, reminders, imports, profiles, tutorials, legacyServers, cinehubServers, receipts].find((result) => result.error);
  if (failed) return response.status(500).json({ error: failed.error.message });
  const now = Date.now();
  const expiringProfiles = (profiles.data || []).filter((item) => item.valid_until && new Date(`${item.valid_until}T23:59:59`).getTime() <= now + 7 * 86400000);
  return response.json({
    tasks: tasks.data || [], reminders: reminders.data || [], imports: imports.data || [],
    profiles: profiles.data || [], tutorials: tutorials.data || [], expiring_profiles: expiringProfiles,
    servers: { legacy: legacyServers.data || [], cinehub: cinehubServers.data || [] },
    digest: { open_tasks: tasks.data?.length || 0, planned_reminders: reminders.data?.filter((item) => item.status === 'planned').length || 0,
      receipts_to_review: receipts.count || 0, expiring_codes: expiringProfiles.length },
  });
});

app.post('/operations/reminders/:id/decision', requireAuthenticatedUser, async (request, response) => {
  const decision = request.body?.decision;
  if (!['approved','cancelled'].includes(decision)) return response.status(400).json({ error: 'Decisão inválida.' });
  const changes = decision === 'approved'
    ? { status: 'approved', approved_by: request.horizonsUser.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: 'cancelled', updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('billing_reminder_queue').update(changes)
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).eq('status', 'planned').select('*').maybeSingle();
  if (error) return response.status(500).json({ error: error.message });
  if (!data) return response.status(409).json({ error: 'Lembrete já processado ou inexistente.' });
  return response.json({ reminder: data, sent: false, message: 'Decisão registrada. Nenhuma mensagem foi enviada.' });
});

app.post('/operations/tasks/:id/decision', requireAuthenticatedUser, async (request, response) => {
  const status = request.body?.status;
  if (!['resolved','ignored'].includes(status)) return response.status(400).json({ error: 'Estado inválido.' });
  const { data, error } = await supabase.from('customer_contact_tasks').update({ status, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).select('*').maybeSingle();
  if (error) return response.status(500).json({ error: error.message });
  return response.json({ task: data });
});

app.get('/operations/imports/:id/errors.csv', requireAuthenticatedUser, async (request, response) => {
  const { data, error } = await supabase.from('customer_access_import_items').select('row_number,validation_errors')
    .eq('batch_id', request.params.id).eq('user_id', request.horizonsUser.id).eq('validation_status', 'blocked').order('row_number');
  if (error) return response.status(500).json({ error: error.message });
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = ['linha;erros', ...(data || []).map((item) => `${item.row_number};${quote((item.validation_errors || []).join(' | '))}`)].join('\n');
  response.set('content-type', 'text/csv; charset=utf-8');
  response.set('content-disposition', `attachment; filename="erros-importacao-${request.params.id}.csv"`);
  return response.send(`\ufeff${csv}`);
});

app.post('/operations/delivery-profiles', requireAuthenticatedUser, async (request, response) => {
  const body = request.body || {};
  if (!String(body.app_name || '').trim() || (!body.legacy_server_id && !body.cinehub_server_id)) return response.status(400).json({ error: 'Informe servidor e aplicativo.' });
  const payload = { user_id: request.horizonsUser.id, legacy_server_id: body.legacy_server_id || null, cinehub_server_id: body.cinehub_server_id || null,
    app_name: String(body.app_name).trim(), device_category: body.device_category || 'android_tv', partner_code: body.partner_code || null,
    downloader_code: body.downloader_code || null, ntdown_code: body.ntdown_code || null, download_url: body.download_url || null,
    dns: body.dns || null, instructions: body.instructions || null, valid_from: body.valid_from || null, valid_until: body.valid_until || null,
    changed_by: request.horizonsUser.id };
  const { data, error } = await supabase.from('server_delivery_profiles').insert(payload).select('*').single();
  if (error) return response.status(500).json({ error: error.message });
  return response.status(201).json({ profile: data });
});

app.post('/operations/tutorial-slots', requireAuthenticatedUser, async (request, response) => {
  const body = request.body || {};
  if (!String(body.title || '').trim() || !String(body.device_category || '').trim()) return response.status(400).json({ error: 'Informe aparelho e título.' });
  const { data, error } = await supabase.from('tutorial_media_slots').insert({ user_id: request.horizonsUser.id,
    device_category: body.device_category, manufacturer: body.manufacturer || null, title: String(body.title).trim(),
    media_type: body.media_type || 'video', media_url: body.media_url || null, script_notes: body.script_notes || null,
    status: body.media_url ? 'published' : 'pending_recording', changed_by: request.horizonsUser.id }).select('*').single();
  if (error) return response.status(500).json({ error: error.message });
  return response.status(201).json({ tutorial: data });
});

*/

registerOperationsRoutes(app, { supabase, requireAuthenticatedUser });

/* renewal and receipt routes moved to server/routes/renewals.js */
/*
app.post('/renewals', requireAuthenticatedUser, async (request, response) => {
  const parsed = renewalRequestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Solicitação inválida.', details: parsed.error.flatten() });
  if (parsed.data.customer_id) {
    const { data: customer } = await supabase.from('customers').select('id').eq('id', parsed.data.customer_id)
      .eq('user_id', request.horizonsUser.id).maybeSingle();
    if (!customer) return response.status(404).json({ error: 'Cliente não encontrado.' });
  }
  const { data, error } = await supabase.from('renewal_requests').insert({
    ...parsed.data, user_id: request.horizonsUser.id, phone: parsed.data.phone.replace(/\D/g, ''), status: 'awaiting_receipt',
  }).select().single();
  if (error) return response.status(500).json({ error: 'Não foi possível abrir a renovação.' });
  return response.status(201).json({ renewal: data });
});

app.post('/renewals/:id/receipts', requireAuthenticatedUser, async (request, response) => {
  const parsed = receiptSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Comprovante inválido.', details: parsed.error.flatten() });
  const { data: renewal } = await supabase.from('renewal_requests').select('id,expected_amount,status')
    .eq('id', request.params.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (!renewal) return response.status(404).json({ error: 'Renovação não encontrada.' });
  const validation = validateReceipt(parsed.data, { amount: renewal.expected_amount });
  const { data, error } = await supabase.from('pix_receipts').insert({
    ...parsed.data, user_id: request.horizonsUser.id, renewal_request_id: renewal.id,
    extraction_status: 'completed', validation_flags: validation.flags,
  }).select().single();
  if (error?.code === '23505') return response.status(409).json({ error: 'Este comprovante/E2E já foi utilizado.' });
  if (error) return response.status(500).json({ error: 'Não foi possível registrar o comprovante.' });
  await supabase.from('renewal_requests').update({ status: 'awaiting_bank_review', updated_at: new Date().toISOString() }).eq('id', renewal.id);
  return response.status(201).json({ receipt: data, validation });
});

app.post('/renewals/:renewalId/receipts/:receiptId/review', requireAuthenticatedUser, async (request, response) => {
  const parsed = receiptReviewSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Decisão inválida.' });
  const { data: renewal } = await supabase.from('renewal_requests').select('id,customer_id,expected_amount')
    .eq('id', request.params.renewalId).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (!renewal) return response.status(404).json({ error: 'Renovação não encontrada.' });
  const { data: receipt } = await supabase.from('pix_receipts').select('id,end_to_end_id,amount,paid_at')
    .eq('id', request.params.receiptId).eq('renewal_request_id', renewal.id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (!receipt) return response.status(404).json({ error: 'Comprovante não encontrado.' });
  const now = new Date().toISOString();
  await supabase.from('pix_receipts').update({ review_status: parsed.data.decision, reviewed_by: request.horizonsUser.id, reviewed_at: now }).eq('id', receipt.id);
  if (parsed.data.decision !== 'confirmed') {
    const status = parsed.data.decision === 'rejected' ? 'rejected' : 'awaiting_receipt';
    await supabase.from('renewal_requests').update({ status, updated_at: now }).eq('id', renewal.id);
    return response.json({ accepted: true, status });
  }
  if (!renewal.customer_id) return response.status(422).json({ error: 'Vincule um cliente antes de confirmar o pagamento.' });
  const eventKey = receipt.end_to_end_id || `receipt:${receipt.id}`;
  const { data: event, error } = await supabase.from('payment_events').upsert({
    provider: 'manual_pix', provider_event_id: eventKey, external_payment_id: receipt.end_to_end_id,
    customer_id: renewal.customer_id, status: 'paid', amount: receipt.amount || renewal.expected_amount,
    paid_at: receipt.paid_at || now, payload: { receipt_id: receipt.id, human_confirmed: true },
  }, { onConflict: 'provider,provider_event_id', ignoreDuplicates: true }).select('id,customer_id').maybeSingle();
  if (error) return response.status(500).json({ error: 'Não foi possível confirmar o pagamento.' });
  if (event) await processPaidPayment(event, { customer_id: renewal.customer_id });
  await supabase.from('renewal_requests').update({ status: 'renewal_pending', confirmed_payment_event_id: event?.id || null, updated_at: now }).eq('id', renewal.id);
  return response.json({ accepted: true, status: 'renewal_pending' });
});

*/

registerRenewalRoutes(app, { supabase, requireAuthenticatedUser, renewalRequestSchema, receiptSchema, receiptReviewSchema, validateReceipt, processPaidPayment, config, sendTelegramMessage });

app.post('/payments/paggpay/pix', requireAuthenticatedUser, async (request, response) => {
  if (!paggpayIsConfigured(config)) return response.status(503).json({ error: 'PaggPay ainda não está configurada na VPS.' });
  const parsed = paggpayPixChargeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados da cobrança inválidos.', details: parsed.error.flatten() });
  const { data: customer, error: customerError } = await supabase.from('customers').select('id,name,phone,value')
    .eq('id', parsed.data.customer_id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (customerError || !customer) return response.status(404).json({ error: 'Cliente não encontrado.' });
  const amount = parsed.data.amount ?? Number(customer.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return response.status(400).json({ error: 'Informe um valor positivo para a cobrança.' });
  const phone = String(customer.phone || '').replace(/\D/g, '');
  if (phone.length < 8) return response.status(422).json({ error: 'O cliente precisa ter um telefone válido.' });
  const { data: renewal, error: renewalError } = await supabase.from('renewal_requests').insert({
    user_id: request.horizonsUser.id, customer_id: customer.id, phone,
    external_username: parsed.data.external_username || null, plan_name: parsed.data.plan_name || null,
    expected_amount: amount, status: 'awaiting_payment',
  }).select('id').single();
  if (renewalError || !renewal) return response.status(500).json({ error: 'Não foi possível abrir a renovação.' });
  try {
    const charge = normalizePaggpayTransaction(await createPaggpayClient(config).createPix({
      reference_id: renewal.id,
      value: Math.round(amount * 100),
      payer_name: customer.name,
      payer_phone: phone,
      payer_pays_fee: parsed.data.payer_pays_fee,
      description: parsed.data.description || `Mensalidade Horizons — ${customer.name}`,
    }));
    if (!charge.id || !charge.pixCode) throw new Error('PaggPay não retornou uma cobrança Pix completa.');
    const { error: paymentError } = await supabase.from('payment_events').insert({
      provider: 'paggpay', provider_event_id: charge.id, external_payment_id: charge.id,
      customer_id: customer.id, status: 'pending', amount, payload: charge.raw,
    });
    if (paymentError) throw new Error('Não foi possível registrar a cobrança PaggPay.');
    return response.status(201).json({
      renewal_id: renewal.id, transaction_id: charge.id, status: charge.status,
      amount, pix_copy_paste: charge.pixCode, qr_code: charge.qrCode, expires_at: charge.expiresAt,
    });
  } catch (error) {
    await supabase.from('renewal_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', renewal.id);
    console.error('Falha ao criar cobrança PaggPay', error.message);
    return response.status(502).json({ error: 'Não foi possível criar a cobrança na PaggPay.', detail: error.message });
  }
});

app.post('/typebot/renewals/paggpay', async (request, response) => {
  const supplied = request.get('x-horizons-bot-token') || '';
  if (!secretMatches(supplied, config.botbotWebhookToken)) return response.status(401).json({ error: 'Ponte Typebot não autorizada.' });
  if (!paggpayIsConfigured(config) || !config.horizonsOwnerUserId) {
    return response.status(503).json({ error: 'PaggPay ainda não está configurada para o Typebot.' });
  }
  const parsed = typebotPaggpayChargeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados da cobrança inválidos.', details: parsed.error.flatten() });
  const phone = parsed.data.phone.replace(/\D/g, '');
  const { data: customers, error: customersError } = await supabase.from('customers').select('id,name,phone,value')
    .eq('user_id', config.horizonsOwnerUserId).limit(2000);
  if (customersError) return response.status(500).json({ error: 'Não foi possível localizar o cliente.' });
  const matches = (customers || []).filter((customer) => String(customer.phone || '').replace(/\D/g, '') === phone);
  if (!matches.length) return response.status(404).json({ error: 'Cliente não encontrado para este telefone.' });
  if (matches.length > 1) return response.status(409).json({ error: 'Mais de um cliente possui este telefone; revise o cadastro.' });
  const customer = matches[0];
  const amount = parsed.data.amount ?? Number(customer.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return response.status(400).json({ error: 'Cliente sem valor mensal válido.' });
  const reservation = {
    user_id: config.horizonsOwnerUserId, customer_id: customer.id, phone,
    external_username: parsed.data.external_username || null, plan_name: parsed.data.plan_name || null,
    expected_amount: amount, status: 'awaiting_payment', source: 'typebot_paggpay',
    source_idempotency_key: parsed.data.idempotency_key,
  };
  const { data: renewal, error: renewalError } = await supabase.from('renewal_requests').insert(reservation).select('id').single();
  if (renewalError?.code === '23505') {
    const { data: existing } = await supabase.from('renewal_requests').select('id,customer_id,status')
      .eq('user_id', config.horizonsOwnerUserId).eq('source', 'typebot_paggpay')
      .eq('source_idempotency_key', parsed.data.idempotency_key).maybeSingle();
    if (!existing || existing.customer_id !== customer.id) return response.status(409).json({ error: 'Chave idempotente já utilizada.' });
    const { data: event } = await supabase.from('payment_events').select('provider_event_id,status,amount,payload')
      .eq('provider', 'paggpay').eq('customer_id', customer.id).eq('payload->pix->>reference_id', existing.id).maybeSingle();
    if (!event) return response.status(409).json({ error: 'Cobrança idempotente ainda está em processamento.' });
    return response.json({
      duplicate: true, renewal_id: existing.id, transaction_id: event.provider_event_id,
      status: event.status, amount: event.amount, pix_copy_paste: event.payload?.pix?.code || null,
      qr_code: event.payload?.pix?.qr_code || null, expires_at: event.payload?.pix?.expiration_date || null,
    });
  }
  if (renewalError || !renewal) return response.status(500).json({ error: 'Não foi possível reservar a renovação.' });
  try {
    const charge = normalizePaggpayTransaction(await createPaggpayClient(config).createPix({
      reference_id: renewal.id, value: Math.round(amount * 100), payer_name: customer.name,
      payer_phone: phone, payer_pays_fee: parsed.data.payer_pays_fee,
      description: parsed.data.description || `Mensalidade Horizons — ${customer.name}`,
    }));
    if (!charge.id || !charge.pixCode) throw new Error('PaggPay não retornou uma cobrança Pix completa.');
    const { error: eventError } = await supabase.from('payment_events').insert({
      provider: 'paggpay', provider_event_id: charge.id, external_payment_id: charge.id,
      customer_id: customer.id, status: 'pending', amount, payload: charge.raw,
    });
    if (eventError) throw eventError;
    return response.status(201).json({
      duplicate: false, renewal_id: renewal.id, transaction_id: charge.id, status: charge.status,
      amount, pix_copy_paste: charge.pixCode, qr_code: charge.qrCode, expires_at: charge.expiresAt,
    });
  } catch (error) {
    await supabase.from('renewal_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', renewal.id);
    console.error('Falha na cobrança PaggPay do Typebot', error.message);
    return response.status(502).json({ error: 'Não foi possível criar a cobrança PaggPay.' });
  }
});

app.post('/webhooks/paggpay', webhookGuard, async (request, response) => {
  const expectedToken = config.paggpayWebhookToken || '';
  const signed = expectedToken.startsWith('whsec_')
    && verifyPaggpayWebhookSignature(request.rawBody, request.get('x-paggpay-webhook-signature'), expectedToken);
  const legacyToken = !expectedToken.startsWith('whsec_') && secretMatches(String(request.query.token || ''), expectedToken);
  if (expectedToken && !signed && !legacyToken) {
    return response.status(401).json({ error: 'Callback PaggPay não autorizado.' });
  }
  const transactionId = paggpayWebhookTransactionId(request.body || {});
  if (!transactionId) return response.status(202).json({ accepted: true, status: 'ignored_missing_transaction_id' });
  try {
    // Even with a valid webhook signature, retrieve the authoritative record.
    const transaction = normalizePaggpayTransaction(await createPaggpayClient(config).getTransaction(transactionId));
    if (!transaction.id || transaction.id !== transactionId) {
      return response.status(202).json({ accepted: true, status: 'ignored_unmatched_transaction' });
    }
    // Checkouts created outside Horizons (including CineHub) use provider-side
    // references that are not UUIDs. Never pass those values to a Postgres UUID
    // comparison: fall through to the guarded phone + amount correlation below.
    let renewal = null;
    if (z.string().uuid().safeParse(transaction.referenceId).success) {
      const { data, error } = await supabase.from('renewal_requests')
        .select('id,customer_id,expected_amount,status').eq('id', transaction.referenceId).maybeSingle();
      if (error) throw error;
      renewal = data;
    }
    let checkoutOrder = null;
    let checkoutPhone = null;
    if (!renewal?.customer_id && transaction.payerPhone && transaction.amount !== null) {
      const phone = normalizedPhone(transaction.payerPhone);
      const { data: sessions, error: sessionsError } = await supabase.from('typebot_conversation_sessions')
        .select('id,phone').eq('user_id', config.horizonsOwnerUserId).order('created_at', { ascending: false }).limit(500);
      if (sessionsError) throw sessionsError;
      const sessionIds = (sessions || []).filter((session) => normalizedPhone(session.phone) === phone).map((session) => session.id);
      if (sessionIds.length) {
        const { data: candidates, error: candidatesError } = await supabase.from('sales_orders')
          .select('id,session_id,prospect_id,amount,status,purpose,union_direct_test_event_id').in('session_id', sessionIds)
          .eq('status', 'waiting_payment').gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
        if (candidatesError) throw candidatesError;
        const matches = (candidates || []).filter((order) => Math.abs(Number(order.amount) - transaction.amount) <= 0.009);
        if (matches.length === 1) {
          checkoutOrder = matches[0];
          checkoutPhone = phone;
        } else if (matches.length > 1) {
          return response.status(202).json({ accepted: true, status: 'manual_review_ambiguous_checkout' });
        }
      }
    }
    if (!renewal?.customer_id && !checkoutOrder) {
      return response.status(202).json({ accepted: true, status: 'ignored_unknown_reference' });
    }
    const expectedAmount = renewal?.customer_id ? Number(renewal.expected_amount) : Number(checkoutOrder.amount);
    if (transaction.amount === null || Math.abs(transaction.amount - expectedAmount) > 0.009) {
      console.error('Transação PaggPay com valor divergente', transaction.id);
      return response.status(202).json({ accepted: true, status: 'manual_review_amount_mismatch' });
    }
    const mappedStatus = transaction.status === 'succeeded' ? 'paid'
      : transaction.status === 'failed' ? 'failed'
        : transaction.status === 'refunded' ? 'refunded' : 'pending';
    const { data: existing, error: existingError } = await supabase.from('payment_events')
      .select('id,status,customer_id').eq('provider', 'paggpay').eq('provider_event_id', transaction.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'paid') return response.status(200).json({ accepted: true, status: 'duplicate' });
    const values = {
      provider: 'paggpay', provider_event_id: transaction.id, external_payment_id: transaction.endToEndId || transaction.id,
      customer_id: renewal?.customer_id || null, status: mappedStatus, amount: transaction.amount,
      paid_at: mappedStatus === 'paid' ? (transaction.paidAt || new Date().toISOString()) : null, payload: transaction.raw,
    };
    const query = existing
      ? supabase.from('payment_events').update(values).eq('id', existing.id)
      : supabase.from('payment_events').insert(values);
    const { data: event, error: eventError } = await query.select('id,status,customer_id').single();
    if (eventError) throw eventError;
    if (event.status === 'paid' && renewal?.customer_id) {
      await processPaidPayment(event, { customer_id: renewal.customer_id });
      await supabase.from('renewal_requests').update({
        status: 'renewal_pending', confirmed_payment_event_id: event.id, updated_at: new Date().toISOString(),
      }).eq('id', renewal.id);
    }
    if (checkoutOrder) {
      const orderStatus = event.status === 'paid' ? 'paid' : event.status === 'failed' ? 'cancelled' : 'waiting_payment';
      await supabase.from('sales_orders').update({
        status: orderStatus,
        metadata: { paggpay_transaction_id: transaction.id, payment_event_id: event.id },
        updated_at: new Date().toISOString(),
      }).eq('id', checkoutOrder.id);
      if (event.status === 'paid') {
        await supabase.from('prospects').update({ lifecycle_stage: 'converted' }).eq('id', checkoutOrder.prospect_id);
        let confirmationMessage = '✅ Pagamento confirmado! Recebemos seu pagamento com sucesso. Seu plano será ativado e você receberá a confirmação assim que o acesso estiver concluído.';
        if (checkoutOrder.purpose === 'new_subscription' && checkoutOrder.union_direct_test_event_id) {
          const { data: trial, error: trialError } = await supabase.from('union_direct_test_events')
            .select('external_username,dns,expires_at,access_password_ciphertext,access_reply_ciphertext')
            .eq('id', checkoutOrder.union_direct_test_event_id).eq('user_id', config.horizonsOwnerUserId).maybeSingle();
          if (trialError) throw trialError;
          if (trial?.external_username && trial?.access_password_ciphertext) {
            const { data: profile } = await supabase.from('lead_qualification_profiles')
              .select('device_category,device_brand').eq('user_id', config.horizonsOwnerUserId)
              .eq('prospect_id', checkoutOrder.prospect_id).maybeSingle();
            const brand = String(profile?.device_brand || '').toLowerCase();
            const deliveryProfile = extractCinehubDeliveryProfile(openAccessValue(trial.access_reply_ciphertext, config.webhookSharedSecret));
            let installation = '';
            if (brand === 'lg') {
              installation = deliveryProfile.partner_provider_code
                ? `Na TV LG, pressione Home, abra LG Content Store → Apps e instale Vizzion Play ou outro aplicativo compatível. Informe o código do provedor ${deliveryProfile.partner_provider_code}.`
                : 'Na TV LG, abra a LG Content Store e instale Vizzion Play. O código do provedor precisa ser revisado pelo suporte antes da configuração.';
            } else if (brand === 'samsung') {
              installation = deliveryProfile.partner_provider_code
                ? `Na TV Samsung, pressione Home ou Smart Hub, abra Apps e instale Vizzion Play ou outro aplicativo compatível. Informe o código do provedor ${deliveryProfile.partner_provider_code}.`
                : 'Na TV Samsung, abra Apps e instale Vizzion Play. O código do provedor precisa ser revisado pelo suporte antes da configuração.';
            } else if (profile?.device_category) {
              const { data: guide } = await supabase.from('installation_guides')
                .select('instructions').eq('user_id', config.horizonsOwnerUserId).eq('active', true)
                .eq('device_category', profile.device_category).limit(1).maybeSingle();
              installation = String(guide?.instructions || '').replace(/\[(?:USUÁRIO|SENHA)\]/gi, 'os dados enviados abaixo')
                .replace(/#{1,6}\s*/g, '').trim().slice(0, 1500);
            }
            const password = openAccessValue(trial.access_password_ciphertext, config.webhookSharedSecret);
            confirmationMessage = `✅ Pagamento confirmado!\n\n📲 INSTALAÇÃO\n${installation || 'Nossa equipe continuará por aqui para auxiliar na instalação do aplicativo.'}\n\n🔐 DADOS DO ACESSO\nUsuário: ${trial.external_username}\nSenha: ${password}\nDNS: ${trial.dns || 'não informado'}\n\nSe precisar de ajuda para instalar, responda MENU e escolha Suporte técnico.`;
          }
        }
        await sendEvolutionText(config, checkoutPhone, confirmationMessage);
      }
    }
    return response.status(200).json({ accepted: true, status: event.status });
  } catch (error) {
    console.error('Falha ao processar callback PaggPay', error.message);
    return response.status(500).json({ error: 'Falha temporária ao processar callback PaggPay.' });
  }
});

app.post('/payments/efi/pix', requireAuthenticatedUser, async (request, response) => {
  if (!efiIsConfigured(config)) return response.status(503).json({ error: 'Efí Pix ainda não está configurado na VPS.' });
  const parsed = efiPixChargeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados da cobrança inválidos.', details: parsed.error.flatten() });
  const { data: customer, error: customerError } = await supabase.from('customers').select('id,name,value')
    .eq('id', parsed.data.customer_id).eq('user_id', request.horizonsUser.id).maybeSingle();
  if (customerError || !customer) return response.status(404).json({ error: 'Cliente não encontrado.' });
  const amount = parsed.data.amount ?? Number(customer.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return response.status(400).json({ error: 'Informe um valor positivo para a cobrança.' });
  try {
    const charge = await createEfiPixClient(config).createImmediateCharge({
      amount, expiresIn: parsed.data.expires_in, description: parsed.data.description || `Mensalidade Horizons — ${customer.name}`,
    });
    if (!charge.txid || !charge.pixCopiaECola) throw new Error('Efí não retornou os dados completos da cobrança.');
    const { error: paymentError } = await supabase.from('payment_events').upsert({
      provider: 'efi', provider_event_id: `cob:${charge.txid}`, external_payment_id: charge.txid,
      customer_id: customer.id, status: 'pending', amount, payload: charge,
    }, { onConflict: 'provider,provider_event_id' });
    if (paymentError) throw new Error('Não foi possível registrar a cobrança Pix.');
    return response.status(201).json({ txid: charge.txid, status: charge.status, created_at: charge.calendario?.criacao,
      expires_in: charge.calendario?.expiracao,
      pix_copy_paste: charge.pixCopiaECola, location: charge.location || charge.loc?.location });
  } catch (error) {
    console.error('Falha ao criar cobrança Efí', error.message);
    return response.status(502).json({ error: 'Não foi possível criar a cobrança no Efí.', detail: error.message });
  }
});

app.post('/payments/efi/webhook/register', requireAuthenticatedUser, async (_, response) => {
  if (!efiIsConfigured(config)) return response.status(503).json({ error: 'Efí Pix ainda não está configurado na VPS.' });
  try {
    await createEfiPixClient(config).configureWebhook();
    return response.status(201).json({ registered: true, mode: 'skip-mtls' });
  } catch (error) {
    console.error('Falha ao cadastrar webhook Efí', error.message);
    return response.status(502).json({ error: 'Não foi possível cadastrar o webhook Efí.', detail: error.message });
  }
});

app.post('/webhooks/efi', webhookGuard, async (request, response) => {
  const supplied = String(request.query.token || '');
  const expected = config.efiWebhookToken || '';
  if (!expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return response.status(401).json({ error: 'Callback Efí não autorizado.' });
  }
  const received = Array.isArray(request.body?.pix) ? request.body.pix : [];
  try {
    for (const pix of received) {
      const txid = String(pix?.txid || '');
      const endToEndId = String(pix?.endToEndId || '');
      const amount = Number(pix?.valor);
      if (!txid || !endToEndId || !Number.isFinite(amount) || amount <= 0) continue;
      const { data: existing, error: existingError } = await supabase.from('payment_events')
        .select('id,customer_id').eq('provider', 'efi').eq('provider_event_id', `cob:${txid}`).maybeSingle();
      if (existingError || !existing?.customer_id) {
        console.error('Pix Efí sem cobrança Horizons correspondente', txid);
        continue;
      }
      const { data: event, error: eventError } = await supabase.from('payment_events').update({
        status: 'paid', amount, paid_at: pix.horario || new Date().toISOString(), external_payment_id: txid,
        payload: request.body,
      }).eq('id', existing.id).eq('status', 'pending').select('id,status,customer_id').maybeSingle();
      if (eventError) throw eventError;
      if (event) await processPaidPayment(event, { customer_id: existing.customer_id });
    }
    return response.status(200).send('200');
  } catch (error) {
    console.error('Falha ao processar callback Efí', error.message);
    return response.status(500).json({ error: 'Falha temporária ao processar callback Efí.' });
  }
});

/* payment webhook moved to server/routes/paymentWebhook.js */
/*
app.post('/webhooks/payments/:provider', async (request, response) => {
  const expected = crypto.createHmac('sha256', config.webhookSharedSecret).update(JSON.stringify(request.body)).digest('hex');
  const received = request.get('x-horizons-signature') || '';
  if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return response.status(401).json({ error: 'Assinatura inválida.' });
  }

  const parsed = paymentSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Payload inválido.', details: parsed.error.flatten() });

  const payment = parsed.data;
  const { data: event, error } = await supabase.from('payment_events').upsert({
    provider: request.params.provider,
    provider_event_id: payment.event_id,
    external_payment_id: payment.external_payment_id || null,
    customer_id: payment.customer_id || null,
    status: payment.status,
    amount: payment.amount || null,
    paid_at: payment.paid_at || null,
    payload: payment.raw || request.body,
  }, { onConflict: 'provider,provider_event_id', ignoreDuplicates: true }).select('id,status,customer_id').maybeSingle();

  if (error) {
    console.error('Falha ao registrar webhook de pagamento', error);
    return response.status(500).json({ error: 'Não foi possível registrar o pagamento.' });
  }
  if (event && payment.status === 'paid' && payment.customer_id) {
    const { data: customerOwner, error: customerOwnerError } = await supabase.from('customers')
      .select('user_id').eq('id', payment.customer_id).maybeSingle();
    if (customerOwnerError || !customerOwner?.user_id) {
      console.error('Cliente do pagamento não possui proprietário', customerOwnerError);
      return response.status(422).json({ error: 'Cliente não encontrado para o pagamento.' });
    }
    try {
      await processReferralFirstPayment(payment.customer_id, customerOwner.user_id);
    } catch (rewardError) {
      console.error('Falha ao processar benefícios de indicação', rewardError);
    }
    const { data: automationJob, error: jobError } = await supabase.from('automation_jobs').upsert({
      payment_event_id: event.id,
      customer_id: payment.customer_id,
      action: 'renew_customer',
    }, { onConflict: 'payment_event_id', ignoreDuplicates: true }).select('id').maybeSingle();
    if (jobError) {
      console.error('Falha ao registrar job de automação', jobError);
      return response.status(500).json({ error: 'Não foi possível registrar a renovação.' });
    }
    const { data: targets, error: targetsError } = await supabase.from('customer_panel_targets')
      .select('id,panel_connection_id,panel_connections(id,automation_mode,session_status,capabilities)')
      .eq('customer_id', payment.customer_id).eq('active', true);
    if (targetsError) {
      console.error('Falha ao localizar destinos do painel', targetsError);
      return response.status(500).json({ error: 'Não foi possível preparar as operações do painel.' });
    }
    if (!targets?.length) {
      await supabase.from('automation_jobs').update({ status: 'manual_review', last_error: 'Cliente sem tela vinculada a um painel.' }).eq('id', automationJob.id);
    }
    for (const target of targets || []) {
      const connection = target.panel_connections;
      const automatic = connection?.automation_mode === 'automatic'
        && connection?.session_status === 'connected'
        && connection?.capabilities?.renew === true;
      const { data: operation, error: operationError } = await supabase.from('panel_operations').upsert({
        user_id: customerOwner.user_id,
        payment_event_id: event.id,
        automation_job_id: automationJob.id,
        customer_id: payment.customer_id,
        customer_panel_target_id: target.id,
        panel_connection_id: target.panel_connection_id,
        action: 'renew_customer',
        status: automatic ? 'queued' : 'pending_approval',
        idempotency_key: `${event.id}:${target.id}:renew_customer`,
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id,status').maybeSingle();
      if (operationError) {
        console.error('Falha ao criar operação de painel', operationError);
        continue;
      }
      if (operation?.status === 'queued') await enqueueOperation(operation.id);
    }
  }
  return response.status(202).json({ accepted: true });
});
*/

registerPaymentWebhookRoute(app, {
  supabase,
  config,
  paymentSchema,
  processReferralFirstPayment,
  enqueueOperation,
  recordWebhookEvent,
});

app.listen(config.port, () => console.log(`Horizons API escutando na porta ${config.port}`));
