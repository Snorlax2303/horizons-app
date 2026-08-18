import fs from "node:fs/promises";

const envText = await fs.readFile("/root/horizons-app/.env", "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const bridgeToken = env.BOTBOT_WEBHOOK_TOKEN || env.WEBHOOK_SHARED_SECRET;
if (!env.TYPEBOT_API_TOKEN || !env.TYPEBOT_ID || !bridgeToken) throw new Error("Required protected configuration missing");
const publicBase = String(env.HORIZONS_PUBLIC_URL || "https://iptv.velhaturbo.cloud").replace(/\/$/, "");
const manualImage = (fileName) => `${publicBase}/manuals/iptv/${fileName}`;

const authHeaders = { Authorization: `Bearer ${env.TYPEBOT_API_TOKEN}`, "Content-Type": "application/json" };
const getResponse = await fetch(`${env.TYPEBOT_API_URL}/api/v1/typebots/${env.TYPEBOT_ID}`, { headers: authHeaders });
const getBody = await getResponse.json().catch(() => ({}));
if (!getResponse.ok || !getBody.typebot) throw new Error(`Could not load draft: HTTP ${getResponse.status}`);

const offersResponse = await fetch("http://127.0.0.1:8081/typebot/offers", { headers: { "x-horizons-bot-token": bridgeToken } });
const offersBody = await offersResponse.json().catch(() => ({}));
if (!offersResponse.ok) throw new Error(`Could not load Horizons offers: HTTP ${offersResponse.status}`);
const plans = (offersBody.plans || []).filter((plan) => plan.id && plan.name && Number.isFinite(Number(plan.amount)));

const variableNames = [
  "session_key", "remoteJid", "phone", "pushName", "prospect_id", "customer_id", "customer_match", "intent",
  "device_location", "device_category", "device_brand", "control_model", "control_photo_1", "control_photo_2",
  "app_name", "guide_found", "guide_id", "guide_title", "guide_instructions", "guide_media_url", "guide_chat_instructions", "provider_code", "simultaneous_screens", "plan_id", "plan_name", "plan_amount",
  "trial_content",
  "test_id", "test_username", "test_password", "test_reply", "test_payment_url", "sales_order_id", "checkout_url", "order_requires_human", "renewal_id", "pix_code",
  "handoff_id", "error_code",
  "access_username", "access_password", "access_message", "access_checkout_url",
  "ai_message", "ai_route", "ai_reply", "ai_device", "ai_brand", "ai_confidence",
];
const variables = variableNames.map((name, index) => ({ id: `var-horizons-${String(index).padStart(2, "0")}`, name, isSessionVariable: true }));
const varId = (name) => variables.find((variable) => variable.name === name).id;

const groupDefs = [
  ["entry", "00 — Entrada"], ["identity-phone", "01 — Telefone no preview"], ["identity-name", "02 — Nome no preview"],
  ["menu", "10 — Menu principal"], ["menu-sales", "11 — Teste e assinatura"],
  ["menu-customer", "12 — Cliente atual"], ["menu-service", "13 — Atendimento"],
  ["ai", "14 — Atendimento em texto livre"],
  ["location", "20 — Local do teste"],
  ["brand", "21 — Marca da Smart TV"], ["brand-android-tv", "21A — Android TV / Fire TV"],
  ["brand-tv-box", "21B — TV Box"], ["brand-mobile", "21C — Celular / tablet"],
  ["control", "22 — Identificar controle"], ["samsung-control", "22A — Controles Samsung"],
  ["samsung-control-1", "22B — Samsung: primeiro controle"],
  ["samsung-control-2", "22C — Samsung: segundo controle"],
  ["samsung-control-3", "22D — Samsung: terceiro controle"],
  ["app", "23 — Aplicativo e instalação"],
  ["screens", "24 — Telas simultâneas"], ["interest", "25 — Interesse comercial"],
  ["interest-plans-1", "25A — Planos: página 1"], ["interest-plans-2", "25B — Planos: página 2"],
  ["trial", "26 — Criar teste"], ["trial-samsung", "26A — Acesso e instalação Samsung"],
  ["trial-other", "26B — Acesso e instalação geral"],
  ["purchase", "30 — Assinar agora"], ["renew", "40 — Renovar"], ["pix", "41 — Pix PaggPay"],
  ["support", "50 — Suporte"], ["finance", "60 — Financeiro"], ["human", "70 — Falar com atendente"],
  ["finish", "80 — Confirmação e encerramento"], ["error", "90 — Falha segura"], ["sales", "71 — Vendas: mais de 3 telas"],
  ["access", "42 — Consultar meus dados"],
];
const groupId = (key) => `group-horizons-${key}`;
const groups = Object.fromEntries(groupDefs.map(([key, title], index) => [key, {
  id: groupId(key), title, graphCoordinates: { x: 420 + (index % 4) * 500, y: Math.floor(index / 4) * 420 }, blocks: [],
}]));
const edges = [];
const edge = (id, from, targetKey, targetBlockId) => {
  const edgeId = `edge-${id}`;
  edges.push({ id: edgeId, from, to: { groupId: groupId(targetKey), ...(targetBlockId ? { blockId: targetBlockId } : {}) } });
  return edgeId;
};
const text = (id, value, outgoingEdgeId) => ({
  id, type: "text", content: { plainText: value, richText: [{ type: "p", children: [{ text: value }] }] },
  ...(outgoingEdgeId ? { outgoingEdgeId } : {}),
});
const image = (id, url) => ({ id, type: "image", content: { url } });
const optionId = (item) => String(item.optionId ?? item.value ?? item.label);
const displayLabel = (item) => String(item.displayLabel ?? item.label);
const listTitle = (item) => {
  const label = displayLabel(item);
  return label.length <= 24 ? label : `${label.slice(0, 21)}...`;
};
const interactiveText = (title, definitions) => {
  if (definitions.length <= 3) {
    return `[buttons]\n[title]${title}\n[description]Toque em uma opção abaixo.\n[footer]Selecione para continuar.\n${definitions.map((item) => `[reply]\ndisplayText: ${displayLabel(item)}\nid: ${optionId(item)}`).join("\n")}`;
  }
  if (definitions.length <= 10) {
    return `[list]\n[title]${title}\n[description]Toque no botão abaixo para escolher.\n[buttonText]Ver opções\n[footerText]Selecione uma opção da lista.\n[menu]\n[section]\ntitle: Opções\n${definitions.map((item) => `[row]\ntitle: ${listTitle(item)}\ndescription: ${item.description ?? displayLabel(item)}\nrowId: ${optionId(item)}`).join("\n")}\n[/section]\n[/menu]`;
  }
  throw new Error(`Interactive menu "${title}" has ${definitions.length} items; split it into pages of at most 10`);
};
let interactiveTextCounter = 0;
const transportDefinitions = (definitions) => definitions.map((item, index) => ({ ...item, optionId: String(index + 1) }));
const numberedText = (title, definitions) => text(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${++interactiveTextCounter}-options`, interactiveText(title, transportDefinitions(definitions)));
const numberedChoice = (id, variable, definitions) => choice(id, variable,
  transportDefinitions(definitions).map((item) => ({ ...item, label: optionId(item) })));
const choice = (id, variable, definitions) => ({
  id, type: "choice input",
  items: definitions.map((item, index) => {
    const itemId = `${id}-item-${index}`;
    const outgoingEdgeId = item.target ? edge(`${id}-${index}`, { blockId: id, itemId }, item.target) : undefined;
    return { id: itemId, content: item.label, value: item.value ?? item.label, ...(outgoingEdgeId ? { outgoingEdgeId } : {}) };
  }),
  options: { buttonLabel: "Enviar", isMultipleChoice: false, ...(variable ? { variableId: varId(variable) } : {}) },
});
const setVariable = (id, variable, type, extra = {}) => ({ id, type: "Set variable", options: { variableId: varId(variable), type, isExecutedOnClient: false, ...extra } });
const textInput = (id, variable, placeholder, outgoingEdgeId) => ({
  id, type: "text input", options: { variableId: varId(variable), labels: { placeholder, button: "Enviar" } },
  ...(outgoingEdgeId ? { outgoingEdgeId } : {}),
});
const phoneInput = (id, variable, outgoingEdgeId) => ({
  id, type: "phone number input", options: {
    variableId: varId(variable), defaultCountryCode: "BR",
    labels: { placeholder: "(DDD) 99999-9999", button: "Enviar" },
    retryMessageContent: "Informe um telefone válido com DDD.",
  },
  ...(outgoingEdgeId ? { outgoingEdgeId } : {}),
});
const http = (id, method, path, body, mappings = [], outgoingEdgeId) => ({
  id, type: "Webhook",
  options: {
    isCustomBody: true, isExecutedOnClient: false, timeout: 30,
    webhook: {
      method, url: `https://iptv.velhaturbo.cloud/api${path}`,
      headers: [
        { id: `${id}-header-auth`, key: "x-horizons-bot-token", value: bridgeToken },
        { id: `${id}-header-content`, key: "content-type", value: "application/json" },
      ],
      body: body ? JSON.stringify(body) : undefined,
    },
    responseVariableMapping: mappings.map(([variable, bodyPath], index) => ({
      id: `${id}-map-${index}`, variableId: varId(variable),
      bodyPath: bodyPath.startsWith("data.") ? bodyPath : `data.${bodyPath}`,
    })),
  },
  ...(outgoingEdgeId ? { outgoingEdgeId } : {}),
});
const intakeBody = (intent, step, profile) => ({
  session_key: "{{session_key}}", phone: "{{phone}}", name: "{{pushName}}", ...(intent ? { intent } : {}),
  current_step: step, ...(profile ? { profile } : {}),
});

