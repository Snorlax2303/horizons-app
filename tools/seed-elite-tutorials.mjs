// Seed idempotente de tutorial slots padrão (smart_tv e android_tv)
// vinculados ao apps do Elite IPTV. Não cria nada se já existir.

import fs from 'node:fs';
import dotenv from 'dotenv/config';

const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const owner = process.env.HORIZONS_OWNER_USER_ID;
if (!ref || !key || !owner) { console.error('env faltando'); process.exit(1); }
const base = `${process.env.SUPABASE_URL}/rest/v1`;
const headers = { apikey: key, authorization: `Bearer ${key}` };
async function rpc(method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, 'content-type': 'application/json', Prefer: method === 'POST' ? 'return=minimal' : 'count=exact' }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

const elite = (await rpc('GET', `/cinehub_servers?user_id=eq.${owner}&code=eq.elite&select=id&limit=1`))[0];
if (!elite) { console.error('Servidor Elite IPTV ausente.'); process.exit(2); }

const apps = (await rpc('GET', `/server_delivery_profiles?user_id=eq.${owner}&cinehub_server_id=eq.${elite.id}&select=id,app_name,device_category`));
const byKey = new Map(apps.map((a) => [`${a.app_name}|${a.device_category}`, a.id]));

const tutorials = [
  {
    title: 'Instalação em Smart TV (Lótus, Vizzion, Blessed, Epic, Play Sim, Assist+)',
    device_category: 'smart_tv', sort_order: 1, status: 'pending_recording', script_notes:
`1. Abra a loja de apps da TV (Samsung Apps / LG Content Store / Roku Channel Store).
2. Pesquise pelo app escolhido (Lótus, Vizzion Play, Blessed Player, Epic Play, Play Sim ou Assist+).
3. Instale e abra o app.
4. No app, escolha a opção de adicionar servidor via código de acesso.
5. Digite o código 2617818 (apps parceiros) ou, para Lótus, o código de acesso 475488.
6. Confirme usuário e senha do cliente.
7. Aguarde a lista de canais carregar.`,
    profile: byKey.get('Lótus|smart_tv'),
  },
  {
    title: 'Instalação em Android TV / TV Box (Ultramix, XCIPTV, Elite TV)',
    device_category: 'android_tv', sort_order: 2, status: 'pending_recording', script_notes:
`1. Abra a Play Store na TV/Box.
2. Pesquise e instale Ultramix (ou XCIPTV / Elite TV).
3. Abra o app e escolha adicionar servidor via URL.
4. Cole a XC URL: http://elitedns.club.
5. Digite usuário e senha do cliente.
6. Em Lótus, abra o app, escolha código de acesso e digite 475488; ou em Ultramix, digite o código 6577417.
7. Aguarde a lista carregar.`,
    profile: byKey.get('Ultramix|android_tv'),
  },
  {
    title: 'Uso via WEBPLAYER (computador, celular Android ou iPhone)',
    device_category: 'computer', sort_order: 3, status: 'pending_recording', script_notes:
`1. Abra o navegador no computador, celular Android ou iPhone.
2. Acesse https://eliteiptv.webplayer.one/login.
3. Informe o usuário e a senha do cliente.
4. Aguarde carregar e assista.`,
    profile: null,
  },
];

let inserted = 0; let skipped = 0;
for (const t of tutorials) {
  const existing = await rpc('GET', `/tutorial_media_slots?user_id=eq.${owner}&title=eq.${encodeURIComponent(t.title)}&select=id&limit=1`);
  if (existing.length) { skipped += 1; continue; }
  await rpc('POST', '/tutorial_media_slots', {
    user_id: owner, device_category: t.device_category, manufacturer: null, title: t.title, media_type: 'video', media_url: null, script_notes: t.script_notes, status: t.status, sort_order: t.sort_order, server_delivery_profile_id: t.profile || null,
  });
  inserted += 1;
}
console.log(JSON.stringify({ tutorials_inserted: inserted, tutorials_skipped: skipped }));
