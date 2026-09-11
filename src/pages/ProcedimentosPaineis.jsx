import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen, Copy, Plus, RefreshCw, ShieldAlert, Trash2, Edit2, Server } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { horizonsApi } from '@/services/horizonsApi';

const deviceCategories = [
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
const deviceLabel = (c) => deviceCategories.find((d) => d.value === c)?.label || c;

const Field = ({ name, description }) => <div className="rounded-lg border bg-white p-4 dark:bg-gray-800"><p className="font-medium">{name}</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{description}</p></div>;

const emptyApp = { cinehub_server_id: '', device_category: 'smart_tv', app_name: '', partner_code: '', downloader_code: '', ntdown_code: '', download_url: '', dns: '', instructions: '', valid_from: '', valid_until: '', active: true, display_order: 0 };
const emptyTutorial = { device_category: 'smart_tv', manufacturer: '', title: '', media_type: 'video', media_url: '', script_notes: '', status: 'pending_recording', sort_order: 0, server_delivery_profile_id: '' };

export default function ProcedimentosPaineis() {
  const { success, error } = useToastNotification();
  const [apps, setApps] = useState([]);
  const [tutorials, setTutorials] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingApp, setSavingApp] = useState(false);
  const [savingTutorial, setSavingTutorial] = useState(false);
  const [appDraft, setAppDraft] = useState(emptyApp);
  const [tutorialDraft, setTutorialDraft] = useState(emptyTutorial);
  const [editAppId, setEditAppId] = useState(null);
  const [editTutorialId, setEditTutorialId] = useState(null);
  const [cloneSource, setCloneSource] = useState('');
  const [cloneTarget, setCloneTarget] = useState('');
  const [cloning, setCloning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [appsRes, tutorialsRes] = await Promise.all([
        horizonsApi('/operations/delivery-profiles'),
        horizonsApi('/operations/tutorial-slots'),
      ]);
      setApps(appsRes.items || []);
      setServers(appsRes.servers || []);
      setTutorials(tutorialsRes.items || []);
    } catch (err) {
      error('Erro', err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const appsByCategory = useMemo(() => {
    const map = new Map();
    for (const app of apps) {
      const key = `${app.cinehub_server_id || 'legacy'}:${app.device_category}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(app);
    }
    return map;
  }, [apps]);

  const saveApp = async (event) => {
    event.preventDefault();
    setSavingApp(true);
    try {
      const payload = { ...appDraft, cinehub_server_id: appDraft.cinehub_server_id || null, partner_code: appDraft.partner_code || null, downloader_code: appDraft.downloader_code || null, ntdown_code: appDraft.ntdown_code || null, download_url: appDraft.download_url || null, dns: appDraft.dns || null, instructions: appDraft.instructions || null, valid_from: appDraft.valid_from || null, valid_until: appDraft.valid_until || null, display_order: Number(appDraft.display_order) || 0, active: Boolean(appDraft.active) };
      if (editAppId) {
        await horizonsApi(`/operations/delivery-profiles/${editAppId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await horizonsApi('/operations/delivery-profiles', { method: 'POST', body: JSON.stringify(payload) });
      }
      success(editAppId ? 'App atualizado' : 'App cadastrado');
      setAppDraft(emptyApp);
      setEditAppId(null);
      await load();
    } catch (err) { error('Erro', err.message); } finally { setSavingApp(false); }
  };

  const removeApp = async (id) => {
    try {
      await horizonsApi(`/operations/delivery-profiles/${id}`, { method: 'DELETE' });
      success('App removido');
      await load();
    } catch (err) { error('Erro', err.message); }
  };

  const startEditApp = (app) => {
    setEditAppId(app.id);
    setAppDraft({ cinehub_server_id: app.cinehub_server_id || '', device_category: app.device_category || 'smart_tv', app_name: app.app_name || '', partner_code: app.partner_code || '', downloader_code: app.downloader_code || '', ntdown_code: app.ntdown_code || '', download_url: app.download_url || '', dns: app.dns || '', instructions: app.instructions || '', valid_from: app.valid_from || '', valid_until: app.valid_until || '', active: Boolean(app.active), display_order: app.display_order || 0 });
  };

  const saveTutorial = async (event) => {
    event.preventDefault();
    setSavingTutorial(true);
    try {
      const payload = { ...tutorialDraft, manufacturer: tutorialDraft.manufacturer || null, media_url: tutorialDraft.media_url || null, script_notes: tutorialDraft.script_notes || null, server_delivery_profile_id: tutorialDraft.server_delivery_profile_id || null, sort_order: Number(tutorialDraft.sort_order) || 0, status: tutorialDraft.status || 'pending_recording', media_type: tutorialDraft.media_type || 'video' };
      if (editTutorialId) {
        await horizonsApi(`/operations/tutorial-slots/${editTutorialId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await horizonsApi('/operations/tutorial-slots', { method: 'POST', body: JSON.stringify(payload) });
      }
      success(editTutorialId ? 'Procedimento atualizado' : 'Procedimento cadastrado');
      setTutorialDraft(emptyTutorial);
      setEditTutorialId(null);
      await load();
    } catch (err) { error('Erro', err.message); } finally { setSavingTutorial(false); }
  };

  const removeTutorial = async (id) => {
    try {
      await horizonsApi(`/operations/tutorial-slots/${id}`, { method: 'DELETE' });
      success('Procedimento removido');
      await load();
    } catch (err) { error('Erro', err.message); }
  };

  const startEditTutorial = (t) => {
    setEditTutorialId(t.id);
    setTutorialDraft({ device_category: t.device_category || 'smart_tv', manufacturer: t.manufacturer || '', title: t.title || '', media_type: t.media_type || 'video', media_url: t.media_url || '', script_notes: t.script_notes || '', status: t.status || 'pending_recording', sort_order: t.sort_order || 0, server_delivery_profile_id: t.server_delivery_profile_id || '' });
  };

  const cloneCatalog = async () => {
    if (!cloneSource || !cloneTarget || cloneSource === cloneTarget) { notify_error('Selecione origem e destino diferentes'); return; }
    setCloning(true);
    try {
      const result = await horizonsApi('/operations/delivery-profiles/clone', { method: 'POST', body: JSON.stringify({ source_server_id: cloneSource, target_server_id: cloneTarget }) });
      success('Catálogo clonado', `${result.cloned} app(s) clonados.`);
      setCloneSource(''); setCloneTarget(''); await load();
    } catch (err) { notify_error('Erro', err.message); } finally { setCloning(false); }
  };

  const refreshElite = async () => {
    setRefreshing(true);
    try {
      const result = await horizonsApi('/operations/delivery-profiles/refresh-elite', { method: 'POST', body: JSON.stringify({}) });
      success('Catálogo Elite atualizado', `${result.updated} alterados, ${result.unchanged} sem mudança.`);
      await load();
    } catch (err) { notify_error('Erro', err.message); } finally { setRefreshing(false); }
  };

  const notify_error = (title, msg) => error(title, msg);

  const filteredApps = (appsByCategory.get(`${appDraft.cinehub_server_id || 'legacy'}:${appDraft.device_category}`) || []);

  return <>
    <Helmet><title>Procedimentos dos Painéis - Horizons</title></Helmet>
    <div className="space-y-6">
      <div className="flex gap-3"><BookOpen className="mt-1 h-7 w-7 text-indigo-600" /><div><h1 className="text-3xl font-bold">Procedimentos dos Painéis</h1><p className="mt-1 text-gray-600 dark:text-gray-400">Cadastre os apps disponíveis por servidor, as categorias de aparelho e os procedimentos de instalação e ativação.</p></div></div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><div className="flex gap-3"><ShieldAlert className="h-5 w-5 shrink-0" /><p>Não armazene senhas dos clientes aqui. Este catálogo é para o operador cadastrar quais apps e procedimentos existem por servidor; as credenciais do cliente são registradas no acesso dele.</p></div></div>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Dados comuns de cada acesso</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field name="Cliente e ID" description="Cliente vinculado e o ID usado para identificar o acesso no painel." />
          <Field name="Painel e servidor" description="Unix, Union, Now, Elite ou P2P; conexão e servidor usados na criação." />
          <Field name="Perfil adulto" description="Com adultos ou sem adultos, quando a opção existir no painel." />
          <Field name="Tipo de acesso" description="Teste, contratação direta, teste convertido ou tela adicional." />
          <Field name="Telas e plano" description="Quantidade de telas daquele acesso e plano externo selecionado." />
          <Field name="Status e validade" description="Estado do teste/acesso e a data de expiração ou próxima renovação." />
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Apps cadastrados por servidor ({apps.length})</h2>
          <div className="flex gap-2">
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={refreshElite}>Atualizar catálogo Elite</Button>
          </div>
        </div>
        <div className="mt-2 rounded border p-3 text-sm">
          <div className="mb-2 flex items-center gap-2"><Copy className="h-4 w-4 text-blue-600" /><b>Clonar apps de outro servidor</b></div>
          <div className="grid gap-2 sm:grid-cols-3"><select className="rounded-lg border bg-transparent px-3 py-2" value={cloneSource} onChange={(e) => setCloneSource(e.target.value)}><option value="">Origem...</option>{Array.from(new Map(apps.map((a) => [a.cinehub_server_id, a.cinehub_servers])).entries()).map(([sid, server]) => <option key={sid} value={sid}>{server?.name || sid}</option>)}</select><select className="rounded-lg border bg-transparent px-3 py-2" value={cloneTarget} onChange={(e) => setCloneTarget(e.target.value)}><option value="">Destino...</option>{Array.from(new Map(apps.map((a) => [a.cinehub_server_id, a.cinehub_servers])).entries()).filter(([sid]) => sid !== cloneSource).map(([sid, server]) => <option key={sid} value={sid}>{server?.name || sid}</option>)}</select><Button variant="primary" loading={cloning} disabled={!cloneSource || !cloneTarget} onClick={cloneCatalog}>Clonar</Button></div>
        </div>
        <div className="mt-3 space-y-2">
          {apps.length ? apps.map((app) => <div key={app.id} className="rounded border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Server className="h-4 w-4 text-blue-600" /><b>{app.cinehub_servers?.name || 'legacy'}</b><span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{deviceLabel(app.device_category)}</span><span className="font-medium">{app.app_name}</span>{app.active === false && <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700">inativo</span>}{app.updated_at && <span className="text-xs text-gray-400">· atualizado {new Date(app.updated_at).toLocaleString('pt-BR')}</span>}</div><div className="flex gap-2"><Button variant="secondary" onClick={() => startEditApp(app)}>Editar</Button><Button variant="secondary" onClick={() => removeApp(app.id)}>Remover</Button></div></div><div className="mt-1 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">{app.partner_code && <div><b>Parceiro:</b> {app.partner_code}</div>}{app.downloader_code && <div><b>Downloader:</b> {app.downloader_code}</div>}{app.ntdown_code && <div><b>NTdown:</b> {app.ntdown_code}</div>}{app.download_url && <div className="break-all"><b>Instalar:</b> <a className="text-blue-600 underline" href={app.download_url} target="_blank" rel="noreferrer">{app.download_url}</a></div>}{app.dns && <div><b>DNS:</b> {app.dns}</div>}{(app.valid_from || app.valid_until) && <div><b>Validade:</b> {app.valid_from || '—'} → {app.valid_until || '—'}</div>}{app.instructions && <div className="sm:col-span-2 whitespace-pre-wrap">{app.instructions}</div>}</div></div>) : <p className="text-sm text-gray-500">Nenhum app cadastrado. Use o formulário abaixo ou “Atualizar catálogo Elite”.</p>}
        </div>
      </section>

      <form onSubmit={saveApp} className="rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h3 className="mb-3 text-lg font-semibold">{editAppId ? 'Editar app' : 'Cadastrar app'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Servidor
            <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={appDraft.cinehub_server_id} onChange={(e) => setAppDraft({ ...appDraft, cinehub_server_id: e.target.value })}>
              <option value="">Selecione o servidor</option>
              {servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Categoria
            <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={appDraft.device_category} onChange={(e) => setAppDraft({ ...appDraft, device_category: e.target.value })}>
              {deviceCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <Input label="Nome do app" required value={appDraft.app_name} onChange={(v) => setAppDraft({ ...appDraft, app_name: v })} placeholder="Ex.: IBO 4K PLUS" />
          <Input label="Ordem" type="number" value={appDraft.display_order} onChange={(v) => setAppDraft({ ...appDraft, display_order: v })} />
          <Input label="Código parceiro" value={appDraft.partner_code} onChange={(v) => setAppDraft({ ...appDraft, partner_code: v })} placeholder="Ex.: 00906" />
          <Input label="Código Downloader" value={appDraft.downloader_code} onChange={(v) => setAppDraft({ ...appDraft, downloader_code: v })} />
          <Input label="Código NTdown" value={appDraft.ntdown_code} onChange={(v) => setAppDraft({ ...appDraft, ntdown_code: v })} />
          <Input label="URL de instalação" value={appDraft.download_url} onChange={(v) => setAppDraft({ ...appDraft, download_url: v })} placeholder="https://..." />
          <Input label="DNS" value={appDraft.dns} onChange={(v) => setAppDraft({ ...appDraft, dns: v })} placeholder="Opcional" />
          <div className="sm:col-span-2"><Input label="Instruções" value={appDraft.instructions} onChange={(v) => setAppDraft({ ...appDraft, instructions: v })} placeholder="Observações para o operador" /></div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2"><Input label="Validade inicial" type="date" value={appDraft.valid_from} onChange={(v) => setAppDraft({ ...appDraft, valid_from: v })} /><Input label="Validade final" type="date" value={appDraft.valid_until} onChange={(v) => setAppDraft({ ...appDraft, valid_until: v })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(appDraft.active)} onChange={(e) => setAppDraft({ ...appDraft, active: e.target.checked })} />Ativo</label>
        </div>
        <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setAppDraft(emptyApp); setEditAppId(null); }}>Limpar</Button><Button type="submit" variant="primary" loading={savingApp}>{editAppId ? 'Salvar' : 'Cadastrar'}</Button></div>
        {filteredApps.length > 0 && <p className="mt-2 text-xs text-gray-500">{filteredApps.length} app(s) já cadastrados para esta combinação servidor/categoria.</p>}
      </form>

      <section className="rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h2 className="mb-3 text-lg font-semibold">Procedimentos de instalação ({tutorials.length})</h2>
        <div className="space-y-2">
          {tutorials.length ? tutorials.map((t) => <div key={t.id} className="rounded border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{deviceLabel(t.device_category)}</span>{t.manufacturer && <span>{t.manufacturer}</span>}<b>{t.title}</b><span className={`rounded px-2 py-0.5 text-xs ${t.status === 'published' ? 'bg-emerald-100 text-emerald-700' : t.status === 'recorded' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{t.status}</span>{t.server_delivery_profiles?.app_name && <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">app: {t.server_delivery_profiles.app_name}</span>}</div><div className="flex gap-2"><Button variant="secondary" onClick={() => startEditTutorial(t)}>Editar</Button><Button variant="secondary" onClick={() => removeTutorial(t.id)}>Remover</Button></div></div>{t.media_url && <div className="text-xs"><b>Mídia:</b> <a className="text-blue-600 underline break-all" href={t.media_url} target="_blank" rel="noreferrer">{t.media_url}</a></div>}{t.script_notes && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{t.script_notes}</div>}</div>) : <p className="text-sm text-gray-500">Nenhum procedimento cadastrado.</p>}
        </div>
      </section>

      <form onSubmit={saveTutorial} className="rounded-xl border bg-white p-5 dark:bg-gray-800">
        <h3 className="mb-3 text-lg font-semibold">{editTutorialId ? 'Editar procedimento' : 'Cadastrar procedimento'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Categoria
            <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={tutorialDraft.device_category} onChange={(e) => setTutorialDraft({ ...tutorialDraft, device_category: e.target.value })}>
              {deviceCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">App vinculado (opcional)
            <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={tutorialDraft.server_delivery_profile_id} onChange={(e) => setTutorialDraft({ ...tutorialDraft, server_delivery_profile_id: e.target.value })}>
              <option value="">— sem app —</option>
              {apps.filter((a) => a.device_category === tutorialDraft.device_category).map((a) => <option key={a.id} value={a.id}>{a.cinehub_servers?.name || 'legacy'} · {a.app_name}</option>)}
            </select>
          </label>
          <Input label="Fabricante (opcional)" value={tutorialDraft.manufacturer} onChange={(v) => setTutorialDraft({ ...tutorialDraft, manufacturer: v })} placeholder="Ex.: Samsung, LG, TCL" />
          <Input label="Ordem" type="number" value={tutorialDraft.sort_order} onChange={(v) => setTutorialDraft({ ...tutorialDraft, sort_order: v })} />
          <Input label="Título" required value={tutorialDraft.title} onChange={(v) => setTutorialDraft({ ...tutorialDraft, title: v })} />
          <label className="block text-sm">Tipo de mídia
            <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={tutorialDraft.media_type} onChange={(e) => setTutorialDraft({ ...tutorialDraft, media_type: e.target.value })}>
              <option value="video">Vídeo</option>
              <option value="image">Imagem</option>
              <option value="document">Documento</option>
            </select>
          </label>
          <Input label="URL da mídia (opcional)" value={tutorialDraft.media_url} onChange={(v) => setTutorialDraft({ ...tutorialDraft, media_url: v })} placeholder="https://..." />
          <label className="block text-sm">Status
            <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={tutorialDraft.status} onChange={(e) => setTutorialDraft({ ...tutorialDraft, status: e.target.value })}>
              <option value="pending_recording">A gravar</option>
              <option value="recorded">Gravado</option>
              <option value="published">Publicado</option>
            </select>
          </label>
          <label className="sm:col-span-2 block text-sm">Roteiro / observações
            <textarea className="mt-1 min-h-24 w-full rounded-lg border bg-transparent p-3" value={tutorialDraft.script_notes} onChange={(e) => setTutorialDraft({ ...tutorialDraft, script_notes: e.target.value })} />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setTutorialDraft(emptyTutorial); setEditTutorialId(null); }}>Limpar</Button><Button type="submit" variant="primary" loading={savingTutorial}>{editTutorialId ? 'Salvar' : 'Cadastrar'}</Button></div>
      </form>
    </div>
  </>;
}
