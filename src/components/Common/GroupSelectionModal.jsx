import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import Modal from './Modal';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import { Layers, Users, Folder, CheckCircle2 } from 'lucide-react';

const GroupSelectionModal = ({ isOpen, onClose, userId, onSelect }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState('all'); // 'all', 'none', or group UUID
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    ungrouped: 0,
    groupCounts: {} // { groupId: count }
  });

  useEffect(() => {
    if (isOpen && userId) {
      fetchData();
    }
  }, [isOpen, userId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Global Counts (Total and Ungrouped)
      // Using count: 'exact', head: true to avoid fetching data
      const [totalRes, ungroupedRes] = await Promise.all([
        supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('group_id', null)
      ]);

      // 2. Fetch Groups with Counts (Batched)
      let allGroups = [];
      let offset = 0;
      const BATCH_SIZE = 100;
      let keepFetching = true;
      const groupCounts = {};

      while (keepFetching) {
        // Fetch groups and count of prospects in each group
        const { data, error } = await supabase
          .from('prospect_groups')
          .select('id, name, created_at, prospects(count)')
          .eq('user_id', userId)
          .range(offset, offset + BATCH_SIZE - 1)
          .order('name');

        if (error) throw error;

        if (data && data.length > 0) {
          allGroups = [...allGroups, ...data];
          
          // Process counts
          data.forEach(g => {
            // PostgREST returns prospects array/object with count
            // Typically: prospects: [{ count: 123 }]
            const countVal = g.prospects?.[0]?.count || 0; 
            groupCounts[g.id] = countVal;
          });

          if (data.length < BATCH_SIZE) {
            keepFetching = false;
          } else {
            offset += BATCH_SIZE;
          }
        } else {
          keepFetching = false;
        }
      }

      setGroups(allGroups);
      setStats({
        total: totalRes.count || 0,
        ungrouped: ungroupedRes.count || 0,
        groupCounts
      });

    } catch (err) {
      console.error('Error fetching selection data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    let groupName = 'Todos os Grupos + Sem Grupo';
    if (selectedOption === 'none') groupName = 'Sem Grupo';
    else if (selectedOption !== 'all') {
      const g = groups.find(x => x.id === selectedOption);
      if (g) groupName = g.name;
    }
    
    // Pass 'all' as scope for the "Todos os Grupos" option
    onSelect(selectedOption, groupName);
  };

  // Calculate count to display based on current selection
  const currentSelectionCount = useMemo(() => {
    if (selectedOption === 'all') return stats.total;
    if (selectedOption === 'none') return stats.ungrouped;
    return stats.groupCounts[selectedOption] || 0;
  }, [selectedOption, stats]);

  const formatCount = (num) => {
    return new Intl.NumberFormat('pt-BR').format(num);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Escopo de Análise" size="md">
      <div className="space-y-4 max-h-[70vh] flex flex-col">
        {/* Header with Counter */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex justify-between items-center">
          <div>
            <p className="text-sm text-blue-600 dark:text-blue-300 font-medium">Registros a Analisar</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-100">
               {loading ? '...' : formatCount(currentSelectionCount)}
            </p>
            {selectedOption === 'all' && (
               <p className="text-xs text-blue-500 mt-1">Total de Cadastros no Sistema</p>
            )}
          </div>
          <div className="text-right text-xs text-blue-500 dark:text-blue-400 max-w-[50%]">
             A detecção será realizada apenas no escopo selecionado abaixo.
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {/* Global Option */}
            <label 
              className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                selectedOption === 'all' 
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                  : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
              }`}
            >
              <input 
                type="radio" 
                name="groupScope" 
                value="all" 
                checked={selectedOption === 'all'} 
                onChange={() => setSelectedOption('all')}
                className="hidden" 
              />
              <div className="flex items-center gap-3 flex-1">
                <div className={`p-2 rounded-full ${selectedOption === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                   <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">Todos os Grupos + Sem Grupo</p>
                    <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-300">
                      {formatCount(stats.total)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Analisa a base inteira globalmente</p>
                </div>
              </div>
              {selectedOption === 'all' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
            </label>

            {/* Ungrouped Option */}
            <label 
              className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                selectedOption === 'none' 
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                  : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
              }`}
            >
              <input 
                type="radio" 
                name="groupScope" 
                value="none" 
                checked={selectedOption === 'none'} 
                onChange={() => setSelectedOption('none')}
                className="hidden" 
              />
              <div className="flex items-center gap-3 flex-1">
                <div className={`p-2 rounded-full ${selectedOption === 'none' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                   <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">Sem Grupo</p>
                    <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-300">
                      {formatCount(stats.ungrouped)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Apenas leads soltos (sem grupo vinculado)</p>
                </div>
              </div>
              {selectedOption === 'none' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
            </label>

            {/* Dynamic Groups */}
            {groups.length > 0 && (
               <div className="pt-2">
                 <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 ml-1">Grupos Específicos</p>
                 <div className="space-y-2">
                   {groups.map(group => {
                     const count = stats.groupCounts[group.id] || 0;
                     return (
                       <label 
                          key={group.id}
                          className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedOption === group.id
                              ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                              : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="groupScope" 
                            value={group.id} 
                            checked={selectedOption === group.id} 
                            onChange={() => setSelectedOption(group.id)}
                            className="hidden" 
                          />
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`p-2 rounded-full ${selectedOption === group.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                               <Folder className="w-5 h-5" />
                            </div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {group.name} 
                              <span className="ml-2 text-xs font-semibold text-gray-500">({formatCount(count)})</span>
                            </span>
                          </div>
                          {selectedOption === group.id && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                        </label>
                     );
                   })}
                 </div>
               </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={loading || currentSelectionCount === 0}>
             {currentSelectionCount === 0 ? 'Sem registros' : 'Iniciar Análise'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default GroupSelectionModal;