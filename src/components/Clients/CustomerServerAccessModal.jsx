import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History, KeyRound, Server } from 'lucide-react';
import Modal from '@/components/Common/Modal';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { horizonsApi } from '@/services/horizonsApi';

const emptyForm = {
  to_server_id: '', reason: '', external_username: '', password: '',
  external_plan: '', screens: 1, dns: '', checkout_url: '',
  valid_until: '', access_message: '',
};

const dateTimeValue = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';

const CustomerServerAccessModal = ({ isOpen, onClose, customer, onSaved, notify }) => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const payload = await horizonsApi(`/customers/${customer.id}/server-accesses`);
      setData(payload);
      const current = payload.accesses.find((access) => access.active && access.is_primary);
      setForm({
        ...emptyForm,
        screens: current?.screens || customer.quantity_screens || 1,
        external_plan: current?.external_plan || '',
        dns: '',
      });
    } catch (error) {
      notify.error('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
    else { setData(null); setForm(emptyForm); }
  }, [isOpen, customer?.id]);

  const current = useMemo(
    () => data?.accesses?.find((access) => access.active && access.is_primary) || null,
    [data],
  );

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await horizonsApi(`/customers/${customer.id}/server-migrations`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          screens: Number(form.screens),
          valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
          checkout_url: form.checkout_url || null,
          dns: form.dns || null,
          external_plan: form.external_plan || null,
          access_message: form.access_message || null,
        }),
      });
      notify.success('Acesso atualizado', current
        ? 'O novo servidor virou principal e o acesso anterior ficou no histórico.'
        : 'O primeiro acesso principal foi vinculado ao cliente.');
      await load();
      onSaved?.();
    } catch (error) {
      notify.error('Erro', error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Acessos de ${customer?.name || 'cliente'}`} size="xl">
      {loading ? <div className="flex justify-center p-12"><LoadingSpinner size="lg" /></div> : data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-5">
            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold"><Server size={18} /> Acesso principal</div>
              {current ? (
                <div className="space-y-1 text-sm">
                  <p><strong>Servidor:</strong> {current.server?.name || 'Não identificado'}</p>
                  <p><strong>Usuário:</strong> {current.external_username || '—'}</p>
                  <p><strong>Plano:</strong> {current.external_plan || '—'} · {current.screens} tela(s)</p>
                  <p><strong>Validade:</strong> {dateTimeValue(current.valid_until)}</p>
                  <p><strong>DNS:</strong> {current.dns || '—'}</p>
                  <p><strong>Checkout:</strong> {current.checkout_url ? 'cadastrado' : 'não cadastrado'}</p>
                  <p><strong>Credenciais:</strong> {current.credentials_complete ? 'completas' : 'pendentes de cadastro'}</p>
                  {current.server_type === 'legacy' && <p className="mt-2 text-amber-700 dark:text-amber-300">Servidor importado do cadastro antigo. Preencha usuário, senha e demais dados confirmados para liberar a entrega automática.</p>}
                </div>
              ) : <p className="text-sm text-gray-500">Este cliente ainda não possui um acesso principal estruturado.</p>}
            </section>

            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold"><History size={18} /> Histórico de servidores</div>
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {(data.history || []).map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
                    <div className="flex items-center gap-2 font-medium">
                      <span>{entry.from_server?.name || 'Primeiro vínculo'}</span><ArrowRight size={14} /><span>{entry.to_server?.name || '—'}</span>
                    </div>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{entry.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">{dateTimeValue(entry.created_at)}</p>
                  </div>
                ))}
                {!data.history?.length && <p className="text-sm text-gray-500">Nenhuma troca registrada.</p>}
              </div>
            </section>
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center gap-2 font-semibold"><KeyRound size={18} /> {current ? 'Migrar para outro servidor' : 'Vincular primeiro acesso'}</div>
            <p className="text-sm text-gray-500">Informe um acesso já criado e validado. O anterior só será desativado quando esta operação for concluída.</p>
            <label className="block text-sm font-medium">Servidor de destino
              <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" required value={form.to_server_id} onChange={(event) => setForm({ ...form, to_server_id: event.target.value })}>
                <option value="">Selecione...</option>
                {(data.servers || []).filter((server) => server.active).map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
              </select>
            </label>
            <Input label="Motivo da vinculação ou troca" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ex.: estabilidade, disponibilidade ou solicitação do cliente" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Usuário do novo acesso" required value={form.external_username} onChange={(event) => setForm({ ...form, external_username: event.target.value })} />
              <Input label="Senha do novo acesso" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Plano/pacote" value={form.external_plan} onChange={(event) => setForm({ ...form, external_plan: event.target.value })} />
              <Input label="Telas" required type="number" min="1" max="99" value={form.screens} onChange={(event) => setForm({ ...form, screens: event.target.value })} />
            </div>
            <Input label="DNS principal do acesso" value={form.dns} onChange={(event) => setForm({ ...form, dns: event.target.value })} placeholder="Opcional; P2P pode não utilizar DNS" />
            <Input label="Checkout" type="url" value={form.checkout_url} onChange={(event) => setForm({ ...form, checkout_url: event.target.value })} placeholder="https://..." />
            <Input label="Validade" type="datetime-local" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} />
            <label className="block text-sm font-medium">Resposta/orientação original do servidor
              <textarea className="mt-1 min-h-24 w-full rounded-lg border bg-transparent px-3 py-2" value={form.access_message} onChange={(event) => setForm({ ...form, access_message: event.target.value })} placeholder="Opcional; será armazenada cifrada." />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
              <Button type="submit" variant="primary" loading={saving}>{current ? 'Confirmar migração' : 'Vincular acesso'}</Button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
};

export default CustomerServerAccessModal;