const startEdge = edge("start", { eventId: "event-start-horizons" }, "entry");
const entryToMenu = edge("entry-menu", { blockId: "entry-intake" }, "menu");
const phoneToNameCheck = edge("phone-name-check", { blockId: "identity-phone-input" }, "entry", "entry-name-condition");
const nameToIntake = edge("name-intake", { blockId: "identity-name-input" }, "entry", "entry-intake");
groups.entry.blocks = [
  // Evolution pre-fills remoteJid and pushName as regular Typebot variables.
  // Do not overwrite pushName with Typebot's Meta-only system value.
  setVariable("entry-phone", "phone", "Custom", { expressionToEvaluate: "{{remoteJid}}" }),
  setVariable("entry-session", "session_key", "Random ID"),
  text("entry-welcome", "Olá! Eu sou o atendimento virtual. Vou identificar sua necessidade e encaminhar tudo certinho."),
  {
    id: "entry-phone-condition", type: "Condition",
    items: [{
      id: "entry-phone-empty", content: { comparisons: [{
        id: "entry-phone-empty-comparison", variableId: varId("phone"), comparisonOperator: "Is empty",
      }] }, outgoingEdgeId: edge("entry-phone-empty", { blockId: "entry-phone-condition", itemId: "entry-phone-empty" }, "identity-phone"),
    }],
    outgoingEdgeId: edge("entry-phone-present", { blockId: "entry-phone-condition" }, "entry", "entry-name-condition"),
  },
  {
    id: "entry-name-condition", type: "Condition",
    items: [{
      id: "entry-name-empty", content: { comparisons: [{
        id: "entry-name-empty-comparison", variableId: varId("pushName"), comparisonOperator: "Is empty",
      }] }, outgoingEdgeId: edge("entry-name-empty", { blockId: "entry-name-condition", itemId: "entry-name-empty" }, "identity-name"),
    }],
    outgoingEdgeId: edge("entry-name-present", { blockId: "entry-name-condition" }, "entry", "entry-intake"),
  },
  http("entry-intake", "POST", "/typebot/intake", intakeBody(null, "menu"), [
    ["prospect_id", "prospect_id"], ["customer_id", "customer.id"], ["customer_match", "customer_match"],
  ], entryToMenu),
];

