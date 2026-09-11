import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History, KeyRound, Plus, Server, Trash2 } from 'lucide-react';
import Modal from '@/components/Common/Modal';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { horizonsApi } from '@/services/horizonsApi';

const emptyForm = {
  to_server_id: '', reason: '', external_username: '', password: '',
  external_plan: '', screens: 1, checkout_url: '',
  valid_until: '', access_message: '',
};

const appCategories = [
  { value: 'smart_tv', label: 'Smart TV' },
  { value: 'android_tv', label: 'Android / Google TV' },
  { value: 'fire_tv', label: 'Fire TV' },
  { value: 'tv_box', label: 'TV Box' },
  { value: 'android', label: 'Celular Android' },
  { value: 'ios', label: 'iPhone / iPad' },
  { value: 'computer', label: 'Computador' },
  { value: 'console', label: 'Console' },
  { value: 'other', label: 'Outro' },
];

const emptyApp = { app_category: 'smart_tv', app_name: '', install_url: '', code: '', username: '', password: '', notes: '', display_order: 0 };

const dateTimeValue = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';

const CustomerServerAccessModal = ({ isOpen, onClose, customer, onSaved, notify }) => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appDraft, setAppDraft] = useState(emptyApp);
  const [appSaving, setAppSaving] = useState(false);
  const [editAppId, setEditAppId] = useState(null);

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
      });
    } catch (error) {
      notify.error('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
    else { setData(null); setForm(emptyForm); setAppDraft(emptyApp); setEditAppId(null); }
  }, [isOpen, customer?.id]);

  const current = useMemo(
    () => data?.accesses?.find((access) => access.active && access.is_primary) || null,
    [data],
  );

  const [catalog, setCatalog] = useState([]);
  const filteredCatalog = useMemo(() => catalog.filter((a) => a.device_category === appDraft.app_category && (current?.cinehub_server_id ? a.cinehub_server_id === current.cinehub_server_id : !a.cinehub_server_id)), [catalog, appDraft.app_category, current?.cinehub_server_id]);

  useEffect(() => {
    if (!isOpen || !current?.cinehub_server_id) { setCatalog([]); return; }
    horizonsApi(`/operations/delivery-profiles?server_id=${current.cinehub_server_id}`)
      .then((data) => setCatalog(data.items || []))
      .catch(() => setCatalog([]));
  }, [isOpen, current?.cinehub_server_id]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const migrationResult = await horizonsApi(`/customers/${customer.id}/server-migrations`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          screens: Number(form.screens),
          valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
          checkout_url: form.checkout_url || null,
          external_plan: form.external_plan || null,
          access_message: form.access_message || null,
        }),
      });
      notify.success('Acesso atualizado', current
        ? 'O novo servidor virou principal e o acesso anterior ficou no histórico.'
        : 'O primeiro acesso principal foi vinculado ao cliente.');
      const accessId = migrationResult?.result?.access_id;
      if (accessId) {
        try {
          const catalog = await horizonsApi(`/customers/${customer.id}/server-accesses/credentials/from-catalog/${accessId}`, { method: 'POST', body: JSON.stringify({}) });
          if (catalog?.created > 0) notify.success('Apps criados', `${catalog.created} app(s) do catálogo. Preencha usuário/senha.`);
          else if (catalog?.skipped > 0) notify.success('Apps já cadastrados', `${catalog.skipped} app(s) já estavam no acesso.`);
        } catch (catalogError) { console.warn('Falha ao gerar apps do catálogo', catalogError.message); }
      }
      await load();
      onSaved?.();
    } catch (error) {
      notify.error('Erro', error.message);
    } finally {
      setSaving(false);
    }
  };

  const addOrUpdateApp = async (event) => {
    event.preventDefault();
    if (!current) { notify.error('Vincule um acesso primeiro'); return; }
    setAppSaving(true);
    try {
      const payload = {
        customer_panel_target_id: current.id,
        app_category: appDraft.app_category,
        app_name: appDraft.app_name,
        install_url: appDraft.install_url || null,
        code: appDraft.code || null,
        username: appDraft.username || null,
        password: appDraft.password || null,
        notes: appDraft.notes || null,
        display_order: appDraft.display_order || 0,
      };
      if (editAppId) {
        await horizonsApi(`/customers/${customer.id}/server-accesses/credentials/${editAppId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await horizonsApi(`/customers/${customer.id}/server-accesses/credentials`, { method: 'POST', body: JSON.stringify(payload) });
      }
      notify.success(editAppId ? 'App atualizado' : 'App cadastrado');
      setAppDraft(emptyApp);
      setEditAppId(null);
      await load();
    } catch (error) {
      notify.error('Erro', error.message);
    } finally {
      setAppSaving(false);
    }
  };

  const removeApp = async (credId) => {
    try {
      await horizonsApi(`/customers/${customer.id}/server-accesses/credentials/${credId}`, { method: 'DELETE' });
      notify.success('App removido');
      await load();
    } catch (error) { notify.error('Erro', error.message); }
  };

  const startEditApp = (item) => {
    setEditAppId(item.id);
    setAppDraft({ app_category: item.app_category, app_name: item.app_name, install_url: item.install_url || '', code: item.code || '', username: item.username || '', password: item.password || '', notes: item.notes || '', display_order: item.display_order || 0 });
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
                  <p><strong>Plano:</strong> {current.external_plan || '—'} · {current.screens} tela(s)</p>
                  <p><strong>Validade:</strong> {dateTimeValue(current.valid_until)}</p>
                  <p><strong>Checkout:</strong> {current.checkout_url ? 'cadastrado' : 'não cadastrado'}</p>
                  <p><strong>Apps cadastrados:</strong> {(current.apps || []).length}</p>
                  {current.server_type === 'legacy' && <p className="mt-2 text-amber-700 dark:text-amber-300">Servidor importado do cadastro antigo. Preencha os apps por aparelho para liberar a entrega automática.</p>}
                </div>
              ) : <p className="text-sm text-gray-500">Este cliente ainda não possui um acesso principal estruturado.</p>}
            </section>

            <section className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold"><Server size={18} /> Apps do acesso principal</div>
              <div className="space-y-2">
                {(current?.apps || []).length ? (current.apps.map((app) => (
                  <div key={app.id} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2"><b>{app.app_name}</b><span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{appCategories.find((c) => c.value === app.app_category)?.label || app.app_category}</span></div>
                    {app.code && <div><b>Código:</b> {app.code}</div>}
                    {app.install_url && <div className="break-all"><b>Instalação:</b> <a className="text-blue-600 underline" href={app.install_url} target="_blank" rel="noreferrer">{app.install_url}</a></div>}
                    {app.username && <div><b>Usuário:</b> {app.username}</div>}
                    {app.password && <div><b>Senha:</b> {app.password}</div>}
                    {app.notes && <div className="text-gray-500">{app.notes}</div>}
                    {app.updated_at && <div className="text-[10px] text-gray-400">Atualizado em {new Date(app.updated_at).toLocaleString('pt-BR')}</div>}
                    <div className="mt-1 flex gap-2"><Button variant="secondary" onClick={() => startEditApp(app)}>Editar</Button><Button variant="secondary" onClick={() => removeApp(app.id)}><Trash2 className="h-3 w-3" />Remover</Button></div>
                  </div>
                ))) : <p className="text-xs text-gray-500">Nenhum app cadastrado. Cadastre um por categoria de aparelho.</p>}
              </div>
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

          <div className="space-y-4">
            <form onSubmit={submit} className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-semibold"><KeyRound size={18} /> {current ? 'Migrar para outro servidor' : 'Vincular primeiro acesso'}</div>
              <p className="text-sm text-gray-500">Defina servidor, telas e validade. Os apps por aparelho são cadastrados separadamente.</p>
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

            <form onSubmit={addOrUpdateApp} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-semibold"><Plus size={18} /> {editAppId ? 'Editar app' : 'Cadastrar app por aparelho'}</div>
              {!current && <p className="text-sm text-gray-500">Cadastre um acesso principal antes de adicionar apps.</p>}
              {current && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">Categoria
                      <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={appDraft.app_category} onChange={(e) => setAppDraft({ ...appDraft, app_category: e.target.value })}>
                        {appCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm">Selecionar app do catálogo
                      <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={appDraft.__catalogId || ''} onChange={(e) => {
                        const item = filteredCatalog.find((c) => c.id === e.target.value);
                        if (item) setAppDraft({ ...appDraft, __catalogId: item.id, app_name: item.app_name, install_url: item.download_url || '', code: item.partner_code || item.downloader_code || item.ntdown_code || '', notes: item.instructions || '' });
                        else setAppDraft({ ...appDraft, __catalogId: '' });
                      }}>
                        <option value="">— preenchimento manual —</option>
                        {filteredCatalog.map((c) => <option key={c.id} value={c.id}>{c.app_name}{c.partner_code ? ` (parceiro ${c.partner_code})` : ''}{c.downloader_code ? ` (downloader ${c.downloader_code})` : ''}{c.ntdown_code ? ` (NTdown ${c.ntdown_code})` : ''}</option>)}
                      </select>
                    </label>
                  </div>
                  <Input label="Nome do app" required value={appDraft.app_name} onChange={(v) => setAppDraft({ ...appDraft, app_name: v })} placeholder="Ex.: IBO 4K PLUS" />
                  <Input label="URL de instalação" value={appDraft.install_url} onChange={(v) => setAppDraft({ ...appDraft, install_url: v })} placeholder="https://..." />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Código do servidor" value={appDraft.code} onChange={(v) => setAppDraft({ ...appDraft, code: v })} placeholder="Ex.: 00906, 7654321" />
                    <Input label="Plano/pacote" value={appDraft.notes} onChange={(v) => setAppDraft({ ...appDraft, notes: v })} placeholder="Observações para o app" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Usuário" value={appDraft.username} onChange={(v) => setAppDraft({ ...appDraft, username: v })} />
                    <Input label="Senha" type="password" value={appDraft.password} onChange={(v) => setAppDraft({ ...appDraft, password: v })} />
                  </div>
                  <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setAppDraft(emptyApp); setEditAppId(null); }}>Limpar</Button><Button type="submit" variant="primary" loading={appSaving}>{editAppId ? 'Salvar alterações' : 'Cadastrar app'}</Button></div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default CustomerServerAccessModal;
