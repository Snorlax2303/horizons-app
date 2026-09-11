import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, RefreshCw, Server, UserPlus } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { horizonsApi } from '@/services/horizonsApi';

const steps = ['Cliente', 'Servidor', 'Plano', 'Apps', 'Concluir'];

export default function NovoAcessoWizard() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [serverId, setServerId] = useState('');
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [screens, setScreens] = useState(1);
  const [apps, setApps] = useState(new Map());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, s, p] = await Promise.all([
          horizonsApi('/billing/overview').catch(() => ({ customers: [] })),
          horizonsApi('/operations/delivery-profiles').catch(() => ({ items: [] })),
          horizonsApi('/planos').catch(() => ({ plans: [] })),
        ]);
        setCustomers((c.customers || []).filter((item) => item.status === 'active').slice(0, 200));
        setCatalog(s.items || []);
        setPlans(p.plans || []);
      } catch (err) { error('Erro', err.message); } finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const appsByServer = useMemo(() => {
    const map = new Map();
    for (const item of catalog) {
      const list = map.get(item.cinehub_server_id) || [];
      list.push(item);
      map.set(item.cinehub_server_id, list);
    }
    return map;
  }, [catalog]);

  useEffect(() => {
    if (!serverId) { setApps(new Map()); return; }
    horizonsApi(`/operations/delivery-profiles?server_id=${serverId}`)
      .then((d) => {
        const list = d.items || [];
        const map = new Map();
        for (const item of list) {
          const key = `${item.device_category}|${item.app_name}`;
          if (!map.has(key)) map.set(key, item);
        }
        setApps(map);
      })
      .catch(() => setApps(new Map()));
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const appsArray = useMemo(() => Array.from(apps.values()), [apps]);
  const current = customers.find((item) => item.id === customerId) || null;
  const plan = plans.find((item) => item.id === planId) || null;

  const submit = async () => {
    setSaving(true);
    try {
      const migration = await horizonsApi(`/customers/${customerId}/server-migrations`, {
        method: 'POST',
        body: JSON.stringify({ to_server_id: serverId, reason: 'wizard_novo_acesso', external_username: '', password: '', external_plan: plan?.name || '', screens: Number(screens) }),
      });
      const accessId = migration?.result?.access_id;
      let catalogResult = null;
      if (accessId) {
        catalogResult = await horizonsApi(`/customers/${customerId}/server-accesses/credentials/from-catalog/${accessId}`, { method: 'POST', body: JSON.stringify({}) });
      }
      setResult({ migration, catalog: catalogResult });
      success('Acesso criado', `${catalogResult?.created || 0} apps do catálogo foram criados.`);
      setStep(4);
    } catch (err) { error('Erro', err.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Novo acesso (wizard)</h1><p className="text-sm text-gray-500">Vincula um cliente a um servidor e gera os apps do catálogo automaticamente.</p></div>
    <ol className="flex flex-wrap gap-3 text-sm">{steps.map((label, index) => <li key={label} className={`flex items-center gap-2 rounded px-3 py-1 ${index === step ? 'bg-indigo-600 text-white' : index < step ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{index < step ? <CheckCircle2 className="h-4 w-4" /> : <span className="font-semibold">{index + 1}</span>}{label}</li>)}</ol>

    {step === 0 && (
      <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h2 className="text-lg font-semibold">Escolher cliente</h2>
        <select className="w-full rounded-lg border bg-transparent px-3 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Selecione um cliente...</option>
          {customers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}
        </select>
        {customerId && <p className="text-xs text-gray-500">Selecionado: {current?.name} · {current?.phone}</p>}
        <div className="flex justify-between"><span /><Button variant="primary" icon={ArrowRight} disabled={!customerId} onClick={() => setStep(1)}>Próximo</Button></div>
      </section>
    )}

    {step === 1 && (
      <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h2 className="text-lg font-semibold">Escolher servidor</h2>
        <div className="grid gap-3 sm:grid-cols-2">{Array.from(new Set(catalog.map((item) => item.cinehub_servers?.id).filter(Boolean))).map((sid) => {
          const s = catalog.find((item) => item.cinehub_server_id === sid)?.cinehub_servers;
          if (!s) return null;
          return <button key={sid} className={`rounded-lg border p-3 text-left ${serverId === sid ? 'border-indigo-600' : ''}`} onClick={() => setServerId(sid)}><div className="flex items-center gap-2"><Server className="h-4 w-4 text-blue-600" /><b>{s.name}</b><span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{s.code}</span></div><div className="mt-1 text-xs text-gray-500">{(appsByServer.get(sid) || []).length} apps no catálogo</div></button>;
        })}</div>
        <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(0)}>Voltar</Button><Button variant="primary" icon={ArrowRight} disabled={!serverId} onClick={() => setStep(2)}>Próximo</Button></div>
      </section>
    )}

    {step === 2 && (
      <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h2 className="text-lg font-semibold">Plano e telas</h2>
        <select className="w-full rounded-lg border bg-transparent px-3 py-2" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Plano externo (opcional)</option>
          {plans.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.value || '—'}</option>)}
        </select>
        <Input label="Telas" type="number" min="1" max="99" value={screens} onChange={(v) => setScreens(v)} />
        <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(1)}>Voltar</Button><Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)}>Próximo</Button></div>
      </section>
    )}

    {step === 3 && (
      <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h2 className="text-lg font-semibold">Apps do catálogo</h2>
        <p className="text-sm text-gray-500">{appsArray.length} app(s) serão criados e ficarão com usuário/senha em branco para você preencher.</p>
        <div className="grid gap-2 sm:grid-cols-2">{appsArray.map((app) => <div key={app.id} className="rounded border p-2 text-xs"><b>{app.app_name}</b><span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-blue-700">{app.device_category}</span>{app.code && <div>cód: {app.code}</div>}{app.download_url && <div className="break-all">instalar: {app.download_url}</div>}</div>)}</div>
        <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(2)}>Voltar</Button><Button variant="primary" icon={KeyRound} loading={saving} disabled={!customerId || !serverId} onClick={submit}>Criar acesso e gerar apps</Button></div>
      </section>
    )}

    {step === 4 && result && (
      <section className="space-y-3 rounded-xl border bg-white p-5 dark:bg-gray-800">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h2 className="text-lg font-semibold">Acesso criado</h2></div>
        <p>Apps criados a partir do catálogo: <b>{result.catalog?.created || 0}</b> · Já existentes: <b>{result.catalog?.skipped || 0}</b></p>
        <p className="text-sm text-gray-500">Abra <b>Clientes → Gerenciar acesso</b> para preencher usuário e senha de cada app.</p>
      </section>
    )}
  </div>;
}