groups["identity-phone"].blocks = [
  text("identity-phone-question", "Para testar pelo navegador, informe um telefone com DDD. Quando o WhatsApp estiver conectado, esta pergunta será preenchida automaticamente."),
  phoneInput("identity-phone-input", "phone", phoneToNameCheck),
];

groups["identity-name"].blocks = [
  text("identity-name-question", "Como posso chamar você?"),
  textInput("identity-name-input", "pushName", "Digite seu nome", nameToIntake),
];

const menuOptions = [
    { label: "Teste ou assinatura", value: "sales_menu", target: "menu-sales" },
    { label: "Já sou cliente", value: "customer_menu", target: "menu-customer" },
    { label: "Atendimento", value: "service_menu", target: "menu-service" },
];
groups.menu.blocks = [
  numberedText("O que você deseja fazer agora?", menuOptions),
  numberedChoice("menu-choice", "intent", menuOptions),
];

const salesMenuOptions = [
  { label: "Fazer um teste", value: "trial", target: "location" },
  { label: "Quero assinar agora", value: "purchase", target: "location" },
  { label: "Voltar", value: "back", target: "menu" },
];
groups["menu-sales"].blocks = [
  numberedText("Teste ou assinatura", salesMenuOptions),
  numberedChoice("menu-sales-choice", "intent", salesMenuOptions),
];
const customerMenuOptions = [
  { label: "Renovar meu plano", value: "renewal", target: "renew" },
  { label: "Consultar meus dados", value: "credentials", target: "access" },
  { label: "Voltar", value: "back", target: "menu" },
];
groups["menu-customer"].blocks = [
  numberedText("Já sou cliente", customerMenuOptions),
  numberedChoice("menu-customer-choice", "intent", customerMenuOptions),
];
const serviceMenuOptions = [
  { label: "Preciso de suporte", value: "support", target: "support" },
  { label: "Financeiro", value: "finance", target: "finance" },
  { label: "Escrever o que preciso", value: "ai", target: "ai" },
];
groups["menu-service"].blocks = [
  numberedText("Atendimento", serviceMenuOptions),
  numberedChoice("menu-service-choice", "intent", serviceMenuOptions),
];

const aiInputToRequest = edge("ai-input-request", { blockId: "ai-input" }, "ai", "ai-request");
const aiRequestToResult = edge("ai-request-result", { blockId: "ai-request" }, "ai", "ai-result");
const aiRoutes = [
  ["location", "location"], ["renew", "renew"], ["access", "access"],
  ["support", "support"], ["finance", "finance"], ["human", "human"],
];
groups.ai.blocks = [
  text("ai-question", "Pode escrever com suas palavras o que você precisa. Por exemplo: quero testar na minha TV Samsung."),
  textInput("ai-input", "ai_message", "Escreva seu pedido", aiInputToRequest),
  http("ai-request", "POST", "/typebot/ai/interpret", { message: "{{ai_message}}" }, [
    ["intent", "intent"], ["ai_route", "route"], ["ai_reply", "reply"], ["ai_device", "device_category"],
    ["ai_brand", "manufacturer"], ["ai_confidence", "confidence"],
  ], aiRequestToResult),
  text("ai-result", "{{ai_reply}}"),
  {
    id: "ai-route-condition", type: "Condition",
    items: aiRoutes.map(([route, target], index) => ({
      id: `ai-route-${route}`, content: { comparisons: [{
        id: `ai-route-${route}-comparison`, variableId: varId("ai_route"), comparisonOperator: "Equal to", value: route,
      }] }, outgoingEdgeId: edge(`ai-route-${route}`, { blockId: "ai-route-condition", itemId: `ai-route-${route}` }, target),
    })),
    outgoingEdgeId: edge("ai-route-fallback", { blockId: "ai-route-condition" }, "human"),
  },
];

const locationOptions = [
  { label: "Smart TV", value: "smart_tv", target: "brand" },
  { label: "Android TV / Fire TV", value: "android_tv", target: "brand-android-tv" },
  { label: "TV Box", value: "tv_box", target: "brand-tv-box" },
  { label: "Celular / Tablet", value: "mobile", target: "brand-mobile" },
  { label: "Computador", value: "computer", target: "app" },
  { label: "Xbox / PlayStation", value: "console", target: "app" },
  { label: "Chromecast", value: "other", target: "app" },
  { label: "Não sei", value: "unknown", target: "human" },
];
groups.location.blocks = [
  http("location-intake", "POST", "/typebot/intake", intakeBody("{{intent}}", "device_location")),
  numberedText("Onde você pretende usar o serviço?", locationOptions),
  numberedChoice("location-choice", "device_location", locationOptions),
];

