const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    amount: { type: ['number', 'null'] }, paid_at: { type: ['string', 'null'] },
    payer_name: { type: ['string', 'null'] }, recipient_name: { type: ['string', 'null'] },
    bank_name: { type: ['string', 'null'] }, end_to_end_id: { type: ['string', 'null'] },
    is_scheduled: { type: ['boolean', 'null'] }, confidence: { type: 'number', minimum: 0, maximum: 1 },
  }, required: ['amount','paid_at','payer_name','recipient_name','bank_name','end_to_end_id','is_scheduled','confidence'],
};

const prompt = 'Extraia somente dados visíveis deste comprovante Pix. Não invente campos. Responda somente JSON com amount, paid_at, payer_name, recipient_name, bank_name, end_to_end_id, is_scheduled e confidence. Use null quando ausente. paid_at deve ser ISO 8601 quando houver data e hora. Marque is_scheduled=true se for agendamento, lançamento futuro ou não concluído.';

function parseStructuredOutput(content) {
  if (typeof content !== 'string') throw new Error('Leitor visual não retornou texto.');
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Leitor visual não retornou JSON.');
  const value = JSON.parse(content.slice(start, end + 1));
  const nullableString = (field) => value[field] == null ? null : String(value[field]).trim() || null;
  const amount = value.amount == null ? null : Number(value.amount);
  const confidence = Number(value.confidence);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw new Error('Valor extraído inválido.');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Confiança extraída inválida.');
  if (value.is_scheduled !== null && typeof value.is_scheduled !== 'boolean') throw new Error('Agendamento extraído inválido.');
  return {
    amount,
    paid_at: nullableString('paid_at'),
    payer_name: nullableString('payer_name'),
    recipient_name: nullableString('recipient_name'),
    bank_name: nullableString('bank_name'),
    end_to_end_id: nullableString('end_to_end_id'),
    is_scheduled: value.is_scheduled ?? null,
    confidence,
  };
}

export function receiptExtractorIsConfigured(config) {
  return Boolean(config.minimaxApiKey || config.receiptAiApiKey);
}

export function receiptExtractorModel(config) {
  if (config.receiptAiProvider === 'minimax' && config.minimaxApiKey) return config.minimaxVisionModel;
  return config.receiptAiModel;
}

async function extractWithMiniMax(config, { base64, mimeType, fetchImpl }) {
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    throw new Error('MiniMax Vision requer comprovante em imagem JPEG, PNG ou WebP.');
  }
  const result = await fetchImpl(config.minimaxApiUrl, {
    method: 'POST', signal: AbortSignal.timeout(config.minimaxTimeoutMs || 45_000),
    headers: { authorization: `Bearer ${config.minimaxApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.minimaxVisionModel || 'MiniMax-M3',
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
      ] }],
      max_completion_tokens: 600,
      temperature: 0.1,
    }),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload?.error?.message || payload?.base_resp?.status_msg || `MiniMax Vision respondeu ${result.status}`);
  return parseStructuredOutput(payload.choices?.[0]?.message?.content);
}

async function extractWithOpenAi(config, { base64, mimeType, fetchImpl }) {
  if (!config.receiptAiApiKey) throw new Error('Fallback visual para este formato não configurado.');
  const isImage = /^image\/(jpeg|png|webp)$/.test(mimeType);
  const isPdf = mimeType === 'application/pdf';
  if (!isImage && !isPdf) throw new Error('Formato não suportado pelo leitor.');
  const mediaContent = isImage
    ? { type: 'input_image', image_url: `data:${mimeType};base64,${base64}`, detail: 'high' }
    : { type: 'input_file', filename: 'comprovante.pdf', file_data: `data:${mimeType};base64,${base64}` };
  const result = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { authorization: `Bearer ${config.receiptAiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.receiptAiModel,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: prompt },
        mediaContent,
      ] }],
      text: { format: { type: 'json_schema', name: 'pix_receipt', strict: true, schema } },
      max_output_tokens: 600,
    }),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload?.error?.message || `Leitor visual respondeu ${result.status}`);
  const output = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  return parseStructuredOutput(output);
}

export async function extractPixReceipt(config, { base64, mimeType }, options = {}) {
  if (!receiptExtractorIsConfigured(config)) throw new Error('Leitor visual não configurado.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (config.receiptAiProvider === 'minimax' && config.minimaxApiKey && mimeType !== 'application/pdf') {
    return extractWithMiniMax(config, { base64, mimeType, fetchImpl });
  }
  return extractWithOpenAi(config, { base64, mimeType, fetchImpl });
}
