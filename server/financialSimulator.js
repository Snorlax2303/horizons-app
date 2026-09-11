import { validateReceipt } from './receiptValidation.js';

export function financialScenarios() {
  return {
    paggpay_callback: {
      provider: 'paggpay', event_id: 'txn_simulado_0001', status: 'paid',
      customer_id: 'SUBSTITUA_POR_UUID', external_payment_id: 'txn_simulado_0001',
      amount: 39.9, paid_at: new Date().toISOString(),
    },
    efi_callback: {
      txid: 'simulado_efi_0001', status: 'CONCLUIDA', value: 3990,
      horario: new Date().toISOString(),
    },
    pix_receipt: {
      end_to_end_id: 'E0000000000000000000000000000000',
      amount: 39.9, paid_at: new Date().toISOString(), bank: 'Banco Simulado', payer_name: 'Cliente Simulado',
    },
    renewal_request: {
      phone: '16999990000', customer_id: 'SUBSTITUA_POR_UUID', expected_amount: 39.9,
    },
  };
}

export function validateReceiptScenario(receipt, expectedAmount) {
  return validateReceipt(receipt || {}, { amount: Number(expectedAmount) || null });
}
