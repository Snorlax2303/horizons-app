import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, Edit2, Trash2, Check, FileText, Star, Copy, Sparkles, Bot, X } from 'lucide-react';
import Button from '@/components/Common/Button';
import Card from '@/components/Common/Card';
import Modal from '@/components/Common/Modal';
import Input from '@/components/Common/Input';
import Table from '@/components/Common/Table';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { TEMPLATE_VARIABLES } from '@/utils/constants';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useConfig } from '@/contexts/ConfigContext';
import { formatDateTime } from '@/utils/formatters';

const Templates = () => {
  const { user } = useAuth();
  const { apiConfigs } = useConfig();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  
  // Operation states
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Data states
  const [aiPrompt, setAiPrompt] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    is_default: false
  });
  
  const { success, error: toastError } = useToastNotification();

  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [user]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
      toastError('Erro', 'Falha ao carregar templates do servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name || template.nome,
        content: template.content || template.conteudo,
        is_default: template.is_default || template.is_padrao || false
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        content: '',
        is_default: false
      });
    }
    setModalOpen(true);
  };

  const handleGenerateAI = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) {
      toastError('Atenção', 'Digite o objetivo da mensagem para a IA.');
      return;
    }

    const apiKey = apiConfigs?.groq?.api_key;
    if (!apiKey) {
      toastError('Configuração Necessária', 'Chave da API Groq não encontrada. Configure em "Configurações" primeiro.');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{
            role: "system",
            content: `Você é um especialista em Copywriting para cobrança e relacionamento com clientes via WhatsApp.
            Sua tarefa é criar templates de mensagens curtos, educados e eficientes.`
          }, {
            role: "user",
            content: `Crie uma mensagem de WhatsApp com o seguinte objetivo: "${aiPrompt}".
            
            REGRAS OBRIGATÓRIAS:
            1. Use obrigatoriamente estas variáveis no texto onde fizer sentido: {{nome}} (nome do cliente), {{valor}} (valor da fatura), {{vencimento}} (data vencimento), {{plano}} (nome do plano).
            2. O tom deve ser profissional mas amigável.
            3. Use emojis moderadamente para suavizar a mensagem.
            4. Responda APENAS com o texto da mensagem, sem explicações antes ou depois.
            5. O idioma deve ser Português do Brasil.`
          }],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Erro na API da IA');
      }

      const data = await response.json();
      const generatedText = data.choices?.[0]?.message?.content?.trim();

      if (generatedText) {
        // Remove surrounding quotes if the AI added them
        const cleanText = generatedText.replace(/^["']|["']$/g, '');
        
        setFormData(prev => ({
          ...prev,
          content: cleanText
        }));
        setAiModalOpen(false);
        setAiPrompt(''); // Reset prompt
        success('Template Gerado', 'O texto foi gerado com sucesso pela IA!');
      } else {
        throw new Error('A IA não retornou nenhum texto válido.');
      }

    } catch (err) {
      console.error('Erro na geração IA:', err);
      toastError('Falha na Geração', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.content) {
      toastError('Campos obrigatórios', 'Preencha o nome e o conteúdo da mensagem.');
      return;
    }

    try {
      // If setting this as default, unset others first
      if (formData.is_default) {
         await supabase
           .from('templates')
           .update({ is_default: false })
           .eq('user_id', user.id);
      }

      if (editingTemplate) {
        // Update existing
        const { error } = await supabase
          .from('templates')
          .update({
            name: formData.name,
            content: formData.content,
            is_default: formData.is_default
          })
          .eq('id', editingTemplate.id)
          .eq('user_id', user.id);

        if (error) throw error;
        success('Atualizado', 'Template atualizado com sucesso.');
      } else {
        // Create new
        const { error } = await supabase
          .from('templates')
          .insert([{
            user_id: user.id,
            name: formData.name,
            content: formData.content,
            is_default: formData.is_default
          }]);

        if (error) throw error;
        success('Criado', 'Novo template criado com sucesso.');
      }

      setModalOpen(false);
      loadTemplates();
    } catch (err) {
      console.error(err);
      toastError('Erro', 'Falha ao salvar template.');
    }
  };

  const handleDeleteClick = (id) => {
    setTemplateToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', templateToDelete)
        .eq('user_id', user.id);

      if (error) throw error;

      success('Excluído', 'Template removido com sucesso.');
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
      loadTemplates();
    } catch (err) {
      console.error(err);
      toastError('Erro', 'Falha ao excluir template.');
    }
  };

  const insertVariable = (variable) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content + variable
    }));
  };

  const columns = [
    { 
      header: 'Nome', 
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.is_default && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
          <span className="font-medium">{row.name}</span>
        </div>
      )
    },
    { 
      header: 'Conteúdo (Prévia)', 
      render: (row) => (
        <span className="text-gray-500 text-sm truncate max-w-md block" title={row.content}>
          {row.content}
        </span>
      )
    },
    { header: 'Criado em', render: (row) => formatDateTime(row.created_at) },
    {
      header: 'Ações',
      render: (row) => (
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleOpenModal(row)}
            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
          >
            <Edit2 size={16} />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleDeleteClick(row.id)}
            className="text-red-600 hover:text-red-800 hover:bg-red-50"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      )
    }
  ];

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
        <title>Templates - Admin Panel</title>
        <meta name="description" content="Gerenciar templates de mensagens" />
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Templates</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Padronize suas mensagens de cobrança e avisos</p>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>
            Novo Template
          </Button>
        </div>

        <Table 
          columns={columns} 
          data={templates}
          emptyMessage="Nenhum template criado ainda."
        />

        {/* Create/Edit Modal */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingTemplate ? 'Editar Template' : 'Novo Template'}
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Nome do Template"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Cobrança Padrão, Aviso de Manutenção..."
              required
            />

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Conteúdo da Mensagem
                </label>
                <div className="flex items-center gap-2">
                   <Button 
                     type="button" 
                     variant="outline" 
                     size="sm" 
                     onClick={() => setAiModalOpen(true)}
                     className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/20 h-8"
                   >
                     <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                     Gerar com IA
                   </Button>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded-t-lg border border-b-0 border-gray-300 dark:border-gray-600 flex gap-2 flex-wrap items-center">
                <span className="text-xs font-semibold text-gray-500 uppercase mr-2">Variáveis:</span>
                {TEMPLATE_VARIABLES.map(variable => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable)}
                    className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-blue-600 dark:text-blue-400 font-mono"
                  >
                    {variable}
                  </button>
                ))}
              </div>
              
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={8}
                className="w-full px-4 py-3 border rounded-b-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 outline-none resize-none font-mono text-sm"
                placeholder="Olá {{nome}}, sua fatura vence em {{vencimento}}..."
                required
              />
              
              <div className="mt-3">
                 <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                   <input 
                     type="checkbox" 
                     checked={formData.is_default} 
                     onChange={(e) => setFormData({...formData, is_default: e.target.checked})}
                     className="rounded text-green-600 focus:ring-green-500"
                   />
                   Definir como template padrão para novas campanhas
                 </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                {editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* AI Generator Modal */}
        <Modal
          isOpen={aiModalOpen}
          onClose={() => !isGenerating && setAiModalOpen(false)}
          title="Assistente de Criação com IA"
          size="md"
        >
          <form onSubmit={handleGenerateAI} className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg shrink-0">
                <Bot className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-purple-900 dark:text-purple-200 font-medium">
                  Descreva o tipo de mensagem que você precisa.
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                  Ex: "Uma cobrança amigável para cliente atrasado há 3 dias" ou "Mensagem de feliz natal oferecendo desconto na renovação".
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Seu objetivo:
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Digite aqui o que você quer que a IA escreva..."
                rows={4}
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => setAiModalOpen(false)}
                disabled={isGenerating}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                variant="primary" 
                loading={isGenerating}
                icon={Sparkles}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isGenerating ? 'Gerando...' : 'Gerar Mensagem'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          title="Confirmar Exclusão"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                type="button" 
                variant="primary" 
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Excluir
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
};

export default Templates;