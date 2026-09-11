import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Search, Undo2, WalletCards } from 'lucide-react';
import Button from '@/components/Common/Button';
import { horizonsApi } from '@/services/horizonsApi';
import { useToast } from '@/hooks/useToast';
import { useNavigate } from 'react-router-dom';

const methodLabels = { checkout: 'Link de checkout', pix: 'Pix por comprovante', manual: 'Manual' };
const recoveryLabels = { pending: 'Em recuperação', reminded: 'Lembrete enviado', recovered: 'Recuperado', cancelled: 'Arquivado', lost: 'Perdido' };

export default function RevisaoFinanceira() {
  const { error } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const load = async () => { setLoading(true); try { const data = await horizonsApi('/billing/overview'); setRows(data.customers || []); } catch (err) { error('Erro', err.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => rows.filter((row) => {
    const text = `${row.name || ''} ${row.phone || ''}`.toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;
    if (filter === 'recovery' && !row.recovery) return false;
    if (filter === 'checkout' && row.payment_method !== 'checkout') return false;
    if (filter === 'pix' && row.payment_method !== 'pix') return false;
    if (filter === 'incomplete' && row.credentials_complete) return false;
    return true;
  }), [rows, search, filter]);

  const totals = useMemo(() => ({
    all: rows.length,
    checkout: rows.filter((row) => row.payment_method === 'checkout').length,
    pix: rows.filter((row) => row.payment_method === 'pix').length,
    recovery: rows.filter((row) => row.recovery && ['pending', 'reminded'].includes(row.recovery.status)).length,
  }), [rows]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Revisão financeira</h1><p className="text-sm text-gray-500">Todos os clientes, um por um: método de cobrança, servidor, telas, credenciais e recuperação.</p></div><Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>Atualizar</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Clientes', totals.all, WalletCards], ['Link de checkout', totals.checkout, CheckCircle2], ['Pix por comprovante', totals.pix, WalletCards], ['Em recuperação', totals.recovery, Undo2],
    ].map(([label, value, Icon]) => <div key={label} className="rounded-xl border bg-white p-4 dark:bg-gray-800"><Icon className="mb-2 h-5 w-5 text-blue-600"/><div className="text-2xl font-bold">{value}</div><div className="text-sm text-gray-500">{label}</div></div>)}</div>
    <div className="flex flex-wrap items-center gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…" className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-3 text-sm"/></div><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border bg-transparent px-3 py-2 text-sm"><option value="all">Todos</option><option value="recovery">Em recuperação</option><option value="checkout">Com checkout</option><option value="pix">Pix por comprovante</option><option value="incomplete">Credenciais incompletas</option></select></div>
    <section className="overflow-hidden rounded-xl border bg-white dark:bg-gray-800"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="p-3">Cliente</th><th>Método</th><th>Servidor</th><th>Telas</th><th>Status</th><th>Recuperação</th><th></th></tr></thead><tbody>{filtered.map((row) => <tr className="border-b" key={row.id}><td className="p-3"><b>{row.name || 'Sem nome'}</b><div className="text-xs text-gray-500">{row.phone || 'Sem telefone'}</div></td><td><span className={`rounded px-2 py-1 text-xs ${row.payment_method === 'checkout' ? 'bg-emerald-100 text-emerald-700' : row.payment_method === 'pix' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>{methodLabels[row.payment_method]}</span></td><td>{row.server_name || '—'}</td><td>{row.screens || '—'}</td><td><span className={`rounded px-2 py-1 text-xs ${row.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{row.status}</span>{!row.credentials_complete && <span className="ml-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-700">sem credencial</span>}</td><td>{row.recovery ? <span className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-700">{recoveryLabels[row.recovery.status]}</span> : <span className="text-xs text-gray-400">—</span>}</td><td><button className="text-blue-600 hover:underline" onClick={() => navigate('/clientes')}>Abrir cadastro</button></td></tr>)}</tbody></table>{!filtered.length && !loading && <p className="py-8 text-center text-sm text-gray-500">Nenhum cliente corresponde ao filtro.</p>}</div></section>
  </div>;
}
