import { formatCurrency } from '@/utils/formatters';
import { logEvent, LOG_LEVELS } from './logs';
import { normalizeToE164 } from '@/utils/phone';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// W-API Configuration
const WAPI_BASE_URL = 'https://api.w-api.app/v1';

// Helper to wait
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Deprecated: Only used for fallback if config not passed
export const getWApiConfig = () => {
  const stored = localStorage.getItem('api_configs');
  return stored ? JSON.parse(stored) : null;
};

export const validateCredentials = (config) => {
  if (!config || !config.wapi_instance_id || !config.wapi_token) {
    throw new Error('Credenciais da W-API não estão configuradas corretamente.');
  }
};

/**
 * Renders the message template with client data.
 * Handles both DB column names (name, phone, value, due_day) 
 * and Form field names (nome, telefone, valor, dia_vencimento) for backward compatibility.
 */
export const renderTemplate = (template, client, referenceDate) => {
  if (!template) return '';
  let message = template;
  
  // Normalize property access to handle mismatch between DB columns and legacy frontend state
  const name = client.name || client.nome || '';
  const firstName = name.split(' ')[0];
  const phone = client.phone || client.telefone || '';
  
  // Plan Name Priority: plano_nome (explicit) > plano (legacy) > plano_id (if overwritten with name)
  const plan = client.plano_nome || client.plano || client.plano_id || '';
  
  const value = client.value !== undefined ? client.value : client.valor;
  const accessCount = client.quantity_screens !== undefined ? client.quantity_screens : client.qtd_acessos;
  
  // Enhanced Due Date Extraction - checks all possible field names
  const rawDueDay = client.due_day || client.dia_vencimento || client.vencimento || client.data_vencimento;
  const dueDay = rawDueDay ? parseInt(rawDueDay, 10) : null;

  // Calculate Date
  let formattedDueDate = 'Data não definida';
  
  if (dueDay && referenceDate) {
      try {
        // Javascript months are 0-indexed (0=Jan, 11=Dec)
        const year = parseInt(referenceDate.year);
        const month = parseInt(referenceDate.month);
        
        // Create date: Year, Month Index, Day
        const dueDate = new Date(year, month, dueDay);
        
        // Verify if the day rolled over (e.g. Feb 30 -> Mar 2)
        // If the month of the resulting date is different from the input month, it rolled over.
        if (dueDate.getMonth() !== month) {
            // Fallback: Set to last day of the intended month
            const lastDayOfMonth = new Date(year, month + 1, 0);
            formattedDueDate = lastDayOfMonth.toLocaleDateString('pt-BR');
        } else if (!isNaN(dueDate.getTime())) {
            formattedDueDate = dueDate.toLocaleDateString('pt-BR');
        } else {
            console.warn('[renderTemplate] Data inválida gerada:', referenceDate, dueDay);
        }
      } catch (e) {
        console.error('[renderTemplate] Error formatting date:', e);
        formattedDueDate = 'Erro na data';
      }
  } else if (!dueDay) {
      // Fallback: If no due day, maybe try to use today's date or leave a placeholder?
      if (typeof client.vencimento === 'string' && client.vencimento.includes('/')) {
          formattedDueDate = client.vencimento;
      }
  }

  const variables = {
    '{{nome}}': firstName,
    '{{nome_completo}}': name,
    '{{telefone}}': phone,
    '{{plano}}': plan,
    '{{valor}}': formatCurrency(value),
    '{{qtd_acessos}}': accessCount,
    '{{vencimento}}': formattedDueDate
  };

  Object.entries(variables).forEach(([key, val]) => {
    // Replace all occurrences of the variable
    try {
        message = message.split(key).join(val || '');
    } catch (e) {
        console.error(`Error replacing variable ${key}`, e);
    }
  });

  return message;
};

export const getSegmentClients = (segment, filterValue) => {
  // NOTE: This function reads from localStorage for client data which might be outdated
  // ideally this should be passed in or fetched from DB, but keeping for compatibility
  const allClients = JSON.parse(localStorage.getItem('clientes_data') || '[]');
  let activeClients = allClients.filter(c => c.status === 'active');

  switch (segment) {
    case 'by_plan':
      return activeClients.filter(c => c.plano_id === filterValue);
    case 'by_status':
      return allClients.filter(c => c.status === filterValue);
    case 'all':
    default:
      return activeClients;
  }
};

