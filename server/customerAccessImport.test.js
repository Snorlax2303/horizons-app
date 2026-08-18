import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCustomerAccessFile } from './customerAccessImport.js';

test('parses Portuguese CSV headers and quoted values', async () => {
  const csv = Buffer.from('Nome;WhatsApp;Servidor;Usuário;Senha;Telas\n"Maria Silva";5516999999999;NOW;abc;123;2\n');
  const [row] = await parseCustomerAccessFile(csv, 'clientes.csv');
  assert.equal(row.name, 'Maria Silva');
  assert.equal(row.phone, '5516999999999');
  assert.equal(row.username, 'abc');
  assert.equal(row.row_number, 2);
});

test('rejects files without access credentials', async () => {
  const csv = Buffer.from('Nome;WhatsApp;Servidor\nMaria;5516999999999;NOW\n');
  await assert.rejects(() => parseCustomerAccessFile(csv, 'clientes.csv'), /Coluna obrigatória ausente/);
});

test('keeps decimal commas inside semicolon-separated CSV fields', async () => {
  const csv = Buffer.from('Nome;Telefone;Servidor;Usuario;Senha;Valor\nMaria;5516999999999;NOW;abc;123;35,00\n');
  const [row] = await parseCustomerAccessFile(csv, 'clientes.csv');
  assert.equal(row.value, '35,00');
});
