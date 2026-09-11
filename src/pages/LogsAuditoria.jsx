import React, { useEffect, useState } from 'react';
import { Activity, Filter, RefreshCw } from 'lucide-react';
import Button from '@/components/Common/Button';
import { horizonsApi } from '@/services/horizonsApi';
import { useToast } from '@/hooks/useToast';

export default function LogsAuditoria() {
  const { error } = useToast();
  const [events, setEvents] = useState([]); const [provider, setProvider] = useState(''); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const params = new URLSearchParams(); if (provider) params.set('provider', provider); const data = await horizonsApi(`/audit/webhooks?${params.toString()}`); setEvents(data.events || []); } catch (err) { error('Erro', err.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Logs e auditoria</h1><p className="text-sm text-gray-500">Eventos recentes de webhooks sem expor credenciais.</p></div><div className="flex gap-2"><select className="rounded-lg border bg-transparent px-3 py-2 text-sm" value={provider} onChange={(e) => setProvider(e.target.value)}><option value="">Todos</option><option value="evolution">Evolution</option><option value="paggpay">PaggPay</option><option value="efi">Efí</option><option value="manual_pix">Manual Pix</option></select><Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>Atualizar</Button></div></div>
    <section className="rounded-xl border bg-white p-5 dark:bg-gray-800"><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5 text-blue-600" /> Eventos</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="p-2">Quando</th><th>Provider</th><th>Status</th><th>Duração (ms)</th><th>Evento</th></tr></thead><tbody>{events.map((ev) => <tr className="border-b" key={ev.id}><td className="p-2 text-xs">{new Date(ev.received_at).toLocaleString('pt-BR')}</td><td>{ev.provider}</td><td><span className={`rounded px-2 py-1 text-xs ${ev.status < 400 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{ev.status}</span></td><td>{ev.duration_ms}</td><td className="text-xs text-gray-500">{ev.event_id || '-'}</td></tr>)}</tbody></table>{!events.length && !loading && <p className="py-6 text-center text-sm text-gray-500">Nenhum evento registrado.</p>}</div></section>
  </div>;
}