export const sendSingleMessage = async (phone, message, config, contextInfo = 'Direct Send', imageUrl = null) => {
  // If config is not passed, try to get from localStorage (legacy fallback)
  const effectiveConfig = config || getWApiConfig();
  
  validateCredentials(effectiveConfig);

  if (!message || message.trim().length === 0) {
      throw new Error('Mensagem vazia. O envio foi abortado.');
  }

  const { wapi_instance_id, wapi_token } = effectiveConfig;
  
  const originalPhone = phone;
  const normalizedPhone = normalizeToE164(phone);
  
  // Determine if we are sending text only or text + image
  const isImageMessage = !!imageUrl;
  
  const url = isImageMessage 
    ? `${WAPI_BASE_URL}/message/send-image?instanceId=${wapi_instance_id}`
    : `${WAPI_BASE_URL}/message/send-text?instanceId=${wapi_instance_id}`;
  
  const requestBody = {
    phone: normalizedPhone,
    // W-API usually expects 'image' for image url and 'caption' for the text when sending media
    ...(isImageMessage ? { image: imageUrl, caption: message } : { message: message })
  };

  const safeHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer [HIDDEN_TOKEN]'
  };

  logEvent(LOG_LEVELS.INFO, 'api_request', wapi_instance_id, `Initiating W-API request (${contextInfo})`, {
    url,
    method: 'POST',
    phone_original: originalPhone,
    phone_normalized: normalizedPhone,
    message_type: isImageMessage ? 'image' : 'text',
    message_content: message,
    image_url: imageUrl,
    wapi_request_body: requestBody,
    wapi_request_headers: safeHeaders
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${wapi_token}`
      },
      body: JSON.stringify(requestBody)
    });

    let responseData;
    const responseText = await response.text();
    
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      responseData = { raw: responseText, parse_error: 'Could not parse JSON response' };
    }

    const responseHeaders = {};
    response.headers.forEach((val, key) => responseHeaders[key] = val);

    const logDetails = {
      phone_original: originalPhone,
      phone_normalized: normalizedPhone,
      wapi_response_status: response.status,
      wapi_response_status_text: response.statusText,
      wapi_response_headers: responseHeaders,
      wapi_response_body: responseData
    };

    if (!response.ok) {
      logEvent(LOG_LEVELS.ERROR, 'api_response', wapi_instance_id, `W-API Error Response (${contextInfo})`, logDetails);
      const errorMessage = responseData?.error?.message || responseData?.message || response.statusText;
      throw new Error(`API Error ${response.status}: ${errorMessage}`);
    }

    logEvent(LOG_LEVELS.INFO, 'api_response', wapi_instance_id, `W-API Success Response (${contextInfo})`, logDetails);

    return responseData;

  } catch (error) {
    if (!error.message.startsWith('API Error')) {
      logEvent(LOG_LEVELS.ERROR, 'network_error', wapi_instance_id, `Network/CORS Error (${contextInfo})`, {
        error_message: error.message,
        error_stack: error.stack,
        phone_target: normalizedPhone,
        original_url: url
      });
    }
    throw error;
  }
};

const sendWithRetry = async (phone, message, config, clientName, imageUrl, attempt = 1) => {
  try {
    return await sendSingleMessage(phone, message, config, `Client: ${clientName}`, imageUrl);
  } catch (error) {
    if (attempt <= MAX_RETRIES) {
      logEvent(LOG_LEVELS.WARNING, 'system', null, `Retry attempt ${attempt} for ${clientName}`, { error: error.message });
      await delay(RETRY_DELAY * Math.pow(2, attempt - 1));
      return sendWithRetry(phone, message, config, clientName, imageUrl, attempt + 1);
    }
    throw error;
  }
};

/**
 * Main process campaign function.
 * @param {Object} campaign - Campaign data
 * @param {Array} clients - Array of clients to send to
 * @param {Function} onProgress - Callback for progress updates
 * @param {Object} userConfig - OPTIONAL: Configuration object from Context. If null, tries localStorage.
 */
export const processCampaign = async (campaign, clients, onProgress, userConfig = null) => {
  // Try to use passed config (preferred) or fallback to localStorage
  let config = userConfig;
  if (!config) {
     config = getWApiConfig(); 
  }
  
  try {
    validateCredentials(config);
  } catch (err) {
    logEvent(LOG_LEVELS.ERROR, 'campanha', campaign.id, 'Campaign failed to start: Missing Config', {});
    throw err;
  }

  logEvent(LOG_LEVELS.INFO, 'campanha', campaign.id, 'Starting Campaign Execution', {
    total_clients: clients.length,
    campaign_name: `Campanha ${campaign.id}`,
    has_image: !!campaign.image_url
  });

  const storedEnvios = JSON.parse(localStorage.getItem('envios_data') || '[]');
  const newEnvios = [];
  let successCount = 0;
  let failCount = 0;

  const referenceDate = {
    month: campaign.referencia_mes,
    year: campaign.referencia_ano
  };
  
  const imageUrl = campaign.image_url;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    
    // Idempotency check
    const alreadySent = storedEnvios.some(
      e => e.campanha_id === campaign.id && e.cliente_id === client.id && e.status === 'entregue'
    );

    if (alreadySent) {
      const msg = `Pulando ${client.nome || client.name} (já enviado)`;
      onProgress(i + 1, clients.length, msg);
      logEvent(LOG_LEVELS.INFO, 'cliente', client.id, 'Skipped client - duplicate send', { campaign_id: campaign.id });
      continue;
    }

    // 1. Priority: Use the preview message if it exists (ensures WYSIWYG)
    let message = client.previewMessage;

    // 2. Fallback: Re-render if missing (safety net)
    if (!message) {
       console.warn(`[Campanha] Client ${client.id} missing previewMessage. Re-rendering template.`);
       message = renderTemplate(campaign.template_text, client, referenceDate);
    }

    const clientName = client.name || client.nome || 'Cliente';
    const clientPhone = client.phone || client.telefone;
    
    const envioRecord = {
      id: Date.now() + i,
      campanha_id: campaign.id,
      cliente_id: client.id,
      cliente_nome: clientName,
      cliente_telefone: clientPhone,
      mensagem: message,
      status: 'pendente',
      created_at: new Date().toISOString(),
      sent_at: null,
      wapi_message_id: null,
      error_detail: null,
      retry_count: 0
    };

    try {
      if (!message || message.trim() === '') {
         throw new Error('Mensagem gerada está vazia.');
      }

      onProgress(i + 1, clients.length, `Enviando para ${clientName}...`);
      
      const result = await sendWithRetry(clientPhone, message, config, clientName, imageUrl);
      
      envioRecord.status = 'entregue';
      envioRecord.sent_at = new Date().toISOString();
      envioRecord.wapi_message_id = result.id || result.messageId || 'mock_id';
      successCount++;
      
      logEvent(LOG_LEVELS.INFO, 'envio', envioRecord.id, `Message delivered to ${clientName}`, {
        wapi_id: envioRecord.wapi_message_id
      });

    } catch (error) {
      console.error(`Falha ao enviar para ${clientName}:`, error);
      envioRecord.status = 'falha';
      envioRecord.error_detail = error.message;
      envioRecord.retry_count = MAX_RETRIES;
      failCount++;

      logEvent(LOG_LEVELS.ERROR, 'envio', envioRecord.id, `Failed to send to ${clientName} after retries`, {
        error: error.message,
        phone: clientPhone
      });
    }

    newEnvios.push(envioRecord);
    await delay(200);
  }

  localStorage.setItem('envios_data', JSON.stringify([...storedEnvios, ...newEnvios]));

  logEvent(LOG_LEVELS.INFO, 'campanha', campaign.id, 'Campaign Execution Finished', {
    success_count: successCount,
    fail_count: failCount
  });

  return { successCount, failCount };
};