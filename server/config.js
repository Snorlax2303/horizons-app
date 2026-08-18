import 'dotenv/config';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REDIS_URL', 'WEBHOOK_SHARED_SECRET'];

export function getConfig() {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);

  const efiEnvironment = process.env.EFI_ENVIRONMENT || 'homologation';
  const efiPrefix = efiEnvironment === 'production' ? 'EFI_PRODUCTION' : 'EFI_HOMOLOGATION';

  return {
    port: Number(process.env.API_PORT || 8080),
    redisUrl: process.env.REDIS_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET,
    evolutionApiUrl: process.env.EVOLUTION_API_URL,
    evolutionApiKey: process.env.EVOLUTION_API_KEY,
    evolutionInstance: process.env.EVOLUTION_INSTANCE,
    evolutionSalesInstance: process.env.EVOLUTION_SALES_INSTANCE || process.env.N8N_EVOLUTION_INSTANCE || 'Horizons Typebot',
    evolutionSupportInstance: process.env.EVOLUTION_SUPPORT_INSTANCE || '',
    evolutionFinanceInstance: process.env.EVOLUTION_FINANCE_INSTANCE || '',
    supportConversationCaptureEnabled: process.env.SUPPORT_CONVERSATION_CAPTURE_ENABLED === 'true',
    evolutionWebhookToken: process.env.EVOLUTION_WEBHOOK_TOKEN,
    receiptAiApiKey: process.env.OPENAI_API_KEY,
    receiptAiModel: process.env.RECEIPT_AI_MODEL || 'gpt-4o-mini',
    botbotApiUrl: process.env.BOTBOT_API_URL || 'https://botbot.chat',
    botbotAuthKey: process.env.BOTBOT_AUTH_KEY,
    botbotAppKey: process.env.BOTBOT_APP_KEY,
    botbotWebhookToken: process.env.BOTBOT_WEBHOOK_TOKEN || process.env.WEBHOOK_SHARED_SECRET,
    typebotApiUrl: process.env.TYPEBOT_API_URL,
    typebotPublicId: process.env.TYPEBOT_PUBLIC_ID,
    typebotApiToken: process.env.TYPEBOT_API_TOKEN,
    typebotWorkspaceId: process.env.TYPEBOT_WORKSPACE_ID,
    typebotId: process.env.TYPEBOT_ID,
    typebotSalesPhone: process.env.TYPEBOT_SALES_PHONE,
    typebotSupportPhone: process.env.TYPEBOT_SUPPORT_PHONE,
    typebotFinancePhone: process.env.TYPEBOT_FINANCE_PHONE,
    typebotGeneralPhone: process.env.TYPEBOT_GENERAL_PHONE,
    paggpayEnvironment: process.env.PAGGPAY_ENVIRONMENT || 'sandbox',
    paggpayApiKey: process.env.PAGGPAY_API_KEY,
    paggpayWebhookToken: process.env.PAGGPAY_WEBHOOK_TOKEN,
    unionTestUrlDefault: process.env.UNION_TEST_URL_DEFAULT,
    cinehubTestEndpointsJson: process.env.CINEHUB_TEST_ENDPOINTS_JSON,
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    minimaxApiUrl: process.env.MINIMAX_API_URL || 'https://api.minimax.io/v1/chat/completions',
    minimaxPrimaryModel: process.env.MINIMAX_PRIMARY_MODEL || 'MiniMax-M2.7',
    minimaxFallbackEnabled: process.env.MINIMAX_FALLBACK_ENABLED === 'true',
    minimaxFallbackModel: process.env.MINIMAX_FALLBACK_MODEL || 'MiniMax-M3',
    minimaxVisionModel: process.env.MINIMAX_VISION_MODEL || 'MiniMax-M3',
    minimaxMaxCompletionTokens: Number(process.env.MINIMAX_MAX_COMPLETION_TOKENS || 1200),
    minimaxTemperature: Number(process.env.MINIMAX_TEMPERATURE || 0.2),
    minimaxTimeoutMs: Number(process.env.MINIMAX_TIMEOUT_MS || 45000),
    minimaxMaxRetries: Number(process.env.MINIMAX_MAX_RETRIES || 1),
    receiptAiProvider: process.env.RECEIPT_AI_PROVIDER || (process.env.MINIMAX_API_KEY ? 'minimax' : 'openai'),
    adminAssistantWritesEnabled: process.env.ADMIN_ASSISTANT_WRITES_ENABLED === 'true',
    adminAssistantWhatsappEnabled: process.env.ADMIN_ASSISTANT_WHATSAPP_ENABLED === 'true',
    adminAssistantAllowedPhones: String(process.env.ADMIN_ASSISTANT_ALLOWED_PHONES || '').split(',').map((value) => value.replace(/\D/g, '')).filter(Boolean),
    telegramAdminBotToken: process.env.TELEGRAM_ADMIN_BOT_TOKEN,
    telegramAdminWebhookSecret: process.env.TELEGRAM_ADMIN_WEBHOOK_SECRET,
    telegramAdminAllowedUserIds: String(process.env.TELEGRAM_ADMIN_ALLOWED_USER_IDS || '').split(',').map((value) => value.replace(/\D/g, '')).filter(Boolean),
    telegramAdminEnabled: process.env.TELEGRAM_ADMIN_ENABLED === 'true',
    horizonsOwnerUserId: process.env.HORIZONS_OWNER_USER_ID,
    panelBrowserBridgeUrl: process.env.PANEL_BROWSER_BRIDGE_URL,
    panelBrowserBridgeToken: process.env.PANEL_BROWSER_BRIDGE_TOKEN,
    efiEnvironment,
    // Namespaced variables allow both Efí environments to remain configured;
    // the legacy EFI_* names are retained only for backwards compatibility.
    efiClientId: process.env[`${efiPrefix}_CLIENT_ID`] || process.env.EFI_CLIENT_ID,
    efiClientSecret: process.env[`${efiPrefix}_CLIENT_SECRET`] || process.env.EFI_CLIENT_SECRET,
    efiPixKey: process.env[`${efiPrefix}_PIX_KEY`] || process.env.EFI_PIX_KEY,
    efiCertPath: process.env[`${efiPrefix}_CERT_PATH`] || process.env.EFI_CERT_PATH,
    efiWebhookToken: process.env.EFI_WEBHOOK_TOKEN,
    efiWebhookUrl: process.env.EFI_WEBHOOK_URL,
  };
}
