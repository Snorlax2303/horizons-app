import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Copy, ExternalLink, Megaphone, UsersRound } from 'lucide-react';
import Button from '@/components/Common/Button';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast as useToastNotification } from '@/hooks/useToast';

export default function Captacao() {
  const { user } = useAuth(); const { success, error } = useToastNotification();
  const [prospects, setProspects] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!user) return; supabase.from('prospects').select('id,lifecycle_stage,source,consent_at,opt_out_at').eq('user_id', user.id).then(({ data, error: err }) => { if (err) error('Erro', 'Aplique a migração de captação para visualizar o funil.'); else setProspects(data || []); setLoading(false); }); }, [user]);
  const counts = useMemo(() => prospects.reduce((all, item) => ({ ...all, [item.lifecycle_stage || 'new']: (all[item.lifecycle_stage || 'new'] || 0) + 1 }), {}), [prospects]);
  const link = `${window.location.origin}/lead?owner=${user?.id || ''}&source=landing_page`;
  const copy = async () => { await navigator.clipboard.writeText(link); success('Link copiado', 'Use-o em bio, anúncio ou campanha com consentimento.'); };
  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <><Helmet><title>Captação - Horizons</title></Helmet><div className="space-y-6"><div><h1 className="text-3xl font-bold">Captação</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Landing pages, anúncios, indicações e reativação com consentimento.</p></div><div className="grid gap-4 md:grid-cols-3">{[['Novos', counts.new || 0], ['Qualificados', counts.qualified || 0], ['Convertidos', counts.converted || 0]].map(([label, count]) => <div key={label} className="rounded-xl border bg-white dark:bg-gray-800 p-5"><p className="text-sm text-gray-500">{label}</p><p className="text-3xl font-bold mt-2">{count}</p></div>)}</div><div className="rounded-xl border bg-white dark:bg-gray-800 p-6 space-y-4"><div className="flex gap-3"><Megaphone className="text-indigo-600" /><div><h2 className="font-semibold">Landing e anúncios</h2><p className="text-sm text-gray-500">Leads entram em Possíveis Clientes com UTM, origem e consentimento.</p></div></div><div className="rounded bg-gray-100 dark:bg-gray-900 p-3 text-xs break-all">{link}</div><div className="flex gap-3"><Button variant="primary" icon={Copy} onClick={copy}>Copiar link</Button><a className="inline-flex items-center gap-2 text-sm text-indigo-600" href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" />Abrir landing</a></div></div><div className="rounded-xl border bg-white dark:bg-gray-800 p-6"><div className="flex gap-3"><UsersRound className="text-indigo-600" /><div><h2 className="font-semibold">Indicações e reativação</h2><p className="text-sm text-gray-500">Use o parâmetro <code>?ref=CODIGO</code> em links de indicação. Campanhas de reativação devem selecionar apenas prospects com consentimento e sem opt-out.</p></div></div></div></div></>;
}
