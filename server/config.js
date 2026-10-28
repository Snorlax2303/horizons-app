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
    evolutionReceiptInstances: process.env.HORIZONS_RECEIPT_INSTANCES === undefined ? null : String(process.env.HORIZONS_RECEIPT_INSTANCES).split(',').map(value => value.trim()).filter(Boolean),
    evolutionFinanceInstance: process.env.EVOLUTION_FINANCE_INSTANCE || '',
    supportConversationCaptureEnabled: process.env.SUPPORT_CONVERSATION_CAPTURE_ENABLED === 'true',
    evolutionWebhookToken: process.env.EVOLUTION_WEBHOOK_TOKEN,
    // IA: OmniRoute (API compatível com OpenAI). A chave e os modelos podem ser
    // definidos pelo painel (/configuracoes); estas variáveis são só o padrão.
    omnirouteBaseUrl: process.env.OMNIROUTE_BASE_URL || 'http://host.docker.internal:20129/v1',
    omnirouteApiKey: process.env.OMNIROUTE_API_KEY,
    aiModelFast: process.env.AI_MODEL_FAST,
    aiModelSmart: process.env.AI_MODEL_SMART,
    aiModelVision: process.env.AI_MODEL_VISION,
    aiFallbackModels: String(process.env.AI_FALLBACK_MODELS || '').split(',').map((value) => value.trim()).filter(Boolean),
    aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),
    aiMaxTokens: Number(process.env.AI_MAX_TOKENS || 1200),
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
    supportPhone: process.env.N8N_SUPPORT_PHONE || process.env.TYPEBOT_SUPPORT_PHONE,
    // Legacy bridge alias; the active customer workflow is maintained in n8n.
    typebotSupportPhone: process.env.N8N_SUPPORT_PHONE || process.env.TYPEBOT_SUPPORT_PHONE,
    typebotFinancePhone: process.env.TYPEBOT_FINANCE_PHONE,
    typebotGeneralPhone: process.env.TYPEBOT_GENERAL_PHONE,
    paggpayEnvironment: process.env.PAGGPAY_ENVIRONMENT || 'sandbox',
    paggpayApiKey: process.env.PAGGPAY_API_KEY,
    paggpayWebhookToken: process.env.PAGGPAY_WEBHOOK_TOKEN,
    unionTestUrlDefault: process.env.UNION_TEST_URL_DEFAULT,
    cinehubTestEndpointsJson: process.env.CINEHUB_TEST_ENDPOINTS_JSON,
    wwpanelApiUrl: process.env.WWPANEL_API_URL || 'https://mcapi.knewcms.com:2087',
    wwpanelApiKey: process.env.WWPANEL_API_KEY,
    wwpanelWritesEnabled: process.env.WWPANEL_WRITES_ENABLED === 'true',
    wwpanelTestsEnabled: process.env.WWPANEL_TESTS_ENABLED === 'true',
    wwpanelCustomersEnabled: process.env.WWPANEL_CUSTOMERS_ENABLED === 'true',
    wwpanelRenewalsEnabled: process.env.WWPANEL_RENEWALS_ENABLED === 'true',
    wwpanelAppActivationEnabled: process.env.WWPANEL_APP_ACTIVATION_ENABLED === 'true',
    wwpanelPaymentWindowDays: Number(process.env.WWPANEL_PAYMENT_WINDOW_DAYS || 14) || 14,
    adminAssistantWritesEnabled: process.env.ADMIN_ASSISTANT_WRITES_ENABLED === 'true',
    adminAssistantWhatsappEnabled: process.env.ADMIN_ASSISTANT_WHATSAPP_ENABLED === 'true',
    adminAssistantAllowedPhones: String(process.env.ADMIN_ASSISTANT_ALLOWED_PHONES || '').split(',').map((value) => value.replace(/\D/g, '')).filter(Boolean),
    telegramAdminBotToken: process.env.TELEGRAM_ADMIN_BOT_TOKEN,
    telegramAdminWebhookSecret: process.env.TELEGRAM_ADMIN_WEBHOOK_SECRET,
    telegramAdminAllowedUserIds: String(process.env.TELEGRAM_ADMIN_ALLOWED_USER_IDS || '').split(',').map((value) => value.replace(/\D/g, '')).filter(Boolean),
    telegramAdminEnabled: process.env.TELEGRAM_ADMIN_ENABLED === 'true',
    horizonsOwnerUserId: process.env.HORIZONS_OWNER_USER_ID,
    horizonsWhatsappRenewalNumber: process.env.HORIZONS_WHATSAPP_RENEWAL_NUMBER,
    horizonsWhatsappRenewalEnabled: process.env.HORIZONS_WHATSAPP_RENEWAL_ENABLED === 'true',
    horizonsTelegramFinancialAlertsEnabled: process.env.HORIZONS_TELEGRAM_FINANCIAL_ALERTS_ENABLED === 'true',
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
