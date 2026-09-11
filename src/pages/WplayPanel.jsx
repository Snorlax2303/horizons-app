import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PlayCircle, RefreshCw, ShieldCheck, Tv } from 'lucide-react';
import Button from '@/components/Common/Button';
import { horizonsApi } from '@/services/horizonsApi';
import { useToast } from '@/hooks/useToast';

const initialStatus = { configured: false, writesEnabled: false, baseUrl: '', note: '' };

function Options({ items }) {
  return (items || []).map(([id, name]) => <option key={String(id)} value={id}>{name}</option>);
}

export default function WplayPanel() {
  const { success, error, info } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [last, setLast] = useState(null);

  const [test, setTest] = useState({ whatsapp: '', country: 'br', testDuration: '4h', package_iptv: '30', package_p2p: '', notes: '' });
  const [app, setApp] = useState({ nameApp: 'Wapp', mac: '', namePlaylist: '', id_user: '' });
  const [customer, setCustomer] = useState({ name: '', whatsapp: '', country: 'br', planId: '2', package_iptv: '30', notes: '' });
  const [renew, setRenew] = useState({ id: '', days: '30' });
  const [xstream, setXstream] = useState({ nameApp: 'WTV Player', email: '', password: '', id_user: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([horizonsApi('/wplay/status'), horizonsApi('/wplay/catalog')]);
      setStatus({ ...initialStatus, ...s });
      setCatalog(c);
    } catch (err) { error('Erro ao carregar WPlay', err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canWrite = status.configured && status.writesEnabled;
  const packagesIptv = useMemo(() => catalog?.iptvPackages || [], [catalog]);

  async function run(label, path, options, payloadPreview) {
    if (!confirm) { info('Confirme a operação', 'Marque "Confirmo a operação real" antes de executar.'); return; }
    if (!canWrite) {
      setLast({ kind: 'dry-run', label, payload: payloadPreview });
      info('Modo seguro (dry-run)', 'Escritas desativadas: nenhuma chamada foi enviada ao painel. Payload mostrado abaixo.');
      return;
    }
    setBusy(label);
    try {
      const result = await horizonsApi(path, options);
      setLast({ kind: 'result', label, payload: result });
      success('Operação concluída', label);
    } catch (err) { error('Falha na operação', err.message); } finally { setBusy(''); }
  }

  const field = 'w-full rounded-lg border bg-transparent px-3 py-2 text-sm';
  const label = 'text-xs font-medium text-gray-500';

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tv className="h-6 w-6 text-emerald-600" /> WPlay (wwpanel)</h1>
        <p className="text-sm text-gray-500">Painel com API própria: teste, cliente, renovação e apps licenciados. Operações reais consomem créditos.</p>
      </div>
      <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>Atualizar</Button>
    </div>

    <div className={`rounded-xl border p-4 text-sm ${canWrite ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20' : 'border-amber-200 bg-amber-50 dark:bg-amber-900/20'}`}>
      <div className="flex items-start gap-2">
        {canWrite ? <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
        <div>
          <b>{canWrite ? 'Escritas habilitadas' : 'Modo seguro (escritas desativadas)'}</b>
          <p className="text-gray-600 dark:text-gray-300">
            Chave configurada: {status.configured ? 'sim' : 'não'} · Escritas: {status.writesEnabled ? 'sim' : 'não'} · Base: {status.baseUrl || '—'}
          </p>
          <p className="text-gray-500">Enquanto <code>WWPANEL_WRITES_ENABLED=false</code>, as ações apenas mostram o payload (dry-run) e não chamam o painel.</p>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-gray-700 dark:text-gray-200">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Confirmo a operação real e o consumo de créditos
      </label>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      {/* Fluxo 1 — teste + app */}
      <section className="rounded-xl border bg-white p-4 dark:bg-gray-800">
        <h2 className="mb-3 font-semibold">1. Teste (trial) + app</h2>
        <div className="space-y-3">
          <div><div className={label}>WhatsApp</div><input className={field} value={test.whatsapp} onChange={(e) => setTest({ ...test, whatsapp: e.target.value })} placeholder="5516999999999" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><div className={label}>País</div><select className={field} value={test.country} onChange={(e) => setTest({ ...test, country: e.target.value })}><Options items={(catalog?.countries || []).map((c) => [c, c.toUpperCase()])} /></select></div>
            <div><div className={label}>Duração</div><select className={field} value={test.testDuration} onChange={(e) => setTest({ ...test, testDuration: e.target.value })}><Options items={(catalog?.testDurations || []).map((d) => [d, d])} /></select></div>
          </div>
          <div><div className={label}>Pacote IPTV</div><select className={field} value={test.package_iptv} onChange={(e) => setTest({ ...test, package_iptv: e.target.value })}><Options items={packagesIptv} /></select></div>
          <div><div className={label}>Pacote P2P (opcional)</div><select className={field} value={test.package_p2p} onChange={(e) => setTest({ ...test, package_p2p: e.target.value })}><option value="">—</option><Options items={catalog?.p2pPackages} /></select></div>
          <div><div className={label}>Notas</div><input className={field} value={test.notes} onChange={(e) => setTest({ ...test, notes: e.target.value })} /></div>
          <Button icon={PlayCircle} loading={busy === 'create_test'} onClick={() => run('Criar teste (trial)', '/wplay/tests', { method: 'POST', body: JSON.stringify({ ...test, package_iptv: Number(test.package_iptv) || undefined, package_p2p: test.package_p2p || undefined }) }, { ...test })}>Criar teste</Button>
        </div>
        <hr className="my-4 border-gray-200 dark:border-gray-700" />
        <h3 className="mb-2 text-sm font-semibold">Ativar app do teste</h3>
        <div className="space-y-3">
          <div><div className={label}>App</div><select className={field} value={app.nameApp} onChange={(e) => setApp({ ...app, nameApp: e.target.value })}><Options items={(catalog?.apps || []).map((a) => [a, a])} /></select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><div className={label}>MAC</div><input className={field} value={app.mac} onChange={(e) => setApp({ ...app, mac: e.target.value })} /></div>
            <div><div className={label}>id_user</div><input className={field} value={app.id_user} onChange={(e) => setApp({ ...app, id_user: e.target.value })} /></div>
          </div>
          <div><div className={label}>Playlist</div><input className={field} value={app.namePlaylist} onChange={(e) => setApp({ ...app, namePlaylist: e.target.value })} /></div>
          <Button variant="secondary" loading={busy === 'activate_app'} onClick={() => run('Ativar app', '/wplay/apps/activate', { method: 'POST', body: JSON.stringify({ ...app, mac: app.mac || undefined, namePlaylist: app.namePlaylist || undefined, id_user: app.id_user || undefined }) }, { ...app })}>Ativar app</Button>
        </div>
      </section>

      {/* Fluxo 2 — cliente + renovação */}
      <section className="rounded-xl border bg-white p-4 dark:bg-gray-800">
        <h2 className="mb-3 font-semibold">2. Cliente + renovação</h2>
        <div className="space-y-3">
          <div><div className={label}>Nome</div><input className={field} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><div className={label}>WhatsApp</div><input className={field} value={customer.whatsapp} onChange={(e) => setCustomer({ ...customer, whatsapp: e.target.value })} /></div>
            <div><div className={label}>País</div><select className={field} value={customer.country} onChange={(e) => setCustomer({ ...customer, country: e.target.value })}><Options items={(catalog?.countries || []).map((c) => [c, c.toUpperCase()])} /></select></div>
          </div>
          <div><div className={label}>Plano</div><select className={field} value={customer.planId} onChange={(e) => setCustomer({ ...customer, planId: e.target.value })}><Options items={catalog?.plans} /></select></div>
          <div><div className={label}>Pacote IPTV</div><select className={field} value={customer.package_iptv} onChange={(e) => setCustomer({ ...customer, package_iptv: e.target.value })}><Options items={packagesIptv} /></select></div>
          <Button icon={PlayCircle} loading={busy === 'create_customer'} onClick={() => run('Criar cliente', '/wplay/customers', { method: 'POST', body: JSON.stringify({ ...customer, planId: Number(customer.planId) || undefined, package_iptv: Number(customer.package_iptv) || undefined }) }, { ...customer })}>Criar cliente</Button>
        </div>
        <hr className="my-4 border-gray-200 dark:border-gray-700" />
        <h3 className="mb-2 text-sm font-semibold">Renovar por ID</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><div className={label}>ID do cliente</div><input className={field} value={renew.id} onChange={(e) => setRenew({ ...renew, id: e.target.value })} /></div>
            <div><div className={label}>Dias</div><input className={field} value={renew.days} onChange={(e) => setRenew({ ...renew, days: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === 'extend'} onClick={() => run('Estender cliente', `/wplay/customers/${encodeURIComponent(renew.id)}/extend`, { method: 'PATCH', body: JSON.stringify({ days: Number(renew.days) || 30 }) }, { id: renew.id, days: Number(renew.days) || 30 })}>Estender</Button>
            <Button variant="secondary" loading={busy === 'add48'} onClick={() => run('Adicionar +48h', `/wplay/customers/${encodeURIComponent(renew.id)}/add-48h`, { method: 'PATCH' }, { id: renew.id })}>+48h</Button>
            <Button variant="secondary" loading={busy === 'plan'} onClick={() => run('Trocar plano', `/wplay/customers/${encodeURIComponent(renew.id)}/plan`, { method: 'PATCH', body: JSON.stringify({ planId: Number(customer.planId) || undefined }) }, { id: renew.id, planId: customer.planId })}>Trocar plano</Button>
          </div>
        </div>
      </section>

      {/* Fluxo 3 — app licenciado */}
      <section className="rounded-xl border bg-white p-4 dark:bg-gray-800">
        <h2 className="mb-3 font-semibold">3. App licenciado (Xtream)</h2>
        <div className="space-y-3">
          <div><div className={label}>App</div><select className={field} value={xstream.nameApp} onChange={(e) => setXstream({ ...xstream, nameApp: e.target.value })}><Options items={(catalog?.xstreamApps || []).map((a) => [a, a])} /></select></div>
          <div><div className={label}>E-mail</div><input className={field} value={xstream.email} onChange={(e) => setXstream({ ...xstream, email: e.target.value })} /></div>
          <div><div className={label}>Senha</div><input className={field} type="password" value={xstream.password} onChange={(e) => setXstream({ ...xstream, password: e.target.value })} /></div>
          <div><div className={label}>id_user</div><input className={field} value={xstream.id_user} onChange={(e) => setXstream({ ...xstream, id_user: e.target.value })} /></div>
          <Button variant="secondary" loading={busy === 'xstream'} onClick={() => run('Ativar app licenciado', '/wplay/apps/activate-xstream', { method: 'POST', body: JSON.stringify({ ...xstream, email: xstream.email || undefined, password: xstream.password || undefined, id_user: xstream.id_user || undefined }) }, { nameApp: xstream.nameApp, email: xstream.email, id_user: xstream.id_user })}>Ativar app licenciado</Button>
        </div>
      </section>
    </div>

    {last && <section className="rounded-xl border bg-white p-4 dark:bg-gray-800">
      <h2 className="mb-2 font-semibold">{last.kind === 'dry-run' ? 'Payload (dry-run, nada foi enviado)' : `Resultado — ${last.label}`}</h2>
      <pre className="max-h-72 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{JSON.stringify(last.payload, null, 2)}</pre>
    </section>}
  </div>;
}
