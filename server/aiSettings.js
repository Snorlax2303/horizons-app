// Configuração da IA (OmniRoute) editável pelo painel. A chave fica cifrada
// (AES-256-GCM, mesmo cofre dos acessos) na tabela `integration_settings`;
// o navegador nunca recebe a chave de volta, só os 4 últimos caracteres.
import { openAccessValue, sealAccessValue } from './accessVault.js';

export const AI_SETTINGS_KEY = 'ai_omniroute';
const TABLE = 'integration_settings';

function cleanModel(value) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 160) : null;
}

function envSettings(config) {
  return {
    baseUrl: config.omnirouteBaseUrl || null,
    apiKey: config.omnirouteApiKey || null,
    models: { fast: cleanModel(config.aiModelFast), smart: cleanModel(config.aiModelSmart), vision: cleanModel(config.aiModelVision) },
    fallbackModels: (config.aiFallbackModels || []).map(cleanModel).filter(Boolean),
  };
}

export function keyHint(apiKey) {
  if (!apiKey) return null;
  const value = String(apiKey);
  return value.length <= 8 ? '••••' : `••••${value.slice(-4)}`;
}

export function createAiSettingsStore({ supabase, config, ttlMs = 30_000, now = () => Date.now() }) {
  let cache = null;
  let cachedAt = 0;

  async function loadRow() {
    const { data, error } = await supabase.from(TABLE)
      .select('key,value,secret_ciphertext,updated_at,updated_by').eq('key', AI_SETTINGS_KEY).maybeSingle();
    if (error) {
      // Tabela ainda não criada: segue só com as variáveis de ambiente.
      if (error.code === '42P01' || error.code === 'PGRST205') return null;
      throw error;
    }
    return data || null;
  }

  async function resolve({ fresh = false } = {}) {
    if (!fresh && cache && now() - cachedAt < ttlMs) return cache;
    const env = envSettings(config);
    const row = await loadRow();
    const stored = row?.value || {};
    let storedKey = null;
    if (row?.secret_ciphertext) {
      try { storedKey = openAccessValue(row.secret_ciphertext, config.webhookSharedSecret); } catch { storedKey = null; }
    }
    const models = {
      fast: cleanModel(stored.models?.fast) || env.models.fast,
      smart: cleanModel(stored.models?.smart) || env.models.smart,
      vision: cleanModel(stored.models?.vision) || env.models.vision,
    };
    cache = {
      source: storedKey ? 'panel' : env.apiKey ? 'env' : 'none',
      baseUrl: stored.base_url || env.baseUrl,
      apiKey: storedKey || env.apiKey,
      models,
      fallbackModels: Array.isArray(stored.fallback_models) ? stored.fallback_models.map(cleanModel).filter(Boolean) : env.fallbackModels,
      timeoutMs: config.aiTimeoutMs || 45_000,
      maxTokens: config.aiMaxTokens || 1200,
      temperature: null,
      updatedAt: row?.updated_at || null,
    };
    cachedAt = now();
    return cache;
  }

  async function publicView() {
    const ai = await resolve({ fresh: true });
    return {
      provider: 'omniroute',
      source: ai.source,
      configured: Boolean(ai.apiKey && ai.baseUrl && (ai.models.fast || ai.models.smart || ai.models.vision)),
      has_key: Boolean(ai.apiKey),
      key_hint: keyHint(ai.apiKey),
      base_url: ai.baseUrl,
      models: ai.models,
      fallback_models: ai.fallbackModels,
      updated_at: ai.updatedAt,
    };
  }

  async function save({ baseUrl, apiKey, clearKey = false, models, fallbackModels }, userId) {
    const row = await loadRow();
    const current = row?.value || {};
    const value = {
      base_url: baseUrl ?? current.base_url ?? null,
      models: {
        fast: cleanModel(models?.fast ?? current.models?.fast),
        smart: cleanModel(models?.smart ?? current.models?.smart),
        vision: cleanModel(models?.vision ?? current.models?.vision),
      },
      fallback_models: (fallbackModels ?? current.fallback_models ?? []).map(cleanModel).filter(Boolean).slice(0, 5),
    };
    let secretCiphertext = row?.secret_ciphertext || null;
    if (clearKey) secretCiphertext = null;
    else if (apiKey) secretCiphertext = sealAccessValue(apiKey, config.webhookSharedSecret);
    const { error } = await supabase.from(TABLE).upsert({
      key: AI_SETTINGS_KEY, value, secret_ciphertext: secretCiphertext,
      updated_by: userId || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) throw error;
    invalidate();
    return publicView();
  }

  function invalidate() { cache = null; cachedAt = 0; }

  return { resolve, publicView, save, invalidate };
}
