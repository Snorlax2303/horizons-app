import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, Server, ShieldCheck, Wifi } from 'lucide-react';
import Button from '@/components/Common/Button';
import { horizonsApi } from '@/services/horizonsApi';
import { useToast } from '@/hooks/useToast';

const labels = { evolution: 'Evolution / WhatsApp', telegram: 'Telegram', ai: 'IA (OmniRoute)', paggpay: 'PaggPay', efi: 'Efí' };

export default function SaudeIntegracoes() {
  const { error } = useToast();
  const [health, setHealth] = useState(null); const [monitor, setMonitor] = useState(null); const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setHealth(await horizonsApi('/health/details'));
      setMonitor(await horizonsApi('/health/monitor').catch(() => null));
    } catch (err) { error('Erro ao consultar saúde', err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Saúde e integrações</h1><p className="text-sm text-gray-500">Status operacional sem exibir chaves ou dados sensíveis.</p></div><Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>Atualizar</Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><Status icon={Activity} label="API" value={health?.api} /><Status icon={Database} label="Banco" value={health?.database} /><Status icon={ShieldCheck} label="Sessão protegida" value={health ? 'ok' : null} /></div>
    <section className="rounded-xl border bg-white p-5 dark:bg-gray-800"><h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Wifi className="h-5 w-5 text-blue-600" /> Integrações configuradas</h2><div className="grid gap-3 sm:grid-cols-2">{Object.entries(labels).map(([key, label]) => <Status key={key} icon={Server} label={label} value={health?.integrations?.[key]} />)}</div></section>
    {monitor && <MonitorSection monitor={monitor} />}
    <p className="text-xs text-gray-500">A configuração indica apenas presença no ambiente. Não confirma conexão ativa, autenticação externa ou entrega de mensagens.</p>
  </div>;
}
function Status({ icon: Icon, label, value }) { const ok = value === true || value === 'ok'; return <div className="flex items-center justify-between rounded-lg border p-4"><div className="flex items-center gap-3"><Icon className="h-5 w-5 text-gray-500" /><span>{label}</span></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : value == null ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{ok ? 'OK' : value == null ? 'Aguardando' : 'Não configurado'}</span></div>; }

function MonitorSection({ monitor }) {
  const problems = monitor.problems || [];
  const instances = monitor.evolution?.items || [];
  return <section className="rounded-xl border bg-white p-5 dark:bg-gray-800">
    <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">{problems.length ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />} Monitor operacional</h2>
    <p className="mb-4 text-xs text-gray-500">Os mesmos sinais geram alerta no Telegram administrativo (a cada 15 min). Verificado em {new Date(monitor.checked_at).toLocaleString('pt-BR')}.</p>
    {problems.length ? <ul className="mb-4 space-y-2">{problems.map((item) => <li key={item.key} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{item.text}</li>)}</ul> : <p className="mb-4 text-sm text-emerald-700">Nenhum problema detectado.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      {instances.map((item) => <div key={item.name} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>WhatsApp: {item.name}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.state === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{item.state === 'open' ? 'Conectado' : item.state}</span></div>)}
      <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>Última mensagem recebida</span><span className="text-xs text-gray-600">{monitor.last_inbound_at ? new Date(monitor.last_inbound_at).toLocaleString('pt-BR') : '—'}</span></div>
      <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>Comprovantes 24 h</span><span className="text-xs text-gray-600">{monitor.receipts_24h ? `${monitor.receipts_24h.failed} falhas / ${monitor.receipts_24h.total}` : '—'}</span></div>
    </div>
  </section>;
}
