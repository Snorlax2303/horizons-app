import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion, Reorder } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  Users, Package, Calendar, TrendingUp, MessageSquare, 
  AlertCircle, DollarSign, CheckCircle2, Clock, Settings,
  GripVertical, Save, RefreshCw, Eye, EyeOff
} from 'lucide-react';
import Card from '@/components/Common/Card';
import Button from '@/components/Common/Button';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { formatCurrency } from '@/utils/formatters';
import { supabase } from '@/lib/customSupabaseClient';
import { horizonsApi } from '@/services/horizonsApi';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

// Static Color Map for Tailwind (Fixes dynamic class issues)
const COLOR_VARIANTS = {
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/20",
    text: "text-blue-600 dark:text-blue-400"
  },
  green: {
    bg: "bg-green-100 dark:bg-green-900/20",
    text: "text-green-600 dark:text-green-400"
  },
  orange: {
    bg: "bg-orange-100 dark:bg-orange-900/20",
    text: "text-orange-600 dark:text-orange-400"
  },
  indigo: {
    bg: "bg-indigo-100 dark:bg-indigo-900/20",
    text: "text-indigo-600 dark:text-indigo-400"
  },
  pink: {
    bg: "bg-pink-100 dark:bg-pink-900/20",
    text: "text-pink-600 dark:text-pink-400"
  },
  cyan: {
    bg: "bg-cyan-100 dark:bg-cyan-900/20",
    text: "text-cyan-600 dark:text-cyan-400"
  },
  emerald: {
    bg: "bg-emerald-100 dark:bg-emerald-900/20",
    text: "text-emerald-600 dark:text-emerald-400"
  }
};

const DEFAULT_PANELS = [
  { id: 'revenue_total', title: 'Receita Total', visible: true, type: 'stat' },
  { id: 'revenue_paid', title: 'Receita Recebida', visible: true, type: 'stat' },
  { id: 'revenue_pending', title: 'Receita Pendente', visible: true, type: 'stat' },
  { id: 'clients_active', title: 'Clientes Ativos', visible: true, type: 'metric' },
  { id: 'campaigns_active', title: 'Campanhas Realizadas', visible: true, type: 'metric' },
  { id: 'pending_tasks', title: 'Pendências', visible: true, type: 'metric' },
  { id: 'total_registered', title: 'Total Cadastrado', visible: true, type: 'metric' },
  { id: 'upcoming_expiries', title: 'Próximos Vencimentos', visible: true, type: 'full' },
  { id: 'operation_summary', title: 'Resumo da Operação', visible: true, type: 'full' },
  { id: 'billing_summary', title: 'Resumo Financeiro', visible: true, type: 'full' },
  { id: 'billing_trends', title: 'Tendências (últimos 30 dias)', visible: true, type: 'full' }
];

