import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Save, Server, Wifi, Key } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Card from '@/components/Common/Card';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { useConfig } from '@/contexts/ConfigContext';
import { supabase } from '@/lib/customSupabaseClient';
import { logEvent, LOG_LEVELS } from '@/services/logs';

const Configuracoes = () => {
  const { apiConfigs, saveConfig, loading: configLoading } = useConfig();
  
  const [groqConfig, setGroqConfig] = useState({
    api_key: ''
  });
  
  const [savingGroq, setSavingGroq] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState({ loading: true, configured: false, connected: false, state: 'unknown' });
  
  const { success, error } = useToastNotification();

  // Sync state with context when loaded
  useEffect(() => {
    if (apiConfigs?.groq) {
      setGroqConfig({
        api_key: apiConfigs.groq.api_key || ''
      });
    }
  }, [apiConfigs]);

  const handleGroqChange = (e) => {
    const { name, value } = e.target;
    setGroqConfig(prev => ({ ...prev, [name]: value }));
  };

  const refreshEvolutionStatus = useCallback(async () => {
    setEvolutionStatus((current) => ({ ...current, loading: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/api/whatsapp/status', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error('Não foi possível consultar a Evolution API.');
      setEvolutionStatus({ loading: false, ...(await response.json()) });
    } catch (err) {
      setEvolutionStatus({ loading: false, configured: false, connected: false, state: 'unavailable' });
    }
  }, []);

  useEffect(() => { refreshEvolutionStatus(); }, [refreshEvolutionStatus]);

  const handleSaveGroq = async (e) => {
    e.preventDefault();
    setSavingGroq(true);
    
    try {
      await saveConfig('groq', groqConfig);
      success('Configurações Groq salvas', 'Chave de API da IA atualizada com sucesso.');
      logEvent(LOG_LEVELS.INFO, 'sistema', 'config', 'Groq Configurations updated via UI', {});
    } catch (err) {
      error('Erro ao salvar', err.message || 'Ocorreu um erro ao salvar as configurações.');
    } finally {
      setSavingGroq(false);
    }
  };


  return (
    <>
      <Helmet>
        <title>Configurações - Admin Panel</title>
        <meta name="description" content="Configurações do sistema" />
      </Helmet>

      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Configurações</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Gerencie as integrações e parâmetros do sistema</p>
        </div>

        {/* Evolution API Settings */}
        <Card>
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Integração Evolution API</h2>
              <p className="text-sm text-gray-500">A instância é gerenciada com segurança pela VPS; nenhum token é exposto no navegador.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700 space-y-4">
               <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                 <Wifi className="w-4 h-4" />
                 Teste de Conexão
               </h3>
               <p className="text-sm text-gray-700 dark:text-gray-300">
                 {evolutionStatus.loading ? 'Consultando instância…' : evolutionStatus.connected ? 'Instância conectada e pronta para envio.' : evolutionStatus.configured ? 'Instância configurada, porém não conectada.' : 'Evolution API ainda não está configurada no Horizons.'}
               </p>
               <Button type="button" variant="outline" onClick={refreshEvolutionStatus} loading={evolutionStatus.loading}>Atualizar status</Button>
            </div>
          </div>
        </Card>

        {/* Groq Settings */}
        <Card>
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Integração IA (Groq)</h2>
              <p className="text-sm text-gray-500">Chave de API para geração de mensagens automáticas</p>
            </div>
          </div>

          <form onSubmit={handleSaveGroq} className="space-y-6">
            <div>
              <Input
                label="Groq API Key"
                name="api_key"
                type="password"
                value={groqConfig.api_key}
                onChange={handleGroqChange}
                placeholder="Ex: gsk_..."
                helperText="Necessária para utilizar o Assistente IA nas campanhas"
                disabled={configLoading}
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button type="submit" variant="primary" icon={Save} loading={savingGroq || configLoading}>
                {savingGroq ? 'Salvando...' : 'Salvar Chave Groq'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

export default Configuracoes;
