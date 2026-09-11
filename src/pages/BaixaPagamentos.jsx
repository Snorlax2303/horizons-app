import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import Button from '@/components/Common/Button';
import { horizonsApi } from '@/services/horizonsApi';
import { useToast } from '@/hooks/useToast';

function Validation({ validation }) {
  if (!validation) return null;
  const badge = (ok) => <span className={`rounded px-2 py-0.5 text-xs ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{ok ? 'ok' : 'divergente'}</span>;
  return (
    <div className="text-xs">
      <b>Validação cruzada:</b> valor={badge(validation.amount_ok)} data={badge(validation.date_ok)} cliente={badge(validation.customer_ok)} E2E={badge(validation.e2e_ok)} confiança={validation.confidence}
    </div>
  );
}

export default function BaixaPagamentos() {
  const { error, success } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [context, setContext] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [renewalList, setRenewalList] = useState([]);
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [sendingList, setSendingList] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await horizonsApi('/payments/overview');
      setItems(data.items || []);
    } catch (err) {
      error('Erro', err.message);
    } finally {
      setLoading(false);
    }
  };
  const loadRenewalList = async () => {
    setRenewalLoading(true);
    try {
      const data = await horizonsApi('/operations/renewal-list');
      setRenewalList(data.items || []);
    } catch (err) {
      error('Erro', err.message);
    } finally {
      setRenewalLoading(false);
    }
  };
  useEffect(() => { load(); loadRenewalList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (renewalId, firstReceiptId) => {
    if (expanded === renewalId) { setExpanded(null); return; }
    setExpanded(renewalId);
    if (context[renewalId]) return;
    try {
      const data = await horizonsApi(`/renewals/${renewalId}/receipts/${firstReceiptId}`);
      setContext((current) => ({ ...current, [renewalId]: data }));
    } catch (err) { error('Erro', err.message); }
  };

  const review = async (renewalId, receiptId, decision) => {
    setSaving(receiptId);
    try {
      await horizonsApi(`/renewals/${renewalId}/receipts/${receiptId}/review`, { method: 'POST', body: JSON.stringify({ decision }) });
      success('Registrado', 'Nenhuma mensagem foi enviada.');
      setContext((current) => {
        const updated = { ...current };
        delete updated[renewalId];
        return updated;
      });
      setExpanded(null);
      await load();
      if (decision === 'confirmed') await loadRenewalList();
    } catch (err) {
      error('Erro', err.message);
    } finally {
      setSaving('');
    }
  };

  const sendRenewalList = async () => {
    setSendingList(true);
    try {
      const result = await horizonsApi('/operations/renewal-list/send', { method: 'POST', body: JSON.stringify({}) });
      success('Lista enviada', `${result.count} clientes na mensagem.`);
    } catch (err) {
      error('Erro', err.message);
    } finally {
      setSendingList(false);
    }
  };

  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); success('Copiado', label); } catch { error('Erro', 'Falha ao copiar.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Baixa de Pagamentos</h1>
          <p className="text-sm text-gray-500">Comprovantes Pix aguardando revisão humana antes de confirmar o pagamento.</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>Atualizar</Button>
      </div>

      <section className="rounded-xl border bg-white dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Cliente</th>
                <th>Vencimento</th>
                <th>Esperado</th>
                <th>Comprovantes</th>
                <th>Recuperação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <React.Fragment key={item.renewal_id}>
                  <tr className="border-b">
                    <td className="p-3"><b>{item.customer?.name || 'Sem nome'}</b><div className="text-xs text-gray-500">{item.customer?.phone || item.renewal?.phone || '—'}</div></td>
                    <td>{item.due_date ? new Date(`${item.due_date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>R$ {Number(item.expected_amount || 0).toFixed(2).replace('.', ',')}</td>
                    <td>{item.receipts.length}</td>
                    <td>{item.recovery ? <span className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-700">{item.recovery.status}</span> : <span className="text-xs text-gray-400">—</span>}</td>
                    <td><Button variant="secondary" onClick={() => item.receipts.length && toggle(item.renewal_id, item.receipts[0].id)}>Abrir</Button></td>
                  </tr>
                  {expanded === item.renewal_id && context[item.renewal_id] && (
                    <tr className="border-b bg-gray-50 dark:bg-gray-900">
                      <td colSpan={6}>
                        <div className="space-y-3 p-3">
                          <div className="grid gap-3 sm:grid-cols-2 text-xs">
                            <div><b>Cliente:</b> {context[item.renewal_id].context?.customer?.name} · {context[item.renewal_id].context?.customer?.phone}</div>
                            <div><b>Status:</b> {context[item.renewal_id].context?.customer?.status} · {context[item.renewal_id].context?.customer?.paid ? 'pago' : 'pendente'}</div>
                            <div><b>Servidor:</b> {context[item.renewal_id].context?.primary_target?.cinehub_server_id ? 'cinehub' : context[item.renewal_id].context?.primary_target?.server_id ? 'legacy' : 'não definido'}</div>
                            <div><b>Telas:</b> {context[item.renewal_id].context?.primary_target?.screens || '—'}</div>
                            <div><b>DNS:</b> {context[item.renewal_id].context?.primary_target?.dns || '—'}</div>
                            <div><b>Checkout:</b> {context[item.renewal_id].context?.primary_target?.checkout_url ? <a className="text-blue-600 underline" href={context[item.renewal_id].context.primary_target.checkout_url} target="_blank" rel="noreferrer">abrir</a> : '—'}</div>
                            <div><b>Recuperação:</b> {context[item.renewal_id].context?.recovery ? `${context[item.renewal_id].context.recovery.status} (${context[item.renewal_id].context.recovery.last_due_date || '—'})` : '—'}</div>
                            <div><b>Credenciais:</b> {context[item.renewal_id].context?.primary_target?.credentials_complete ? 'completas' : 'incompletas'}</div>
                          </div>
                          <Validation validation={context[item.renewal_id].context?.validation} />
                          <div className="space-y-2">
                            <b>Comprovantes:</b>
                            {context[item.renewal_id].receipt && (
                              <div className="flex flex-wrap items-center gap-2 rounded border p-2">
                                <div className="text-xs">
                                  R$ {Number(context[item.renewal_id].receipt.amount || 0).toFixed(2).replace('.', ',')}
                                  {' · '}E2E {context[item.renewal_id].receipt.end_to_end_id || '—'}
                                  {' · '}{context[item.renewal_id].receipt.paid_at ? new Date(context[item.renewal_id].receipt.paid_at).toLocaleString('pt-BR') : '—'}
                                  {context[item.renewal_id].receipt.validation_flags?.length ? ` · flags: ${context[item.renewal_id].receipt.validation_flags.join(', ')}` : ''}
                                </div>
                                <div className="ml-auto flex gap-2">
                                  <Button variant="primary" loading={saving === context[item.renewal_id].receipt.id} onClick={() => review(item.renewal_id, context[item.renewal_id].receipt.id, 'confirmed')}>
                                    <ShieldCheck className="h-4 w-4" />Confirmar baixa
                                  </Button>
                                  <Button variant="secondary" loading={saving === context[item.renewal_id].receipt.id} onClick={() => review(item.renewal_id, context[item.renewal_id].receipt.id, 'rejected')}>Rejeitar</Button>
                                  <Button variant="secondary" loading={saving === context[item.renewal_id].receipt.id} onClick={() => review(item.renewal_id, context[item.renewal_id].receipt.id, 'needs_more_evidence')}>Solicitar novo</Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!items.length && !loading && (
                <tr><td colSpan={6} className="p-6 text-center text-sm text-gray-500">Nenhum comprovante aguardando baixa.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Renovação no painel (clientes com baixa confirmada)</h2>
            <p className="text-sm text-gray-500">Lista estruturada para o operador entrar no painel do servidor e renovar o acesso. Credenciais decriptadas somente para o proprietário autenticado.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={RefreshCw} loading={renewalLoading} onClick={loadRenewalList}>Atualizar</Button>
            <Button variant="primary" icon={Send} loading={sendingList} onClick={sendRenewalList}>Enviar lista ao WhatsApp</Button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {renewalList.map((item) => (
            <div key={item.renewal_id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <b>{item.customer?.name}</b>
                  <div className="text-xs text-gray-500">
                    {item.customer?.phone}
                    {' · '}{item.server_name || 'servidor'}
                    {' · '}{item.target?.screens || '?'} tela(s)
                    {' · '}vence {item.target?.valid_until ? new Date(item.target.valid_until).toLocaleDateString('pt-BR') : '—'}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs">
                <b>Apps:</b>
                {(item.target?.apps || []).length ? (
                  <div className="mt-1 space-y-1">
                    {item.target.apps.map((app) => (
                      <div key={app.id} className="rounded border p-2">
                        <div className="flex items-center justify-between gap-2"><span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{app.app_category}</span><b>{app.app_name}</b>{app.code && <span>cód: {app.code}</span>}</div>
                        {app.install_url && <div className="break-all">instalar: <a className="text-blue-600 underline" href={app.install_url} target="_blank" rel="noreferrer">{app.install_url}</a></div>}
                        <div className="flex flex-wrap gap-2">{app.username && <span>usuário: {app.username} <button type="button" className="text-blue-600" onClick={() => copy(app.username, 'Usuário')}><Copy className="inline h-3 w-3" /></button></span>}{app.password && <span>senha: {app.password} <button type="button" className="text-blue-600" onClick={() => copy(app.password, 'Senha')}><Copy className="inline h-3 w-3" /></button></span>}{app.code && <span>código: {app.code} <button type="button" className="text-blue-600" onClick={() => copy(app.code, 'Código')}><Copy className="inline h-3 w-3" /></button></span>}</div>
                        {app.notes && <div className="text-gray-500">{app.notes}</div>}
                      </div>
                    ))}
                  </div>
                ) : <div className="text-gray-500">Nenhum app cadastrado. Cadastre em Gerenciar acesso.</div>}
              </div>
              <div className="mt-2 text-xs text-gray-500">Recebido: R$ {Number(item.received_amount || 0).toFixed(2).replace('.', ',')} · Esperado: R$ {Number(item.expected_amount || 0).toFixed(2).replace('.', ',')}</div>
            </div>
          ))}
          {!renewalList.length && !renewalLoading && (
            <p className="text-sm text-gray-500">Nenhuma baixa confirmada aguardando renovação no painel.</p>
          )}
        </div>
      </section>
    </div>
  );
}
