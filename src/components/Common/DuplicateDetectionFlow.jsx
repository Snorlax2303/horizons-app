import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import GroupSelectionModal from './GroupSelectionModal';
import Modal from './Modal';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import { findDuplicatesByPhone } from '@/utils/duplicateDetection';
import { useToast } from '@/hooks/useToast';
import { Trash2, AlertTriangle, CheckCircle2, ArrowRight, RefreshCw, Layers } from 'lucide-react';
import { formatPhoneDisplay, formatDateTime } from '@/utils/formatters';

const DuplicateDetectionFlow = ({ isOpen, onClose, userId, onSuccess }) => {
  const [step, setStep] = useState('select'); // 'select', 'analyzing', 'results', 'success'
  const [selectedGroup, setSelectedGroup] = useState(null); // { id: 'all'|'none'|uuid, name: string }
  const [analysisData, setAnalysisData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { success, error } = useToast();

  const handleGroupSelect = async (groupId, groupName) => {
    setSelectedGroup({ id: groupId, name: groupName });
    setStep('analyzing');
    await performAnalysis(groupId, groupName);
  };

  const performAnalysis = async (groupId, groupName) => {
    try {
      let allProspects = [];
      let offset = 0;
      const BATCH_SIZE = 1000; // Increased batch size for efficiency
      let keepFetching = true;

      // 1. Build Query based on Scope
      // 'all' -> No filter (fetch everything)
      // 'none' -> is null
      // uuid -> eq uuid
      let query = supabase.from('prospects')
        .select('id, name, phone, created_at, group_id')
        .eq('user_id', userId);

      if (groupId === 'none') {
        query = query.is('group_id', null);
      } else if (groupId !== 'all') {
        query = query.eq('group_id', groupId);
      }
      // if 'all', we apply no group filter, just user_id

      console.log(`[DuplicateDetection] Starting analysis for scope: ${groupName} (${groupId})`);

      // 2. Fetch Loop
      while (keepFetching) {
        const { data, error: fetchError } = await query.range(offset, offset + BATCH_SIZE - 1);
        
        if (fetchError) throw fetchError;

        if (data && data.length > 0) {
          allProspects = [...allProspects, ...data];
          if (data.length < BATCH_SIZE) {
            keepFetching = false;
          } else {
            offset += BATCH_SIZE;
          }
        } else {
          keepFetching = false;
        }
      }

      console.log(`[DuplicateDetection] Fetched ${allProspects.length} records.`);

      // 3. Detect Duplicates (The logic is scoped because the data is scoped)
      // We pass the prospects which are already filtered by the selected scope
      const result = findDuplicatesByPhone(allProspects);
      
      setAnalysisData({
        ...result,
        totalChecked: allProspects.length,
        scopeName: groupName
      });
      setStep('results');

    } catch (err) {
      console.error('Analysis failed:', err);
      error('Erro', 'Falha ao analisar duplicatas. Tente novamente.');
      onClose();
    }
  };

  const handleRemoveDuplicates = async () => {
    if (!analysisData || analysisData.duplicates.length === 0) return;
    
    setIsDeleting(true);
    const idsToDelete = analysisData.duplicates.map(d => d.id);
    
    const DELETE_BATCH = 1000;
    let deletedCount = 0;
    
    try {
      for (let i = 0; i < idsToDelete.length; i += DELETE_BATCH) {
        const batch = idsToDelete.slice(i, i + DELETE_BATCH);
        const { error: delError } = await supabase
          .from('prospects')
          .delete()
          .in('id', batch);
          
        if (delError) throw delError;
        deletedCount += batch.length;
      }

      success('Sucesso', `${deletedCount} duplicatas removidas.`);
      setStep('success');
      if (onSuccess) onSuccess();

    } catch (err) {
      console.error('Delete failed:', err);
      error('Erro', 'Falha ao remover registros. Tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReset = () => {
    setStep('select');
    setSelectedGroup(null);
    setAnalysisData(null);
  };

  // --- RENDER STEPS ---

  if (!isOpen) return null;

  if (step === 'select') {
    return (
      <GroupSelectionModal 
        isOpen={isOpen} 
        onClose={onClose} 
        userId={userId} 
        onSelect={handleGroupSelect} 
      />
    );
  }

  if (step === 'analyzing') {
    return (
      <Modal isOpen={isOpen} onClose={() => {}} title="Analisando..." size="sm">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <LoadingSpinner size="lg" />
          <div className="text-center">
             <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Verificando Registros</p>
             <p className="text-sm text-gray-500 mt-1">
               Escopo: <strong>{selectedGroup?.name}</strong>
             </p>
             <p className="text-xs text-gray-400 mt-2">Buscando telefones duplicados...</p>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'results') {
    const hasDuplicates = analysisData?.summary?.totalDuplicates > 0;

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Resultado da Análise" size="lg">
        <div className="space-y-6 max-h-[75vh] flex flex-col">
          {/* Header Summary */}
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            hasDuplicates 
              ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
              : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
          }`}>
             {hasDuplicates ? (
               <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-500 shrink-0" />
             ) : (
               <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-500 shrink-0" />
             )}
             <div>
               <h3 className={`font-semibold ${
                 hasDuplicates ? 'text-amber-800 dark:text-amber-300' : 'text-green-800 dark:text-green-300'
               }`}>
                 {hasDuplicates 
                   ? `Encontramos ${analysisData.summary.totalDuplicates} duplicatas`
                   : 'Nenhuma duplicata encontrada'
                 }
               </h3>
               <p className={`text-sm mt-1 ${
                 hasDuplicates ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'
               }`}>
                 Escopo: <strong>{analysisData.scopeName}</strong><br/>
                 Total analisado: {analysisData.totalChecked} registros.
               </p>
             </div>
          </div>

          {/* List */}
          {hasDuplicates && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 border rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
               <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700 font-medium text-sm text-gray-500 flex justify-between items-center">
                 <span>Registros sugeridos para remoção (Mais recentes)</span>
                 <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                   {analysisData.duplicates.length} itens
                 </span>
               </div>
               <div className="overflow-y-auto p-0">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2">Nome</th>
                        <th className="px-4 py-2">Telefone</th>
                        <th className="px-4 py-2">Criado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {analysisData.duplicates.map(dup => (
                        <tr key={dup.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{dup.name || 'Sem nome'}</td>
                          <td className="px-4 py-2 font-mono text-gray-600 dark:text-gray-400">{formatPhoneDisplay(dup.phone)}</td>
                          <td className="px-4 py-2 text-gray-500">{formatDateTime(dup.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700 mt-auto">
             <Button variant="ghost" onClick={handleReset} icon={ArrowRight} className="flex-row-reverse">
               Analisar outro grupo
             </Button>
             
             <div className="flex gap-3">
               <Button variant="secondary" onClick={onClose}>Fechar</Button>
               {hasDuplicates && (
                 <Button 
                   variant="danger" 
                   onClick={handleRemoveDuplicates} 
                   loading={isDeleting}
                   icon={Trash2}
                 >
                   Remover {analysisData.summary.totalDuplicates} Itens
                 </Button>
               )}
             </div>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'success') {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Concluído" size="sm">
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Limpeza Finalizada</h3>
            <p className="text-gray-500 mt-2">Os registros duplicados foram removidos com sucesso.</p>
          </div>
          
          <div className="flex flex-col gap-3 w-full">
            <Button onClick={handleReset} variant="outline" icon={RefreshCw} className="w-full justify-center">
              Nova Análise
            </Button>
            <Button onClick={onClose} variant="primary" className="w-full justify-center">
              Concluir
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
};

export default DuplicateDetectionFlow;