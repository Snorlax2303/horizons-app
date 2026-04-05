import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { 
  Plus, Clock, Send, Sparkles, Bot, User, Check, RefreshCw, MessageSquare, 
  Copy, AlertCircle, FileText, Filter, X, Users, UserPlus, Image as ImageIcon, 
  Trash2, Upload, Folder, Search, CheckSquare, Square, AlertTriangle, Server
} from 'lucide-react';
import Button from '@/components/Common/Button';
import Table from '@/components/Common/Table';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { formatDateTime, formatCurrency } from '@/utils/formatters';
import { MONTHS } from '@/utils/constants';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { renderTemplate, processCampaign } from '@/services/envios';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useConfig } from '@/contexts/ConfigContext';

// Default Template Fallback
const DEFAULT_TEMPLATE = `Olá {{nome}}!
Sua fatura do plano {{plano}} no valor de {{valor}} vence no dia {{vencimento}}.
Acesse para pagar ou digite #pix.`;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; 

const Campanhas = () => {
  const { user } = useAuth();
  const { apiConfigs } = useConfig();
  const [campanhas, setCampanhas] = useState([]);
  const [plans, setPlans] = useState([]);
  const [servers, setServers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Data Cache
  const [rawCustomers, setRawCustomers] = useState([]);
  const [rawProspects, setRawProspects] = useState([]);
  const [fetchingData, setFetchingData] = useState(false);

  // Wizard State
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewClients, setPreviewClients] = useState([]); // Final list to send
  const [recipientSearchTerm, setRecipientSearchTerm] = useState('');
  
  // Advanced Filters State
  const [filters, setFilters] = useState({
    audience: 'customers', // 'customers' or 'prospects'
    status: ['active'], // ['active', 'inactive']
    paymentStatus: ['unpaid'], // ['paid', 'unpaid']
    planIds: [], // array of IDs
    serverIds: [], // array of IDs
    groupIds: [] // array of IDs for prospects
  });

  // AI Chat State
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatError, setChatError] = useState(null);
  const chatEndRef = useRef(null);
  
  // Sending State
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });

  // Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    referencia_mes: new Date().getMonth(),
    referencia_ano: new Date().getFullYear(),
    template_text: '', 
    selected_template_id: '',
    scheduled_at: '',
    image_url: '' // New field for image
  });

  const { success, error: toastError, info } = useToastNotification();

  useEffect(() => {
    if (user) {
      loadCampanhas();
      fetchPlans();
      fetchServers();
      fetchGroups();
      loadTemplates();
    }
  }, [user]);

  // Effect to update preview when selection or template changes
  useEffect(() => {
    if (modalOpen) {
      updatePreviewMessageOnly();
    }
  }, [formData.template_text, formData.referencia_mes, formData.referencia_ano]);

  // Effect to handle data fetching when wizard opens or audience changes
  useEffect(() => {
    if (modalOpen && wizardStep === 2) {
      if (filters.audience === 'customers' && rawCustomers.length === 0) {
        fetchAllData('customers');
      } else if (filters.audience === 'prospects' && rawProspects.length === 0) {
        fetchAllData('prospects');
      }
    }
  }, [modalOpen, wizardStep, filters.audience]);

  // Auto-scroll chat
  useEffect(() => {
    if (aiChatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, aiChatOpen, chatError]);

  // Helper to fetch all records with loop
  const fetchBatch = async (table) => {
    let allData = [];
    let page = 0;
    let size = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', user.id)
        .range(page * size, (page + 1) * size - 1);

      if (error) throw error;
      
      allData = [...allData, ...data];
      if (data.length < size) hasMore = false;
      page++;
    }
    return allData;
  };

  const fetchAllData = async (type) => {
    setFetchingData(true);
    try {
      if (type === 'customers') {
        const data = await fetchBatch('customers');
        setRawCustomers(data);
      } else {
        const data = await fetchBatch('prospects');
        setRawProspects(data);
      }
    } catch (err) {
      console.error(`Error fetching ${type}:`, err);
      toastError('Erro', `Falha ao carregar lista de ${type}.`);
    } finally {
      setFetchingData(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setAvailableTemplates(data || []);

      if (!formData.template_text) {
        const defaultTmpl = (data || []).find(t => t.is_default);
        if (defaultTmpl) {
          setFormData(prev => ({ 
            ...prev, 
            template_text: defaultTmpl.content, 
            selected_template_id: defaultTmpl.id
          }));
        } else {
             setFormData(prev => ({ ...prev, template_text: DEFAULT_TEMPLATE }));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
      if (!formData.template_text) {
        setFormData(prev => ({ ...prev, template_text: DEFAULT_TEMPLATE }));
      }
    }
  };

  const handleTemplateSelect = (e) => {
    const tmplId = e.target.value;
    if (!tmplId) return;

    const template = availableTemplates.find(t => String(t.id) === String(tmplId));
    if (template) {
      setFormData(prev => ({
        ...prev,
        selected_template_id: template.id,
        template_text: template.content
      }));
    }
  };

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase.from('plans').select('*').eq('user_id', user.id);
      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      console.error('Erro ao carregar planos:', err);
    }
  };

  const fetchServers = async () => {
    try {
      const { data, error } = await supabase.from('servers').select('id, name').eq('user_id', user.id);
      if (error) throw error;
      setServers(data || []);
    } catch (err) {
      console.error('Erro ao carregar servidores:', err);
    }
  };
  
  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase.from('prospect_groups').select('*').eq('user_id', user.id);
      if (error) throw error;
      setGroups(data || []);
    } catch (err) {
      console.error('Erro ao carregar grupos:', err);
    }
  };

  const loadCampanhas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setCampanhas(data || []);
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
      toastError('Erro', 'Falha ao carregar histórico de campanhas.');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toastError('Erro', 'Por favor, selecione apenas arquivos de imagem.');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) { 
      toastError('Erro', 'A imagem deve ter no máximo 5MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('campaign-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('campaign-media')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, image_url: publicUrlData.publicUrl }));
      success('Imagem enviada', 'Imagem anexada com sucesso!');
    } catch (err) {
      console.error('Error uploading image:', err);
      toastError('Erro', 'Falha ao fazer upload da imagem.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    setFormData(prev => ({ ...prev, image_url: '' }));
  };

  // --- Filtering Logic ---

  // Compute candidates based on Filters (Memoized)
  const candidateList = useMemo(() => {
    let sourceData = filters.audience === 'customers' ? rawCustomers : rawProspects;
    if (!sourceData) return [];

    return sourceData.filter(item => {
      // 1. Common Filter: Search (Name/Phone)
      if (recipientSearchTerm) {
        const term = recipientSearchTerm.toLowerCase();
        const nameMatch = (item.name || item.nome || '').toLowerCase().includes(term);
        const phoneMatch = (item.phone || item.telefone || '').includes(term);
        if (!nameMatch && !phoneMatch) return false;
      }

      if (filters.audience === 'prospects') {
        // Prospect Filters
        if (filters.groupIds.length > 0) {
           // If groups are selected, item must be in one of them
           if (!item.group_id || !filters.groupIds.includes(item.group_id)) return false;
        } else {
           if (filters.groupIds.length === 0) return false;
        }
        return true;
      } else {
        // Customer Filters
        if (filters.status.length > 0 && !filters.status.includes(item.status)) return false;

        const isPaid = item.paid === true;
        const wantsPaid = filters.paymentStatus.includes('paid');
        const wantsUnpaid = filters.paymentStatus.includes('unpaid');
        
        if (isPaid && !wantsPaid) return false;
        if (!isPaid && !wantsUnpaid) return false;
        if (filters.paymentStatus.length === 0) return false;

        if (filters.planIds.length > 0) {
          if (!filters.planIds.includes(item.plan_id)) return false;
        }

        // Server Filter
        if (filters.serverIds.length > 0) {
          const clientServers = Array.isArray(item.server_ids) ? item.server_ids : [];
          const hasMatchingServer = filters.serverIds.some(id => clientServers.includes(id));
          if (!hasMatchingServer) return false;
        }

        return true;
      }
    });
  }, [filters, rawCustomers, rawProspects, recipientSearchTerm]);


  const updatePreviewMessageOnly = () => {
     if (previewClients.length === 0) return;

     const referenceDate = { month: formData.referencia_mes, year: formData.referencia_ano };

     const updated = previewClients.map(item => {
        let message = '';
        try {
           message = renderTemplate(formData.template_text, item, referenceDate);
        } catch (e) {
           message = 'Erro na renderização';
        }
        return { ...item, previewMessage: message };
     });
     
     setPreviewClients(updated);
  };

  const preparePreviewForNextStep = () => {
     // Gather all objects for selected IDs
     const source = filters.audience === 'customers' ? rawCustomers : rawProspects;
     const selectedObjects = source.filter(item => selectedIds.has(item.id));
     
     const referenceDate = { month: formData.referencia_mes, year: formData.referencia_ano };
     
     const mapped = selectedObjects.map(item => {
         const planName = item.plan_id ? (plans.find(p => p.id === item.plan_id)?.name || 'Plano não encontrado') : '';
         
         const clientWithData = {
             ...item,
             plano_nome: planName, 
             plano: planName 
         };

         let message = '';
         try {
            message = renderTemplate(formData.template_text, clientWithData, referenceDate);
         } catch (e) {
            message = 'Erro na renderização';
         }

         return {
            ...clientWithData,
            previewMessage: message
         };
     });
     
     setPreviewClients(mapped);
  };

  // --- Bulk Selection Handlers ---
  const handleSelectAll = () => {
    // Select ALL filtered candidates (respecting server filter and other filters)
    const newSelected = new Set(selectedIds);
    candidateList.forEach(c => newSelected.add(c.id));
    setSelectedIds(newSelected);
  };

  const handleDeselectAll = () => {
    const newSelected = new Set(selectedIds);
    // Only deselect visible/filtered items? Or deselect absolutely all?
    // "Limpar Seleção" usually implies clearing EVERYTHING or just visible?
    // Let's assume clear what is currently filtered to avoid confusion, 
    // BUT common UX is usually "Deselect All" clears the selection set entirely or just visible.
    // Given the button name "Nenhum", let's clear the visible ones from the set.
    candidateList.forEach(c => newSelected.delete(c.id));
    setSelectedIds(newSelected);
  };
  
  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  
  // --- Campaign Creation ---

  const handleCreateCampanha = async (shouldSendNow) => {
    if (previewClients.length === 0) {
      toastError('Atenção', 'Não há clientes selecionados para envio.');
      return;
    }

    if (previewClients.length > 1000) {
       if (!window.confirm(`Atenção: Você está prestes a criar uma campanha para ${previewClients.length} contatos. Isso pode levar alguns minutos. Deseja continuar?`)) {
         return;
       }
    }

    try {
      // 1. Create Campaign
      const newCampaignPayload = {
        user_id: user.id,
        name: `Campanha ${MONTHS[formData.referencia_mes]}/${formData.referencia_ano}`,
        reference_month: formData.referencia_mes,
        reference_year: formData.referencia_ano,
        template_text: formData.template_text,
        segment: 'advanced_filter', 
        filter_value: JSON.stringify(filters), 
        status: shouldSendNow ? 'executando' : 'agendado',
        total_sent: 0,
        total_failed: 0,
        scheduled_at: shouldSendNow ? new Date().toISOString() : (formData.scheduled_at || new Date().toISOString()),
        image_url: formData.image_url 
      };

      const { data: createdCampaign, error } = await supabase
        .from('campaigns')
        .insert([newCampaignPayload])
        .select()
        .single();

      if (error) throw error;

      // 2. Batch Create Messages
      await createCampaignMessages(createdCampaign.id, previewClients);

      // 3. UI Updates
      const campaignWithCount = { ...createdCampaign, total_envios: previewClients.length }; 
      setCampanhas([campaignWithCount, ...campanhas]);
      setModalOpen(false);
      
      success('Campanha Criada', `Campanha gerada com ${previewClients.length} mensagens.`);

      if (shouldSendNow) {
        await executeCampaign(campaignWithCount);
      }
      
      // Reset
      setWizardStep(1);
      resetForm();
    } catch (err) {
      console.error(err);
      toastError('Erro', 'Falha ao criar campanha.');
    }
  };

  const createCampaignMessages = async (campaignId, recipients) => {
    const BATCH_SIZE = 100;
    const chunks = [];
    
    // Split into chunks
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        chunks.push(recipients.slice(i, i + BATCH_SIZE));
    }

    let totalCreated = 0;
    
    for (const chunk of chunks) {
        const messagesPayload = chunk.map(r => ({
            campaign_id: campaignId,
            customer_id: r.plan_id ? r.id : null, // Only link if it's a customer (proxy check using plan_id)
            phone: r.phone || r.telefone,
            message: r.previewMessage || 'Template not rendered',
            status: 'pending',
            created_at: new Date().toISOString()
        }));
        
        const { error } = await supabase.from('campaign_messages').insert(messagesPayload);
        if (error) {
           console.error('Error creating messages batch:', error);
        } else {
           totalCreated += chunk.length;
        }
    }
    return totalCreated;
  }

  const executeCampaign = async (campaign) => {
    setIsSending(true);
    setProgress({ current: 0, total: previewClients.length, message: 'Iniciando processamento...' });

    try {
      const result = await processCampaign(
        campaign, 
        previewClients, 
        (current, total, message) => {
           setProgress({ current, total, message });
        },
        apiConfigs?.wapi
      );

      const finalStatus = result.failCount > 0 
        ? (result.successCount > 0 ? 'parcial' : 'falha') 
        : 'concluido';

      await supabase
        .from('campaigns')
        .update({ 
          status: finalStatus,
          total_sent: result.successCount,
          total_failed: result.failCount
        })
        .eq('id', campaign.id);

      setCampanhas(prev => prev.map(c => 
        c.id === campaign.id 
          ? { 
              ...c, 
              status: finalStatus, 
              total_sent: result.successCount, 
              total_failed: result.failCount 
            } 
          : c
      ));

      if (result.failCount > 0) {
        toastError('Concluído com erros', `${result.successCount} enviados, ${result.failCount} falhas.`);
      } else {
        success('Sucesso', `Campanha enviada para ${result.successCount} clientes!`);
      }

    } catch (err) {
      console.error(err);
      toastError('Erro Crítico', err.message);
      
      await supabase
        .from('campaigns')
        .update({ status: 'erro' })
        .eq('id', campaign.id);
        
      setCampanhas(prev => prev.map(c => 
        c.id === campaign.id ? { ...c, status: 'erro' } : c
      ));
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    let defaultText = DEFAULT_TEMPLATE;
    let defaultId = '';
    
    const def = availableTemplates.find(t => t.is_default);
    if (def) {
      defaultText = def.content;
      defaultId = def.id;
    }

    setFormData({
      referencia_mes: new Date().getMonth(),
      referencia_ano: new Date().getFullYear(),
      template_text: defaultText,
      selected_template_id: defaultId,
      scheduled_at: '',
      image_url: ''
    });
    setFilters({
      audience: 'customers',
      status: ['active'],
      paymentStatus: ['unpaid'],
      planIds: [],
      serverIds: [],
      groupIds: []
    });
    setSelectedIds(new Set());
    setPreviewClients([]);
    setRecipientSearchTerm('');
  };

  // --- Filter Helpers ---
  const toggleFilter = (category, value) => {
    setFilters(prev => {
      const current = prev[category];
      if (current.includes(value)) {
        return { ...prev, [category]: current.filter(item => item !== value) };
      } else {
        return { ...prev, [category]: [...current, value] };
      }
    });
  };
  
  const handleServerFilterChange = (serverId) => {
    // If empty string, clear server filter
    if (!serverId) {
      setFilters(prev => ({ ...prev, serverIds: [] }));
      return;
    }
    
    // Toggle single selection logic for dropdown (or replace if multi not supported by UI)
    // Here we implement single select dropdown behavior:
    setFilters(prev => ({ ...prev, serverIds: [serverId] }));
  };

  const isFilterSelected = (category, value) => {
    return filters[category].includes(value);
  };


  // --- AI Chat Logic ---
  const openAiChat = () => {
    setAiChatOpen(true);
    setChatError(null);
    if (chatHistory.length === 0) {
      setChatHistory([{
        role: 'assistant',
        text: 'Olá! Sou seu especialista em marketing no WhatsApp. Me diga qual é o objetivo da sua campanha e eu ajudarei a criar a mensagem perfeita. (Ex: cobrança amigável, promoção de natal, aviso de manutenção)'
      }]);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    setChatError(null);

    const userMessage = { role: 'user', text: chatInput };
    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setChatInput('');
    setChatLoading(true);
    
    const groqKey = apiConfigs?.groq?.api_key || "gsk_8J2t7CH2lZJiAjCWmqbiWGdyb3FYIIgBu422JMXWU6b2CvmEXfE"; 

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); 

    try {
      const systemContext = `
        CONTEXTO DO SISTEMA: Você é um especialista em Marketing para WhatsApp.
        REGRAS OBRIGATÓRIAS:
        1. Use estas variáveis: {{nome}}, {{valor}}, {{plano}}, {{vencimento}}.
        2. Seja breve e direto (WhatsApp style).
        3. Use emojis adequados.
        4. Responda em Português do Brasil.
        5. Se o usuário pedir para "criar" ou "gerar", forneça o texto do template claramente.
      `;

      const messages = [];
      messages.push({ role: "system", content: systemContext });
      updatedHistory.forEach(msg => {
         const apiRole = msg.role === 'model' ? 'assistant' : msg.role;
         messages.push({ role: apiRole, content: msg.text });
      });

      const requestBody = {
        model: GROQ_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: false
      };
      
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const responseText = await response.text();
      let responseData;
      
      try {
         responseData = JSON.parse(responseText);
      } catch (parseErr) {
         console.error('Erro ao fazer parse da resposta Groq:', parseErr);
         throw new Error(`Resposta inválida da API (Não é JSON). Status: ${response.status}`);
      }

      if (!response.ok) {
        console.error('Groq API Error Response:', responseData);
        const errorMsg = responseData.error?.message || responseData.error?.code || 'Erro desconhecido na API Groq';
        throw new Error(`Erro API (${response.status}): ${errorMsg}`);
      }

      if (responseData.choices && responseData.choices.length > 0 && responseData.choices[0].message) {
        const aiResponseText = responseData.choices[0].message.content;
        setChatHistory(prev => [...prev, { role: 'assistant', text: aiResponseText }]);
      } else {
        throw new Error('A IA não retornou nenhum texto candidato. Tente reformular.');
      }

    } catch (err) {
      console.error('Groq Chat Error:', err);
      let displayError = 'Ocorreu um erro ao comunicar com a IA.';
      if (err.name === 'AbortError') displayError = 'Timeout na resposta da IA. Tente novamente.';
      else if (err.message) displayError = err.message;
      setChatError(displayError);
    } finally {
      clearTimeout(timeoutId);
      setChatLoading(false);
    }
  };

  const applyTemplate = (text) => {
    const cleanText = text.replace(/^"|"$/g, '').trim();
    setFormData(prev => ({ ...prev, template_text: cleanText, selected_template_id: '' })); 
    setAiChatOpen(false);
    success('Template aplicado', 'O texto gerado foi inserido no campo de mensagem.');
  };

  const columns = [
    { 
      header: 'Referência', 
      render: (row) => (
        <span className="text-gray-900 dark:text-gray-200">
           {`${MONTHS[row.reference_month] || 'Mês'}/${row.reference_year || 'Ano'}`}
        </span>
      )
    },
    { 
      header: 'Status', 
      render: (row) => {
        const styles = {
          concluido: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
          executando: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
          agendado: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
          erro: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
          parcial: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[row.status] || styles.agendado}`}>
            {row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : 'Desconhecido'}
          </span>
        );
      }
    },
    { 
      header: 'Criado em', 
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-400">
           {formatDateTime(row.created_at)}
        </span>
      )
    },
    { header: 'Enviados', accessor: 'total_sent' },
    { header: 'Falhas', accessor: 'total_failed' }
  ];

  const renderWizardStep = () => {
    switch (wizardStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="font-semibold text-gray-900 dark:text-white">Passo 1: Referência da Campanha e Mídia</h3>
            
            {/* Reference Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">Mês</label>
                <select
                  value={formData.referencia_mes}
                  onChange={(e) => setFormData({ ...formData, referencia_mes: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 outline-none"
                >
                  {MONTHS.map((month, idx) => (
                    <option key={idx} value={idx}>{month}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">Ano</label>
                <input
                  type="number"
                  value={formData.referencia_ano}
                  onChange={(e) => setFormData({ ...formData, referencia_ano: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>

            {/* Image Upload */}
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block flex items-center gap-2">
                 <ImageIcon className="w-4 h-4 text-purple-600" />
                 Imagem da Campanha (Opcional)
               </label>
               
               {formData.image_url ? (
                 <div className="flex flex-col gap-3">
                    <div className="relative w-full max-w-xs aspect-video rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 border dark:border-gray-700">
                      <img src={formData.image_url} alt="Campaign preview" className="w-full h-full object-cover" />
                    </div>
                    <Button 
                      variant="danger" 
                      size="sm" 
                      onClick={removeImage} 
                      icon={Trash2}
                      className="w-fit"
                    >
                      Remover Imagem
                    </Button>
                 </div>
               ) : (
                 <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      ref={fileInputRef}
                      className="hidden"
                      id="campaign-image-upload"
                      disabled={uploadingImage}
                    />
                    <label 
                      htmlFor="campaign-image-upload" 
                      className={`flex flex-col items-center justify-center w-full h-32 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${uploadingImage ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      {uploadingImage ? (
                        <LoadingSpinner size="md" />
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-gray-400 mb-2" />
                          <span className="text-sm text-gray-500 dark:text-gray-400">Clique para fazer upload da imagem</span>
                          <span className="text-xs text-gray-400 mt-1">Máx 5MB (JPG, PNG)</span>
                        </>
                      )}
                    </label>
                 </div>
               )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 flex flex-col h-[550px]">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 shrink-0">
              <Filter className="w-5 h-5 text-green-600" />
              Passo 2: Filtragem e Seleção
            </h3>

            {/* Top Filters Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
              {/* Audience Source */}
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Público Alvo</h4>
                  <div className="flex gap-2">
                      <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${filters.audience === 'customers' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}>
                        <input type="radio" name="audience" className="hidden" checked={filters.audience === 'customers'} onChange={() => { setFilters(prev => ({ ...prev, audience: 'customers' })); setSelectedIds(new Set()); }} />
                        <Users className={`w-4 h-4 ${filters.audience === 'customers' ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Clientes</span>
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${filters.audience === 'prospects' ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}>
                        <input type="radio" name="audience" className="hidden" checked={filters.audience === 'prospects'} onChange={() => { setFilters(prev => ({ ...prev, audience: 'prospects' })); setSelectedIds(new Set()); }} />
                        <UserPlus className={`w-4 h-4 ${filters.audience === 'prospects' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Prospects</span>
                      </label>
                  </div>
                </div>
              </div>

              {/* Filters specific to Audience */}
              <div className="space-y-3 overflow-hidden">
                 {filters.audience === 'prospects' ? (
                    <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 h-full flex flex-col">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex justify-between">
                           <span>Filtrar por Grupo</span>
                           <button onClick={() => setFilters(prev => ({ ...prev, groupIds: [] }))} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Limpar</button>
                        </h4>
                        <div className="overflow-y-auto pr-1 max-h-[100px] grid grid-cols-2 gap-2">
                           {groups.map(group => (
                             <label key={group.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded p-1 text-gray-700 dark:text-gray-200">
                               <input type="checkbox" className="rounded text-blue-600" checked={isFilterSelected('groupIds', group.id)} onChange={() => toggleFilter('groupIds', group.id)} />
                               <span className="truncate">{group.name}</span>
                             </label>
                           ))}
                           {groups.length === 0 && <span className="text-gray-500 dark:text-gray-400 text-xs">Nenhum grupo</span>}
                        </div>
                    </div>
                 ) : (
                    <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 h-full">
                       <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Filtros de Cliente</h4>
                       <div className="flex flex-col gap-2">
                          {/* Basic Filters */}
                          <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-200">
                             <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={isFilterSelected('status', 'active')} onChange={() => toggleFilter('status', 'active')} className="rounded text-green-600" /> Ativos</label>
                             <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={isFilterSelected('status', 'inactive')} onChange={() => toggleFilter('status', 'inactive')} className="rounded text-green-600" /> Inativos</label>
                             <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={isFilterSelected('paymentStatus', 'unpaid')} onChange={() => toggleFilter('paymentStatus', 'unpaid')} className="rounded text-green-600" /> Não Pago</label>
                             <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={isFilterSelected('paymentStatus', 'paid')} onChange={() => toggleFilter('paymentStatus', 'paid')} className="rounded text-green-600" /> Pago</label>
                          </div>
                          
                          {/* Server Filter */}
                          <div className="mt-1 pt-2 border-t border-gray-200 dark:border-gray-700">
                             <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Servidor:</label>
                                <select 
                                  className="flex-1 text-xs py-1 px-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-green-500"
                                  value={filters.serverIds[0] || ''}
                                  onChange={(e) => handleServerFilterChange(e.target.value)}
                                >
                                   <option value="">Todos</option>
                                   {servers.map(server => (
                                      <option key={server.id} value={server.id}>{server.name}</option>
                                   ))}
                                </select>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}
              </div>
            </div>

            {/* Selection Area (List) */}
            <div className="flex-1 flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
               {/* Search & Actions Bar */}
               <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col sm:flex-row gap-3 justify-between items-center">
                  <div className="relative w-full sm:w-64">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                     <input 
                       type="text" 
                       placeholder="Buscar nome ou telefone..." 
                       value={recipientSearchTerm}
                       onChange={(e) => setRecipientSearchTerm(e.target.value)}
                       className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:border-green-500 placeholder-gray-400 dark:placeholder-gray-500"
                     />
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                     <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        <span className="font-bold text-gray-900 dark:text-white">{selectedIds.size}</span> selecionados de {candidateList.length}
                     </div>
                     <div className="flex gap-1">
                       <Button size="sm" variant="outline" className="h-8 text-xs px-2" onClick={handleSelectAll} title="Selecionar Todos Visíveis">
                         <CheckSquare className="w-4 h-4 mr-1" /> Todos
                       </Button>
                       <Button size="sm" variant="outline" className="h-8 text-xs px-2" onClick={handleDeselectAll} title="Limpar Seleção">
                         <Square className="w-4 h-4 mr-1" /> Nenhum
                       </Button>
                     </div>
                  </div>
               </div>

               {/* Virtualized-like List */}
               <div className="flex-1 overflow-y-auto p-2">
                  {fetchingData ? (
                     <div className="h-full flex items-center justify-center flex-col gap-2">
                        <LoadingSpinner />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Carregando contatos...</span>
                     </div>
                  ) : candidateList.length === 0 ? (
                     <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                        Nenhum contato encontrado com os filtros atuais.
                     </div>
                  ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {candidateList.map(item => (
                           <div 
                             key={item.id} 
                             onClick={() => toggleSelection(item.id)}
                             className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                               selectedIds.has(item.id) 
                                 ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                                 : 'bg-white border-gray-100 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-500'
                             }`}
                           >
                              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                 selectedIds.has(item.id) ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                 {selectedIds.has(item.id) && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="overflow-hidden">
                                 <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name || item.nome || 'Sem Nome'}</p>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.phone || item.telefone}</p>
                                 {item.plan_id && (
                                   <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                      {plans.find(p => p.id === item.plan_id)?.name || 'Plano'}
                                   </span>
                                 )}
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
               
               {/* Large Selection Warning */}
               {selectedIds.size > 1000 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 border-t border-yellow-200 dark:border-yellow-800 flex items-center justify-center gap-2 text-xs text-yellow-800 dark:text-yellow-300">
                     <AlertTriangle className="w-4 h-4" />
                     Grande volume selecionado ({selectedIds.size}). O envio pode demorar ~{Math.ceil(selectedIds.size * 0.5 / 60)} min.
                  </div>
               )}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Passo 3: Template da Mensagem</h3>
            
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block mb-2">
                 Selecione um Template Salvo
               </label>
               <div className="flex gap-2">
                 <select
                   value={formData.selected_template_id}
                   onChange={handleTemplateSelect}
                   className="flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 outline-none"
                 >
                   <option value="">-- Selecione ou digite abaixo --</option>
                   {availableTemplates.map(t => (
                     <option key={t.id} value={t.id}>
                       {t.name} {t.is_default ? '(Padrão)' : ''}
                     </option>
                   ))}
                 </select>
                 <Button 
                    variant="outline" 
                    icon={RefreshCw} 
                    onClick={loadTemplates}
                    title="Recarregar Templates"
                 />
               </div>
            </div>

            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Conteúdo da Mensagem</label>
              <Button 
                variant="primary" 
                size="sm" 
                icon={Sparkles} 
                onClick={openAiChat}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg transition-all"
              >
                Abrir Assistente IA
              </Button>
            </div>

            <div className="space-y-2 relative">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                Variáveis: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-purple-600 dark:text-purple-400">{'{{nome}}'}</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-purple-600 dark:text-purple-400">{'{{valor}}'}</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-purple-600 dark:text-purple-400">{'{{plano}}'}</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-purple-600 dark:text-purple-400">{'{{vencimento}}'}</code>
              </label>
              <textarea
                value={formData.template_text}
                onChange={(e) => setFormData({ ...formData, template_text: e.target.value, selected_template_id: '' })}
                rows={8}
                className="w-full px-4 py-3 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 outline-none resize-none font-mono text-sm shadow-sm placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Digite sua mensagem aqui ou selecione um template acima..."
              />
            </div>
            
            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/20">
              <p className="text-xs text-blue-800 dark:text-blue-300 font-bold uppercase mb-2">Simulação Real ({previewClients.length} destinatários):</p>
              <div className="bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-32 overflow-y-auto">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {previewClients.length > 0 ? previewClients[0].previewMessage : '⚠️ Nenhum cliente selecionado.'}
                </p>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 flex flex-col h-[500px]">
             <h3 className="font-semibold text-gray-900 dark:text-white">Passo 4: Revisão e Lista de Envios</h3>
             
             <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 shadow-sm mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                      <span className="text-gray-500 dark:text-gray-400">Público:</span>
                      <span className="ml-2 font-bold text-gray-900 dark:text-gray-100">
                        {filters.audience === 'customers' ? 'Clientes' : 'Possíveis Clientes'}
                      </span>
                   </div>
                   <div>
                      <span className="text-gray-500 dark:text-gray-400">Total Selecionado:</span>
                      <span className={`ml-2 font-bold ${previewClients.length === 0 ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                        {previewClients.length}
                      </span>
                   </div>
                   <div>
                      <span className="text-gray-500 dark:text-gray-400">Mês de Referência:</span>
                      <span className="ml-2 font-bold text-gray-900 dark:text-gray-100">{MONTHS[formData.referencia_mes]}/{formData.referencia_ano}</span>
                   </div>
                   <div>
                      <span className="text-gray-500 dark:text-gray-400">Anexo:</span>
                      <span className="ml-2 font-bold text-gray-900 dark:text-gray-100">
                        {formData.image_url ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <Check className="w-4 h-4" /> Sim (Imagem)
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Não</span>
                        )}
                      </span>
                   </div>
                </div>
                {previewClients.length === 0 && (
                  <p className="mt-2 text-xs text-red-500">
                    Aviso: Nenhum destinatário selecionado. Volte ao passo 2.
                  </p>
                )}
             </div>
            
             {/* Image Preview Panel for Review Step */}
             {formData.image_url && (
                <div className="mb-4 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded overflow-hidden border dark:border-gray-700 bg-white dark:bg-gray-800">
                    <img src={formData.image_url} alt="Anexo" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mídia Anexada</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Esta imagem será enviada junto com a mensagem.</p>
                  </div>
                </div>
             )}

             <div className="flex-1 overflow-auto border dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                   <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                      <tr>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Mensagem Renderizada</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {previewClients.length > 0 ? (
                        previewClients.map((client, idx) => (
                           <tr key={idx}>
                              <td className="px-4 py-2 text-gray-900 dark:text-gray-200">
                                {client.name || client.nome}
                                <br/>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{client.plano_nome}</span>
                              </td>
                              <td className="px-4 py-2">
                                {client.paid !== undefined ? (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${client.paid ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300'}`}>
                                    {client.paid ? 'Pago' : 'Não Pago'}
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                    Prospect
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 truncate max-w-xs" title={client.previewMessage}>
                                 {client.previewMessage}
                              </td>
                           </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                            Nenhum cliente para exibir.
                          </td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Campanhas - Admin Panel</title>
        <meta name="description" content="Gerenciar campanhas de mensagens WhatsApp" />
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Campanhas</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Gerencie e envie campanhas em massa</p>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
            Nova Campanha
          </Button>
        </div>

        <Table 
          columns={columns} 
          data={campanhas}
          emptyMessage="Nenhuma campanha criada ainda"
        />

        {/* Wizard Modal */}
        <Modal
          isOpen={modalOpen}
          onClose={() => { if (!isSending) { setModalOpen(false); setWizardStep(1); resetForm(); } }}
          title="Nova Campanha"
          size="xl"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    wizardStep >= step 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {step}
                  </div>
                  {step < 4 && <div className={`w-12 h-0.5 mx-2 transition-colors ${wizardStep > step ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              ))}
            </div>

            {renderWizardStep()}

            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              {wizardStep > 1 && (
                <Button variant="secondary" onClick={() => setWizardStep(wizardStep - 1)} disabled={isSending}>
                  Voltar
                </Button>
              )}
              
              {wizardStep < 4 ? (
                <Button variant="primary" onClick={() => {
                   if (wizardStep === 2) {
                      if (selectedIds.size === 0) {
                        toastError('Selecione Contatos', 'Você deve selecionar pelo menos um destinatário.');
                        return;
                      }
                      preparePreviewForNextStep();
                   }
                   setWizardStep(wizardStep + 1);
                }} disabled={fetchingData}>
                  Próximo
                </Button>
              ) : (
                <div className="flex gap-2">
                   <Button variant="outline" onClick={() => handleCreateCampanha(false)} icon={Clock} disabled={isSending}>
                      Agendar
                   </Button>
                   <Button variant="primary" onClick={() => handleCreateCampanha(true)} icon={Send} disabled={isSending || previewClients.length === 0}>
                      Enviar Agora ({previewClients.length})
                   </Button>
                </div>
              )}
            </div>
          </div>
        </Modal>

        {/* AI Chat Modal - Groq Integration */}
        <Modal
          isOpen={aiChatOpen}
          onClose={() => setAiChatOpen(false)}
          title="Assistente de Criação (Groq AI)"
          size="lg"
        >
          <div className="flex flex-col h-[500px]">
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-4 border border-gray-200 dark:border-gray-700 relative">
              
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === 'user' 
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' 
                        : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300'
                    }`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>

                    {/* Bubble */}
                    <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-tr-none'
                        : 'bg-purple-600 text-white rounded-tl-none'
                    }`}>
                      {msg.text}
                      
                      {/* Action buttons for AI messages */}
                      {msg.role === 'assistant' && (
                        <div className="mt-3 pt-2 border-t border-purple-500/30 flex gap-2">
                          <button 
                            onClick={() => applyTemplate(msg.text)}
                            className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors"
                          >
                            <Check size={12} /> Usar este texto
                          </button>
                           <button 
                            onClick={() => navigator.clipboard.writeText(msg.text)}
                            className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors"
                          >
                            <Copy size={12} /> Copiar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-purple-600/10 dark:bg-purple-900/20 rounded-2xl rounded-tl-none p-3 ml-11">
                    <LoadingSpinner size="sm" />
                    <span className="text-xs text-purple-600 dark:text-purple-400 ml-2">Digitando...</span>
                  </div>
                </div>
              )}
              
              {chatError && (
                 <div className="flex items-center gap-2 p-3 mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    <AlertCircle size={16} />
                    <span>{chatError}</span>
                 </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Ex: Crie uma mensagem curta cobrando a fatura vencida..."
                className="flex-1 px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none placeholder-gray-400 dark:placeholder-gray-500"
                disabled={chatLoading}
              />
              <Button 
                variant="primary" 
                onClick={handleSendMessage} 
                disabled={chatLoading || !chatInput.trim()}
                className="bg-purple-600 hover:bg-purple-700 px-6 rounded-xl"
              >
                <Send size={20} />
              </Button>
            </div>
            
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2">
              IA otimizada para marketing no WhatsApp (Modelo: Groq Llama 3.3 Versatile)
            </p>
          </div>
        </Modal>

        {/* Sending Progress Modal */}
        {isSending && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
                 <div className="relative w-20 h-20 mx-auto">
                    <LoadingSpinner size="lg" />
                 </div>
                 <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Enviando Campanha</h3>
                    <p className="text-gray-600 dark:text-gray-400">{progress.message}</p>
                 </div>
                 
                 <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                    <div 
                       className="bg-green-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                       style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    ></div>
                 </div>
                 
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {progress.current} de {progress.total} processados
                 </p>
              </div>
           </div>
        )}
      </div>
    </>
  );
};

export default Campanhas;