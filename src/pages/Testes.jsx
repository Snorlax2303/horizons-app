import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Plus, RefreshCw, TestTube2, Tv } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { supabase } from '@/lib/customSupabaseClient';
import { horizonsApi } from '@/services/horizonsApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast as useToastNotification } from '@/hooks/useToast';

const statusLabel = { pending: 'Pendente', creating: 'Criando', sent: 'Enviado', converted: 'Convertido', expired: 'Expirado', cancelled: 'Cancelado' };
const initialForm = {
  prospect_id: '', panel_connection_id: '', panel_provider: 'union', adult_profile: false,
  client_reference: '', valid_until: '', instructions: '', create_now: false, create_unix: false, create_union: false,
  unix_server: '', unix_plan: '', unix_hours: 'Até 2 horas',
  union_server: '', union_plan: '', union_hours: '12',
};
const initialAssistedForm = { requester_phone: '', beneficiary_phone: '', beneficiary_name: '', server: 'kyros', duration_hours: '6', content: 'no_adults' };

function providerOf(connection) { return String(connection?.provider || '').toLowerCase(); }

export default function Testes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error } = useToastNotification();
  const [tests, setTests] = useState([]); const [prospects, setProspects] = useState([]); const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true); const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [form, setForm] = useState(initialForm);
  const [assistedOpen, setAssistedOpen] = useState(false); const [assistedSaving, setAssistedSaving] = useState(false);
  const [assistedForm, setAssistedForm] = useState(initialAssistedForm); const [assistedResult, setAssistedResult] = useState(null);
  const [assistedRequests, setAssistedRequests] = useState([]); const [assistedRequestId, setAssistedRequestId] = useState(null);
  const selectedConnection = connections.find((item) => item.id === form.panel_connection_id);
  const selectedProvider = providerOf(selectedConnection);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [testResult, prospectResult, connectionResult, assistedRequestResult] = await Promise.all([
        supabase.from('test_requests').select('*, prospects(name,phone), panel_connections(name)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('prospects').select('id,name,phone').eq('user_id', user.id).order('name').limit(500),
        supabase.from('panel_connections').select('id,name,provider').eq('user_id', user.id).order('name'),
        supabase.from('assisted_test_requests').select('id,requester_phone,beneficiary_name,beneficiary_phone,server,duration_hours,content,status,error,created_at').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }),
      ]);
      if (testResult.error || prospectResult.error || connectionResult.error || assistedRequestResult.error) throw testResult.error || prospectResult.error || connectionResult.error || assistedRequestResult.error;
      setTests(testResult.data || []); setProspects(prospectResult.data || []); setConnections(connectionResult.data || []); setAssistedRequests(assistedRequestResult.data || []);
    } catch (err) { if (!silent) error('Erro', err.message || 'Não foi possível carregar os testes.'); } finally { if (!silent) setLoading(false); }
  };
  useEffect(() => {
    if (!user) return undefined;
    load();
    const refresh = () => load({ silent: true });
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [user]);

  const changeConnection = (id) => setForm((current) => ({
    ...current, panel_connection_id: id, create_unix: false, create_union: false, create_now: false,
  }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const shouldCreateUnix = form.create_unix && selectedProvider === 'unix';
      const shouldCreateUnion = form.create_union && selectedProvider === 'union';
      if ((form.create_unix && !shouldCreateUnix) || (form.create_union && !shouldCreateUnion)) throw new Error('A criação automática deve usar a conexão correspondente.');
      const createNow = shouldCreateUnix || shouldCreateUnion;
      const prospect = prospects.find((item) => item.id === form.prospect_id);
      const clientName = prospect?.name || form.client_reference;
      const phone = prospect?.phone || '';
      const { data: test, error: insertError } = await supabase.from('test_requests').insert({
        user_id: user.id, prospect_id: form.prospect_id || null, panel_connection_id: form.panel_connection_id || null,
        panel_provider: selectedConnection?.provider || form.panel_provider, adult_profile: form.adult_profile,
        client_reference: form.client_reference || null, status: createNow ? 'creating' : 'pending',
        valid_until: form.valid_until ? new Date(`${form.valid_until}T23:59:59`).toISOString() : null, instructions: form.instructions || null,
      }).select('id').single();
      if (insertError) throw insertError;
      if (createNow) {
        const input = shouldCreateUnion
          ? { test_request_id: test.id, union_test: { server: form.union_server, plan: form.union_plan, hours: form.union_hours, name: clientName, phone } }
          : { test_request_id: test.id, unix_test: { server: form.unix_server, plan: form.unix_plan, hours: form.unix_hours, name: clientName, phone } };
        try {
          await horizonsApi('/panel-operations', { method: 'POST', body: JSON.stringify({ action: 'create_test', panel_connection_id: selectedConnection.id, input }) });
        } catch (operationError) {
          await supabase.from('test_requests').update({ status: 'pending' }).eq('id', test.id).eq('user_id', user.id);
          throw operationError;
        }
      }
      success(createNow ? 'Teste enviado para automação' : 'Teste registrado', createNow ? 'O agente local criará o acesso. Acompanhe em Operações de Painéis.' : 'Ele ficou na fila manual até o Typebot e o agente local serem configurados.');
      setOpen(false); setForm(initialForm); load();
    } catch (err) { error('Erro', err.message || 'Não foi possível registrar o teste.'); } finally { setSaving(false); }
  };
  const createAssistedTest = async (event) => {
    event.preventDefault(); setAssistedSaving(true);
    try {
      const result = await horizonsApi('/integrations/cinehub/assisted-tests', {
        method: 'POST',
        body: JSON.stringify({
          request_id: assistedRequestId || crypto.randomUUID(), ...assistedForm,
          duration_hours: Number(assistedForm.duration_hours), confirm_external_creation: true,
        }),
      });
      setAssistedResult(result); setAssistedOpen(false); setAssistedForm(initialAssistedForm); setAssistedRequestId(null); load();
      success('Teste assistido criado', 'O acesso foi vinculado ao telefone próprio do beneficiário.');
    } catch (err) { error('Erro', err.message || 'Não foi possível criar o teste assistido.'); }
    finally { setAssistedSaving(false); }
  };
  const reviewAssistedRequest = (item) => {
    setAssistedRequestId(item.id);
    setAssistedForm({
      requester_phone: item.requester_phone, beneficiary_phone: item.beneficiary_phone,
      beneficiary_name: item.beneficiary_name, server: item.server,
      duration_hours: String(item.duration_hours), content: item.content,
    });
    setAssistedOpen(true);
  };
  const rejectAssistedRequest = async (item) => {
    try {
      const { error: updateError } = await supabase.from('assisted_test_requests').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id).eq('user_id', user.id).eq('status', 'pending');
      if (updateError) throw updateError;
      success('Solicitação recusada', 'Nenhum acesso externo foi criado.'); load();
    } catch (err) { error('Erro', err.message || 'Não foi possível recusar a solicitação.'); }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <>
    <Helmet><title>Testes - Horizons</title></Helmet>
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row"><div><h1 className="text-3xl font-bold">Testes</h1><p className="mt-1 text-gray-600 dark:text-gray-400">Todo teste é de 1 tela. Testes para outra pessoa devem usar o telefone próprio do beneficiário.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" icon={RefreshCw} onClick={load}>Atualizar</Button><Button variant="secondary" icon={Tv} onClick={() => navigate('/wplay')}>Painel WPlay</Button><Button variant="secondary" icon={TestTube2} onClick={() => setAssistedOpen(true)}>Teste assistido CineHub</Button><Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Registrar teste</Button></div></div>
      {assistedRequests.length > 0 && <section className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"><div className="border-b border-amber-200 p-4 dark:border-amber-800"><h2 className="font-semibold">Testes para outra pessoa aguardando revisão</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Solicitações coletadas pelo WhatsApp. Nenhum acesso foi criado ainda.</p></div><div className="divide-y divide-amber-200 dark:divide-amber-800">{assistedRequests.map((item) => <article key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-medium">{item.beneficiary_name} · {item.beneficiary_phone}</p><p className="text-sm text-gray-600 dark:text-gray-300">Solicitado por {item.requester_phone} · {new Date(item.created_at).toLocaleString('pt-BR')}</p>{item.error && <p className="mt-1 text-sm text-red-700 dark:text-red-300">Falha anterior: {item.error}</p>}</div><div className="flex gap-2"><Button variant="secondary" onClick={() => rejectAssistedRequest(item)}>Recusar</Button><Button variant="primary" onClick={() => reviewAssistedRequest(item)}>Revisar e criar</Button></div></article>)}</div></section>}
      <div className="overflow-x-auto rounded-xl border bg-white dark:bg-gray-800"><table className="w-full text-sm"><thead className="border-b text-left text-gray-500"><tr><th className="p-4">Cliente</th><th className="p-4">Painel</th><th className="p-4">Perfil</th><th className="p-4">Status</th><th className="p-4">Validade</th></tr></thead><tbody>{tests.map((test) => <tr key={test.id} className="border-b last:border-0"><td className="p-4 font-medium">{test.prospects?.name || test.client_reference || '—'}<span className="block text-xs font-normal text-gray-500">{test.external_username || test.prospects?.phone || ''}</span></td><td className="p-4">{test.panel_connections?.name || test.panel_provider}</td><td className="p-4">{test.adult_profile ? 'Com adultos' : 'Sem adultos'}</td><td className="p-4">{statusLabel[test.status]}</td><td className="p-4">{test.valid_until ? new Date(test.valid_until).toLocaleDateString('pt-BR') : '—'}</td></tr>)}{!tests.length && <tr><td colSpan="5" className="p-10 text-center text-gray-500"><TestTube2 className="mx-auto mb-3" />Nenhum teste registrado.</td></tr>}</tbody></table></div>
    </div>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Registrar teste" size="md"><form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Possível cliente<select className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" value={form.prospect_id} onChange={(e) => setForm({ ...form, prospect_id: e.target.value })}><option value="">Informar referência manualmente</option>{prospects.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.name} · {prospect.phone}</option>)}</select></label>
      {!form.prospect_id && <Input label="Nome ou ID do cliente" value={form.client_reference} onChange={(e) => setForm({ ...form, client_reference: e.target.value })} required />}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Conexão de painel<select className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" value={form.panel_connection_id} onChange={(e) => changeConnection(e.target.value)}><option value="">Definir apenas o painel</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name} · {connection.provider}</option>)}</select></label>
      {!form.panel_connection_id && <label className="block text-sm font-medium">Painel<select className="mt-1 w-full rounded border p-2 bg-transparent" value={form.panel_provider} onChange={(e) => setForm({ ...form, panel_provider: e.target.value })}><option value="unix">Unix</option><option value="union">Union</option><option value="now">Now</option></select></label>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.adult_profile} onChange={(e) => setForm({ ...form, adult_profile: e.target.checked })} />Teste com adultos</label>
      {selectedProvider === 'unix' && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"><label className="flex gap-2 font-medium"><input type="checkbox" checked={form.create_unix} onChange={(e) => setForm({ ...form, create_unix: e.target.checked })} />Criar agora no Unix</label>{form.create_unix && <div className="mt-3 space-y-3"><Input label="Servidor (texto do painel)" value={form.unix_server} onChange={(e) => setForm({ ...form, unix_server: e.target.value })} required /><Input label="Plano de teste (texto exato)" value={form.unix_plan} onChange={(e) => setForm({ ...form, unix_plan: e.target.value })} required /><Input label="Horas de teste" value={form.unix_hours} onChange={(e) => setForm({ ...form, unix_hours: e.target.value })} required /></div>}</div>}
      {selectedProvider === 'union' && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"><label className="flex gap-2 font-medium"><input type="checkbox" checked={form.create_union} onChange={(e) => setForm({ ...form, create_union: e.target.checked })} />Criar agora no Union</label>{form.create_union && <div className="mt-3 space-y-3"><Input label="Servidor (texto exato do painel)" value={form.union_server} onChange={(e) => setForm({ ...form, union_server: e.target.value })} required /><Input label="Plano de teste (texto exato)" value={form.union_plan} onChange={(e) => setForm({ ...form, union_plan: e.target.value })} required /><Input label="Horas de teste" type="number" min="1" value={form.union_hours} onChange={(e) => setForm({ ...form, union_hours: e.target.value })} required /><p className="text-xs">O Union gera o usuário e a senha no próprio painel. Ao salvar, um acesso real será criado.</p></div>}</div>}
      <Input label="Validade (opcional)" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
      <label className="block text-sm font-medium">Observações<textarea className="mt-1 w-full rounded border p-2 bg-transparent" rows="3" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Ex.: enviar Blessed e código N." /></label><p className="text-xs text-gray-500">A entrega das credenciais será ligada ao Typebot/WhatsApp na próxima etapa.</p>
      <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={saving}>{form.create_union ? 'Criar teste no Union' : form.create_unix ? 'Criar teste no Unix' : 'Salvar'}</Button></div>
    </form></Modal>
    <Modal isOpen={assistedOpen} onClose={() => { setAssistedOpen(false); setAssistedRequestId(null); setAssistedForm(initialAssistedForm); }} title="Criar teste assistido no CineHub" size="md"><form onSubmit={createAssistedTest} className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">Esta ação cria um acesso real. Use somente quando o solicitante estiver pedindo para outra pessoa. O telefone do beneficiário será usado no teste, na cobrança e no cadastro.</div>
      <Input label="Telefone de quem solicitou" value={assistedForm.requester_phone} onChange={(e) => setAssistedForm({ ...assistedForm, requester_phone: e.target.value })} placeholder="Ex.: 5516999999999" required />
      <Input label="Nome do beneficiário" value={assistedForm.beneficiary_name} onChange={(e) => setAssistedForm({ ...assistedForm, beneficiary_name: e.target.value })} required />
      <Input label="Telefone próprio do beneficiário" value={assistedForm.beneficiary_phone} onChange={(e) => setAssistedForm({ ...assistedForm, beneficiary_phone: e.target.value })} placeholder="Não repita o telefone do solicitante" required />
      <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium">Servidor<select className="mt-1 w-full rounded border p-2 bg-transparent" value={assistedForm.server} onChange={(e) => setAssistedForm({ ...assistedForm, server: e.target.value })}>{['kyros','vornak','kronos','zeus','fenix','p2p'].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label><label className="block text-sm font-medium">Duração<select className="mt-1 w-full rounded border p-2 bg-transparent" value={assistedForm.duration_hours} onChange={(e) => setAssistedForm({ ...assistedForm, duration_hours: e.target.value })}><option value="6">6 horas</option><option value="12">12 horas</option></select></label></div>
      <label className="block text-sm font-medium">Conteúdo<select className="mt-1 w-full rounded border p-2 bg-transparent" value={assistedForm.content} onChange={(e) => setAssistedForm({ ...assistedForm, content: e.target.value })}><option value="no_adults">Sem adultos</option><option value="complete">Completo</option></select></label>
      <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setAssistedOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={assistedSaving}>Confirmar e criar acesso real</Button></div>
    </form></Modal>
    <Modal isOpen={Boolean(assistedResult)} onClose={() => setAssistedResult(null)} title="Teste assistido criado" size="md">{assistedResult && <div className="space-y-3 text-sm"><p>Entregue estes dados somente ao beneficiário correto:</p><div className="rounded-lg border p-4 font-mono"><p>Usuário: {assistedResult.test?.username}</p><p>Senha: {assistedResult.test?.password}</p><p>DNS: {assistedResult.test?.dns}</p><p>Validade: {assistedResult.test?.expires_at ? new Date(assistedResult.test.expires_at).toLocaleString('pt-BR') : '—'}</p>{assistedResult.test?.checkout_url && <p className="break-all">Checkout: {assistedResult.test.checkout_url}</p>}</div><div className="flex justify-end"><Button variant="primary" onClick={() => setAssistedResult(null)}>Concluir</Button></div></div>}</Modal>
  </>;
}
