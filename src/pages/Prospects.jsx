import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { 
  Plus, Search, Trash2, Upload, UserPlus, Folder, 
  Edit2, Check, AlertTriangle, Copy, Bug, Filter, Layers
} from 'lucide-react';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Table from '@/components/Common/Table';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import DuplicateDetectionFlow from '@/components/Common/DuplicateDetectionFlow';
import PaginationControls from '@/components/Common/PaginationControls';
import { formatDateTime, formatPhoneDisplay, formatPhoneInput, formatCurrency } from '@/utils/formatters';
import { normalizeToE164 } from '@/utils/phone';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const Prospects = () => {
  const { user } = useAuth();
  const [prospects, setProspects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('all');
  
  // Data for Conversion Form
  const [plans, setPlans] = useState([]);
  const [servers, setServers] = useState([]);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isDeleteUngroupedModalOpen, setIsDeleteUngroupedModalOpen] = useState(false);
  const [isDuplicateFlowOpen, setIsDuplicateFlowOpen] = useState(false);
  
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Forms
  const [addFormData, setAddFormData] = useState({ name: '', phone: '', group_id: '' });
  const [groupFormData, setGroupFormData] = useState({ name: '' });

  const [convertFormData, setConvertFormData] = useState({
    nome: '',
    phone: '',
    plano_id: '',
    qtd_acessos: 1,
    valor: '',
    dia_vencimento: 5,
    status: 'active',
    observacoes: '',
    paid: false,
    server_ids: []
  });

  // Import State
  const [importText, setImportText] = useState('');
  const [importGroupId, setImportGroupId] = useState('');
  // Ungrouped count for cleanup button
  const [ungroupedTotalCount, setUngroupedTotalCount] = useState(0);

  const { success, error, info } = useToastNotification();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on search change
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (user) {
      // Reset pagination when filter changes
      setCurrentPage(1);
    }
  }, [filterGroupId, user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentPage, pageSize, debouncedSearch, filterGroupId]);

  // Separate effect to fetch groups once or when needed
  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchPlansAndServers();
      fetchUngroupedCount();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    await fetchProspects();
    setLoading(false);
  };

  const fetchUngroupedCount = async () => {
    try {
      const { count } = await supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('group_id', null);
      
      setUngroupedTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching ungrouped count', err);
    }
  };

  const fetchProspects = async () => {
    try {
      let query = supabase
        .from('prospects')
        .select(`
          *,
          prospect_groups (
            name,
            id
          )
        `, { count: 'exact' })
        .eq('user_id', user.id);

      // Apply Filters
      if (filterGroupId !== 'all') {
        query = query.eq('group_id', filterGroupId);
      }
      
      if (debouncedSearch) {
        // Use 'or' for name or phone search
        query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);
      }

      // Apply Pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error: err } = await query;

      if (err) throw err;
      
      setProspects(data || []);
      setTotalRecords(count || 0);
    } catch (err) {
      console.error('Erro ao buscar prospects:', err);
      error('Erro', 'Falha ao carregar lista de possíveis clientes.');
    }
  };

  const fetchGroups = async () => {
    try {
      const { data, error: err } = await supabase
        .from('prospect_groups')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setGroups(data || []);
    } catch (err) {
      console.error('Erro ao buscar grupos:', err);
    }
  };

  const fetchPlansAndServers = async () => {
    const [plansRes, serversRes] = await Promise.all([
      supabase.from('plans').select('*').eq('user_id', user.id),
      supabase.from('servers').select('*').eq('user_id', user.id)
    ]);
    
    if (plansRes.data) setPlans(plansRes.data);
    if (serversRes.data) setServers(serversRes.data);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.ceil(totalRecords / pageSize)) {
      setCurrentPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // --- Group Management ---

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupFormData.name.trim()) return;

    setSaving(true);
    try {
      const { data, error: err } = await supabase
        .from('prospect_groups')
        .insert([{
          user_id: user.id,
          name: groupFormData.name.trim(),
          is_active: true
        }])
        .select()
        .single();

      if (err) throw err;

      setGroups([data, ...groups]);
      setGroupFormData({ name: '' });
      success('Sucesso', 'Grupo criado!');
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao criar grupo.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGroup = async (group) => {
    const newName = window.prompt("Novo nome do grupo:", group.name);
    if (!newName || newName === group.name) return;

    try {
      const { error: err } = await supabase
        .from('prospect_groups')
        .update({ name: newName })
        .eq('id', group.id);

      if (err) throw err;

      setGroups(groups.map(g => g.id === group.id ? { ...g, name: newName } : g));
      success('Atualizado', 'Nome do grupo alterado.');
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao atualizar grupo.');
    }
  };

  const handleToggleGroupStatus = async (group) => {
    try {
      const { error: err } = await supabase
        .from('prospect_groups')
        .update({ is_active: !group.is_active })
        .eq('id', group.id);

      if (err) throw err;

      setGroups(groups.map(g => g.id === group.id ? { ...g, is_active: !g.is_active } : g));
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao alterar status.');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("Tem certeza? Os prospects deste grupo ficarão 'Sem Grupo'.")) return;
    
    try {
      const { error: err } = await supabase
        .from('prospect_groups')
        .delete()
        .eq('id', groupId);

      if (err) throw err;

      setGroups(groups.filter(g => g.id !== groupId));
      await Promise.all([fetchProspects(), fetchUngroupedCount()]);
      success('Removido', 'Grupo excluído.');
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao excluir grupo.');
    }
  };

  const handleClearGroupProspects = async (groupId) => {
    if (!window.confirm("ATENÇÃO: Isso excluirá PERMANENTEMENTE todos os prospects deste grupo. Continuar?")) return;

    try {
      const { error: err } = await supabase
        .from('prospects')
        .delete()
        .eq('group_id', groupId);

      if (err) throw err;

      await Promise.all([fetchProspects(), fetchUngroupedCount()]);
      success('Limpeza', 'Todos os prospects do grupo foram removidos.');
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao limpar grupo.');
    }
  };

  // --- Prospect Actions ---

  const handleAddProspect = async (e) => {
    e.preventDefault();
    if (!addFormData.phone) {
      error('Erro', 'Telefone é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const { data, error: err } = await supabase
        .from('prospects')
        .insert([{
          user_id: user.id,
          name: addFormData.name,
          phone: normalizeToE164(addFormData.phone),
          group_id: addFormData.group_id || null
        }])
        .select(`*, prospect_groups(name, id)`)
        .single();

      if (err) throw err;

      // Update list optimistically or refetch current page
      await Promise.all([fetchProspects(), fetchUngroupedCount()]);

      success('Sucesso', 'Possível cliente adicionado!');
      setIsAddModalOpen(false);
      setAddFormData({ name: '', phone: '', group_id: '' });
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao adicionar registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    
    setSaving(true);
    try {
      const lines = importText.split('\n');
      const newProspects = [];
      const targetGroupId = importGroupId || null;
      
      for (const line of lines) {
        // Simple CSV parser: Name,Phone or just Phone
        const parts = line.split(',');
        let name = '';
        let phone = '';
        
        if (parts.length >= 2) {
          name = parts[0].trim();
          phone = parts[1].trim();
        } else {
          phone = parts[0].trim();
        }
        
        if (phone) {
           // Basic cleanup
           const cleanPhone = phone.replace(/[^0-9+]/g, '');
           if (cleanPhone.length >= 10) { 
             newProspects.push({
               user_id: user.id,
               name: name || 'Sem nome',
               phone: normalizeToE164(cleanPhone),
               group_id: targetGroupId
             });
           }
        }
      }

      if (newProspects.length > 0) {
        const { error: err } = await supabase
          .from('prospects')
          .insert(newProspects);

        if (err) throw err;
        
        success('Importação Concluída', `${newProspects.length} registros importados.`);
        setIsImportModalOpen(false);
        setImportText('');
        setImportGroupId('');
        await Promise.all([fetchProspects(), fetchUngroupedCount()]);
      } else {
        info('Importação', 'Nenhum número válido encontrado.');
      }
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha na importação.');
    } finally {
      setSaving(false);
    }
  };

  const openConvertModal = (prospect) => {
    setSelectedProspect(prospect);
    setConvertFormData({
      nome: prospect.name || '',
      phone: formatPhoneInput(prospect.phone?.replace('+55', '') || ''),
      plano_id: '',
      qtd_acessos: 1,
      valor: '',
      dia_vencimento: 5,
      status: 'active',
      observacoes: 'Convertido de Possíveis Clientes',
      paid: false,
      server_ids: []
    });
    setIsConvertModalOpen(true);
  };

  const handlePlanChange = (planId) => {
    const selectedPlan = plans.find(p => p.id === planId);
    if (selectedPlan) {
      setConvertFormData(prev => ({
        ...prev,
        plano_id: planId,
        valor: selectedPlan.value,
        qtd_acessos: selectedPlan.quantity_screens
      }));
    } else {
      setConvertFormData(prev => ({ ...prev, plano_id: planId }));
    }
  };

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // 1. Create Customer
      const payload = {
        user_id: user.id,
        name: convertFormData.nome,
        phone: normalizeToE164(convertFormData.phone),
        plan_id: convertFormData.plano_id,
        quantity_screens: parseInt(convertFormData.qtd_acessos),
        value: parseFloat(convertFormData.valor),
        due_day: parseInt(convertFormData.dia_vencimento),
        status: convertFormData.status,
        notes: convertFormData.observacoes,
        paid: convertFormData.paid,
        server_ids: convertFormData.server_ids
      };

      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .insert([payload])
        .select()
        .single();

      if (custErr) throw custErr;

      // 2. Add Phone Record
      const { error: phoneErr } = await supabase
        .from('customer_phones')
        .insert([{
          customer_id: customer.id,
          phone: payload.phone,
          is_primary: true
        }]);

      if (phoneErr) throw phoneErr;

      // 3. Delete Prospect
      const { error: delErr } = await supabase
        .from('prospects')
        .delete()
        .eq('id', selectedProspect.id);

      if (delErr) console.warn('Falha ao remover prospect após conversão:', delErr);

      success('Sucesso', 'Cliente cadastrado com sucesso!');
      setIsConvertModalOpen(false);
      
      // Refresh current page
      await Promise.all([fetchProspects(), fetchUngroupedCount()]);
      
    } catch (err) {
      console.error(err);
      error('Erro', `Falha na conversão: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProspect) return;
    try {
      const { error: err } = await supabase
        .from('prospects')
        .delete()
        .eq('id', selectedProspect.id);
        
      if (err) throw err;
      
      // Refresh current page
      await Promise.all([fetchProspects(), fetchUngroupedCount()]);
      success('Removido', 'Registro excluído.');
      setIsDeleteModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao excluir registro.');
    }
  };

  const handleDeleteUngrouped = async () => {
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from('prospects')
        .delete()
        .eq('user_id', user.id)
        .is('group_id', null);

      if (err) throw err;

      // Refresh data
      setCurrentPage(1);
      await Promise.all([fetchProspects(), fetchUngroupedCount()]);
      success('Limpeza Concluída', 'Todos os leads sem grupo foram removidos.');
      setIsDeleteUngroupedModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao excluir leads sem grupo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicatesRemoved = async () => {
    // Refresh prospects list after duplicates are removed
    await Promise.all([fetchProspects(), fetchUngroupedCount()]);
  };

  const columns = [
    { 
      header: 'Nome', 
      render: (row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.name || '-'}</span> 
    },
    { 
      header: 'Telefone', 
      render: (row) => (
        <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
          {formatPhoneDisplay(row.phone)}
        </span>
      )
    },
    {
      header: 'Grupo',
      render: (row) => (
        row.prospect_groups ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300">
            {row.prospect_groups.name}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Sem Grupo</span>
        )
      )
    },
    { 
      header: 'Data Cadastro', 
      render: (row) => formatDateTime(row.created_at) 
    },
    {
      header: 'Ações',
      render: (row) => (
        <div className="flex justify-end gap-2">
           <Button 
             size="sm" 
             variant="outline"
             className="h-8 px-2 text-xs border-green-200 hover:bg-green-50 text-green-700"
             onClick={(e) => { e.stopPropagation(); openConvertModal(row); }}
             title="Tornar Cliente"
             id={`convert-btn-${row.id}`}
             name={`convert-btn-${row.id}`}
           >
             <UserPlus className="w-3.5 h-3.5 mr-1" /> Converter
           </Button>
           <button 
             onClick={(e) => { e.stopPropagation(); setSelectedProspect(row); setIsDeleteModalOpen(true); }}
             className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
             id={`delete-btn-${row.id}`}
             name={`delete-btn-${row.id}`}
           >
             <Trash2 className="w-4 h-4" />
           </button>
        </div>
      )
    }
  ];

  return (
    <>
      <Helmet>
        <title>Possíveis Clientes - Admin Panel</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Possíveis Clientes</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Gerencie leads, grupos e contatos em potencial</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              className="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-900/20"
              icon={Filter} 
              onClick={() => setIsDuplicateFlowOpen(true)}
              title="Detectar duplicatas"
              id="detect-duplicates-btn"
              name="detect-duplicates-btn"
            >
              <span className="hidden sm:inline">Detectar Duplicatas</span>
              <span className="sm:hidden">Duplicatas</span>
            </Button>
            <Button 
              variant="outline" 
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
              icon={Trash2} 
              onClick={() => setIsDeleteUngroupedModalOpen(true)}
              disabled={ungroupedTotalCount === 0}
              title={ungroupedTotalCount === 0 ? "Não há leads sem grupo" : `Excluir ${ungroupedTotalCount} leads sem grupo`}
              id="delete-ungrouped-btn"
              name="delete-ungrouped-btn"
            >
              <span className="hidden sm:inline">Limpar Sem Grupo</span>
              <span className="sm:hidden">Limpar</span>
            </Button>
            <Button variant="outline" icon={Folder} onClick={() => setIsGroupManagerOpen(true)}>
              Gerenciar Grupos
            </Button>
            <Button variant="outline" icon={Upload} onClick={() => setIsImportModalOpen(true)}>
              Importar
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
              Novo Lead
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              containerClassName="!mb-0"
              id="search-prospects-input"
              name="search-prospects-input"
            />
          </div>
          <div className="w-full md:w-48">
             <select
               value={filterGroupId}
               onChange={(e) => setFilterGroupId(e.target.value)}
               className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 outline-none"
               id="filter-group-select"
               name="filter-group-select"
             >
               <option value="all">Todos os Grupos</option>
               {groups.map(g => (
                 <option key={g.id} value={g.id}>{g.name}</option>
               ))}
             </select>
          </div>
          
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center whitespace-nowrap shadow-sm min-w-[160px] h-[58px]">
             <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Encontrado</span>
             <span className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none mt-1">
                {totalRecords}
             </span>
          </div>
        </div>

        <div className="min-h-[400px]">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-20 space-y-4">
               <LoadingSpinner size="lg" />
               <p className="text-gray-500 animate-pulse">Carregando registros...</p>
             </div>
          ) : (
             <div className="space-y-4">
               <motion.div
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 transition={{ duration: 0.3 }}
               >
                 <Table 
                   columns={columns} 
                   data={prospects}
                   emptyMessage="Nenhum possível cliente encontrado com os filtros atuais."
                 />
               </motion.div>
               
               <PaginationControls
                 currentPage={currentPage}
                 totalPages={Math.ceil(totalRecords / pageSize)}
                 pageSize={pageSize}
                 totalRecords={totalRecords}
                 onPageChange={handlePageChange}
                 onPageSizeChange={handlePageSizeChange}
                 isLoading={loading}
               />
             </div>
          )}
        </div>

        {/* Modal Group Manager */}
        <Modal
          isOpen={isGroupManagerOpen}
          onClose={() => setIsGroupManagerOpen(false)}
          title="Gerenciar Grupos"
          size="lg"
        >
          <div className="space-y-6">
            <form onSubmit={handleCreateGroup} className="flex gap-2">
              <Input
                placeholder="Nome do novo grupo"
                value={groupFormData.name}
                onChange={(e) => setGroupFormData({ name: e.target.value })}
                containerClassName="flex-1 !mb-0"
                id="new-group-name"
                name="new-group-name"
              />
              <Button type="submit" variant="primary" icon={Plus} disabled={!groupFormData.name.trim()} id="create-group-btn" name="create-group-btn">
                Criar
              </Button>
            </form>

            <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
               <table className="w-full text-sm">
                 <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                   <tr>
                     <th className="px-4 py-2 text-left">Nome</th>
                     <th className="px-4 py-2 text-center">Status</th>
                     <th className="px-4 py-2 text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                   {groups.length === 0 ? (
                     <tr><td colSpan={3} className="p-4 text-center text-gray-500">Nenhum grupo criado.</td></tr>
                   ) : (
                     groups.map(group => (
                         <tr key={group.id}>
                           <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{group.name}</td>
                           <td className="px-4 py-3 text-center">
                             <button
                               onClick={() => handleToggleGroupStatus(group)}
                               className={`px-2 py-1 rounded text-xs font-bold ${group.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                             >
                               {group.is_active ? 'ATIVO' : 'INATIVO'}
                             </button>
                           </td>
                           <td className="px-4 py-3 flex justify-end gap-2">
                             <button onClick={() => handleUpdateGroup(group)} className="text-blue-500 hover:text-blue-700 p-1" title="Editar Nome"><Edit2 size={16}/></button>
                             <button onClick={() => handleClearGroupProspects(group.id)} className="text-orange-500 hover:text-orange-700 p-1" title="Limpar Prospects"><Trash2 size={16}/></button>
                             <button onClick={() => handleDeleteGroup(group.id)} className="text-red-500 hover:text-red-700 p-1" title="Excluir Grupo"><Trash2 size={16}/></button>
                           </td>
                         </tr>
                       )
                     )
                   )}
                 </tbody>
               </table>
            </div>
          </div>
        </Modal>

        {/* Modal Add Single */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Novo Possível Cliente"
          size="sm"
        >
          <form onSubmit={handleAddProspect} className="space-y-4">
            <Input
              label="Nome (Opcional)"
              value={addFormData.name}
              onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
              id="new-prospect-name"
              name="new-prospect-name"
            />
            <Input
              label="Telefone (Obrigatório)"
              value={addFormData.phone}
              onChange={(e) => setAddFormData({ ...addFormData, phone: formatPhoneInput(e.target.value) })}
              placeholder="(11) 99999-9999"
              required
              id="new-prospect-phone"
              name="new-prospect-phone"
            />
            <div className="flex flex-col gap-1.5">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Grupo</label>
               <select
                 className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none"
                 value={addFormData.group_id}
                 onChange={(e) => setAddFormData({ ...addFormData, group_id: e.target.value })}
                 id="new-prospect-group"
                 name="new-prospect-group"
               >
                 <option value="">Sem Grupo</option>
                 {groups.filter(g => g.is_active).map(g => (
                   <option key={g.id} value={g.id}>{g.name}</option>
                 ))}
               </select>
            </div>
            <div className="flex justify-end gap-3 mt-6">
               <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>Cancelar</Button>
               <Button type="submit" variant="primary" loading={saving}>Salvar</Button>
            </div>
          </form>
        </Modal>

        {/* Modal Import */}
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Importação em Massa"
          size="md"
        >
          <div className="space-y-4">
             <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200">
               <p className="font-bold mb-1">Formato aceito:</p>
               <p>Cole uma lista com <strong>Nome,Telefone</strong> ou apenas <strong>Telefone</strong> (um por linha).</p>
               <p className="mt-2 opacity-80">Exemplo:</p>
               <code className="block bg-white/50 dark:bg-black/20 p-2 rounded mt-1">
                 João Silva, 11999999999<br/>
                 Maria, 21988888888<br/>
                 11977777777
               </code>
             </div>
             
             <div className="flex flex-col gap-1.5">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Importar para Grupo</label>
               <select
                 className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none"
                 value={importGroupId}
                 onChange={(e) => setImportGroupId(e.target.value)}
                 id="import-group-select"
                 name="import-group-select"
               >
                 <option value="">Sem Grupo</option>
                 {groups.filter(g => g.is_active).map(g => (
                   <option key={g.id} value={g.id}>{g.name}</option>
                 ))}
               </select>
             </div>

             <textarea
               className="w-full h-64 p-3 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 font-mono text-sm"
               placeholder="Cole sua lista aqui..."
               value={importText}
               onChange={(e) => setImportText(e.target.value)}
               id="import-text-area"
               name="import-text-area"
             />
             
             <div className="flex justify-end gap-3">
               <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>Cancelar</Button>
               <Button variant="primary" onClick={handleImport} loading={saving}>Importar</Button>
             </div>
          </div>
        </Modal>

        {/* Modal Convert */}
        <Modal
          isOpen={isConvertModalOpen}
          onClose={() => setIsConvertModalOpen(false)}
          title="Converter para Cliente"
          size="lg"
        >
           <form onSubmit={handleConvertSubmit} className="space-y-4">
             <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg flex items-center gap-2 text-green-800 dark:text-green-300 text-sm mb-4">
               <Check className="w-5 h-5" />
               Convertendo <strong>{selectedProspect?.name}</strong> ({selectedProspect?.phone})
             </div>

             <div className="grid grid-cols-2 gap-4">
               <Input
                  label="Nome Completo"
                  value={convertFormData.nome}
                  onChange={(e) => setConvertFormData({ ...convertFormData, nome: e.target.value })}
                  required
                  id="convert-name"
                  name="convert-name"
                />
                <Input
                  label="Telefone"
                  value={convertFormData.phone}
                  onChange={(e) => setConvertFormData({ ...convertFormData, phone: formatPhoneInput(e.target.value) })}
                  required
                  id="convert-phone"
                  name="convert-phone"
                />
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plano</label>
                  <select
                    className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none"
                    value={convertFormData.plano_id}
                    onChange={(e) => handlePlanChange(e.target.value)}
                    required
                    id="convert-plan"
                    name="convert-plan"
                  >
                    <option value="">Selecione...</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.value)}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Dia Vencimento"
                  type="number"
                  min="1"
                  max="31"
                  value={convertFormData.dia_vencimento}
                  onChange={(e) => setConvertFormData({ ...convertFormData, dia_vencimento: e.target.value })}
                  required
                  id="convert-due-day"
                  name="convert-due-day"
                />
             </div>
             
             {/* Server Selection */}
             <div className="space-y-2 border-t pt-4 border-gray-100 dark:border-gray-700">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Servidores</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg bg-gray-50 dark:bg-gray-800">
                  {servers.map(server => (
                    <label key={server.id} className="flex items-center gap-2 cursor-pointer p-1">
                      <input 
                        type="checkbox"
                        checked={convertFormData.server_ids.includes(server.id)}
                        onChange={() => {
                           const current = convertFormData.server_ids;
                           const newIds = current.includes(server.id) 
                             ? current.filter(id => id !== server.id)
                             : [...current, server.id];
                           setConvertFormData({ ...convertFormData, server_ids: newIds });
                        }}
                        className="rounded text-indigo-600 w-4 h-4"
                        id={`server-${server.id}`}
                        name={`server-${server.id}`}
                      />
                      <span className="text-sm">{server.name}</span>
                    </label>
                  ))}
                </div>
             </div>

             <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="secondary" onClick={() => setIsConvertModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={saving}>Concluir Cadastro</Button>
             </div>
           </form>
        </Modal>

        {/* Modal Delete */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Excluir Lead"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-300">
              Tem certeza que deseja excluir este possível cliente?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
              <Button variant="danger" onClick={handleDelete}>Excluir</Button>
            </div>
          </div>
        </Modal>

        {/* Modal Delete All Ungrouped */}
        <Modal
          isOpen={isDeleteUngroupedModalOpen}
          onClose={() => setIsDeleteUngroupedModalOpen(false)}
          title="Limpar Leads Sem Grupo"
          size="sm"
        >
           <div className="space-y-4">
             <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                   <h4 className="font-semibold text-red-800 dark:text-red-300">Atenção Crítica</h4>
                   <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                     Você está prestes a excluir <strong>{ungroupedTotalCount}</strong> leads que não pertencem a nenhum grupo. Esta ação é irreversível.
                   </p>
                </div>
             </div>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Certifique-se de que não precisa desses contatos antes de prosseguir.
             </p>
             <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setIsDeleteUngroupedModalOpen(false)} disabled={saving} id="cancel-delete-ungrouped-btn" name="cancel-delete-ungrouped-btn">
                  Cancelar
                </Button>
                <Button variant="danger" onClick={handleDeleteUngrouped} loading={saving} icon={Trash2} id="confirm-delete-ungrouped-btn" name="confirm-delete-ungrouped-btn">
                  Excluir Tudo
                </Button>
             </div>
           </div>
        </Modal>

        {/* New Duplicate Detection Flow Modal */}
        <DuplicateDetectionFlow
          isOpen={isDuplicateFlowOpen}
          onClose={() => setIsDuplicateFlowOpen(false)}
          userId={user?.id}
          onSuccess={handleDuplicatesRemoved}
        />
      </div>
    </>
  );
};

export default Prospects;