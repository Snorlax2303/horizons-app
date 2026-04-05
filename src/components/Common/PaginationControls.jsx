import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/Common/Button';

const PaginationControls = ({
  currentPage,
  totalPages,
  totalRecords,
  onPageChange,
  isLoading
}) => {
  if (totalRecords === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-lg">
      
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Total: <span className="font-semibold text-gray-900 dark:text-gray-100">{totalRecords}</span> clientes
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Página <span className="font-semibold text-gray-900 dark:text-gray-100">{currentPage}</span> de <span className="font-semibold text-gray-900 dark:text-gray-100">{totalPages}</span>
        </span>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="h-9 px-3"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="h-9 px-3"
          >
            Próxima <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaginationControls;