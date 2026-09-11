// Seed idempotente do catálogo de apps do Elite IPTV em
// server_delivery_profiles, usando a devolutiva do painel.
// Não cria nada se já existir (checa antes de inserir).

import fs from 'node:fs';
import dotenv from 'dotenv/config';

const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const owner = process.env.HORIZONS_OWNER_USER_ID;
if (!ref || !key || !owner) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e HORIZONS_OWNER_USER_ID são obrigatórios.');
  process.exit(1);
}

const base = `${process.env.SUPABASE_URL}/rest/v1`;

async function rpc(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: method === 'POST' ? 'return=minimal' : 'count=exact' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

const headers = { apikey: key, authorization: `Bearer ${key}` };

// 1) Localizar o servidor Elite IPTV (code='elite') do proprietário.
const serverRows = await rpc('GET', `/cinehub_servers?user_id=eq.${owner}&code=eq.elite&select=id,code,name&limit=1`);
if (!serverRows.length) {
  console.error('Servidor Elite IPTV (code=elite) não encontrado para o proprietário. Migration 20260825070000 aplicada?');
  process.exit(2);
}
const eliteServer = serverRows[0];
console.log(`Servidor Elite IPTV localizado: ${eliteServer.name} (${eliteServer.id})`);

const apps = [
  // WEBPLAYER: computador, celular Android e iPhone.
  { app_name: 'WEBPLAYER', device_category: 'computer', partner_code: null, downloader_code: null, ntdown_code: null, download_url: 'https://eliteiptv.webplayer.one/login', instructions: 'Acesso via navegador em computador. Usar usuário e senha do teste.' },
  { app_name: 'WEBPLAYER', device_category: 'android', partner_code: null, downloader_code: null, ntdown_code: null, download_url: 'https://eliteiptv.webplayer.one/login', instructions: 'Acesso via navegador no celular Android.' },
  { app_name: 'WEBPLAYER', device_category: 'ios', partner_code: null, downloader_code: null, ntdown_code: null, download_url: 'https://eliteiptv.webplayer.one/login', instructions: 'Acesso via navegador no iPhone/iPad.' },
  // Ultramix: TV ANDROID, TV BOX, CELULAR.
  { app_name: 'Ultramix', device_category: 'android_tv', partner_code: '6577417', downloader_code: null, ntdown_code: null, download_url: 'https://play.google.com/store/apps/details?id=com.ultra.mix', instructions: 'XC URL: http://elitedns.club. Código de acesso: 6577417 - ELITE IPTV.' },
  { app_name: 'Ultramix', device_category: 'tv_box', partner_code: '6577417', downloader_code: null, ntdown_code: null, download_url: 'https://play.google.com/store/apps/details?id=com.ultra.mix', instructions: 'XC URL: http://elitedns.club. Código de acesso: 6577417 - ELITE IPTV.' },
  { app_name: 'Ultramix', device_category: 'android', partner_code: '6577417', downloader_code: null, ntdown_code: null, download_url: 'https://play.google.com/store/apps/details?id=com.ultra.mix', instructions: 'XC URL: http://elitedns.club. Código de acesso: 6577417 - ELITE IPTV.' },
  // Lótus: TVs Samsung, LG, Roku e Android.
  { app_name: 'Lótus', device_category: 'smart_tv', partner_code: '475488', downloader_code: '9953407', ntdown_code: null, download_url: 'https://rma.la/lotus', instructions: 'Link de download (rma.la/lotus) + código Downloader 9953407 + código de acesso 475488. XC URL: http://elitedns.club.' },
  // XCIPTV: TV ANDROID, TV BOX, CELULAR.
  { app_name: 'XCIPTV', device_category: 'android_tv', partner_code: null, downloader_code: null, ntdown_code: null, download_url: 'https://play.google.com/store/apps/details?id=com.nathnetwork.xciptv&hl=pt_BR', instructions: 'XC URL: http://elitedns.club.' },
  { app_name: 'XCIPTV', device_category: 'tv_box', partner_code: null, downloader_code: null, ntdown_code: null, download_url: 'https://play.google.com/store/apps/details?id=com.nathnetwork.xciptv&hl=pt_BR', instructions: 'XC URL: http://elitedns.club.' },
  { app_name: 'XCIPTV', device_category: 'android', partner_code: null, downloader_code: null, ntdown_code: null, download_url: 'https://play.google.com/store/apps/details?id=com.nathnetwork.xciptv&hl=pt_BR', instructions: 'XC URL: http://elitedns.club.' },
  // Apps parceiros (Samsung, LG, Roku) — código 2617818 compartilhado.
  { app_name: 'Vizzion Play', device_category: 'smart_tv', partner_code: '2617818', downloader_code: null, ntdown_code: null, download_url: null, instructions: 'Código de acesso: 2617818 (Elite IPTV). Compatível com TVs Samsung, LG e Roku.' },
  { app_name: 'Blessed Player', device_category: 'smart_tv', partner_code: '2617818', downloader_code: null, ntdown_code: null, download_url: null, instructions: 'Código de acesso: 2617818 (Elite IPTV). Compatível com TVs Samsung, LG e Roku.' },
  { app_name: 'Epic Play', device_category: 'smart_tv', partner_code: '2617818', downloader_code: null, ntdown_code: null, download_url: null, instructions: 'Código de acesso: 2617818 (Elite IPTV). Compatível com TVs Samsung, LG e Roku.' },
  { app_name: 'Play Sim', device_category: 'smart_tv', partner_code: '2617818', downloader_code: null, ntdown_code: null, download_url: null, instructions: 'Código de acesso: 2617818 (Elite IPTV). Compatível com TVs Samsung, LG e Roku.' },
  { app_name: 'Assist+', device_category: 'smart_tv', partner_code: '2617818', downloader_code: null, ntdown_code: null, download_url: null, instructions: 'Código de acesso: 2617818 (Elite IPTV). Compatível com TVs Samsung, LG e Roku.' },
  // Elite TV: TV ANDROID, TV BOX, CELULAR.
  { app_name: 'Elite TV', device_category: 'android_tv', partner_code: null, downloader_code: '9777941', ntdown_code: null, download_url: 'https://aftv.news/9777941', instructions: 'Código Downloader: 9777941 (aftv.news/9777941). XC URL: http://elitedns.club.' },
  { app_name: 'Elite TV', device_category: 'tv_box', partner_code: null, downloader_code: '9777941', ntdown_code: null, download_url: 'https://aftv.news/9777941', instructions: 'Código Downloader: 9777941. XC URL: http://elitedns.club.' },
  { app_name: 'Elite TV', device_category: 'android', partner_code: null, downloader_code: '9777941', ntdown_code: null, download_url: 'https://aftv.news/9777941', instructions: 'Código Downloader: 9777941. XC URL: http://elitedns.club.' },
];

let inserted = 0; let skipped = 0;
for (const app of apps) {
  const existing = await fetch(`${base}/server_delivery_profiles?user_id=eq.${owner}&cinehub_server_id=eq.${eliteServer.id}&device_category=eq.${app.device_category}&app_name=eq.${encodeURIComponent(app.app_name)}&select=id&limit=1`, { headers }).then((r) => r.json());
  if (existing.length) { skipped += 1; continue; }
  const payload = {
    user_id: owner, cinehub_server_id: eliteServer.id, device_category: app.device_category, app_name: app.app_name,
    partner_code: app.partner_code, downloader_code: app.downloader_code, ntdown_code: app.ntdown_code,
    download_url: app.download_url, dns: null, instructions: app.instructions, active: true, display_order: 0,
    valid_from: new Date().toISOString().slice(0, 10), valid_until: null,
  };
  await rpc('POST', '/server_delivery_profiles', payload);
  inserted += 1;
}

console.log(JSON.stringify({ seeded: inserted, skipped, total_in_catalog: apps.length }));
