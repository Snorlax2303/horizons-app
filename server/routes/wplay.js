import { createWwpanelClient, wwpanelConfigured } from '../wplayPanel.js';
import { fetchWplayLinks, resolveInstall, WPLAY_INSTALL_PRODUCTS } from '../wplayInstall.js';
import {
  WWPANEL_PLANS,
  WWPANEL_ADDONS,
  WWPANEL_IPTV_PACKAGES,
  WWPANEL_P2P_PACKAGES,
  WWPANEL_KRATOR_PACKAGES,
  WWPANEL_NEXUS_PACKAGES,
  WWPANEL_APPS,
  WWPANEL_XSTREAM_APPS,
  WWPANEL_COUNTRIES,
} from '../wplayCatalog.js';

const TEST_PRODUCTS = ['iptv', 'p2p', 'krator', 'nexus'];

// O painel espera duração em HORAS (número), não string. Aceitamos '4h' por
// conveniência do operador e convertemos para 4.
const TEST_DURATION_HOURS = [1, 2, 4, 8, 12, 24];

function resolveTestProduct(requested, payload) {
  if (requested) return requested;
  if (payload.package_krator) return 'krator';
  if (payload.package_nexus !== undefined) return 'nexus';
  return 'iptv';
}

function text(max) {
  return (z) => z.string().trim().min(1).max(max);
}

// Remove qualquer campo potencialmente sensível antes de registrar em log/auditoria.
function sanitizeForAudit(payload) {
  if (!payload || typeof payload !== 'object') return payload ?? null;
  const clone = Array.isArray(payload) ? [] : {};
  for (const [key, value] of Object.entries(payload)) {
    if (/pass|senha|token|secret|key/i.test(key)) clone[key] = '[redacted]';
    else if (value && typeof value === 'object') clone[key] = sanitizeForAudit(value);
    else clone[key] = value;
  }
  return clone;
}

