const normalize = (value) => String(value || '').trim();

export function validateReceipt(extracted, expected = {}) {
  const flags = [];
  const amount = Number(extracted.amount);
  const expectedAmount = Number(expected.amount);
  if (!Number.isFinite(amount) || amount <= 0) flags.push('amount_missing');
  else if (Number.isFinite(expectedAmount) && Math.abs(amount - expectedAmount) > 0.009) flags.push('amount_mismatch');
  if (!normalize(extracted.end_to_end_id)) flags.push('e2e_missing');
  if (!extracted.paid_at) flags.push('date_missing');
  if (extracted.is_scheduled === true) flags.push('scheduled_payment');
  if (expected.recipient_name && extracted.recipient_name
    && !normalize(extracted.recipient_name).toLocaleLowerCase('pt-BR').includes(normalize(expected.recipient_name).toLocaleLowerCase('pt-BR'))) {
    flags.push('recipient_mismatch');
  }
  const confidence = Number(extracted.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.75) flags.push('low_confidence');
  return { flags, eligibleForReview: !flags.includes('scheduled_payment') && !flags.includes('amount_missing') };
}
