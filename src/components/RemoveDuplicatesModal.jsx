import React, { useState } from 'react';
import { Copy, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import Button from '@/components/Common/Button';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { removeDuplicates } from '@/utils/removeDuplicates';

const RemoveDuplicatesModal = ({ userId, onSuccess }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleOpen = () => {
    setResult(null);
    setIsOpen(true);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await removeDuplicates(userId);
      setResult(res);
      if (res.success && res.recordsDeleted > 0 && onSuccess) {
        onSuccess();
      }
    } catch (error) {
      setResult({ success: false, error: 'Falha crítica na execução.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset result after animation potentially, but simpler here
    setTimeout(() => setResult(null), 300); 
  };

  return (
    <>
      <Button 
        variant="outline" 
        className="border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-900/20"
        icon={Copy} 
        onClick={handleOpen}
        title="Remover registros duplicados"
        id="open-clean-duplicates-modal-btn"
        name="open-clean-duplicates-modal-btn"
      >
        <span className="hidden sm:inline">Remover Duplicatas</span>
        <span className="sm:hidden">Duplicatas</span>
      </Button>

      <Modal isOpen={isOpen} onClose={handleClose} title="Remover Duplicatas" size="sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Processando exclusão de duplicatas...
            </p>
          </div>
        ) : result ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            {result.success ? (
              <>
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Operação Concluída
                  </h3>
                  {result.recordsDeleted > 0 ? (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Encontradas <strong>{result.duplicatesFound}</strong> duplicatas.
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                        {result.recordsDeleted} registros removidos com sucesso.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Nenhuma duplicata encontrada.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                  <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Erro
                  </h3>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {result.error}
                  </p>
                </div>
              </>
            )}
            
            <div className="pt-4">
              <Button variant="secondary" onClick={handleClose} className="min-w-[100px]">
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-300">
                  Deseja remover duplicatas?
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  Esta ação manterá apenas o registro mais antigo de cada número de telefone e excluirá os demais. <strong>Esta ação não pode ser desfeita.</strong>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button 
                variant="secondary" 
                onClick={handleClose}
                id="cancel-remove-duplicates"
              >
                Cancelar
              </Button>
              <Button 
                variant="primary" 
                onClick={handleConfirm}
                id="confirm-remove-duplicates"
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default RemoveDuplicatesModal;