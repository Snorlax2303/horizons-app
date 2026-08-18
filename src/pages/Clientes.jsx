import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, Edit2, Trash2, MoreVertical, CheckCircle2, XCircle, RefreshCw, Smartphone, Server, KeyRound } from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Table from '@/components/Common/Table';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import PaginationControls from '@/components/Common/PaginationControls';
import FilterBar from '@/components/Clients/FilterBar';
import ServerSelectionModal from '@/components/Common/ServerSelectionModal';
import ServerTagsDisplay from '@/components/Clients/ServerTagsDisplay';
import CustomerServerAccessModal from '@/components/Clients/CustomerServerAccessModal';
import { formatPhoneDisplay } from '@/utils/formatters';
import { validateRequired } from '@/utils/validators';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

const Clientes = () => {
  const { user } = useAuth();
  const { success, error: toastError, warning } = useToastNotification();

  // --- Main Data State ---
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [servers, setServers] = useState([]);
  const [profileExists, setProfileExists] = useState(true);

  // --- Pagination & Filter ---
  const [pagination, setPagination] = useState({ page: 1, pageSize: 100, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ search: '', server: '', paymentStatus: '', activeStatus: '', plan: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // --- Scroll Preservation ---
  const scrollRef = useRef(0);
  const shouldRestoreScroll = useRef(false);

  // --- Modal & Form State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [phoneList, setPhoneList] = useState(['']);
  
  const [formData, setFormData] = useState({
    nome: '', plano_id: '', qtd_acessos: '', valor: '', dia_vencimento: '',
    status: 'active', observacoes: '', paid: false, server_ids: []
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 500);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    if (user) { checkUserProfile(); loadResources(); }
  }, [user]);

  useEffect(() => {
    if (user) fetchClientes();
  }, [user, pagination.page, debouncedSearch, filters.server, filters.paymentStatus, filters.activeStatus, filters.plan]);

  // Restore scroll position after loading completes
  useEffect(() => {
    if (!loading && shouldRestoreScroll.current) {
      console.log('🔄 Restoring scroll to:', scrollRef.current);
      // Small delay to ensure DOM is fully rendered and height is correct
      setTimeout(() => {
        window.scrollTo(0, scrollRef.current);
        shouldRestoreScroll.current = false;
      }, 100);
    }
  }, [loading, clientes]);

  const captureScrollPosition = () => {
    const currentScroll = window.scrollY;
    console.log('📍 Capturing scroll position:', currentScroll);
    scrollRef.current = currentScroll;
  };

  const checkUserProfile = async () => {
    const { data } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    setProfileExists(!!data);
  };

  const loadResources = async () => {
    const [pRes, sRes] = await Promise.all([
      supabase.from('plans').select('*').eq('user_id', user.id),
      supabase.from('servers').select('*').eq('user_id', user.id)
    ]);
    if (pRes.data) setPlans(pRes.data);
    if (sRes.data) setServers(sRes.data);
  };

  const fetchClientes = async () => {
    console.log('Fetching clients...');
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('customers')
        .select(`*, plans(name), customer_phones(phone, is_primary)`, { count: 'exact' })
        .eq('user_id', user.id);

      if (filters.server) query = query.contains('server_ids', JSON.stringify([filters.server]));
      if (filters.paymentStatus) query = query.eq('paid', filters.paymentStatus === 'paid');
      if (filters.activeStatus) query = query.eq('status', filters.activeStatus);
      if (filters.plan) query = query.eq('plan_id', filters.plan);
      if (debouncedSearch) query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);

      const from = (pagination.page - 1) * pagination.pageSize;
      const { data, error: fetchError, count } = await query.order('created_at', { ascending: false }).range(from, from + pagination.pageSize - 1);

      if (fetchError) throw fetchError;
      setClientes(data || []);
      setPagination(prev => ({ ...prev, total: count || 0, totalPages: Math.ceil((count || 0) / prev.pageSize) }));
      console.log('Clients fetched successfully');

    } catch (err) {
      console.error('Error fetching customers:', err);
      setError(err.message);
      toastError('Erro', 'Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const resetForm = () => {
    setFormData({
      nome: '', plano_id: '', qtd_acessos: '', valor: '', dia_vencimento: '',
      status: 'active', observacoes: '', paid: false, server_ids: []
    });
    setPhoneList(['']);
    setSelectedCliente(null);
  };

  const handleOpenCreate = () => {
    if (!profileExists) return warning('Atenção', 'Complete seu perfil antes de cadastrar.');
    resetForm();
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cliente) => {
    // Capture scroll before opening modal
    captureScrollPosition();

    // Load raw phone numbers directly from DB structure without formatting or stripping codes
    let phones = cliente.customer_phones?.map(p => p.phone || '') || [''];
    
    // Fallback to main phone field if customer_phones is empty or invalid
    if (phones.length === 0 || (phones.length === 1 && !phones[0])) {
         if (cliente.phone) phones = [cliente.phone];
    }
    
    // Ensure at least one empty field if nothing exists
    if (phones.length === 0) phones = [''];

    setFormData({
      nome: cliente.name,
      plano_id: cliente.plan_id,
      qtd_acessos: cliente.quantity_screens,
      valor: cliente.value,
      dia_vencimento: cliente.due_day,
      status: cliente.status,
      observacoes: cliente.notes || '',
      paid: cliente.paid || false,
      server_ids: Array.isArray(cliente.server_ids) ? cliente.server_ids : []
    });
    setPhoneList(phones);
    setSelectedCliente(cliente);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleOpenServerModal = (cliente) => {
    captureScrollPosition();
    setSelectedCliente(cliente);
    setIsServerModalOpen(true);
  };

  const handleOpenAccessModal = (cliente) => {
    captureScrollPosition();
    setSelectedCliente(cliente);
    setIsAccessModalOpen(true);
  };

  const handleOpenDeleteModal = (cliente) => {
    captureScrollPosition();
    setSelectedCliente(cliente);
    setIsDeleteModalOpen(true);
  }

  const handleServerSave = async (selectedIds) => {
    if (!selectedCliente) return;
    
    try {
      const { error } = await supabase
        .from('customers')
        .update({ server_ids: selectedIds })
        .eq('id', selectedCliente.id);
        
      if (error) throw error;
      
      // Optimistic update
      setClientes(prev => prev.map(c => 
        c.id === selectedCliente.id ? { ...c, server_ids: selectedIds } : c
      ));
      
      success('Sucesso', 'Servidores atualizados!');
      setIsServerModalOpen(false);
      
      // Manually restore scroll since fetchClientes is not called (optimistic update)
      shouldRestoreScroll.current = true;
      setTimeout(() => {
        window.scrollTo(0, scrollRef.current);
        shouldRestoreScroll.current = false;
      }, 100);

    } catch (err) {
      toastError('Erro', 'Falha ao salvar servidores');
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateRequired(formData.nome)) return toastError('Erro', 'Nome obrigatório');
    if (!validateRequired(formData.plano_id)) return toastError('Erro', 'Plano obrigatório');
    
    // Note: Scroll is already captured in handleOpenEdit
    setSaving(true);
    try {
      const validPhones = phoneList.filter(p => p.trim() !== '');
      // Use raw phone string exactly as entered
      const primaryPhone = validPhones[0] || '';
      
      const payload = {
        user_id: user.id,
        name: formData.nome,
        phone: primaryPhone,
        plan_id: formData.plano_id,
        quantity_screens: parseInt(formData.qtd_acessos) || 1,
        value: parseFloat(formData.valor) || 0,
        due_day: parseInt(formData.dia_vencimento),
        status: formData.status,
        notes: formData.observacoes,
        paid: formData.paid,
        server_ids: formData.server_ids
      };

      let customerId;
      if (modalMode === 'create') {
        const { data, error } = await supabase.from('customers').insert([payload]).select().single();
        if (error) throw error;
        customerId = data.id;
        success('Sucesso', 'Cliente criado!');
      } else {
        const { error } = await supabase.from('customers').update(payload).eq('id', selectedCliente.id);
        if (error) throw error;
        customerId = selectedCliente.id;
        success('Sucesso', 'Cliente atualizado!');
        
        // Flag for scroll restoration only on edit/update
        shouldRestoreScroll.current = true;
        console.log('✅ Edit saved. Flagging for scroll restoration.');
      }

      if (modalMode === 'edit') await supabase.from('customer_phones').delete().eq('customer_id', customerId);
      if (validPhones.length > 0) {
        await supabase.from('customer_phones').insert(
          validPhones.map((p, i) => ({ 
              customer_id: customerId, 
              phone: p, // Use raw phone string
              is_primary: i === 0 
          }))
        );
      }

      setIsModalOpen(false);
      fetchClientes(); 
    } catch (err) {
      toastError('Erro', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    // Note: Scroll captured in handleOpenDeleteModal
    try {
      const { error } = await supabase.from('customers').delete().eq('id', selectedCliente.id);
      if (error) throw error;
      success('Sucesso', 'Cliente removido');
      setIsDeleteModalOpen(false);
      
      shouldRestoreScroll.current = true;
      fetchClientes();
    } catch (err) {
      toastError('Erro', err.message);
    }
  };

  const togglePaidStatus = async (cliente) => {
    captureScrollPosition();
    try {
      await supabase.from('customers').update({ paid: !cliente.paid }).eq('id', cliente.id);
      setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, paid: !c.paid } : c));
      
      // Manually restore scroll since fetchClientes is not called
      shouldRestoreScroll.current = true;
      setTimeout(() => {
        window.scrollTo(0, scrollRef.current);
        shouldRestoreScroll.current = false;
      }, 100);
    } catch (err) {
      toastError('Erro', 'Falha ao atualizar status');
    }
  };

  const handleResetPayments = async () => {
    captureScrollPosition();
    setSaving(true);
    try {
      const { error } = await supabase.rpc('reset_monthly_payments', { target_user_id: user.id });
      if (error) throw error;
      success('Sucesso', 'Pagamentos resetados');
      setIsResetModalOpen(false);
      
      shouldRestoreScroll.current = true;
      fetchClientes();
    } catch (err) {
      toastError('Erro', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper to update local state when a server is removed via the tag
  const handleServerRemoved = (customerId, updatedServerIds) => {
    captureScrollPosition();
    setClientes(prev => prev.map(c => 
      c.id === customerId ? { ...c, server_ids: updatedServerIds } : c
    ));
    
    // Manually restore scroll since fetchClientes is not called
    setTimeout(() => {
      window.scrollTo(0, scrollRef.current);
    }, 100);
  };

  const columns = [
    { 
      header: 'Nome / Info', 
      render: (row) => (
        <div className="group relative">
          <p className="font-medium text-gray-900 dark:text-gray-100">{row.name}</p>
          <div className="flex flex-col gap-0.5 mt-1">
             {row.notes && <p className="text-xs text-gray-500 truncate max-w-[150px]" title={row.notes}>{row.notes}</p>}
          </div>
        </div>
      )
    },
    { 
      header: 'Telefone', 
      render: (row) => (
        <div className="flex flex-col gap-1">
          {row.customer_phones?.[0]?.phone 
            ? <span className="text-sm text-gray-600 dark:text-gray-300">{formatPhoneDisplay(row.customer_phones[0].phone)}</span>
            : <span className="text-sm text-gray-600 dark:text-gray-300">{formatPhoneDisplay(row.phone)}</span>
          }
        </div>
      )
    },
    {
      header: 'Servidores',
      render: (row) => (
        <ServerTagsDisplay 
           serverIds={row.server_ids} 
           allServers={servers} 
           customerId={row.id}
           onAddClick={() => handleOpenServerModal(row)}
           onServerRemove={(updatedIds) => handleServerRemoved(row.id, updatedIds)}
        />
      )
    },
    { 
      header: 'Plano', render: (row) => <span className="capitalize text-gray-700 dark:text-gray-300 text-sm">{row.plans?.name || 'Personalizado'}</span>
    },
    { 
      header: 'Venc.', render: (row) => <span className="text-gray-700 dark:text-gray-300 text-sm">Dia {row.due_day}</span>
    },
    {
      header: 'Pagamento',
      render: (row) => (
        <button 
          onClick={(e) => { e.stopPropagation(); togglePaidStatus(row); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
            row.paid 
              ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
              : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900'
          }`}
        >
          {row.paid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {row.paid ? 'Pago' : 'Pendente'}
        </button>
      )
    },
    {
      header: 'Ações',
      render: (row) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500 dark:text-gray-400 outline-none"><MoreVertical className="w-4 h-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenEdit(row)} className="gap-2"><Edit2 className="w-4 h-4" /> Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenAccessModal(row)} className="gap-2"><KeyRound className="w-4 h-4" /> Gerenciar acesso</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenServerModal(row)} className="gap-2"><Server className="w-4 h-4" /> Gerenciar Servidores</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleOpenDeleteModal(row)} className="gap-2 text-red-600"><Trash2 className="w-4 h-4" /> Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }
  ];

  return (
    <>
      <Helmet><title>Clientes - Admin</title></Helmet>
      <div className="space-y-6 flex flex-col h-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Clientes</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Gerencie sua base de clientes</p></div>
          <div className="flex items-center gap-3"><Button variant="outline" icon={RefreshCw} onClick={() => { captureScrollPosition(); setIsResetModalOpen(true); }}>Virar Mês</Button><Button variant="primary" icon={Plus} onClick={handleOpenCreate}>Novo Cliente</Button></div>
        </div>

        <FilterBar servers={servers} plans={plans} filters={filters} onFilterChange={handleFilterChange} />

        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {loading ? <div className="flex-1 flex items-center justify-center p-12"><LoadingSpinner size="lg" /></div> : error ? <div className="flex-1 flex items-center justify-center p-12 text-red-500"><p>{error}</p></div> : (
            <>
              <div className="flex-1 overflow-auto"><Table columns={columns} data={clientes} emptyMessage={<div className="py-12 text-center text-gray-500">Nenhum cliente encontrado.</div>} /></div>
              <PaginationControls currentPage={pagination.page} totalPages={pagination.totalPages} totalRecords={pagination.total} onPageChange={p => setPagination(prev => ({ ...prev, page: p }))} isLoading={loading} />
            </>
          )}
        </div>

        {/* Modal Declarations */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalMode === 'create' ? "Novo Cliente" : "Editar Cliente"} size="lg">
           <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Nome" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required />
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefones</label>
                {phoneList.map((ph, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="flex-1"><Input value={ph} onChange={e => { const l = [...phoneList]; l[idx] = e.target.value; setPhoneList(l); }} placeholder="Ex: 5511999999999" /></div>
                    {idx === 0 ? <Button type="button" size="sm" variant="outline" onClick={() => setPhoneList([...phoneList, ''])}><Plus size={16}/></Button> : <Button type="button" size="sm" variant="ghost" className="text-red-500" onClick={() => setPhoneList(phoneList.filter((_, i) => i !== idx))}><Trash2 size={16}/></Button>}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium mb-1">Plano</label>
                    <select className="w-full border rounded p-2 bg-transparent" value={formData.plano_id} onChange={e => {
                       const pid = e.target.value;
                       const p = plans.find(pl => pl.id === pid);
                       setFormData({ ...formData, plano_id: pid, valor: p?.value || formData.valor, qtd_acessos: p?.quantity_screens || formData.qtd_acessos });
                    }} required>
                       <option value="">Selecione...</option>
                       {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                 </div>
                 <Input label="Dia Vencimento" type="number" value={formData.dia_vencimento} onChange={e => setFormData({...formData, dia_vencimento: e.target.value})} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <Input label="Valor" type="number" step="0.01" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} />
                 <Input label="Telas" type="number" value={formData.qtd_acessos} onChange={e => setFormData({...formData, qtd_acessos: e.target.value})} />
              </div>

              {/* Server Multi-Select (Simplified for Create/Edit Modal - Full Management in dedicated modal) */}
              <div>
                <label className="block text-sm font-medium mb-2">Servidores</label>
                <div className="flex flex-wrap gap-3 p-3 border rounded bg-gray-50 dark:bg-gray-900">
                   {servers.map(s => (
                     <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={formData.server_ids.includes(s.id)} onChange={() => {
                           const ids = formData.server_ids.includes(s.id) ? formData.server_ids.filter(id => id !== s.id) : [...formData.server_ids, s.id];
                           setFormData({...formData, server_ids: ids});
                        }} className="rounded text-blue-600" />
                        <span className="text-sm">{s.name}</span>
                     </label>
                   ))}
                </div>
              </div>

              {/* Observações Field */}
              <div>
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea 
                  className="w-full border rounded p-2 bg-transparent min-h-[80px]" 
                  value={formData.observacoes} 
                  onChange={e => setFormData({...formData, observacoes: e.target.value})}
                  placeholder="Anotações sobre o cliente..."
                />
              </div>

              <div className="flex items-center gap-4">
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.paid} onChange={e => setFormData({...formData, paid: e.target.checked})} className="rounded text-green-600" />
                    <span className="text-sm font-medium">Pago</span>
                 </label>
                 <select className="border rounded p-1 text-sm bg-transparent" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                 </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                 <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                 <Button type="submit" variant="primary" loading={saving}>Salvar</Button>
              </div>
           </form>
        </Modal>

        <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Excluir Cliente" size="sm">
           <div className="space-y-4">
              <p>Tem certeza que deseja excluir <strong>{selectedCliente?.name}</strong>?</p>
              <div className="flex justify-end gap-3">
                 <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
                 <Button variant="danger" onClick={handleDelete}>Excluir</Button>
              </div>
           </div>
        </Modal>

        <Modal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} title="Virar Mês" size="sm">
           <div className="space-y-4">
              <p className="text-sm text-gray-600">Isso marcará todos os clientes ativos como <strong>Não Pagos</strong>.</p>
              <div className="flex justify-end gap-3">
                 <Button variant="secondary" onClick={() => setIsResetModalOpen(false)}>Cancelar</Button>
                 <Button variant="primary" onClick={handleResetPayments} loading={saving}>Confirmar</Button>
              </div>
           </div>
        </Modal>

        {/* Dedicated Server Selection Modal */}
        <ServerSelectionModal 
           isOpen={isServerModalOpen}
           onClose={() => setIsServerModalOpen(false)}
           onConfirm={handleServerSave}
           initialSelectedIds={selectedCliente?.server_ids || []}
           servers={servers}
        />
        <CustomerServerAccessModal
          isOpen={isAccessModalOpen}
          onClose={() => setIsAccessModalOpen(false)}
          customer={selectedCliente}
          onSaved={fetchClientes}
          notify={{ success, error: toastError }}
        />
      </div>
    </>
  );
};

export default Clientes;
