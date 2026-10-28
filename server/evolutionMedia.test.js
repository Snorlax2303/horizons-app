import test from 'node:test';
import assert from 'node:assert/strict';
import { evolutionInboundMedia, looksLikeGroupPhone, receiptRejectionReason } from './evolutionMedia.js';

const config = { evolutionFinanceInstance: '', evolutionSalesInstance: 'Horizons Typebot' };
const body = (key, instance = 'Horizons Typebot') => ({
  instance, data: { key: { id: 'MSG1', ...key }, message: { imageMessage: { mimetype: 'image/jpeg', caption: 'pix' } } },
});

test('aceita imagem de conversa privada na instância de comprovantes', () => {
  const media = evolutionInboundMedia(body({ remoteJid: '5516999999999@s.whatsapp.net' }));
  assert.equal(media.phone, '5516999999999');
  assert.equal(receiptRejectionReason(media, config), null);
});

test('recusa grupo, status, mensagem própria e outra instância', () => {
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body({ remoteJid: '120363000000000000@g.us' })), config), 'not_private_chat');
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body({ remoteJid: 'status@broadcast' })), config), 'not_private_chat');
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body({ remoteJid: '5516999999999@s.whatsapp.net', fromMe: true })), config), 'from_me');
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body({ remoteJid: '5516999999999@s.whatsapp.net' }, 'Meu numero')), config), 'instance_not_allowed');
});

test('sem instância de comprovantes configurada, nada vira comprovante (fecha por padrão)', () => {
  const media = evolutionInboundMedia(body({ remoteJid: '5516999999999@s.whatsapp.net' }, 'Meu numero'));
  assert.equal(receiptRejectionReason(media, { evolutionFinanceInstance: '', evolutionSalesInstance: '' }), 'no_receipt_instance_configured');
});

test('identifica id de grupo pelo tamanho', () => {
  assert.equal(looksLikeGroupPhone('120363025246125486'), true);
  assert.equal(looksLikeGroupPhone('5516999999999'), false);
});


test('lista explícita restringe comprovantes ao Financeiro sem liberar vendas', () => {
  const exclusive = { ...config, evolutionFinanceInstance: 'Financeiro', evolutionReceiptInstances: ['Financeiro'] };
  const key = { remoteJid: '5516999999999@s.whatsapp.net' };
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body(key, 'Financeiro')), exclusive), null);
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body(key)), exclusive), 'instance_not_allowed');
  assert.equal(receiptRejectionReason(evolutionInboundMedia(body(key, 'Financeiro')), { ...exclusive, evolutionReceiptInstances: [] }), 'no_receipt_instance_configured');
});
