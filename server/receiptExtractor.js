import { aiIsConfigured, chatCompletion, extractJsonObject, modelChain, withModelFallback } from './llm.js';

const prompt = 'Extraia somente dados visíveis deste comprovante Pix. Não invente campos. Responda somente JSON com amount, paid_at, payer_name, recipient_name, bank_name, end_to_end_id, is_scheduled e confidence. Use null quando ausente. amount é número em reais (ex.: 30.5). paid_at deve ser ISO 8601 quando houver data e hora. Marque is_scheduled=true se for agendamento, lançamento futuro ou não concluído. confidence vai de 0 a 1.';

function parseStructuredOutput(value) {
  const nullableString = (field) => value[field] == null ? null : String(value[field]).trim() || null;
  const amount = value.amount == null ? null : Number(value.amount);
  const confidence = Number(value.confidence);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw new Error('Valor extraído inválido.');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Confiança extraída inválida.');
  if (value.is_scheduled != null && typeof value.is_scheduled !== 'boolean') throw new Error('Agendamento extraído inválido.');
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

export function receiptExtractorIsConfigured(ai) {
  return aiIsConfigured(ai, 'vision');
}

export function receiptExtractorModel(ai) {
  return modelChain(ai, 'vision')[0] || null;
}

function mediaPart({ base64, mimeType }) {
  if (/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
    return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } };
  }
  if (mimeType === 'application/pdf') {
    return { type: 'file', file: { filename: 'comprovante.pdf', file_data: `data:${mimeType};base64,${base64}` } };
  }
  throw new Error('Formato não suportado pelo leitor.');
}

// Lê o comprovante com o perfil `vision` do OmniRoute; tenta o próximo modelo
// quando a resposta falha ou não passa na validação. Devolve também o modelo.
export async function extractPixReceipt(ai, { base64, mimeType }, options = {}) {
  if (!receiptExtractorIsConfigured(ai)) throw new Error('Leitor visual (OmniRoute) não configurado.');
  const part = mediaPart({ base64, mimeType });
  const result = await withModelFallback(ai, 'vision', async (model) => {
    const content = await chatCompletion(ai, {
      model, maxTokens: 600, fetchImpl: options.fetchImpl,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, part] }],
    });
    return parseStructuredOutput(extractJsonObject(content));
  });
  return { ...result.value, model: result.model };
}