const fetchWithRetry = async (operation, retries = 3, delay = 1000) => {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
};

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Dashboard Data State
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    totalRevenue: 0,
    paidRevenue: 0,
    pendingRevenue: 0,
    totalCampaigns: 0,
    upcomingExpiries: [],
    billing: { customers: [], loaded: false },
    trends: { series: [], total: 0, days: 30, loaded: false }
  });

  // Layout State
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    if (user) {
      Promise.all([fetchDashboardData(), fetchLayout()]).finally(() => setLoading(false));
      
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchLayout = async () => {
    try {
      // Use maybeSingle() instead of single() to handle 0 rows gracefully (returns null data instead of error)
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .select('layout_config')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching layout:', error);
        // Don't throw, just use defaults
        return;
      }
      
      if (data && data.layout_config) {
        // Merge saved layout with default to ensure new panels appear if added in code later
        const savedPanels = data.layout_config;
        
        const mergedPanels = savedPanels.map(p => {
          const def = DEFAULT_PANELS.find(d => d.id === p.id);
          // If definition exists, merge. If not (deprecated panel), filter out later if desired, 
          // or keep it but it might lack display properties. 
          // Here we only keep panels that still exist in DEFAULT_PANELS to avoid errors.
          if (!def) return null;
          return { ...def, ...p };
        }).filter(Boolean);

        // Add any new default panels that weren't in saved layout
        const newPanels = DEFAULT_PANELS.filter(d => !savedPanels.find(s => s.id === d.id));
        
        setPanels([...mergedPanels, ...newPanels]);
      }
      // If no data (data is null), we just keep the initial state (DEFAULT_PANELS)
    } catch (err) {
      console.error('Unexpected error in fetchLayout:', err);
      // Fallback to defaults is automatic since state is initialized with DEFAULT_PANELS
    }
  };

  const saveLayout = async () => {
    setSavingLayout(true);
    try {
      // Simplify payload
      const layoutConfig = panels.map(({ id, visible }) => ({ id, visible }));
      
      const { error } = await supabase
        .from('dashboard_layouts')
        .upsert({ user_id: user.id, layout_config: layoutConfig }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Layout do dashboard salvo com sucesso!",
      });
      setIsConfigOpen(false);
    } catch (err) {
      console.error('Error saving layout:', err);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar layout.",
      });
    } finally {
      setSavingLayout(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setError(null);
      await fetchWithRetry(async () => {
        // 1. Clients & Revenue
        const { data: clients, error: clientsErr } = await supabase
          .from('customers')
          .select('id, status, value, due_day, name, paid, plans(name)')
          .eq('user_id', user.id);
        
        if (clientsErr) throw clientsErr;

        const totalClients = clients.length;
        const activeClientsData = clients.filter(c => c.status === 'active');
        const activeClients = activeClientsData.length;
        
        const totalRevenue = activeClientsData.reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);
        const paidRevenue = activeClientsData.filter(c => c.paid).reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);
        const pendingRevenue = activeClientsData.filter(c => !c.paid).reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);

        // 2. Campaigns
        const { count: campaignsCount, error: campaignsErr } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
          
        if (campaignsErr) throw campaignsErr;

        // 3. Upcoming Expiries
        const todayDay = new Date().getDate();
        const upcoming = activeClientsData
          .filter(c => !c.paid)
          .sort((a, b) => {
            const distA = a.due_day - todayDay;
            const distB = b.due_day - todayDay;
            if ((distA >= 0 && distB >= 0) || (distA < 0 && distB < 0)) return a.due_day - b.due_day;
            return distA - distB; 
          })
          .slice(0, 5)
          .map(c => ({
             id: c.id,
             name: c.name,
             plan: c.plans?.name || 'N/A',
             day: c.due_day,
             amount: c.value,
             status: c.due_day < todayDay ? 'late' : (c.due_day === todayDay ? 'today' : 'upcoming')
          }));

        setStats({
          totalClients, activeClients, totalRevenue, paidRevenue, pendingRevenue,
          totalCampaigns: campaignsCount || 0, upcomingExpiries: upcoming,
          billing: await fetchWithRetry(() => horizonsApi('/billing/overview')).then((data) => ({ customers: data.customers || [], loaded: true })).catch(() => ({ customers: [], loaded: false })),
          trends: await fetchWithRetry(() => horizonsApi('/billing/trends?days=30')).then((data) => ({ series: data.series || [], total: data.total || 0, days: data.days || 30, loaded: true })).catch(() => ({ series: [], total: 0, days: 30, loaded: false }))
        });
      });
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setError('Falha ao carregar dados.');
    }
  };

  // Render Helpers
  const renderStatCard = (id) => {
    let props = {};
    switch(id) {
      case 'revenue_total':
        props = { title: 'Receita Total', value: stats.totalRevenue, sub: 'Previsão Mensal', icon: DollarSign, color: 'blue', isCurrency: true };
        break;
      case 'revenue_paid':
        props = { title: 'Receita Recebida', value: stats.paidRevenue, sub: 'Já em caixa', icon: CheckCircle2, color: 'green', isCurrency: true };
        break;
      case 'revenue_pending':
        props = { title: 'Receita Pendente', value: stats.pendingRevenue, sub: 'A receber', icon: Clock, color: 'orange', isCurrency: true };
        break;
      default: return null;
    }
    const { bg, text } = COLOR_VARIANTS[props.color];
    const Icon = props.icon;
    
    return (
      <Card hover>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{props.title}</p>
            <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {props.isCurrency ? formatCurrency(props.value) : props.value}
            </p>
            <p className="text-xs text-gray-500 mt-1">{props.sub}</p>
          </div>
          <div className={`p-3 rounded-lg ${bg}`}>
            <Icon className={`w-5 h-5 md:w-6 md:h-6 ${text}`} />
          </div>
        </div>
      </Card>
    );
  };

  const renderMetricCard = (id) => {
    let props = {};
    switch(id) {
      case 'clients_active':
        props = { title: 'Clientes Ativos', value: stats.activeClients, icon: Users, color: 'indigo' };
        break;
      case 'campaigns_active':
        props = { title: 'Campanhas', value: stats.totalCampaigns, icon: MessageSquare, color: 'pink' };
        break;
      case 'pending_tasks':
        props = { title: 'Pendentes', value: stats.upcomingExpiries.length, icon: AlertCircle, color: 'cyan' };
        break;
      case 'total_registered':
        props = { title: 'Total Cadastrado', value: stats.totalClients, icon: TrendingUp, color: 'emerald' };
        break;
      default: return null;
    }
    const { bg, text } = COLOR_VARIANTS[props.color];
    const Icon = props.icon;

    return (
      <Card>
        <div className="flex items-center gap-4">
           <div className={`p-3 rounded-lg ${bg}`}>
              <Icon className={`w-6 h-6 ${text}`} />
           </div>
           <div>
              <p className="text-sm text-gray-500">{props.title}</p>
              <p className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">{props.value}</p>
           </div>
        </div>
     </Card>
    );
  };

  const renderFullCard = (id) => {
    if (id === 'upcoming_expiries') {
      return (
        <Card>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2">
                 <Calendar className="w-5 h-5 text-orange-500" />
                 <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">Próximos Vencimentos</h2>
              </div>
              <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 px-2 py-1 rounded-full whitespace-nowrap">
                Top 5 Prioritários
              </span>
          </div>
          <div className="space-y-3 overflow-x-auto">
              {stats.upcomingExpiries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                     <CheckCircle2 className="w-12 h-12 text-green-200 dark:text-green-900 mb-2" />
                     <p className="text-gray-500 dark:text-gray-400">Tudo em dia! Nenhum pagamento pendente.</p>
                  </div>
              ) : (
                  stats.upcomingExpiries.map((client) => {
                    let statusColor = 'text-gray-600 dark:text-gray-400';
                    let statusText = 'Em breve';
                    if (client.status === 'late') { statusColor = 'text-red-600 dark:text-red-400 font-bold'; statusText = 'Atrasado'; } 
                    else if (client.status === 'today') { statusColor = 'text-orange-600 dark:text-orange-400 font-bold'; statusText = 'Vence Hoje'; }

                    return (
                      <div key={client.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors gap-2">
                          <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100 text-sm md:text-base">{client.name}</p>
                              <p className="text-xs md:text-sm text-gray-500">{client.plan}</p>
                          </div>
                          <div className="text-left sm:text-right flex flex-row sm:flex-col justify-between items-center sm:items-end w-full sm:w-auto">
                              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm md:text-base">{formatCurrency(client.amount)}</p>
                              <div className="flex items-center gap-1.5 sm:mt-0.5"><span className={`text-xs ${statusColor}`}>Dia {client.day} • {statusText}</span></div>
                          </div>
                      </div>
                    );
                  })
              )}
          </div>
        </Card>
      );
    }
    if (id === 'operation_summary') {
      return (
         <Card>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                   <Package className="w-5 h-5 text-blue-500" />
                   <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">Resumo da Operação</h2>
                </div>
            </div>
            <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">Total de Clientes</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{stats.totalClients}</span>
                </div>
                 <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">Clientes Ativos</span>
                    <span className="font-bold text-green-600">{stats.activeClients}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">Adimplência (Est.)</span>
                    <span className={`font-bold ${stats.totalRevenue > 0 && (stats.paidRevenue / stats.totalRevenue) > 0.8 ? 'text-green-600' : 'text-orange-500'}`}>
                       {stats.totalRevenue > 0 ? ((stats.paidRevenue / stats.totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                </div>
                 <div className="flex justify-between items-center pb-2">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">Campanhas Realizadas</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{stats.totalCampaigns}</span>
                </div>
            </div>
         </Card>
      );
    }
    if (id === 'billing_summary') {
      const customers = stats.billing?.customers || [];
      const checkout = customers.filter((item) => item.payment_method === 'checkout').length;
      const pix = customers.filter((item) => item.payment_method === 'pix').length;
      const manual = customers.filter((item) => item.payment_method === 'manual').length;
      const recovery = customers.filter((item) => item.recovery && ['pending', 'reminded'].includes(item.recovery.status)).length;
      const incomplete = customers.filter((item) => !item.credentials_complete).length;
      const expected = customers.filter((item) => item.status === 'active').reduce((sum, item) => sum + Number(item.value || 0), 0);
      return (
        <Card>
          <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-500" /><h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">Resumo Financeiro</h2></div>{!stats.billing?.loaded && <span className="text-xs text-gray-400">Indisponível</span>}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Com checkout</p><p className="mt-1 text-xl font-bold">{checkout}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Pix por comprovante</p><p className="mt-1 text-xl font-bold">{pix}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Manual</p><p className="mt-1 text-xl font-bold">{manual}</p></div>
            <div className="rounded-lg border border-rose-200 p-3"><p className="text-xs text-gray-500">Em recuperação</p><p className="mt-1 text-xl font-bold text-rose-600">{recovery}</p></div>
            <div className="rounded-lg border border-amber-200 p-3"><p className="text-xs text-gray-500">Credenciais incompletas</p><p className="mt-1 text-xl font-bold text-amber-600">{incomplete}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Mensalidade esperada</p><p className="mt-1 text-lg font-bold">{formatCurrency(expected)}</p></div>
          </div>
        </Card>
      );
    }
    if (id === 'billing_trends') {
      const series = stats.trends?.series || [];
      const total = stats.trends?.total || 0;
      const days = stats.trends?.days || 30;
      const chartData = series.map((item) => ({ day: item.day.slice(5), valor: Number(item.amount.toFixed(2)) }));
      return (
        <Card>
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-500" /><h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">Pagamentos confirmados ({days} dias)</h2></div><span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-1 rounded-full">{formatCurrency(total)}</span></div>
          {chartData.length > 1 ? <ResponsiveContainer width="100%" height={220}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip formatter={(value) => formatCurrency(value)} /><Line type="monotone" dataKey="valor" stroke="#10b981" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer> : <p className="py-8 text-center text-sm text-gray-500">Sem pagamentos confirmados no período para exibir tendência.</p>}
        </Card>
      );
    }
    return null;
  };

  if (loading) return <div className="flex items-center justify-center h-full"><LoadingSpinner size="lg" /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Erro de Conexão</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
      <Button onClick={() => { setLoading(true); fetchDashboardData(); }}>Tentar Novamente</Button>
    </div>
  );

  const visibleStats = panels.filter(p => p.visible && p.type === 'stat');
  const visibleMetrics = panels.filter(p => p.visible && p.type === 'metric');
  const visibleFull = panels.filter(p => p.visible && p.type === 'full');

  return (
    <>
      <Helmet><title>Dashboard - Admin Panel</title></Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1">Visão geral financeira e operacional</p>
          </div>
          <Button variant="outline" icon={Settings} onClick={() => setIsConfigOpen(true)}>
             Personalizar
          </Button>
        </div>

        {/* Dynamic Sections Based on Config */}
        {visibleStats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {visibleStats.map((panel, idx) => (
              <motion.div key={panel.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                {renderStatCard(panel.id)}
              </motion.div>
            ))}
          </div>
        )}

        {visibleMetrics.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
             {visibleMetrics.map(panel => (
                <div key={panel.id}>{renderMetricCard(panel.id)}</div>
             ))}
          </div>
        )}

        {visibleFull.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
             {visibleFull.map(panel => (
                <div key={panel.id}>{renderFullCard(panel.id)}</div>
             ))}
          </div>
        )}

        {/* Customization Modal */}
        <Modal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} title="Personalizar Dashboard">
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <p className="text-sm text-gray-500 mb-4">Arraste para reordenar ou use o ícone de olho para mostrar/esconder.</p>
            
            <Reorder.Group axis="y" values={panels} onReorder={setPanels} className="space-y-2">
              {panels.map((panel) => (
                <Reorder.Item key={panel.id} value={panel}>
                   <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                      <div className="flex items-center gap-3">
                         <GripVertical className="w-4 h-4 text-gray-400" />
                         <span className="font-medium text-gray-700 dark:text-gray-200">{panel.title}</span>
                      </div>
                      <button 
                        onClick={() => {
                          const updated = panels.map(p => p.id === panel.id ? { ...p, visible: !p.visible } : p);
                          setPanels(updated);
                        }}
                        className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${panel.visible ? 'text-blue-600' : 'text-gray-400'}`}
                      >
                         {panel.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>
                   </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>
          <div className="flex justify-end gap-3 mt-6 border-t pt-4">
             <Button variant="secondary" onClick={() => setIsConfigOpen(false)}>Cancelar</Button>
             <Button icon={Save} onClick={saveLayout} loading={savingLayout}>Salvar Layout</Button>
          </div>
        </Modal>

      </div>
    </>
  );
};

export default Dashboard;