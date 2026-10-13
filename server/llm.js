// Cliente único de IA do Horizons. Fala com o OmniRoute (API compatível com
// OpenAI) e aplica a cadeia de fallback entre modelos (ex.: Claude ↔ GPT).
// Nunca registra conteúdo de prompt/resposta em log: só modelo, tarefa e erro.

export const AI_PROFILES = ['fast', 'smart', 'vision'];

export function aiIsConfigured(ai, profile) {
  if (!ai?.apiKey || !ai?.baseUrl) return false;
  return modelChain(ai, profile).length > 0;
}

export function modelChain(ai, profile = 'smart') {
  const models = ai?.models || {};
  const primary = models[profile] || (profile === 'vision' ? null : models.smart || models.fast);
  const chain = [primary, ...(Array.isArray(ai?.fallbackModels) ? ai.fallbackModels : [])]
    .map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(chain)];
}

function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}${path}`;
}

export function stripReasoning(content) {
  return String(content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Extrai o primeiro objeto JSON completo do texto (ignora markdown e texto extra).
export function extractJsonObject(content) {
  if (typeof content !== 'string') throw new Error('Modelo não retornou texto.');
  const text = stripReasoning(content);
  const start = text.indexOf('{');
  if (start < 0) throw new Error('Modelo não retornou JSON.');
  let depth = 0; let quoted = false; let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error('Modelo retornou JSON incompleto.');
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  return null;
}

export async function chatCompletion(ai, { model, messages, maxTokens, temperature, fetchImpl = globalThis.fetch }) {
  const body = { model, messages, stream: false, max_tokens: maxTokens || ai.maxTokens || 1200 };
  // Modelos de raciocínio (GPT-5/Codex) rejeitam temperature != 1; só envia quando pedido.
  const effectiveTemperature = temperature ?? ai.temperature;
  if (effectiveTemperature !== null && effectiveTemperature !== undefined) body.temperature = effectiveTemperature;
  const response = await fetchImpl(endpoint(ai.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { authorization: `Bearer ${ai.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ai.timeoutMs || 45_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`IA ${model} respondeu ${response.status}${payload?.error?.message ? `: ${String(payload.error.message).slice(0, 160)}` : ''}.`);
    error.statusCode = response.status;
    throw error;
  }
  const text = messageText(payload.choices?.[0]?.message);
  if (typeof text !== 'string' || !text.trim()) throw new Error(`IA ${model} não retornou texto.`);
  return text;
}

// Executa `attempt(model)` em cada modelo da cadeia até um funcionar.
// Erro de validação (JSON inválido, schema) também aciona o próximo modelo.
export async function withModelFallback(ai, profile, attempt) {
  const chain = modelChain(ai, profile);
  if (!ai?.apiKey || !ai?.baseUrl || chain.length === 0) throw new Error('IA (OmniRoute) não configurada.');
  const failures = [];
  for (const [index, model] of chain.entries()) {
    try {
      const value = await attempt(model);
      return { model, fallback_used: index > 0, value };
    } catch (error) {
      failures.push(`${model}: ${error.message}`);
      if (error.statusCode === 401 || error.statusCode === 403) break; // chave inválida: não adianta trocar de modelo
    }
  }
  const error = new Error(`Nenhum modelo de IA respondeu. ${failures.join(' | ')}`.slice(0, 600));
  error.failures = failures;
  throw error;
}

export async function chatJson(ai, { profile, messages, maxTokens, temperature, parse, fetchImpl }) {
  return withModelFallback(ai, profile, async (model) => {
    const content = await chatCompletion(ai, { model, messages, maxTokens, temperature, fetchImpl });
    const json = extractJsonObject(content);
    return parse ? parse(json) : json;
  });
}

export async function listModels({ baseUrl, apiKey, timeoutMs = 15_000, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(endpoint(baseUrl, '/models'), {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403
      ? 'Chave recusada pelo OmniRoute.'
      : `OmniRoute respondeu ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return [...new Set(items.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean))].sort();
}