export function registerWplayRoutes(app, { supabase, requireAuthenticatedUser, config, z, clientFactory = createWwpanelClient }) {
  const durationHours = z.preprocess((value) => {
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d+)\s*h?$/i);
      return match ? Number(match[1]) : value;
    }
    return value;
  }, z.number().int().min(1).max(72));

  function writesDisabled(response) {
    if (!wwpanelConfigured(config)) {
      response.status(503).json({ error: 'WPlay não está configurado: defina WWPANEL_API_KEY no ambiente protegido.' });
      return true;
    }
    if (!config.wwpanelWritesEnabled) {
      response.status(403).json({ error: 'Escritas no painel WPlay estão desativadas. Operações reais consomem créditos; ative WWPANEL_WRITES_ENABLED quando for executá-las.' });
      return true;
    }
    return false;
  }

  function operationDisabled(operation, response) {
    const flags = {
      test: config.wwpanelTestsEnabled,
      customer: config.wwpanelCustomersEnabled,
      renewal: config.wwpanelRenewalsEnabled,
      app_activation: config.wwpanelAppActivationEnabled,
    };
    if (!flags[operation]) {
      response.status(403).json({ error: `Operação '${operation}' está desativada no painel WPlay.` });
      return true;
    }
    return false;
  }

  async function audit(request, action, entry) {
    const record = {
      user_id: request.horizonsUser?.id ?? null,
      action,
      target_id: entry.targetId ?? null,
      status: entry.status,
      summary: sanitizeForAudit(entry.summary),
      created_at: new Date().toISOString(),
    };
    console.info(JSON.stringify({ event: 'wplay_operation', ...record }));
    try {
      await supabase.from('wplay_operations').insert(record);
    } catch {
      // Tabela de auditoria ainda não aplicada: o log estruturado acima permanece.
    }
  }

  function client() {
    return clientFactory(config);
  }

  app.get('/wplay/status', requireAuthenticatedUser, (_request, response) => {
    return response.json({
      configured: wwpanelConfigured(config),
      writesEnabled: Boolean(config.wwpanelWritesEnabled),
      operations: {
        test: Boolean(config.wwpanelTestsEnabled),
        customer: Boolean(config.wwpanelCustomersEnabled),
        renewal: Boolean(config.wwpanelRenewalsEnabled),
        app_activation: Boolean(config.wwpanelAppActivationEnabled),
      },
      baseUrl: config.wwpanelApiUrl,
      note: 'Chamadas de escrita consomem créditos no painel externo. Use WWPANEL_WRITES_ENABLED para o gate global e flags específicas por operação.',
    });
  });

  app.get('/wplay/catalog', requireAuthenticatedUser, (_request, response) => {
    return response.json({
      plans: WWPANEL_PLANS,
      addons: WWPANEL_ADDONS,
      iptvPackages: WWPANEL_IPTV_PACKAGES,
      p2pPackages: WWPANEL_P2P_PACKAGES,
      kratorPackages: WWPANEL_KRATOR_PACKAGES,
      nexusPackages: WWPANEL_NEXUS_PACKAGES,
      apps: WWPANEL_APPS,
      xstreamApps: WWPANEL_XSTREAM_APPS,
      countries: WWPANEL_COUNTRIES,
      testDurations: TEST_DURATION_HOURS,
      testProducts: TEST_PRODUCTS,
    });
  });

  // Leitura — serviços do painel (serviceId obrigatório no teste Krator+).
  app.get('/wplay/services', requireAuthenticatedUser, async (_request, response) => {
    if (!wwpanelConfigured(config)) {
      return response.status(503).json({ error: 'WPlay não está configurado: defina WWPANEL_API_KEY no ambiente protegido.' });
    }
    try {
      const services = await client().services();
      return response.json({ services });
    } catch (error) {
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  app.get('/wplay/install', requireAuthenticatedUser, async (request, response) => {
    if (!wwpanelConfigured(config)) {
      return response.status(503).json({ error: 'WPlay não está configurado: defina WWPANEL_API_KEY no ambiente protegido.' });
    }
    const product = String(request.query?.product || 'iptv').trim().toLowerCase();
    const brand = request.query?.brand ?? request.query?.device;
    try {
      const items = await fetchWplayLinks(config);
      const result = resolveInstall(items, {
        product,
        brand,
        username: request.query?.username,
        password: request.query?.password,
        m3u8: request.query?.m3u8,
      });
      return response.json({ ...result, products: WPLAY_INSTALL_PRODUCTS, source: 'panel-links' });
    } catch (error) {
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  // Fluxo 1 — teste (trial). O produto decide o endpoint do painel:
  // Krator+ e Nexus têm rota própria; IPTV/P2P usam a rota comum.
  app.post('/wplay/tests', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('test', response)) return undefined;
    const parsed = z.object({
      product: z.enum(TEST_PRODUCTS).optional(),
      isTrial: z.number().int().min(0).max(1).optional(),
      package_iptv: z.number().int().optional(),
      package_p2p: z.string().trim().max(64).optional(),
      package_krator: z.string().trim().max(64).optional(),
      package_nexus: z.number().int().optional(),
      serviceId: z.string().trim().max(64).optional(),
      whatsapp: z.string().trim().max(32).optional(),
      notes: z.string().trim().max(500).optional(),
      country: z.string().trim().max(4).optional(),
      mac: z.string().trim().max(64).optional(),
      testDuration: durationHours.optional(),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });

    const { product: requestedProduct, ...payload } = parsed.data;
    const product = resolveTestProduct(requestedProduct, payload);
    if (product === 'krator' && !payload.package_krator) {
      return response.status(400).json({ error: 'Informe package_krator para teste Krator+.', details: { package_krator: 'obrigatório' } });
    }
    if (product === 'krator' && !payload.serviceId) {
      return response.status(400).json({ error: 'Informe serviceId para teste Krator+ (veja GET /wplay/services).', details: { serviceId: 'obrigatório' } });
    }
    if (product === 'nexus' && payload.package_nexus === undefined) {
      return response.status(400).json({ error: 'Informe package_nexus para teste Nexus.', details: { package_nexus: 'obrigatório' } });
    }
    try {
      const input = { isTrial: 1, ...payload };
      let result;
      if (product === 'krator') result = await client().createKratorTest(input);
      else if (product === 'nexus') result = await client().createNexusTest(input);
      else result = await client().createTest(input);
      await audit(request, 'create_test', { status: 'completed', summary: { product, ...payload } });
      return response.status(201).json({ operation: 'create_test', product, result });
    } catch (error) {
      await audit(request, 'create_test', { status: 'failed', summary: { product, message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  // Fluxo 1 — ativação de app do trial (por MAC/playlist).
  app.post('/wplay/apps/activate', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('app_activation', response)) return undefined;
    const parsed = z.object({
      nameApp: z.enum(WWPANEL_APPS),
      mac: text(64)(z).optional(),
      namePlaylist: z.string().trim().max(120).optional(),
      id_user: z.union([z.string().trim().max(64), z.number().int()]).optional(),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    try {
      const result = await client().activateApp(parsed.data);
      await audit(request, 'activate_app', { status: 'completed', summary: parsed.data });
      return response.status(200).json({ operation: 'activate_app', result });
    } catch (error) {
      await audit(request, 'activate_app', { status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  // Fluxo 3 — ativação de app licenciado via Xtream.
  app.post('/wplay/apps/activate-xstream', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('app_activation', response)) return undefined;
    const parsed = z.object({
      nameApp: z.enum(WWPANEL_XSTREAM_APPS),
      email: z.string().trim().max(160).optional(),
      password: z.string().trim().max(160).optional(),
      id_user: z.union([z.string().trim().max(64), z.number().int()]).optional(),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    try {
      const result = await client().activateAppXstream(parsed.data);
      await audit(request, 'activate_app_xstream', { status: 'completed', summary: { nameApp: parsed.data.nameApp, id_user: parsed.data.id_user } });
      return response.status(200).json({ operation: 'activate_app_xstream', result });
    } catch (error) {
      await audit(request, 'activate_app_xstream', { status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  // Fluxo 2 — criação de cliente.
  app.post('/wplay/customers', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('customer', response)) return undefined;
    const parsed = z.object({
      isTrial: z.number().int().min(0).max(1).optional(),
      name: text(160)(z),
      whatsapp: z.string().trim().max(32).optional(),
      country: z.enum(WWPANEL_COUNTRIES).optional(),
      planId: z.number().int().optional(),
      notes: z.string().trim().max(500).optional(),
      package_iptv: z.number().int().optional(),
      package_p2p: z.string().trim().max(64).optional(),
      package_krator: z.string().trim().max(64).optional(),
      package_nexus: z.number().int().optional(),
      deviceKey: z.string().trim().max(120).optional(),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    try {
      const result = await client().createCustomer({ isTrial: 1, ...parsed.data });
      await audit(request, 'create_customer', { status: 'completed', summary: parsed.data });
      return response.status(201).json({ operation: 'create_customer', result });
    } catch (error) {
      await audit(request, 'create_customer', { status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  // Fluxo 2 — renovação (estender / +48h / trocar plano / ativar trial).
  app.patch('/wplay/customers/:id/extend', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('renewal', response)) return undefined;
    const parsed = z.object({ days: z.number().int().min(1).max(3650), months: z.number().int().min(1).max(120).optional(), notes: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    try {
      const result = await client().extend(request.params.id, parsed.data);
      await audit(request, 'extend_customer', { targetId: request.params.id, status: 'completed', summary: parsed.data });
      return response.status(200).json({ operation: 'extend_customer', result });
    } catch (error) {
      await audit(request, 'extend_customer', { targetId: request.params.id, status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  app.patch('/wplay/customers/:id/add-48h', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('renewal', response)) return undefined;
    try {
      const result = await client().add48h(request.params.id);
      await audit(request, 'add_48h', { targetId: request.params.id, status: 'completed', summary: {} });
      return response.status(200).json({ operation: 'add_48h', result });
    } catch (error) {
      await audit(request, 'add_48h', { targetId: request.params.id, status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  app.patch('/wplay/customers/:id/plan', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('renewal', response)) return undefined;
    const parsed = z.object({
      planId: z.number().int().optional(),
      package_iptv: z.number().int().optional(),
      package_p2p: z.string().trim().max(64).optional(),
      package_krator: z.string().trim().max(64).optional(),
      package_nexus: z.number().int().optional(),
    }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    try {
      const result = await client().managePlan(request.params.id, parsed.data);
      await audit(request, 'manage_plan', { targetId: request.params.id, status: 'completed', summary: parsed.data });
      return response.status(200).json({ operation: 'manage_plan', result });
    } catch (error) {
      await audit(request, 'manage_plan', { targetId: request.params.id, status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });

  app.post('/wplay/customers/:id/activate', requireAuthenticatedUser, async (request, response) => {
    if (writesDisabled(response)) return undefined;
    if (operationDisabled('customer', response)) return undefined;
    const parsed = z.object({ planId: z.number().int().optional(), package_iptv: z.number().int().optional(), package_p2p: z.string().trim().max(64).optional(), notes: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() });
    try {
      const result = await client().activateTrial(request.params.id, parsed.data);
      await audit(request, 'activate_customer', { targetId: request.params.id, status: 'completed', summary: parsed.data });
      return response.status(200).json({ operation: 'activate_customer', result });
    } catch (error) {
      await audit(request, 'activate_customer', { targetId: request.params.id, status: 'failed', summary: { message: error.message, statusCode: error.statusCode } });
      return response.status(error.statusCode && error.statusCode < 500 ? 400 : 502).json({ error: error.message });
    }
  });
}
