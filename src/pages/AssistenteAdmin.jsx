import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Bot, Send, ShieldCheck } from 'lucide-react';
import Button from '@/components/Common/Button';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { horizonsApi } from '@/services/horizonsApi';

function ResultView({ response }) {
  if (!response) return null;
  if (response.needs_clarification) return <p className="whitespace-pre-wrap">{response.question}</p>;
  if (response.needs_confirmation) return <p>Esta ação exige confirmação reforçada. Envie o mesmo comando ao bot administrativo no Telegram para revisar o destino e confirmar.</p>;
  const result = response.result || {};
  if (response.tool === 'find_customer' || result.ambiguous) {
    const rows = result.customers || result.matches || [];
    return <div className="space-y-2">{rows.map((item) => <div key={item.id} className="rounded border p-3"><p className="font-medium">{item.name || 'Sem nome'}</p><p className="text-sm text-gray-500">{item.phone || 'Sem telefone'}</p></div>)}{!rows.length && <p>Nenhum cliente encontrado.</p>}</div>;
  }
  if (response.tool === 'get_business_metrics') return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
    ['Novos clientes', result.new_customers], ['Possíveis clientes', result.new_prospects], ['Pagamentos', result.payments_count],
    ['Clientes pagantes', result.paying_customers], ['Recebido', `R$ ${Number(result.received_total || 0).toFixed(2).replace('.', ',')}`],
  ].map(([label, value]) => <div key={label} className="rounded border p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold">{value || 0}</p></div>)}</div>;
  if (response.tool === 'get_unpaid_customers') return <div><p className="mb-3 font-medium">{result.count || 0} pendente(s) · R$ {Number(result.expected_monthly_total || 0).toFixed(2).replace('.', ',')}</p><div className="space-y-2">{(result.customers || []).map((item) => <div key={item.id} className="flex justify-between rounded border p-3"><span>{item.name || 'Sem nome'}</span><span>R$ {Number(item.monthly_value || 0).toFixed(2).replace('.', ',')}</span></div>)}</div></div>;
  if (response.tool === 'get_customer_summary' || response.tool === 'get_checkout') return <div className="space-y-3"><div><p className="font-semibold">{result.customer?.name || 'Cliente'}</p><p className="text-sm text-gray-500">{result.customer?.phone || 'Sem telefone'}</p></div>{(result.accesses || []).map((access) => <div key={access.id} className="rounded border p-3 text-sm"><p className="font-medium">{access.external_plan || 'Plano não informado'} · {access.active ? 'Ativo' : 'Inativo'}</p><p>Usuário: {access.external_username || '—'}</p><p>Validade: {access.valid_until ? new Date(access.valid_until).toLocaleDateString('pt-BR') : '—'}</p>{access.checkout_url && <p className="mt-2 break-all">Checkout: <a className="text-blue-600 underline" href={access.checkout_url} target="_blank" rel="noreferrer">{access.checkout_url}</a></p>}</div>)}</div>;
  if (response.tool === 'help') return <p>Posso localizar clientes, consultar resumos e checkout, listar inadimplentes e calcular métricas.</p>;
  return <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre>;
}

export default function AssistenteAdmin() {
  const [status, setStatus] = useState(null); const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false); const [messages, setMessages] = useState([]);
  useEffect(() => { horizonsApi('/admin-assistant/status').then(setStatus).finally(() => setLoading(false)); }, []);
  const submit = async (event) => {
    event.preventDefault(); const text = command.trim(); if (!text || sending) return;
    setMessages((items) => [...items, { role: 'user', text }]); setCommand(''); setSending(true);
    try {
      const response = await horizonsApi('/admin-assistant/query', { method: 'POST', body: JSON.stringify({ command: text }) });
      setMessages((items) => [...items, { role: 'assistant', response }]);
    } catch (error) { setMessages((items) => [...items, { role: 'error', text: error.message }]); }
    finally { setSending(false); }
  };
  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <>
    <Helmet><title>Assistente administrativo - Horizons</title></Helmet>
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header><h1 className="flex items-center gap-3 text-3xl font-bold"><Bot className="text-indigo-600" />Assistente administrativo</h1><p className="mt-1 text-gray-600 dark:text-gray-400">Consulte o Horizons em linguagem natural usando a mesma inteligência do canal administrativo no WhatsApp.</p></header>
      <div className="flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-green-100 px-3 py-1 text-green-800">IA {status?.configured ? 'configurada' : 'indisponível'}</span><span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">{status?.mode === 'confirmed_writes' ? 'Escritas com confirmação' : 'Modo somente leitura'}</span><span className={`rounded-full px-3 py-1 ${status?.telegram_connected ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>Telegram {status?.telegram_connected ? 'autorizado' : 'desativado'}</span><span className={`rounded-full px-3 py-1 ${status?.whatsapp_connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>WhatsApp administrativo {status?.whatsapp_connected ? 'autorizado' : 'desativado'}</span></div>
      <section className="rounded-xl border bg-white p-5 text-sm dark:bg-gray-800"><h2 className="mb-2 font-semibold">Ambiente de teste</h2><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-gray-500">Modelo principal</p><p>{status?.primary_model || '—'}</p></div><div><p className="text-xs text-gray-500">Fallback</p><p>{status?.fallback_enabled ? status?.fallback_model : 'Desativado'}</p></div><div><p className="text-xs text-gray-500">Allowlist WhatsApp</p><p>{status?.whatsapp_allowlist_count ?? 0} número(s)</p></div></div><p className="mt-3 text-xs text-gray-500">Comandos seguros para testar: “Localize o cliente Rafael”, “Quem está inadimplente?”, “Quanto recebi este mês?”, “Mostre o checkout do cliente X”. Pedidos de escrita não são executados aqui; exigem confirmação no canal administrativo.</p></section>
      <div className="flex min-h-[480px] flex-col rounded-xl border bg-white dark:bg-gray-800"><div className="flex-1 space-y-4 overflow-y-auto p-5">{!messages.length && <div className="rounded-lg border border-dashed p-6 text-center text-gray-500"><ShieldCheck className="mx-auto mb-3" /><p>Exemplos: “Localize o cliente Rafael”, “Quem está inadimplente?” ou “Quanto recebi este mês?”</p><p className="mt-2 text-xs">A IA interpreta o pedido, mas os dados vêm de ferramentas restritas do Horizons.</p></div>}{messages.map((message, index) => <div key={index} className={`rounded-lg p-4 ${message.role === 'user' ? 'ml-auto max-w-3xl bg-indigo-600 text-white' : message.role === 'error' ? 'max-w-3xl bg-red-50 text-red-800' : 'mr-auto max-w-4xl bg-gray-50 dark:bg-gray-900'}`}>{message.text || <ResultView response={message.response} />}</div>)}{sending && <div className="flex items-center gap-2 text-sm text-gray-500"><LoadingSpinner size="sm" />Consultando o Horizons…</div>}</div>
        <form onSubmit={submit} className="flex gap-3 border-t p-4"><textarea className="min-h-[52px] flex-1 resize-none rounded-lg border bg-transparent p-3" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Digite uma consulta administrativa…" maxLength={2000} /><Button type="submit" variant="primary" icon={Send} disabled={!command.trim()} loading={sending}>Enviar</Button></form>
      </div>
    </div>
  </>;
}
