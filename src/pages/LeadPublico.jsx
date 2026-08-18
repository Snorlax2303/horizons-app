import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function LeadPublico() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', phone: '', consent: false });
  const [state, setState] = useState('idle');
  const ownerId = params.get('owner');
  const submit = async (event) => {
    event.preventDefault();
    if (!ownerId || !form.consent) return;
    setState('sending');
    try {
      const response = await fetch('/api/public/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        owner_id: ownerId, name: form.name, phone: form.phone, consent: true, source: params.get('source') || 'landing_page',
        source_metadata: { utm_source: params.get('utm_source'), utm_campaign: params.get('utm_campaign'), utm_medium: params.get('utm_medium') }, referral_code: params.get('ref') || undefined,
      }) });
      if (!response.ok) throw new Error();
      setState('sent');
    } catch { setState('error'); }
  };
  if (!ownerId) return <main className="min-h-screen grid place-items-center p-6 text-center">Link de captação inválido.</main>;
  return <main className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 p-6 grid place-items-center"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"><p className="text-indigo-600 font-semibold">IPTV sem complicação</p><h1 className="mt-2 text-3xl font-bold text-slate-900">Peça seu teste</h1><p className="mt-3 text-slate-600">Deixe seu contato e nossa equipe fala com você no WhatsApp.</p>{state === 'sent' ? <div className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">Recebemos seu interesse. Em breve entraremos em contato.</div> : <form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Nome<input required className="mt-1 w-full rounded-lg border p-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="block text-sm font-medium">WhatsApp<input required className="mt-1 w-full rounded-lg border p-3" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} required />Autorizo o contato por WhatsApp sobre esta solicitação.</label>{state === 'error' && <p className="text-sm text-red-600">Não foi possível enviar. Tente novamente.</p>}<button disabled={state === 'sending'} className="w-full rounded-lg bg-indigo-600 p-3 font-semibold text-white disabled:opacity-60">{state === 'sending' ? 'Enviando...' : 'Quero falar com a equipe'}</button></form>}</section></main>;
}
