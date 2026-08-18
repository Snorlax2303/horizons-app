import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link2, Plus, RefreshCw, ShieldCheck, CircleAlert, Monitor, LogOut, Trash2, Camera } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { horizonsApi } from '@/services/horizonsApi';

const emptyForm = { name: '', provider: 'unix', base_url: '', server_id: '', automation_mode: 'manual', lookup: true, create_test: false, renew: false, proxy_label: '', browser_location: 'vps', agent_id: '' };

const statusLabels = { connected: 'Conectada', expired: 'Expirada', reconnect_required: 'Reconexão necessária', blocked: 'Bloqueada' };

export default function ConexoesPaineis() {
  const { user } = useAuth();
  const { success, error } = useToastNotification();
  const [connections, setConnections] = useState([]);
  const [agents, setAgents] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [browser, setBrowser] = useState(null);
  const [openingBrowser, setOpeningBrowser] = useState(null);
  const [confirmingBrowser, setConfirmingBrowser] = useState(false);
  const [enrollment, setEnrollment] = useState(null);
  const [agentName, setAgentName] = useState('Meu computador');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [deletingConnection, setDeletingConnection] = useState(null);
  const [capture, setCapture] = useState(null);
  const [captureLoading, setCaptureLoading] = useState(null);
  const [captureReview, setCaptureReview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [panelData, serverData, agentData] = await Promise.all([
        horizonsApi('/panel-connections'),
        supabase.from('servers').select('id,name').eq('user_id', user.id).order('name'),
        horizonsApi('/panel-agents'),
      ]);
      setConnections(panelData.connections || []);
      setAgents(agentData.agents || []);
      if (serverData.error) throw serverData.error;
      setServers(serverData.data || []);
    } catch (err) { error('Erro', err.message || 'Falha ao carregar conexões.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user) load(); }, [user]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await horizonsApi('/panel-connections', {
        method: 'POST', body: JSON.stringify({
          name: form.name, provider: form.provider, base_url: form.base_url,
          server_id: form.server_id || null, automation_mode: form.automation_mode,
          capabilities: { lookup: form.lookup, create_test: form.create_test, renew: form.renew },
          proxy_label: form.proxy_label || null,
          browser_location: form.browser_location,
          agent_id: form.browser_location === 'local_agent' ? form.agent_id || null : null,
        }),
      });
      success('Conexão criada', form.browser_location === 'local_agent' ? 'Use Abrir login seguro para abrir o painel no computador conectado.' : 'Faça o login manual no navegador da VPS para ativar a sessão.');
      setOpen(false); setForm(emptyForm); load();
    } catch (err) { error('Erro', err.message); }
    finally { setSaving(false); }
  };

  const reconnect = async (id) => {
    try {
      await horizonsApi(`/panel-connections/${id}/request-reconnect`, { method: 'POST' });
      success('Reconexão solicitada', 'Abra o navegador da VPS, faça o login manual e valide a conexão.');
      load();
    } catch (err) { error('Erro', err.message); }
  };

  const openBrowser = async (connection) => {
    setOpeningBrowser(connection.id);
    try {
      const data = await horizonsApi(`/panel-connections/${connection.id}/start-browser`, { method: 'POST' });
      if (data.mode === 'local_agent') {
        success('Comando enviado', 'O Chrome abrirá no computador conectado em poucos segundos. Faça o login e depois confirme a sessão aqui.');
        setBrowser({ connection, local: true });
      } else {
        setBrowser({ connection, url: data.vnc_path });
        success('Navegador aberto', 'Faça o login neste painel. CAPTCHA e desafios devem ser resolvidos por você.');
      }
    } catch (err) { error('Não foi possível abrir o navegador', err.message); }
    finally { setOpeningBrowser(null); }
  };

  const createAgent = async () => {
    setCreatingAgent(true);
    try {
      const data = await horizonsApi('/panel-agents', { method: 'POST', body: JSON.stringify({ name: agentName }) });
      setEnrollment({ ...data, config: JSON.stringify({ apiUrl: `${window.location.origin}/api`, agentId: data.agent.id, enrollmentToken: data.enrollment_token, pollIntervalSeconds: 5, allowedHosts: [] }, null, 2) });
      load();
    } catch (err) { error('Erro', err.message); }
    finally { setCreatingAgent(false); }
  };

  const confirmBrowserLogin = async () => {
    if (!browser) return;
    setConfirmingBrowser(true);
    try {
      await horizonsApi(`/panel-connections/${browser.connection.id}/confirm-browser-login`, { method: 'POST' });
      success('Sessão confirmada', 'O perfil do navegador foi mantido para este painel.');
      setBrowser(null); load();
    } catch (err) { error('Erro', err.message); }
    finally { setConfirmingBrowser(false); }
  };

  const closeBrowser = async () => {
    if (!browser) return;
    try {
      await horizonsApi(`/panel-connections/${browser.connection.id}/stop-browser`, { method: 'POST' });
      setBrowser(null); load();
    } catch (err) { error('Erro', err.message); }
  };

  const deleteConnection = async () => {
    if (!deletingConnection) return;
    try {
      await horizonsApi(`/panel-connections/${deletingConnection.id}`, { method: 'DELETE' });
      success('Conexão excluída', 'O navegador e comandos pendentes foram encerrados.');
      setDeletingConnection(null); load();
    } catch (err) { error('Erro', err.message); }
  };

  const startCapture = async (connection) => {
    setCaptureLoading(connection.id);
    try {
      const data = await horizonsApi(`/panel-connections/${connection.id}/start-capture`, { method: 'POST' });
      setCapture({ ...data.capture, connection });
      success('Captura iniciada', 'O painel abrirá no computador local. Faça o fluxo normalmente; os cliques e telas serão registrados.');
    } catch (err) { error('Erro', err.message); }
    finally { setCaptureLoading(null); }
  };

  const stopCapture = async () => {
    if (!capture) return;
    setCaptureLoading(capture.connection.id);
    try {
      await horizonsApi(`/panel-captures/${capture.id}/stop`, { method: 'POST' });
      const review = await horizonsApi(`/panel-captures/${capture.id}`);
      setCapture(null); setCaptureReview(review);
      success('Captura concluída', 'O roteiro foi salvo e ficará disponível para montar o adaptador deste painel.');
    } catch (err) { error('Erro', err.message); }
    finally { setCaptureLoading(null); }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <>
    <Helmet><title>Conexões de Painéis - Horizons</title></Helmet>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Conexões de Painéis</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Sessões manuais, capacidades e automação por painel.</p></div>
        <div className="flex gap-2"><Button variant="secondary" icon={Monitor} onClick={() => setEnrollment({ setup: true })}>Conectar computador</Button><Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Nova conexão</Button></div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm flex gap-3"><CircleAlert className="w-5 h-5 shrink-0" />CAPTCHA e desafios são sempre resolvidos manualmente. O sistema não tenta contorná-los.</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map((connection) => <div key={connection.id} className="rounded-xl border bg-white dark:bg-gray-800 p-5 space-y-3">
          <div className="flex justify-between gap-3"><div><h2 className="font-semibold text-lg">{connection.name}</h2><p className="text-sm text-gray-500">{connection.provider} · {connection.base_url}</p></div><Link2 className="text-indigo-500" /></div>
          <div className="text-sm"><span className="font-medium">Sessão:</span> {statusLabels[connection.session_status] || connection.session_status}</div>
          <div className="text-sm"><span className="font-medium">Modo:</span> {connection.automation_mode === 'automatic' ? 'Automático' : 'Aprovação manual'}</div>
          <div className="text-sm"><span className="font-medium">Navegador:</span> {connection.browser_location === 'local_agent' ? 'Computador local' : 'VPS'}</div>
          <div className="flex flex-wrap gap-2 text-xs">{Object.entries(connection.capabilities || {}).filter(([, value]) => value).map(([key]) => <span key={key} className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-1">{key}</span>)}</div>
          {connection.last_error && <p className="text-xs text-amber-700">{connection.last_error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Monitor} loading={openingBrowser === connection.id} onClick={() => openBrowser(connection)}>Abrir login seguro</Button>
            <Button variant="secondary" icon={Camera} loading={captureLoading === connection.id} disabled={Boolean(capture)} onClick={() => startCapture(connection)}>Capturar fluxo</Button>
            <Button variant="secondary" icon={RefreshCw} onClick={() => reconnect(connection.id)}>Solicitar reconexão</Button>
            <Button variant="danger" icon={Trash2} onClick={() => setDeletingConnection(connection)}>Excluir</Button>
          </div>
        </div>)}
        {!connections.length && <div className="col-span-full rounded-lg border border-dashed p-10 text-center text-gray-500"><ShieldCheck className="mx-auto mb-3" />Nenhuma conexão configurada.</div>}
      </div>
    </div>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Nova conexão de painel" size="md">
      <form onSubmit={save} className="space-y-4">
        <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Fornecedor/painel" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Ex: unix" required />
        <Input label="URL do painel" type="url" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required />
        <label className="block text-sm font-medium">Onde abrir o navegador<select className="mt-1 w-full rounded border p-2 bg-transparent" value={form.browser_location} onChange={(e) => setForm({ ...form, browser_location: e.target.value, agent_id: e.target.value === 'local_agent' ? form.agent_id : '' })}><option value="vps">VPS</option><option value="local_agent">Meu computador (ponte local)</option></select></label>
        {form.browser_location === 'local_agent' && <label className="block text-sm font-medium">Computador conectado<select className="mt-1 w-full rounded border p-2 bg-transparent" value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} required><option value="">Selecione</option>{agents.filter((agent) => agent.status === 'active').map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.last_seen_at ? ' · online recentemente' : ' · aguardando agente'}</option>)}</select>{!agents.some((agent) => agent.status === 'active') && <span className="mt-1 block text-xs text-amber-700">Cadastre o computador pelo botão “Conectar computador”.</span>}</label>}
        <label className="block text-sm font-medium">Servidor associado<select className="mt-1 w-full rounded border p-2 bg-transparent" value={form.server_id} onChange={(e) => setForm({ ...form, server_id: e.target.value })}><option value="">Todos / definir por tela</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Modo<select className="mt-1 w-full rounded border p-2 bg-transparent" value={form.automation_mode} onChange={(e) => setForm({ ...form, automation_mode: e.target.value })}><option value="manual">Aprovação manual</option><option value="automatic">Automático após homologação</option></select></label>
        <Input label="Identificação do proxy (opcional)" value={form.proxy_label} onChange={(e) => setForm({ ...form, proxy_label: e.target.value })} placeholder="Ex: proxy residencial BR" />
        <div className="space-y-2 text-sm"><p className="font-medium">Capacidades liberadas</p>{[['lookup', 'Consultar'], ['create_test', 'Criar teste'], ['renew', 'Renovar']].map(([key, label]) => <label key={key} className="flex gap-2"><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}</div>
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={saving}>Salvar</Button></div>
      </form>
    </Modal>
    <Modal isOpen={Boolean(browser)} onClose={closeBrowser} title={`Login manual — ${browser?.connection.name || ''}`} size="xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{browser?.local ? 'O navegador abriu no computador conectado. Faça o login nele normalmente e depois confirme abaixo.' : 'Este navegador fica na VPS e usa um perfil exclusivo deste painel. Faça o login normalmente e resolva qualquer CAPTCHA por conta própria.'}</p>
        {browser && !browser.local && <iframe title="Navegador seguro do painel" src={browser.url} className="w-full h-[70vh] min-h-[480px] rounded border bg-gray-950" allow="clipboard-read; clipboard-write" />}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" icon={LogOut} onClick={closeBrowser}>Fechar navegador</Button>
          <Button type="button" variant="primary" loading={confirmingBrowser} onClick={confirmBrowserLogin}>Concluir login e salvar sessão</Button>
        </div>
      </div>
    </Modal>
    <Modal isOpen={Boolean(enrollment)} onClose={() => setEnrollment(null)} title="Conectar computador local" size="lg">
      {!enrollment?.agent ? <div className="space-y-4"><p className="text-sm text-gray-600 dark:text-gray-300">O agente cria apenas uma conexão de saída para o Horizons e abre o Chrome no seu computador. Ele não expõe sua rede nem transmite senhas do painel.</p><Input label="Nome deste computador" value={agentName} onChange={(e) => setAgentName(e.target.value)} required /><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setEnrollment(null)}>Cancelar</Button><Button variant="primary" loading={creatingAgent} onClick={createAgent}>Gerar configuração</Button></div></div> : <div className="space-y-4"><p className="text-sm text-amber-700">Copie esta configuração agora. O token não será exibido novamente.</p><ol className="list-decimal pl-5 text-sm space-y-1"><li>Baixe a pasta <code>local-panel-agent</code> deste projeto no seu computador.</li><li>Copie <code>config.example.json</code> para <code>config.json</code> e cole o conteúdo abaixo.</li><li>Inclua em <code>allowedHosts</code> apenas os domínios dos seus painéis e rode <code>npm start</code>.</li></ol><textarea readOnly value={enrollment.config} className="w-full h-64 rounded border p-3 font-mono text-xs bg-gray-50 dark:bg-gray-900" /><div className="flex justify-end"><Button variant="primary" onClick={() => setEnrollment(null)}>Concluído</Button></div></div>}
    </Modal>
    <Modal isOpen={Boolean(deletingConnection)} onClose={() => setDeletingConnection(null)} title="Excluir conexão de painel" size="sm">
      <div className="space-y-4"><p className="text-sm text-gray-600 dark:text-gray-300">Excluir <strong>{deletingConnection?.name}</strong>? A sessão, comandos pendentes e vínculo deste painel serão removidos. Esta ação não apaga o cliente no cadastro.</p><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setDeletingConnection(null)}>Cancelar</Button><Button variant="danger" icon={Trash2} onClick={deleteConnection}>Excluir conexão</Button></div></div>
    </Modal>
    <Modal isOpen={Boolean(capture)} onClose={() => {}} title={`Capturando fluxo — ${capture?.connection.name || ''}`} size="md">
      <div className="space-y-4"><p className="text-sm text-gray-600 dark:text-gray-300">Execute no navegador local apenas o fluxo que quer automatizar. A captura registra a estrutura da página, navegação, cliques e imagens reduzidas — nunca o valor de campos de senha.</p><div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Use um cliente de teste. Não navegue em dados reais durante esta gravação.</div><div className="flex justify-end"><Button variant="primary" icon={Camera} loading={captureLoading === capture?.connection.id} onClick={stopCapture}>Concluir e salvar captura</Button></div></div>
    </Modal>
    <Modal isOpen={Boolean(captureReview)} onClose={() => setCaptureReview(null)} title="Captura registrada" size="xl">
      <div className="space-y-4"><p className="text-sm text-gray-600 dark:text-gray-300">{captureReview?.events?.length || 0} etapas registradas. Estes dados ficam vinculados ao painel e serão usados para montar o adaptador.</p><div className="max-h-[65vh] overflow-auto space-y-4">{captureReview?.events?.map((event) => <div key={event.id} className="rounded border p-3 text-sm"><p><strong>{event.event_type === 'click' ? 'Clique' : 'Página'}</strong> {event.element_text ? `· ${event.element_text}` : ''}</p><p className="text-xs text-gray-500 break-all">{event.page_url}</p>{event.screenshot_base64 && <img alt="Captura do painel" src={`data:image/jpeg;base64,${event.screenshot_base64}`} className="mt-2 max-h-64 rounded border" />}</div>)}</div><div className="flex justify-end"><Button variant="primary" onClick={() => setCaptureReview(null)}>Concluído</Button></div></div>
    </Modal>
  </>;
}
