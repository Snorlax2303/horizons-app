import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Gift, Link, Plus, QrCode, Settings, Trophy } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast as useToastNotification } from '@/hooks/useToast';

const statusLabel = { pending: 'Aguardando pagamento', eligible: 'Elegível', granted: 'Concedida', cancelled: 'Cancelada' };
const makeCode = (name) => `${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'CLIENTE'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export default function Indicacoes() {
  const { user } = useAuth();
  const { success, error } = useToastNotification();
  const [customers, setCustomers] = useState([]); const [links, setLinks] = useState([]); const [rewards, setRewards] = useState([]); const [benefits, setBenefits] = useState([]);
  const [program, setProgram] = useState({ first_month_discount: 5, referral_credit: 15, milestone_referrals: 3, active: true });
  const [loading, setLoading] = useState(true); const [open, setOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [selected, setSelected] = useState(null); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customer_id: '', reward_value: '15' });
  const load = async () => {
    setLoading(true);
    try {
      const [customerRes, linkRes, rewardRes, benefitRes, settingsRes] = await Promise.all([
        supabase.from('customers').select('id,name,phone,paid').eq('user_id', user.id).order('name'),
        supabase.from('referral_links').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('referral_rewards').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('referral_benefits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('referral_program_settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);
      if (customerRes.error || linkRes.error || rewardRes.error || benefitRes.error || settingsRes.error) throw customerRes.error || linkRes.error || rewardRes.error || benefitRes.error || settingsRes.error;
      setCustomers(customerRes.data || []); setLinks(linkRes.data || []); setRewards(rewardRes.data || []); setBenefits(benefitRes.data || []); if (settingsRes.data) setProgram(settingsRes.data);
    } catch (err) { error('Erro', 'Aplique a migration de indicação e tente novamente.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (user) load(); }, [user]);
  const customerNames = useMemo(() => Object.fromEntries(customers.map((customer) => [customer.id, customer.name])), [customers]);
  const rewardByLink = useMemo(() => rewards.reduce((all, reward) => ({ ...all, [reward.referral_link_id]: (all[reward.referral_link_id] || 0) + 1 }), {}), [rewards]);
  const linkUrl = (code) => `${window.location.origin}/lead?owner=${user.id}&source=referral&ref=${encodeURIComponent(code)}`;
  const createLink = async (event) => {
    event.preventDefault(); const customer = customers.find((item) => item.id === form.customer_id); if (!customer?.paid) { error('Pagamento necessário', 'O cliente recebe cupom de indicação após o primeiro pagamento.'); return; }
    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('referral_links').insert({ user_id: user.id, customer_id: customer.id, code: makeCode(customer.name), reward_value: Number(form.reward_value), active: true });
      if (insertError) throw insertError;
      success('Link criado', 'O cliente já pode compartilhar o QR code.'); setOpen(false); setForm({ customer_id: '', reward_value: '15' }); load();
    } catch (err) { error('Erro', 'Não foi possível criar o link. Tente novamente.'); } finally { setSaving(false); }
  };
  const copy = async (code) => { await navigator.clipboard.writeText(linkUrl(code)); success('Link copiado', 'Envie ao cliente para ele compartilhar.'); };
  const updateReward = async (reward, status) => {
    try { const { error: updateError } = await supabase.from('referral_rewards').update({ status, granted_at: status === 'granted' ? new Date().toISOString() : null }).eq('id', reward.id); if (updateError) throw updateError; success('Atualizado', 'Recompensa atualizada.'); load(); }
    catch { error('Erro', 'Não foi possível atualizar a recompensa.'); }
  };
  const saveProgram = async (event) => {
    event.preventDefault(); setSaving(true);
    try { const { error: saveError } = await supabase.from('referral_program_settings').upsert({ ...program, user_id: user.id }, { onConflict: 'user_id' }); if (saveError) throw saveError; success('Regras salvas', 'As novas regras valem para as próximas indicações.'); setSettingsOpen(false); load(); }
    catch { error('Erro', 'Não foi possível salvar as regras.'); } finally { setSaving(false); }
  };
  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <><Helmet><title>Indicações - Horizons</title></Helmet><div className="space-y-6"><div className="flex flex-col md:flex-row justify-between gap-4"><div><h1 className="text-3xl font-bold">Indicações</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Cupom, QR code e benefícios progressivos após o primeiro pagamento.</p></div><div className="flex gap-2"><Button variant="secondary" icon={Settings} onClick={() => setSettingsOpen(true)}>Regras</Button><Button variant="primary" icon={Plus} onClick={() => { setForm({ customer_id: '', reward_value: String(program.referral_credit) }); setOpen(true); }}>Criar link</Button></div></div><div className="rounded-lg bg-indigo-50 text-indigo-900 p-4 text-sm">Indicado: R$ {Number(program.first_month_discount).toFixed(2)} de desconto no 1º mês. Indicador: R$ {Number(program.referral_credit).toFixed(2)} por indicação, limitado ao valor da mensalidade; {program.milestone_referrals} indicações pagas no ciclo substituem os créditos elegíveis por 1 mês grátis.</div><div className="grid gap-4 md:grid-cols-3">{[['Links ativos', links.filter((link) => link.active).length, Link], ['Benefícios elegíveis', benefits.filter((benefit) => benefit.status === 'eligible').length, Gift], ['Vendas indicadas', rewards.length, Trophy]].map(([label, value, Icon]) => <div key={label} className="rounded-xl border bg-white dark:bg-gray-800 p-5 flex justify-between"><div><p className="text-sm text-gray-500">{label}</p><p className="text-3xl font-bold mt-2">{value}</p></div><Icon className="text-indigo-500" /></div>)}</div><section className="grid gap-4 lg:grid-cols-2">{links.map((link) => <article key={link.id} className="rounded-xl border bg-white dark:bg-gray-800 p-5 flex gap-4"><QRCodeSVG value={linkUrl(link.code)} size={112} includeMargin /><div className="min-w-0 flex-1"><p className="font-semibold">{customerNames[link.customer_id] || 'Cliente'}</p><p className="mt-1 text-sm text-gray-500">Cupom: <b>{link.code}</b></p><p className="text-sm text-gray-500">Crédito por indicação: R$ {Number(link.reward_value).toFixed(2)}</p><p className="text-sm text-gray-500">Indicações convertidas: {rewardByLink[link.id] || 0}</p><Button className="mt-3" variant="secondary" icon={Copy} onClick={() => copy(link.code)}>Copiar link</Button></div></article>)}{!links.length && <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-gray-500"><QrCode className="mx-auto mb-3" />Crie o primeiro QR code de indicação.</div>}</section><section className="rounded-xl border bg-white dark:bg-gray-800 overflow-x-auto"><div className="p-5 border-b"><h2 className="font-semibold">Extrato de benefícios</h2></div><table className="w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="p-4">Cliente</th><th className="p-4">Benefício</th><th className="p-4">Valor</th><th className="p-4">Ciclo</th><th className="p-4">Estado</th></tr></thead><tbody>{benefits.map((benefit) => <tr key={benefit.id} className="border-t"><td className="p-4">{customerNames[benefit.beneficiary_customer_id] || '—'}</td><td className="p-4">{benefit.benefit_type === 'free_month' ? 'Mês grátis' : 'Desconto'}</td><td className="p-4">R$ {Number(benefit.amount).toFixed(2)}</td><td className="p-4">{benefit.cycle_month}</td><td className="p-4">{benefit.status}</td></tr>)}{!benefits.length && <tr><td colSpan="5" className="p-8 text-center text-gray-500">Ainda não há benefícios liberados.</td></tr>}</tbody></table></section></div><Modal isOpen={open} onClose={() => setOpen(false)} title="Novo cupom de indicação" size="sm"><form onSubmit={createLink} className="space-y-4"><label className="block text-sm font-medium">Cliente indicador<select required className="mt-1 w-full rounded border p-2 bg-transparent" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}><option value="">Selecione</option>{customers.filter((customer) => customer.paid).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><Input required type="number" min="0" step="0.01" label="Desconto por indicação (R$)" value={form.reward_value} onChange={(e) => setForm({ ...form, reward_value: e.target.value })} /><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={saving}>Criar QR code</Button></div></form></Modal><Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Regras do programa" size="sm"><form onSubmit={saveProgram} className="space-y-4"><Input required type="number" min="0" step="0.01" label="Desconto do indicado no 1º mês (R$)" value={program.first_month_discount} onChange={(e) => setProgram({ ...program, first_month_discount: Number(e.target.value) })} /><Input required type="number" min="0" step="0.01" label="Crédito por indicação paga (R$)" value={program.referral_credit} onChange={(e) => setProgram({ ...program, referral_credit: Number(e.target.value) })} /><Input required type="number" min="1" step="1" label="Indicações pagas para mês grátis" value={program.milestone_referrals} onChange={(e) => setProgram({ ...program, milestone_referrals: Number(e.target.value) })} /><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>Cancelar</Button><Button type="submit" variant="primary" loading={saving}>Salvar</Button></div></form></Modal></>;
}
