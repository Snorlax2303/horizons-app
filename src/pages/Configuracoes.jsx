import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Save, Server, Wifi, AlertTriangle, CheckCircle, Smartphone, Key } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Card from '@/components/Common/Card';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { useConfig } from '@/contexts/ConfigContext';
import { logEvent, LOG_LEVELS } from '@/services/logs';
import { sendSingleMessage } from '@/services/envios';
import { formatPhoneInput } from '@/utils/formatters';

const Configuracoes = () => {
  const { apiConfigs, saveConfig, loading: configLoading } = useConfig();
  
  const [wapiConfig, setWapiConfig] = useState({
    wapi_instance_id: '',
    wapi_token: ''
  });

  const [groqConfig, setGroqConfig] = useState({
    api_key: ''
  });
  
  const [testing, setTesting] = useState(false);
  const [savingWapi, setSavingWapi] = useState(false);
  const [savingGroq, setSavingGroq] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState(null);
  
  const { success, error } = useToastNotification();

  // Sync state with context when loaded
  useEffect(() => {
    if (apiConfigs?.wapi) {
      setWapiConfig({
        wapi_instance_id: apiConfigs.wapi.wapi_instance_id || '',
        wapi_token: apiConfigs.wapi.wapi_token || ''
      });
    }
    if (apiConfigs?.groq) {
      setGroqConfig({
        api_key: apiConfigs.groq.api_key || ''
      });
    }
  }, [apiConfigs]);

  const handleWapiChange = (e) => {
    const { name, value } = e.target;
    setWapiConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleGroqChange = (e) => {
    const { name, value } = e.target;
    setGroqConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveWapi = async (e) => {
    e.preventDefault();
    setSavingWapi(true);
    
    try {
      await saveConfig('wapi', wapiConfig);
      success('Configurações W-API salvas', 'As credenciais foram atualizadas com sucesso.');
      logEvent(LOG_LEVELS.INFO, 'sistema', 'config', 'W-API Configurations updated via UI', {});
    } catch (err) {
      error('Erro ao salvar', err.message || 'Ocorreu um erro ao salvar as configurações.');
    } finally {
      setSavingWapi(false);
    }
  };

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

  const handleTestConnection = async () => {
    if (!wapiConfig.wapi_instance_id || !wapiConfig.wapi_token) {
      error('Dados incompletos', 'Preencha o ID da Instância e o Token antes de testar.');
      return;
    }

    if (!testPhone || testPhone.length < 10) {
      error('Telefone Obrigatório', 'Digite um número de telefone válido para receber a mensagem de teste.');
      return;
    }

    setTesting(true);
    setTestResult(null);

    logEvent(LOG_LEVELS.INFO, 'test_connection', 'system', 'Initiating Connection Test (User Action)', { phone_input: testPhone });

    try {
      const startTime = Date.now();
      
      // Pass local config explicitly to test function
      const responseData = await sendSingleMessage(
        testPhone, 
        '🔔 Teste de Conexão W-API: Seu sistema está configurado corretamente! 🚀', 
        wapiConfig, // Use the config currently in the form state
        'Test Connection Button'
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      const resultDetails = {
        body: responseData,
        duration: `${duration}ms`
      };

      setTestResult({ 
        success: true, 
        message: 'Conexão validada! Mensagem enviada com sucesso.', 
        details: resultDetails 
      });
      
      success('Teste Bem-sucedido', 'Mensagem de teste enviada com sucesso.');

    } catch (err) {
      const errorDetails = { error: err.message, stack: err.stack };
      setTestResult({ 
        success: false, 
        message: `Falha: ${err.message}`, 
        details: errorDetails 
      });
      
      error('Falha no Teste', err.message);
    } finally {
      setTesting(false);
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

        {/* W-API Settings */}
        <Card>
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Integração W-API</h2>
              <p className="text-sm text-gray-500">Configure a conexão com seu provedor de WhatsApp</p>
            </div>
          </div>

          <form onSubmit={handleSaveWapi} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Input
                label="Instance ID"
                name="wapi_instance_id"
                value={wapiConfig.wapi_instance_id}
                onChange={handleWapiChange}
                placeholder="Ex: instance12345"
                required
                disabled={configLoading}
              />
              
              <Input
                label="API Token"
                name="wapi_token"
                type="password"
                value={wapiConfig.wapi_token}
                onChange={handleWapiChange}
                placeholder="Ex: a1b2c3d4e5..."
                required
                disabled={configLoading}
              />
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700 space-y-4">
               <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                 <Wifi className="w-4 h-4" />
                 Teste de Conexão
               </h3>
               <p className="text-xs text-gray-500">
                 Para validar a conexão, enviaremos uma mensagem de texto simples para o número abaixo.
               </p>
               
               <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <Input
                      label="Telefone para Teste"
                      value={testPhone}
                      onChange={(e) => setTestPhone(formatPhoneInput(e.target.value))}
                      placeholder="(11) 99999-9999"
                      icon={Smartphone}
                    />
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleTestConnection}
                    loading={testing}
                    className="mb-[2px]"
                  >
                    Testar Envio
                  </Button>
               </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button type="submit" variant="primary" icon={Save} loading={savingWapi || configLoading}>
                {savingWapi ? 'Salvando...' : 'Salvar Configuração W-API'}
              </Button>
            </div>
          </form>

          {/* Test Results Display */}
          {testResult && (
            <div className={`mt-6 p-4 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800'}`}>
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="w-full">
                  <h4 className={`font-semibold text-sm ${testResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                    {testResult.message}
                  </h4>
                  
                  {testResult.details && (
                    <div className="mt-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3 overflow-x-auto">
                       <pre className="text-xs font-mono text-gray-600 dark:text-gray-300">
                         {JSON.stringify(testResult.details, null, 2)}
                       </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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