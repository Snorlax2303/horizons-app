import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import Button from '@/components/Common/Button';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { horizonsApi } from '@/services/horizonsApi';

const labels = { queued: 'Na fila', processing: 'Em execução', pending_approval: 'Ação manual', completed: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada', create_test: 'Criar teste', renew_customer: 'Renovar', lookup_customer: 'Consultar' };

export default function OperacoesPaineis() {
  const { user } = useAuth();
  const { success, error } = useToastNotification();
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const data = await horizonsApi('/panel-operations'); setOperations(data.operations || []); }
    catch (err) { error('Erro', err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (user) load(); }, [user]);
  const complete = async () => {
    setSaving(true);
    try {
      await horizonsApi(`/panel-operations/${selected.id}/complete-manually`, { method: 'POST', body: JSON.stringify({ notes }) });
      success('Registrado', 'A operação manual foi concluída e ficou registrada.');
      setSelected(null); setNotes(''); load();
    } catch (err) { error('Erro', err.message); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <>
    <Helmet><title>Operações de Painéis - Horizons</title></Helmet>
    <div className="space-y-6"><div className="flex justify-between gap-4"><div><h1 className="text-3xl font-bold">Operações de Painéis</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Fila por tela, com confirmação de tarefas feitas manualmente.</p></div><Button variant="secondary" icon={RefreshCw} onClick={load}>Atualizar</Button></div>
      <div className="overflow-x-auto rounded-xl border bg-white dark:bg-gray-800"><table className="w-full text-sm"><thead className="border-b text-left text-gray-500"><tr><th className="p-4">Ação</th><th className="p-4">Cliente</th><th className="p-4">Painel</th><th className="p-4">Estado</th><th className="p-4">Detalhe</th><th className="p-4"></th></tr></thead><tbody>{operations.map((operation) => <tr key={operation.id} className="border-b last:border-0"><td className="p-4 font-medium">{labels[operation.action]}</td><td className="p-4">{operation.customers?.name || '—'}</td><td className="p-4">{operation.panel_connections?.name || '—'}</td><td className="p-4">{labels[operation.status] || operation.status}</td><td className="p-4 text-xs text-amber-700">{operation.last_error || '—'}</td><td className="p-4">{['pending_approval', 'queued'].includes(operation.status) && <Button variant="secondary" icon={ClipboardCheck} onClick={() => setSelected(operation)}>Confirmar manual</Button>}</td></tr>)}{!operations.length && <tr><td colSpan="6" className="p-10 text-center text-gray-500">Nenhuma operação registrada.</td></tr>}</tbody></table></div>
    </div>
    <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Confirmar operação manual" size="sm"><div className="space-y-4"><p>Confirme somente depois de concluir a ação no painel correto.</p><textarea className="w-full rounded border p-2 bg-transparent" rows="4" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: renovado por 30 dias, usuário externo..." /><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setSelected(null)}>Cancelar</Button><Button variant="primary" icon={CheckCircle2} loading={saving} onClick={complete}>Concluir</Button></div></div></Modal>
  </>;
}
