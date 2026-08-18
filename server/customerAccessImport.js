const aliases = {
  name: ['nome', 'cliente', 'nome_cliente'], phone: ['telefone', 'whatsapp', 'celular', 'fone'],
  server: ['servidor', 'server', 'painel'], username: ['usuario', 'user', 'login', 'usuario_acesso'],
  password: ['senha', 'password'], plan: ['plano', 'pacote', 'plan'], screens: ['telas', 'conexoes', 'conexoes_simultaneas'],
  value: ['valor', 'mensalidade', 'preco'], due_day: ['vencimento_dia', 'dia_vencimento'],
  valid_until: ['validade', 'vencimento', 'vence_em', 'data_vencimento'], dns: ['dns', 'url', 'host'],
  checkout_url: ['checkout', 'link_pagamento', 'checkout_url'], access_message: ['orientacoes', 'mensagem', 'resposta_servidor'],
};

const key = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const aliasMap = new Map(Object.entries(aliases).flatMap(([field, values]) => values.map((value) => [value, field])));

function csvRows(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((values) => values.some((value) => String(value).trim()));
}

export async function parseCustomerAccessFile(buffer, filename = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Arquivo vazio ou maior que 5 MB.');
  if (!/\.csv$/i.test(filename)) throw new Error('Envie um arquivo .csv em UTF-8. No Excel, use Salvar como CSV UTF-8.');
  const matrix = csvRows(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (matrix.length < 2) throw new Error('A planilha precisa ter cabeçalho e ao menos uma linha.');
  if (matrix.length > 1001) throw new Error('O limite é de 1.000 clientes por arquivo.');
  const headers = matrix[0].map((value) => aliasMap.get(key(value)) || null);
  for (const required of ['name', 'phone', 'server', 'username', 'password']) {
    if (!headers.includes(required)) throw new Error(`Coluna obrigatória ausente: ${required}.`);
  }
  return matrix.slice(1).map((values, index) => Object.fromEntries(headers
    .map((header, column) => header ? [header, String(values[column] ?? '').trim()] : null).filter(Boolean)
    .concat([['row_number', index + 2]])));
}

export const normalizeImportText = key;
