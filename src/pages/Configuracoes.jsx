import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Save, Server, Wifi, Brain, PlugZap, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Card from '@/components/Common/Card';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { supabase } from '@/lib/customSupabaseClient';
import { horizonsApi } from '@/services/horizonsApi';

const PROFILES = [
  { key: 'fast', label: 'Modelo rápido', help: 'Classificar mensagens do bot (intenção, aparelho, MAC).' },
  { key: 'smart', label: 'Modelo inteligente', help: 'Assistente administrativo (Telegram/painel).' },
  { key: 'vision', label: 'Modelo de visão', help: 'Leitura de comprovantes Pix (imagem/PDF).' },
];

const SOURCE_LABEL = { panel: 'chave salva pelo painel', env: 'chave do arquivo .env', none: 'nenhuma chave configurada' };

const emptyForm = { base_url: '', api_key: '', models: { fast: '', smart: '', vision: '' }, fallback_models: '' };

function AiSettingsCard() {
  const { success, error } = useToastNotification();
  const [view, setView] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [modelChecks, setModelChecks] = useState({});

  const applyView = useCallback((data) => {
    setView(data);
    setForm({
      base_url: data.base_url || '',
      api_key: '',
      models: { fast: data.models?.fast || '', smart: data.models?.smart || '', vision: data.models?.vision || '' },
      fallback_models: (data.fallback_models || []).join(', '),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      applyView(await horizonsApi('/settings/ai'));
      setForbidden(false);
    } catch (err) {
      if (/propriet/i.test(err.message)) setForbidden(true);
      else error('Erro ao carregar IA', err.message);
    } finally {
      setLoading(false);
    }
  }, [applyView, error]);

  useEffect(() => { load(); }, [load]);

  const setModel = (key, value) => setForm((current) => ({ ...current, models: { ...current.models, [key]: value } }));

  const fallbackList = () => form.fallback_models.split(',').map((item) => item.trim()).filter(Boolean);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = { base_url: form.base_url || undefined, api_key: form.api_key || undefined };
      const result = await horizonsApi('/settings/ai/test', { method: 'POST', body: JSON.stringify(body) });
      setAvailableModels(result.models || []);
      setTestResult({ ok: true, text: `Conectado em ${result.latency_ms} ms — ${result.model_count} modelos disponíveis.` });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    } finally {
      setTesting(false);
    }
  };

  const testModels = async () => {
    const models = [...new Set([...Object.values(form.models), ...fallbackList()].filter(Boolean))];
    if (!models.length) {
      error('Nenhum modelo', 'Preencha pelo menos um modelo.');
      return;
    }
    setTesting(true);
    const results = {};
    for (const model of models) {
      try {
        const body = { base_url: form.base_url || undefined, api_key: form.api_key || undefined, model };
        const result = await horizonsApi('/settings/ai/test', { method: 'POST', body: JSON.stringify(body) });
        results[model] = { ok: true, text: `ok em ${result.chat?.latency_ms ?? '?'} ms` };
      } catch (err) {
        results[model] = { ok: false, text: err.message };
      }
      setModelChecks({ ...results });
    }
    setTesting(false);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        base_url: form.base_url || undefined,
        models: {
          fast: form.models.fast.trim() || null,
          smart: form.models.smart.trim() || null,
          vision: form.models.vision.trim() || null,
        },
        fallback_models: fallbackList(),
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      applyView(await horizonsApi('/settings/ai', { method: 'PUT', body: JSON.stringify(body) }));
      success('IA salva', 'Configuração do OmniRoute atualizada. Vale em até 30 segundos.');
    } catch (err) {
      error('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!window.confirm('Remover a chave do OmniRoute salva no painel? A IA para até uma nova chave ser salva (ou volta à chave do .env, se houver).')) return;
    setSaving(true);
    try {
      applyView(await horizonsApi('/settings/ai', { method: 'PUT', body: JSON.stringify({ clear_key: true }) }));
      success('Chave removida', 'A chave salva no painel foi apagada.');
    } catch (err) {
      error('Erro ao remover', err.message);
    } finally {
      setSaving(false);
    }
  };

  const check = (model) => modelChecks[model];

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
          <Brain className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Inteligência Artificial (OmniRoute)</h2>
          <p className="text-sm text-gray-500">Leitura de comprovantes, interpretação do bot e assistente usam os modelos ChatGPT/Claude via OmniRoute.</p>
        </div>
      </div>

      {forbidden ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Somente o proprietário do Horizons pode ver e alterar esta configuração.</p>
      ) : (
        <form onSubmit={save} className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 space-y-1">
            {loading || !view ? 'Carregando…' : (
              <>
                <p className="flex items-center gap-2">
                  {view.configured ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  {view.configured ? 'IA configurada' : 'IA ainda não configurada'} — {SOURCE_LABEL[view.source] || view.source}
                  {view.key_hint ? ` (${view.key_hint})` : ''}
                </p>
                {view.updated_at && <p className="text-xs text-gray-500">Atualizada em {new Date(view.updated_at).toLocaleString('pt-BR')}</p>}
              </>
            )}
          </div>

          <Input
            label="URL da API do OmniRoute"
            value={form.base_url}
            onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
            placeholder="http://host.docker.internal:20129/v1"
          />
          <div className="space-y-1">
            <Input
              label="Chave de API do OmniRoute"
              type="password"
              autoComplete="new-password"
              value={form.api_key}
              onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder={view?.has_key ? `Deixe em branco para manter a chave salva (${view.key_hint})` : 'Cole aqui a chave criada no OmniRoute'}
            />
            <p className="text-xs text-gray-500">A chave é cifrada na VPS e nunca volta para o navegador; só os 4 últimos caracteres são exibidos.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" icon={PlugZap} onClick={testConnection} loading={testing}>Testar conexão</Button>
            {testResult && (
              <span className={`text-sm self-center ${testResult.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{testResult.text}</span>
            )}
          </div>

          <datalist id="omniroute-models">
            {availableModels.map((model) => <option key={model} value={model} />)}
          </datalist>

          <div className="grid gap-4 md:grid-cols-3">
            {PROFILES.map((profile) => (
              <div key={profile.key} className="space-y-1">
                <Input
                  label={profile.label}
                  list="omniroute-models"
                  value={form.models[profile.key]}
                  onChange={(event) => setModel(profile.key, event.target.value)}
                  placeholder={availableModels.length ? 'Escolha um modelo' : 'Teste a conexão para listar'}
                />
                <p className="text-xs text-gray-500">{profile.help}</p>
                {check(form.models[profile.key]) && (
                  <p className={`text-xs ${check(form.models[profile.key]).ok ? 'text-green-700' : 'text-red-600'}`}>{check(form.models[profile.key]).text}</p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Input
              label="Modelos de reserva (fallback), separados por vírgula"
              value={form.fallback_models}
              onChange={(event) => setForm((current) => ({ ...current, fallback_models: event.target.value }))}
              placeholder="Ex.: um modelo GPT como reserva do Claude"
            />
            <p className="text-xs text-gray-500">Usados em ordem quando o modelo principal falha ou responde fora do formato (máx. 5).</p>
            {fallbackList().filter((model) => check(model)).map((model) => (
              <p key={model} className={`text-xs ${check(model).ok ? 'text-green-700' : 'text-red-600'}`}>{model}: {check(model).text}</p>
            ))}
          </div>

          <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={testModels} loading={testing}>Testar modelos</Button>
              {view?.source === 'panel' && (
                <Button type="button" variant="outline" icon={Trash2} onClick={clearKey} loading={saving}>Remover chave</Button>
              )}
            </div>
            <Button type="submit" variant="primary" icon={Save} loading={saving || loading}>
              {saving ? 'Salvando...' : 'Salvar configuração de IA'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

const Configuracoes = () => {
  const [evolutionStatus, setEvolutionStatus] = useState({ loading: true, configured: false, connected: false, state: 'unknown' });

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

        <AiSettingsCard />
      </div>
    </>
  );
};

export default Configuracoes;
