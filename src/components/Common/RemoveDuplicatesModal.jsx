import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Trash2, CheckCircle2, Activity, 
  ChevronDown, ChevronUp, Database, FileText, Search 
} from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import { removeDuplicates } from '@/utils/duplicates';
import { useToast as useToastNotification } from '@/hooks/useToast';

const RemoveDuplicatesModal = ({ isOpen, onClose, userId, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const { success, error } = useToastNotification();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAnalysisResult(null);
      setCompleted(false);
      setShowDetails(false);
      // Auto-start analysis
      runAnalysis();
    }
  }, [isOpen]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      // Dry run = true
      const result = await removeDuplicates(userId, true);
      setAnalysisResult(result);
    } catch (err) {
      console.error(err);
      error('Erro na Análise', 'Falha ao analisar duplicatas. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecuteDeletion = async () => {
    if (!analysisResult || analysisResult.recordsToDelete.length === 0) return;

    setLoading(true);
    try {
      // Dry run = false (Execute delete)
      const result = await removeDuplicates(userId, false);
      
      if (result.deletionResults.success > 0) {
        success('Sucesso', `${result.deletionResults.success} registros removidos.`);
        setCompleted(true);
        if (onSuccess) onSuccess();
        
        // Auto close after success
        setTimeout(() => {
          handleClose();
        }, 2500);
      } else if (result.deletionResults.failed > 0) {
        error('Atenção', `Falha ao remover ${result.deletionResults.failed} registros.`);
        setCompleted(true); // Still treat as completed flow
      } else {
        success('Nada removido', 'Nenhum registro foi apagado.');
        setCompleted(true);
      }
    } catch (err) {
      error('Erro Crítico', 'Falha ao executar limpeza.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCompleted(false);
    setAnalysisResult(null);
    onClose();
  };

  if (analyzing) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Analisando Base de Dados" size="sm">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <LoadingSpinner size="lg" />
          <div className="text-center">
             <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Buscando registros...</p>
             <p className="text-sm text-gray-500 mt-1">Isso pode levar alguns segundos dependendo do tamanho da base.</p>
          </div>
        </div>
      </Modal>
    );
  }

  if (completed) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Concluído" size="sm">
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Limpeza Finalizada</h3>
            <p className="text-gray-500 mt-2">Sua base de dados está otimizada.</p>
          </div>
          <Button onClick={handleClose} className="w-full">Fechar</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Gerenciar Duplicatas" size="lg">
      <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-amber-800 dark:text-amber-300">Como funciona?</h4>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              O sistema busca telefones idênticos em toda a sua base. Se encontrar duplicatas, 
              ele preserva o registro <strong>mais antigo</strong> e remove os mais recentes.
            </p>
          </div>
        </div>

        {/* Results Overview */}
        {analysisResult && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
               <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                 <Activity className="w-4 h-4 text-blue-500" />
                 Resumo da Análise
               </h3>
            </div>
            
            <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700">
               <div className="p-4 text-center">
                 <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Total Analisado</p>
                 <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                   {analysisResult.totalFetched}
                 </p>
               </div>
               <div className="p-4 text-center">
                 <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Grupos Duplicados</p>
                 <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                   {analysisResult.duplicateGroups.length}
                 </p>
               </div>
               <div className="p-4 text-center bg-red-50 dark:bg-red-900/10">
                 <p className="text-xs uppercase tracking-wider text-red-600 dark:text-red-400 font-semibold">A Remover</p>
                 <p className="text-2xl font-bold text-red-700 dark:text-red-500 mt-1">
                   {analysisResult.recordsToDelete.length}
                 </p>
               </div>
            </div>

            {/* Detailed List Toggle */}
            {analysisResult.duplicateGroups.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Ver lista de duplicatas encontradas
                  </span>
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showDetails && (
                  <div className="p-0 bg-gray-50 dark:bg-gray-900 overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 dark:bg-gray-800 text-xs uppercase text-gray-500">
                          <tr>
                            <th className="px-4 py-2">Telefone</th>
                            <th className="px-4 py-2 text-center">Ocorrências</th>
                            <th className="px-4 py-2 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {analysisResult.duplicateGroups.map((group, idx) => (
                            <tr key={idx} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-4 py-2 font-mono text-blue-600 dark:text-blue-400">
                                {group.phone}
                              </td>
                              <td className="px-4 py-2 text-center font-medium">
                                {group.count}
                              </td>
                              <td className="px-4 py-2 text-right text-xs text-gray-500">
                                Manter 1, Apagar {group.count - 1}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          
          <Button 
            variant="outline" 
            onClick={runAnalysis} 
            disabled={loading}
            icon={Search}
          >
            Re-analisar
          </Button>

          {analysisResult && analysisResult.recordsToDelete.length > 0 && (
            <Button 
              variant="danger" 
              onClick={handleExecuteDeletion} 
              loading={loading} 
              icon={Trash2}
            >
              Remover Duplicatas ({analysisResult.recordsToDelete.length})
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RemoveDuplicatesModal;