const smartTvBrands = [
  { label: "Samsung", value: "samsung", target: "samsung-control" }, { label: "LG", value: "lg", target: "app" },
  { label: "Roku", value: "roku", target: "app" }, { label: "Panasonic", value: "panasonic", target: "app" },
  { label: "Hisense", value: "hisense", target: "app" }, { label: "Toshiba", value: "toshiba", target: "app" },
  { label: "Outra / não sei", value: "unknown", target: "human" },
];
groups.brand.blocks = [
  http("brand-save-location", "POST", "/typebot/intake", intakeBody("{{intent}}", "device_brand", { installation_location: "{{device_location}}", device_category: "{{device_location}}" })),
  numberedText("Qual é a marca da Smart TV?", smartTvBrands),
  numberedChoice("brand-choice", "device_brand", smartTvBrands),
];

const androidTvBrands = [
  { label: "Amazon Fire TV", value: "amazon", target: "app" },
  { label: "Android TV / Google TV", value: "generic", target: "app" },
  { label: "Não sei", value: "unknown", target: "human" },
];
groups["brand-android-tv"].blocks = [
  numberedText("Qual sistema ou aparelho você usa?", androidTvBrands),
  numberedChoice("brand-android-tv-choice", "device_brand", androidTvBrands),
];
const tvBoxBrands = [
  { label: "MXQ Pro 5G 4K", value: "mxq", target: "app" },
  { label: "Outro modelo / não sei", value: "unknown", target: "human" },
];
groups["brand-tv-box"].blocks = [
  numberedText("Qual é o modelo da TV Box?", tvBoxBrands),
  numberedChoice("brand-tv-box-choice", "device_brand", tvBoxBrands),
];
const mobileBrands = [
  { label: "Android", value: "android", target: "app" },
  { label: "iPhone / iPad", value: "apple", target: "app" },
];
groups["brand-mobile"].blocks = [
  numberedText("Qual é o sistema do celular ou tablet?", mobileBrands),
  numberedChoice("brand-mobile-choice", "device_brand", mobileBrands),
];

groups.control.blocks = [
  text("control-pending", "Não consegui identificar o aparelho com segurança. Vou encaminhar para atendimento humano para evitar instrução incorreta.", edge("control-human", { blockId: "control-pending" }, "human")),
];

const samsungControlOptions = [
  { label: "Primeiro controle", value: "samsung_compact_1", target: "samsung-control-1" },
  { label: "Segundo controle", value: "samsung_compact_2", target: "samsung-control-2" },
  { label: "Terceiro controle", value: "samsung_traditional", target: "samsung-control-3" },
];
groups["samsung-control"].blocks = [
  text("samsung-controls-intro", "Compare com os três controles abaixo."),
  text("samsung-control-first-label", "Primeiro controle"),
  image("samsung-control-first-image", manualImage("img_37c0c2f5f4c4.jpg")),
  text("samsung-control-second-label", "Segundo controle"),
  image("samsung-control-second-image", manualImage("img_9354b57eb0fc.jpg")),
  text("samsung-control-third-label", "Terceiro controle"),
  image("samsung-control-third-image", manualImage("img_082707577bc3.jpg")),
  numberedText("Qual deles é mais parecido com o seu?", samsungControlOptions),
  numberedChoice("samsung-control-choice", "control_model", samsungControlOptions),
];

groups["samsung-control-1"].blocks = [
  text("samsung-control-1-tip", "Perfeito. Nesse controle, use o botão Home, com o desenho de uma casa, para abrir os aplicativos.", edge("samsung-control-1-app", { blockId: "samsung-control-1-tip" }, "app")),
];
groups["samsung-control-2"].blocks = [
  text("samsung-control-2-tip", "Perfeito. Nesse controle, pressione o botão Home, com o desenho de uma casa, para acessar os aplicativos.", edge("samsung-control-2-app", { blockId: "samsung-control-2-tip" }, "app")),
];
groups["samsung-control-3"].blocks = [
  text("samsung-control-3-tip", "Perfeito. Nesse controle tradicional, use Smart Hub ou o botão colorido de aplicativos para abrir a loja da TV.", edge("samsung-control-3-app", { blockId: "samsung-control-3-tip" }, "app")),
];

groups.app.blocks = [
  http("guide-recommend", "POST", "/typebot/guides/recommend", {
    device_category: "{{device_location}}", manufacturer: "{{device_brand}}",
  }, [["guide_found", "found"], ["guide_id", "guide.id"], ["guide_title", "guide_title"], ["guide_instructions", "guide_instructions"], ["guide_media_url", "guide_media_url"], ["guide_chat_instructions", "guide_chat_instructions"], ["provider_code", "provider_code"], ["app_name", "guide.app_name"]]),
  {
    id: "guide-found-condition", type: "Condition", items: [{
      id: "guide-found", content: { logicalOperator: "AND", comparisons: [{ id: "guide-found-cmp", variableId: varId("guide_found"), comparisonOperator: "Equal to", value: "true" }] },
      outgoingEdgeId: edge("guide-found", { blockId: "guide-found-condition", itemId: "guide-found" }, "app", "app-guide"),
    }], outgoingEdgeId: edge("guide-not-found", { blockId: "guide-found-condition" }, "human"),
  },
  text("app-guide", "Encontrei a instalação correta para {{guide_title}}. Vou configurar seu teste e já enviar tutorial, aplicativo e dados de acesso juntos.", edge("app-screens", { blockId: "app-guide" }, "screens")),
];

