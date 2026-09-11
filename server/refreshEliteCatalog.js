// Atualiza o catálogo de delivery_profiles do servidor Elite IPTV a partir
// da devolutiva do painel. Cria um teste por execução (autorizado pelo
// operador); faz upsert dos códigos, URL de instalação e instruções.

import { testUrl } from './unionChatbot.js';

const allowedHosts = new Set(['revenda-eliteiptv.online']);

function parseApps(reply) {
  if (!reply || typeof reply !== 'string') return [];
  const apps = [];
  // WEBPLAYER (computador, celular Android e iPhone)
  const webplayer = reply.match(/https?:\/\/[^\s]*webplayer\.one\/login[^\s]*/);
  if (webplayer) apps.push({ app_name: 'WEBPLAYER', device_categories: ['computer', 'android', 'ios'], install_url: 'https://eliteiptv.webplayer.one/login', partner_code: null, downloader_code: null, ntdown_code: null, instructions: 'Acesso via navegador. Compatível com computador, celular Android e iPhone.' });
  // Ultramix
  if (/Ultramix/i.test(reply)) {
    const ult = webplayer; apps.push({ app_name: 'Ultramix', device_categories: ['android_tv', 'tv_box', 'android'], install_url: 'https://play.google.com/store/apps/details?id=com.ultra.mix', partner_code: reply.match(/Código de acesso:\s*(\d+)\s*-?\s*ELITE\s*IPTV/i)?.[1] || null, downloader_code: null, ntdown_code: null, instructions: 'XC URL: http://elitedns.club' });
  }
  // Lótus
  if (/L[ÓO]TUS/i.test(reply)) {
    const dl = reply.match(/Link Download:\s*(https?:\/\/[^\s]+)/i)?.[1];
    const down = reply.match(/C[ÓO]DIGO\s+DOWNLOADER:?\s*(\d+)/i)?.[1];
    const code = reply.match(/Código de acesso:\s*(\d+)/i)?.[1];
    apps.push({ app_name: 'Lótus', device_categories: ['smart_tv'], install_url: dl || 'https://rma.la/lotus', partner_code: code, downloader_code: down, ntdown_code: null, instructions: code || down ? `Código: ${code || ''} · Downloader: ${down || ''}` : null });
  }
  // XCIPTV
  if (/XCIPTV/i.test(reply)) {
    apps.push({ app_name: 'XCIPTV', device_categories: ['android_tv', 'tv_box', 'android'], install_url: 'https://play.google.com/store/apps/details?id=com.nathnetwork.xciptv&hl=pt_BR', partner_code: null, downloader_code: null, ntdown_code: null, instructions: 'XC URL: http://elitedns.club' });
  }
  // Elite TV
  if (/Elite\s*TV/i.test(reply)) {
    const dl = reply.match(/https?:\/\/aftv\.news\/\d+/);
    const down = reply.match(/C[ÓO]DIGO\s+DOWNLOADER:?\s*(\d+).*?(?:Elite\s*TV|Elite\s*TV\b)/is)?.[1] || reply.match(/(\d{5,})/);
    apps.push({ app_name: 'Elite TV', device_categories: ['android_tv', 'tv_box', 'android'], install_url: dl || 'https://aftv.news/9777941', partner_code: null, downloader_code: down || null, ntdown_code: null, instructions: 'XC URL: http://elitedns.club' });
  }
  // Apps parceiros (código compartilhado)
  const partnerCode = reply.match(/(?:VIZZION PLAY|BLESSED PLAYER|EPIC PLAY|PLAY SIM|ASSIST\+).*?CODIGO:?\s*(\d+)/i)?.[1];
  if (partnerCode) {
    for (const app_name of ['Vizzion Play', 'Blessed Player', 'Epic Play', 'Play Sim', 'Assist+']) {
      apps.push({ app_name, device_categories: ['smart_tv'], install_url: null, partner_code: partnerCode, downloader_code: null, ntdown_code: null, instructions: 'Compatível com TVs Samsung, LG e Roku.' });
    }
  }
  return apps;
}

export async function refreshEliteCatalog(supabase, config) {
  const ownerId = config.horizonsOwnerUserId;
  const eliteServerRows = await supabase.from('cinehub_servers').select('id').eq('user_id', ownerId).eq('code', 'elite').limit(1);
  if (eliteServerRows.error || !eliteServerRows.data?.length) throw new Error('Servidor Elite IPTV (code=elite) não encontrado.');
  const eliteServerId = eliteServerRows.data[0].id;
  const url = testUrl(config, { server: 'elite', duration_hours: 4, content: 'complete' });
  const parsed = new URL(url);
  if (!allowedHosts.has(parsed.hostname)) throw new Error(`Host do Elite não permitido: ${parsed.hostname}`);
  const response = await fetch(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({}), signal: AbortSignal.timeout(30000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Elite respondeu ${response.status}: ${payload?.message || payload?.error || ''}`);
  const apps = parseApps(payload?.reply);
  if (!apps.length) return { updated: 0, note: 'Nenhum app identificado na devolutiva.' };
  const rows = [];
  for (const app of apps) {
    for (const category of app.device_categories) {
      rows.push({
        user_id: ownerId, cinehub_server_id: eliteServerId, device_category: category,
        app_name: app.app_name, partner_code: app.partner_code, downloader_code: app.downloader_code,
        ntdown_code: app.ntdown_code, download_url: app.install_url, dns: null,
        instructions: app.instructions, active: true, display_order: 0,
      });
    }
  }
  const { data: existing } = await supabase.from('server_delivery_profiles')
    .select('id,device_category,app_name,partner_code,downloader_code,ntdown_code,download_url,instructions,updated_at')
    .eq('user_id', ownerId).eq('cinehub_server_id', eliteServerId);
  const byKey = new Map((existing || []).map((row) => [`${row.device_category}|${row.app_name}`, row]));
  let updated = 0; let unchanged = 0;
  for (const row of rows) {
    const key = `${row.device_category}|${row.app_name}`;
    const prev = byKey.get(key);
    if (!prev) continue; // skip; seed-elite-catalog.mjs creates new rows
    const same = prev.partner_code === row.partner_code && prev.downloader_code === row.downloader_code && prev.ntdown_code === row.ntdown_code && prev.download_url === row.download_url && prev.instructions === row.instructions;
    if (same) { unchanged += 1; continue; }
    const { error: updateError } = await supabase.from('server_delivery_profiles')
      .update({ partner_code: row.partner_code, downloader_code: row.downloader_code, ntdown_code: row.ntdown_code, download_url: row.download_url, instructions: row.instructions, updated_at: new Date().toISOString() })
      .eq('id', prev.id);
    if (updateError) throw new Error(`Falha ao atualizar ${row.app_name}/${row.device_category}: ${updateError.message}`);
    updated += 1;
  }
  return { updated, unchanged, total: rows.length, note: 'Catálogo Elite IPTV atualizado a partir da devolutiva do painel (1 teste criado).' };
}
