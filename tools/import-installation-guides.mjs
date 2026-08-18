import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const envText = await fs.readFile(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.HORIZONS_OWNER_USER_ID) {
  throw new Error('Configuração protegida do Horizons incompleta.');
}

const source = await fs.readFile(new URL('../docs/manual-iptv-fonte.md', import.meta.url), 'utf8');
const publicBase = String(env.HORIZONS_PUBLIC_URL || 'https://iptv.velhaturbo.cloud').replace(/\/$/, '');
const asset = (name) => `${publicBase}/manuals/iptv/${name}`;

const definitions = [
  [1, 'TV antiga — configuração por DNS', 'smart_tv', null, 'TV sem Smart / modelos antigos', 'Sistema proprietário', 'dns', 'SSIPTV', ['img_082707577bc3.jpg', 'img_37c0c2f5f4c4.jpg', 'img_a76a14531929.jpg']],
  [2, 'TV antiga — aplicativos com licença', 'smart_tv', null, 'TV sem Smart / modelos antigos', 'Sistema proprietário', 'direct_site', 'SmartOne / SSIPTV', []],
  [3, 'Samsung Smart TV — Tizen', 'smart_tv', 'Samsung', 'Tizen 2016 ou posterior', 'Tizen', 'app_store', 'Vizzion Play e alternativas', ['img_37c0c2f5f4c4.jpg', 'img_9354b57eb0fc.jpg']],
  [4, 'LG Smart TV — webOS', 'smart_tv', 'LG', 'webOS 3.0 ou posterior', 'webOS', 'app_store', 'Vizzion Play e alternativas', ['img_a76a14531929.jpg', 'img_3f267d4ef047.jpg', 'img_794cab5660d5.jpg']],
  [5, 'Roku TV', 'smart_tv', 'Roku', 'Roku TV', 'Roku OS', 'other', 'Aplicativo compatível', ['img_6d8a4f6badc0.jpg']],
  [6, 'Panasonic Smart TV', 'smart_tv', 'Panasonic', 'Modelos com NetRange', 'NetRange', 'app_store', 'NetRange', ['img_028bc2978716.jpg']],
  [7, 'Toshiba / Hisense — Vidaa', 'smart_tv', 'Hisense / Toshiba', 'Toshiba ou Hisense compatível', 'Vidaa', 'app_store', 'Aplicativo Vidaa compatível', ['img_c0d5e4a34ebd.jpg']],
  [8, 'Amazon Fire TV Stick', 'android_tv', 'Amazon', 'Fire TV Stick', 'Fire OS', 'downloader', 'Downloader', ['img_f9b2ca4c6285.jpg']],
  [9, 'Android TV / Google TV', 'android_tv', null, 'TCL, Philco, Aiwa, Philips ou Xiaomi', 'Android TV / Google TV', 'downloader', 'Downloader / NTDown', ['img_7f175f34f107.jpg', 'img_c0a6714678d7.jpg']],
  [10, 'TV Box MXQ Pro 5G 4K', 'tv_box', 'MXQ', 'MXQ Pro 5G 4K', 'Android', 'downloader', 'Downloader', ['img_062a833c12d3.jpg']],
  [11, 'Celular Android', 'mobile', 'Android', 'Celular ou tablet', 'Android', 'app_store', 'Aplicativo compatível', ['img_c0a6714678d7.jpg']],
  [12, 'iPhone e iPad', 'mobile', 'Apple', 'iPhone ou iPad', 'iOS / iPadOS', 'app_store', 'Aplicativo compatível', ['img_0af39a7ea707.jpg']],
  [13, 'Computador e notebook', 'computer', null, 'Windows, macOS ou navegador', 'Desktop / Web', 'direct_site', 'Web Player', ['img_1227527666b7.jpg']],
  [14, 'Xbox / PlayStation', 'console', null, 'Xbox One/Series ou PS4/PS5', 'Console', 'direct_site', 'Web Player', ['img_2137edbd045d.jpg', 'img_ef081785e402.jpg']],
  [15, 'Chromecast — espelhamento', 'other', 'Google', 'Chromecast', 'Google Cast', 'app_store', 'App de espelhamento', []],
];

const extractSection = (number) => {
  const start = source.search(new RegExp(`^# ${number}\\.`, 'm'));
  if (start < 0) throw new Error(`Seção ${number} ausente no manual.`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/^# \d+\./m);
  const section = next < 0 ? rest.split(/^# 📌/m)[0] : rest.slice(0, next + 1);
  return section.replace(/^# .*?\n/, '').replace(/\n---\s*$/, '').trim();
};

const rows = definitions.map(([number, title, device_category, manufacturer, model_hint, platform, installation_method, app_name, images]) => ({
  user_id: env.HORIZONS_OWNER_USER_ID,
  title,
  device_category,
  manufacturer,
  model_hint,
  platform,
  recommended_panel: null,
  installation_method,
  app_name,
  instructions: extractSection(number),
  media_urls: [...images.map(asset), asset('manual-completo.pdf')],
  active: true,
}));

if (!process.argv.includes('--apply')) {
  process.stdout.write(`${JSON.stringify({ dry_run: true, guides: rows.map(({ title, device_category, manufacturer, media_urls }) => ({ title, device_category, manufacturer, media_count: media_urls.length })) }, null, 2)}\n`);
  process.exit(0);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let inserted = 0;
let updated = 0;
for (const row of rows) {
  const { data: existing, error: lookupError } = await supabase.from('installation_guides')
    .select('id').eq('user_id', row.user_id).eq('title', row.title).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const { error } = await supabase.from('installation_guides').update(row).eq('id', existing.id);
    if (error) throw error;
    updated += 1;
  } else {
    const { error } = await supabase.from('installation_guides').insert(row);
    if (error) throw error;
    inserted += 1;
  }
}

process.stdout.write(`${JSON.stringify({ applied: true, inserted, updated, total: rows.length })}\n`);