groups.screens.blocks = [
  numberedText("Em quantas telas você precisa assistir ao mesmo tempo?", [
    { label: "1 tela", value: "1" }, { label: "2 telas", value: "2" },
    { label: "3 telas", value: "3" }, { label: "Mais de 3 telas", value: "4" },
  ]),
  numberedChoice("screens-choice", "simultaneous_screens", [
    { label: "1 tela", value: "1", target: "interest" }, { label: "2 telas", value: "2", target: "interest" },
    { label: "3 telas", value: "3", target: "interest" }, { label: "Mais de 3 telas", value: "4", target: "sales" },
  ]),
];

const planItems = plans.length
  ? plans.map((plan) => ({
      label: plan.name,
      description: `${plan.name} — R$ ${Number(plan.amount).toFixed(2).replace(".", ",")}`,
      optionId: `plan_${plan.id}`,
      value: plan.id,
    }))
  : [{ label: "Consultar planos com atendente", value: "manual", target: "human" }];
const interestCondition = (suffix) => ({
  id: `interest-condition-${suffix}`, type: "Condition", options: undefined,
  items: [
    { id: `interest-condition-trial-${suffix}`, content: { logicalOperator: "AND", comparisons: [{ id: `cmp-interest-trial-${suffix}`, variableId: varId("intent"), comparisonOperator: "Equal to", value: "trial" }] }, outgoingEdgeId: edge(`interest-trial-${suffix}`, { blockId: `interest-condition-${suffix}`, itemId: `interest-condition-trial-${suffix}` }, "trial") },
    { id: `interest-condition-purchase-${suffix}`, content: { logicalOperator: "AND", comparisons: [{ id: `cmp-interest-purchase-${suffix}`, variableId: varId("intent"), comparisonOperator: "Equal to", value: "purchase" }] }, outgoingEdgeId: edge(`interest-purchase-${suffix}`, { blockId: `interest-condition-${suffix}`, itemId: `interest-condition-purchase-${suffix}` }, "trial") },
  ],
  outgoingEdgeId: edge(`interest-fallback-${suffix}`, { blockId: `interest-condition-${suffix}` }, "human"),
});
const planPageSize = 9;
const planPage1 = planItems.slice(0, planPageSize);
const planPage2 = planItems.slice(planPageSize);
if (planPage2.length > planPageSize) throw new Error(`Plan catalog has ${planItems.length} items; add another interactive page`);
const plansStartEdge = edge("interest-plans-start", { blockId: "interest-save" }, "interest-plans-1");
groups.interest.blocks = [
  http("interest-save", "POST", "/typebot/intake", intakeBody("{{intent}}", "plan", { simultaneous_screens: "{{simultaneous_screens}}" }), [], plansStartEdge),
];
const planPage1Options = planPage2.length
  ? [...planPage1, { label: "Ver mais planos", target: "interest-plans-2" }]
  : planPage1;
groups["interest-plans-1"].blocks = [
  numberedText("Escolha o plano", planPage1Options),
  numberedChoice("interest-plan-page-1", "plan_id", planPage1Options),
  interestCondition("page-1"),
];
groups["interest-plans-2"].blocks = [
  numberedText("Mais planos", [...planPage2, { label: "Voltar aos planos anteriores", target: "interest-plans-1" }]),
  numberedChoice("interest-plan-page-2", "plan_id", [...planPage2, { label: "Voltar aos planos anteriores", target: "interest-plans-1" }]),
  interestCondition("page-2"),
];

groups.trial.blocks = [
  numberedText("Qual tipo de conteúdo deseja no teste?", [
    { label: "Sem conteúdo adulto", value: "no_adults" }, { label: "Completo", value: "complete" },
  ]),
  numberedChoice("trial-content-choice", "trial_content", [
    { label: "Sem conteúdo adulto", value: "no_adults" },
    { label: "Completo", value: "complete" },
  ]),
  http("trial-create", "POST", "/typebot/union/tests", {
    idempotency_key: "trial_{{session_key}}", phone: "{{phone}}", name: "{{pushName}}", prospect_id: "{{prospect_id}}",
    server: "kyros", duration_hours: 6, content: "{{trial_content}}",
  }, [["test_id", "test_event_id"], ["test_username", "test.username"], ["test_password", "test.password"], ["test_reply", "test.reply"], ["test_payment_url", "test.payment_url"]]),
  {
    id: "trial-created-condition", type: "Condition", items: [{
      id: "trial-created", content: { logicalOperator: "AND", comparisons: [
        { id: "trial-user-present", variableId: varId("test_username"), comparisonOperator: "Is set" },
        { id: "trial-password-present", variableId: varId("test_password"), comparisonOperator: "Is set" },
      ] }, outgoingEdgeId: edge("trial-created", { blockId: "trial-created-condition", itemId: "trial-created" }, "trial", "trial-device-condition"),
    }], outgoingEdgeId: edge("trial-not-created", { blockId: "trial-created-condition" }, "error"),
  },
  {
    id: "trial-device-condition", type: "Condition", items: [{
      id: "trial-device-samsung", content: { logicalOperator: "AND", comparisons: [{
        id: "trial-device-samsung-comparison", variableId: varId("device_brand"), comparisonOperator: "Equal to", value: "samsung",
      }] }, outgoingEdgeId: edge("trial-device-samsung", { blockId: "trial-device-condition", itemId: "trial-device-samsung" }, "trial-samsung"),
    }], outgoingEdgeId: edge("trial-device-other", { blockId: "trial-device-condition" }, "trial-other"),
  },
];

