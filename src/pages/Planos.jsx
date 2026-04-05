import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, Edit, Trash2, Search, CheckCircle, AlertCircle } from 'lucide-react';
import Card from '@/components/Common/Card';
import Button from '@/components/Common/Button';
import Modal from '@/components/Common/Modal';
import Input from '@/components/Common/Input';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { formatCurrency } from '@/utils/formatters';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const Planos = () => {
  const { user } = useAuth();
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Operation States
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Data States
  const [currentPlan, setCurrentPlan] = useState(null); // For edit/delete reference
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    value: '',
    quantity_screens: ''
  });

  const { success, error: toastError } = useToastNotification();

  // --- Initial Load ---
  useEffect(() => {
    fetchPlanos();
  }, []);

  // --- Data Fetching ---
  const fetchPlanos = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      setPlanos(data || []);
    } catch (err) {
      console.error('[Planos] Error fetching plans:', err);
      toastError('Erro ao carregar', 'Não foi possível buscar a lista de planos.');
    } finally {
      setLoading(false);
    }
  };

  // --- Form Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      value: '',
      quantity_screens: ''
    });
    setCurrentPlan(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (plan) => {
    setCurrentPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      value: plan.value,
      quantity_screens: plan.quantity_screens
    });
    setIsModalOpen(true);
  };

  const openDeleteModal = (plan) => {
    setCurrentPlan(plan);
    setIsDeleteModalOpen(true);
  };

  // --- CRUD Operations ---
  const handleSave = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.value || !formData.quantity_screens) {
      toastError('Campos obrigatórios', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        value: parseFloat(formData.value),
        quantity_screens: parseInt(formData.quantity_screens, 10),
        created_by: user?.id // Optional tracking
      };

      let result;

      if (currentPlan?.id) {
        // UPDATE
        result = await supabase
          .from('plans')
          .update(payload)
          .eq('id', currentPlan.id)
          .select();
      } else {
        // CREATE
        result = await supabase
          .from('plans')
          .insert([payload])
          .select();
      }

      if (result.error) throw result.error;

      success('Sucesso', `Plano ${currentPlan ? 'atualizado' : 'criado'} com sucesso!`);
      
      setIsModalOpen(false);
      resetForm();
      await fetchPlanos(); // Immediate refresh

    } catch (err) {
      console.error('[Planos] Save error:', err);
      toastError('Erro ao salvar', err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentPlan?.id) return;

    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('plans')
        .delete()
        .eq('id', currentPlan.id);

      if (error) {
        // Check for Foreign Key violation (Code 23503)
        if (error.code === '23503') {
           throw new Error('Este plano possui clientes vinculados e não pode ser excluído.');
        }
        throw error;
      }

      success('Plano excluído', 'O plano foi removido permanentemente.');
      
      setIsDeleteModalOpen(false);
      setCurrentPlan(null);
      await fetchPlanos(); // Immediate refresh

    } catch (err) {
      console.error('[Planos] Delete error:', err);
      toastError('Erro ao excluir', err.message || 'Não foi possível excluir o plano.');
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Render ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-gray-500 animate-pulse">Carregando planos...</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Planos - Admin Panel</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Planos</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Gerencie os pacotes disponíveis para seus clientes</p>
          </div>
          <Button variant="primary" icon={Plus} onClick={openCreateModal}>
            Novo Plano
          </Button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {planos.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Nenhum plano encontrado</h3>
              <p className="text-gray-500 mt-1 mb-6">Comece criando seu primeiro pacote de serviços.</p>
              <Button variant="outline" icon={Plus} onClick={openCreateModal}>
                Criar Plano
              </Button>
            </div>
          ) : (
            planos.map((plano) => (
              <Card key={plano.id} className="flex flex-col h-full relative group overflow-hidden border-t-4 border-t-green-500">
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate" title={plano.name}>
                      {plano.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 min-h-[40px]">
                      {plano.description || 'Sem descrição definida.'}
                    </p>
                  </div>
                  
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-gray-500 font-medium">R$</span>
                    <span className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                      {plano.value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm text-gray-500">/mês</span>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="font-semibold">{plano.quantity_screens}</span>
                      <span>{plano.quantity_screens === 1 ? 'Tela Simultânea' : 'Telas Simultâneas'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    icon={Edit} 
                    onClick={() => openEditModal(plano)} 
                    className="flex-1 bg-gray-50 dark:bg-gray-700/50 hover:bg-green-50 hover:text-green-700"
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    icon={Trash2} 
                    onClick={() => openDeleteModal(plano)} 
                    className="flex-1 bg-gray-50 dark:bg-gray-700/50 hover:bg-red-50 hover:text-red-700"
                  >
                    Excluir
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => !isSaving && setIsModalOpen(false)}
          title={currentPlan ? 'Editar Plano' : 'Novo Plano'}
        >
          <form onSubmit={handleSave} className="space-y-5">
            <Input
              label="Nome do Plano"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="Ex: Família 4K"
            />
            
            <Input
              label="Descrição (Opcional)"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Ex: Melhor qualidade de imagem para toda família"
            />
            
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Valor Mensal (R$)"
                name="value"
                type="number"
                step="0.01"
                min="0"
                value={formData.value}
                onChange={handleInputChange}
                required
                placeholder="0.00"
              />
              
              <Input
                label="Qtd. de Telas"
                name="quantity_screens"
                type="number"
                min="1"
                step="1"
                value={formData.quantity_screens}
                onChange={handleInputChange}
                required
                placeholder="1"
              />
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-gray-100 dark:border-gray-700">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => setIsModalOpen(false)} 
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                variant="primary" 
                loading={isSaving}
                icon={CheckCircle}
              >
                {currentPlan ? 'Salvar Alterações' : 'Criar Plano'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
          title="Excluir Plano"
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-100">Atenção Necessária</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Você está prestes a excluir o plano <strong>{currentPlan?.name}</strong>. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Se existirem clientes atualmente vinculados a este plano, a exclusão será bloqueada para manter a integridade dos dados.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button 
                variant="secondary" 
                onClick={() => setIsDeleteModalOpen(false)} 
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                onClick={handleDelete} 
                loading={isDeleting}
                icon={Trash2}
              >
                Sim, excluir plano
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
};

export default Planos;