const afterTrialOptions = [
  { label: "Fechar plano", value: "checkout", target: "purchase" },
  { label: "Falar com atendente", value: "human", target: "human" },
  { label: "Voltar ao menu", value: "menu", target: "menu" },
];
groups["trial-samsung"].blocks = [
  text("trial-samsung-install", "✅ Seu teste está pronto!\n\n{{guide_chat_instructions}}\n\nOrientações e códigos específicos do servidor:\n{{test_reply}}\n\nUsuário: {{test_username}}\nSenha: {{test_password}}\n\nNunca use código fixo de outro servidor."),
  numberedText("O que deseja fazer agora?", afterTrialOptions),
  numberedChoice("trial-samsung-after", null, afterTrialOptions),
];
groups["trial-other"].blocks = [
  text("trial-other-install", "✅ Seu teste está pronto!\n\n{{guide_chat_instructions}}\n\nAplicativo recomendado: {{app_name}}\nCódigo do provedor (quando solicitado): {{provider_code}}\nUsuário: {{test_username}}\nSenha: {{test_password}}\n\nGuarde esses dados e faça a instalação seguindo os passos acima."),
  numberedText("O que deseja fazer agora?", afterTrialOptions),
  numberedChoice("trial-other-after", null, afterTrialOptions),
];

const purchaseOrderToCondition = edge("purchase-order-condition", { blockId: "purchase-order" }, "purchase", "purchase-checkout-condition");
groups.purchase.blocks = [
  text("purchase-info", "Perfeito. Vou separar o checkout seguro do plano que você escolheu."),
  http("purchase-order", "POST", "/typebot/orders", {
    session_key: "{{session_key}}", purpose: "trial_conversion", plan_id: "{{plan_id}}", simultaneous_screens: "{{simultaneous_screens}}", union_direct_test_event_id: "{{test_id}}",
  }, [["sales_order_id", "order.id"], ["plan_name", "order.plan_name"], ["plan_amount", "order.amount"], ["checkout_url", "order.checkout_url"], ["order_requires_human", "requires_human"]], purchaseOrderToCondition),
  {
    id: "purchase-checkout-condition", type: "Condition", items: [{
      id: "purchase-checkout-unavailable", content: { comparisons: [{
        id: "purchase-checkout-unavailable-comparison", variableId: varId("order_requires_human"), comparisonOperator: "Equal to", value: "true",
      }] }, outgoingEdgeId: edge("purchase-checkout-unavailable", { blockId: "purchase-checkout-condition", itemId: "purchase-checkout-unavailable" }, "human"),
    }], outgoingEdgeId: edge("purchase-checkout-ready", { blockId: "purchase-checkout-condition" }, "purchase", "purchase-saved"),
  },
  text("purchase-saved", "Plano: {{plan_name}}\nValor: R$ {{plan_amount}}\n\nPara concluir a assinatura, abra o checkout seguro:\n{{checkout_url}}\n\nAssim que a PaggPay confirmar o pagamento, você receberá a confirmação automaticamente por aqui."),
  numberedText("Enquanto isso, você pode:", [{ label: "Voltar ao menu", value: "menu", target: "menu" }, { label: "Falar com atendente", value: "human", target: "human" }]),
  numberedChoice("purchase-after", null, [{ label: "Voltar ao menu", value: "menu", target: "menu" }, { label: "Falar com atendente", value: "human", target: "human" }]),
];

groups.renew.blocks = [
  http("renew-intake", "POST", "/typebot/intake", intakeBody("renewal", "renewal_lookup"), [
    ["prospect_id", "prospect_id"], ["customer_id", "customer.id"], ["customer_match", "customer_match"], ["plan_amount", "customer.value"],
  ]),
  {
    id: "renew-customer-condition", type: "Condition",
    items: [{
      id: "renew-customer-found", content: { logicalOperator: "AND", comparisons: [{
        id: "renew-customer-found-comparison", variableId: varId("customer_match"), comparisonOperator: "Equal to", value: "found",
      }] }, outgoingEdgeId: edge("renew-customer-found", { blockId: "renew-customer-condition", itemId: "renew-customer-found" }, "renew", "renew-info"),
    }],
    outgoingEdgeId: edge("renew-customer-not-found", { blockId: "renew-customer-condition" }, "human"),
  },
  text("renew-info", "Localizei o cadastro com base no seu WhatsApp. Valor atual: R$ {{plan_amount}}. Se houver divergência ou mais de um cadastro, fale com um atendente antes de pagar."),
  numberedText("O que deseja fazer?", [
    { label: "Gerar Pix" }, { label: "Tenho dúvida" }, { label: "Financeiro" },
  ]),
  numberedChoice("renew-choice", null, [
    { label: "Gerar Pix", target: "pix" }, { label: "Tenho dúvida", target: "human" }, { label: "Financeiro", target: "finance" },
  ]),
];

groups.pix.blocks = [
  text("pix-warning", "A confirmação será feita automaticamente pela PaggPay. Enviar comprovante ou escrever “paguei” não substitui a confirmação bancária."),
  http("pix-create", "POST", "/typebot/renewals/paggpay", {
    idempotency_key: "renew_{{session_key}}", phone: "{{phone}}", payer_pays_fee: false,
  }, [["renewal_id", "renewal_id"], ["pix_code", "pix_copy_paste"], ["plan_amount", "amount"]]),
  text("pix-result", "Pix no valor de R$ {{plan_amount}}:\n\n{{pix_code}}\n\nApós a confirmação bancária, o Horizons enviará a renovação ao painel."),
  numberedText("O que deseja fazer agora?", [{ label: "Voltar ao menu", target: "menu" }, { label: "Falar com Financeiro", target: "finance" }]),
  numberedChoice("pix-after", null, [{ label: "Voltar ao menu", target: "menu" }, { label: "Falar com Financeiro", target: "finance" }]),
];

groups.access.blocks = [
  http("access-lookup", "POST", "/typebot/access/lookup", { session_key: "{{session_key}}" }, [
    ["access_username", "primary_access.username"], ["access_password", "primary_access.password"],
    ["access_message", "primary_access.message"], ["access_checkout_url", "primary_access.checkout_url"],
  ]),
  text("access-result", "Seus dados cadastrados são:\n\nUsuário: {{access_username}}\nSenha: {{access_password}}\n\n{{access_message}}\n\nCheckout permanente para renovações: {{access_checkout_url}}"),
  numberedText("O que deseja fazer agora?", [{ label: "Renovar meu plano", target: "renew" }, { label: "Voltar ao menu", target: "menu" }, { label: "Falar com suporte", target: "support" }]),
  numberedChoice("access-after", null, [{ label: "Renovar meu plano", target: "renew" }, { label: "Voltar ao menu", target: "menu" }, { label: "Falar com suporte", target: "support" }]),
];

groups.support.blocks = [
  http("support-intake", "POST", "/typebot/intake", intakeBody("support", "support_reason")),
  numberedText("Qual problema você está enfrentando?", [
    { label: "Não abre", value: "not_opening" }, { label: "Está travando", value: "buffering" },
    { label: "Sem canais", value: "no_channels" }, { label: "Instalação", value: "installation" },
    { label: "Usuário ou senha", value: "credentials" }, { label: "Outro", value: "other" },
  ]),
  numberedChoice("support-choice", "error_code", [
    { label: "Não abre", value: "not_opening" }, { label: "Está travando", value: "buffering" },
    { label: "Sem canais", value: "no_channels" }, { label: "Instalação", value: "installation" },
    { label: "Usuário ou senha", value: "credentials" }, { label: "Outro", value: "other" },
  ]),
  http("support-handoff", "POST", "/typebot/handoffs", { session_key: "{{session_key}}", department: "support", reason: "{{error_code}}", summary: "Aparelho: {{device_location}}; marca: {{device_brand}}; app: {{app_name}}." }, [["handoff_id", "handoff_id"]]),
  text("support-end", "Seu caso foi enviado ao Suporte. Protocolo: {{handoff_id}}. As instruções automáticas por aparelho serão incluídas junto do catálogo de apps."),
];

groups.finance.blocks = [
  http("finance-intake", "POST", "/typebot/intake", intakeBody("finance", "finance_reason")),
  numberedText("Sobre qual assunto financeiro você precisa falar?", [
    { label: "Pagamento não reconhecido", value: "payment_not_found" }, { label: "Valor divergente", value: "amount_mismatch" },
    { label: "Enviar comprovante", value: "receipt" }, { label: "Cancelamento ou reembolso", value: "refund" },
    { label: "Outro", value: "other" },
  ]),
  numberedChoice("finance-choice", "error_code", [
    { label: "Pagamento não reconhecido", value: "payment_not_found" }, { label: "Valor divergente", value: "amount_mismatch" },
    { label: "Enviar comprovante", value: "receipt" }, { label: "Cancelamento ou reembolso", value: "refund" },
    { label: "Outro", value: "other" },
  ]),
  http("finance-handoff", "POST", "/typebot/handoffs", { session_key: "{{session_key}}", department: "finance", reason: "{{error_code}}", summary: "Solicitação financeira recebida pelo Typebot." }, [["handoff_id", "handoff_id"]]),
  text("finance-end", "Encaminhei sua solicitação ao Financeiro. Protocolo: {{handoff_id}}."),
];

groups.human.blocks = [
  http("human-intake", "POST", "/typebot/intake", intakeBody("human", "human_handoff")),
  http("human-handoff", "POST", "/typebot/handoffs", { session_key: "{{session_key}}", department: "general", reason: "Atendimento humano solicitado", summary: "Intenção anterior: {{intent}}." }, [["handoff_id", "handoff_id"]]),
  text("human-end", "Certo. Encaminhei a conversa para um atendente. Protocolo: {{handoff_id}}."),
];

groups.sales.blocks = [
  text("sales-info", "Cada acesso atende até 3 telas simultâneas. Para mais de 3, precisamos montar uma proposta com dois ou mais acessos."),
  http("sales-handoff", "POST", "/typebot/handoffs", { session_key: "{{session_key}}", department: "sales", reason: "Mais de 3 telas simultâneas", summary: "Cliente informou mais de 3 telas simultâneas." }, [["handoff_id", "handoff_id"]]),
  text("sales-end", "Encaminhei para Vendas montar a melhor combinação. Protocolo: {{handoff_id}}."),
];

groups.finish.blocks = [
  text("finish-text", "Posso ajudar em mais alguma coisa?"),
  numberedText("Escolha uma opção", [{ label: "Voltar ao menu", target: "menu" }, { label: "Encerrar" }]),
  numberedChoice("finish-choice", null, [{ label: "Voltar ao menu", target: "menu" }, { label: "Encerrar" }]),
];
groups.error.blocks = [
  text("error-text", "Não consegui concluir essa etapa com segurança. Para evitar teste, cobrança ou renovação duplicada, não vou repetir automaticamente."),
  numberedText("Escolha uma opção", [{ label: "Voltar ao menu", target: "menu" }, { label: "Falar com atendente", target: "human" }]),
  numberedChoice("error-choice", null, [{ label: "Voltar ao menu", target: "menu" }, { label: "Falar com atendente", target: "human" }]),
];

const typebot = {
  ...getBody.typebot,
  groups: groupDefs.map(([key]) => groups[key]),
  variables,
  edges,
  events: [{ id: "event-start-horizons", type: "start", graphCoordinates: { x: 0, y: 0 }, outgoingEdgeId: startEdge }],
};
const allBlocks = typebot.groups.flatMap((group) => group.blocks || []);
const interactiveBlocks = allBlocks.filter((block) => block.type === "text" && /\[(?:buttons|list)\]/.test(block.content?.plainText || ""));
const choiceBlocks = allBlocks.filter((block) => block.type === "choice input");
const unpairedChoices = typebot.groups.flatMap((group) => (group.blocks || []).flatMap((block, index, blocks) => {
  if (block.type !== "choice input") return [];
  const previous = blocks[index - 1];
  return previous?.type === "text" && /\[(?:buttons|list)\]/.test(previous.content?.plainText || "") ? [] : [block.id];
}));
const mismatchedChoiceIds = typebot.groups.flatMap((group) => (group.blocks || []).flatMap((block, index, blocks) => {
  if (block.type !== "choice input") return [];
  const previousContent = blocks[index - 1]?.content?.plainText || "";
  const interactiveIds = [...previousContent.matchAll(/^(?:id|rowId): ([^\n]+)$/gm)].map((match) => match[1]);
  const choiceIds = (block.items || []).map((item) => String(item.content));
  return JSON.stringify(interactiveIds) === JSON.stringify(choiceIds)
    ? []
    : [{ blockId: block.id, interactiveIds, choiceIds }];
}));
const duplicateBlockIds = allBlocks.map((block) => block.id).filter((id, index, ids) => ids.indexOf(id) !== index);
const duplicateEdgeIds = edges.map((item) => item.id).filter((id, index, ids) => ids.indexOf(id) !== index);
const unresolvedEdges = edges.filter((item) => !typebot.groups.some((group) => group.id === item.to?.groupId));
const invalidInteractiveBlocks = interactiveBlocks.flatMap((block) => {
  const content = block.content.plainText;
  const replyLabels = [...content.matchAll(/displayText: ([^\n]+)/g)].map((match) => match[1]);
  const rowTitles = [...content.matchAll(/\[row\]\ntitle: ([^\n]+)/g)].map((match) => match[1]);
  const errors = [];
  if (content.includes("[buttons]") && (replyLabels.length < 1 || replyLabels.length > 3)) errors.push("button-count");
  if (replyLabels.some((label) => label.length > 25)) errors.push("button-label-length");
  if (content.includes("[list]") && (rowTitles.length < 4 || rowTitles.length > 10)) errors.push("list-row-count");
  if (rowTitles.some((title) => title.length > 24)) errors.push("list-title-length");
  if (/^(?:\s*[▶️]*\s*\d+\s*[-.)])/mu.test(content)) errors.push("numbered-visible-option");
  return errors.length ? [{ blockId: block.id, errors }] : [];
});
if (unpairedChoices.length || mismatchedChoiceIds.length || duplicateBlockIds.length || duplicateEdgeIds.length || unresolvedEdges.length || invalidInteractiveBlocks.length) {
  throw new Error(JSON.stringify({ unpairedChoices, mismatchedChoiceIds, duplicateBlockIds, duplicateEdgeIds, unresolvedEdges: unresolvedEdges.map((item) => item.id), invalidInteractiveBlocks }));
}
if (process.env.TYPEBOT_DRY_RUN === "1") {
  process.stdout.write(JSON.stringify({
    dryRun: true,
    groups: typebot.groups.length,
    blocks: allBlocks.length,
    edges: edges.length,
    variables: variables.length,
    plans: plans.length,
    buttons: interactiveBlocks.filter((block) => block.content.plainText.includes("[buttons]")).length,
    lists: interactiveBlocks.filter((block) => block.content.plainText.includes("[list]")).length,
    choices: choiceBlocks.length,
    unpairedChoices: unpairedChoices.length,
    mismatchedChoiceIds: mismatchedChoiceIds.length,
    duplicateBlockIds: duplicateBlockIds.length,
    duplicateEdgeIds: duplicateEdgeIds.length,
    unresolvedEdges: unresolvedEdges.length,
    invalidInteractiveBlocks: invalidInteractiveBlocks.length,
  }) + "\n");
  process.exit(0);
}
const response = await fetch(`${env.TYPEBOT_API_URL}/api/v1/typebots/${env.TYPEBOT_ID}`, {
  method: "PATCH", headers: authHeaders, body: JSON.stringify({ typebot, overwrite: true }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Update failed HTTP ${response.status}: ${JSON.stringify(body)}`);
const publishResponse = await fetch(`${env.TYPEBOT_API_URL}/api/v1/typebots/${env.TYPEBOT_ID}/publish`, {
  method: "POST", headers: authHeaders,
});
const publishBody = await publishResponse.json().catch(() => ({}));
if (!publishResponse.ok) throw new Error(`Publish failed HTTP ${publishResponse.status}: ${JSON.stringify(publishBody)}`);
const blockCount = (body.typebot?.groups || []).reduce((sum, group) => sum + group.blocks.length, 0);
process.stdout.write(JSON.stringify({ updated: true, published: publishBody.message === "success", warnings: publishBody.warnings || [], groups: body.typebot?.groups?.length, blocks: blockCount, edges: body.typebot?.edges?.length, variables: body.typebot?.variables?.length, plans: plans.length }) + "\n");
