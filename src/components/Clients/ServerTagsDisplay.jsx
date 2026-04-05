import React from 'react';
import { Server, Plus, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const ServerTagsDisplay = ({ serverIds = [], allServers = [], customerId, onAddClick, onServerRemove, limit = 2 }) => {
  const { toast } = useToast();
  
  // Filter to get full server objects
  const selectedServers = allServers.filter(s => serverIds?.includes(s.id));
  
  if (!serverIds || serverIds.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 italic">Sem servidores</span>
        <button 
          onClick={(e) => { e.stopPropagation(); onAddClick?.(); }}
          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
          title="Adicionar servidor"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    );
  }

  const handleRemove = async (e, serverIdToRemove) => {
    e.stopPropagation();
    
    if (!customerId) return;
    
    // Calculate new array
    const updatedIds = serverIds.filter(id => id !== serverIdToRemove);
    
    try {
        const { error } = await supabase
            .from('customers')
            .update({ server_ids: updatedIds })
            .eq('id', customerId);

        if (error) throw error;

        toast({
          title: "Acesso revogado",
          description: "Servidor removido do cliente com sucesso.",
        });
        
        // Notify parent to update local state immediately
        if (onServerRemove) {
            onServerRemove(updatedIds);
        }
    } catch (err) {
        console.error("Error removing server:", err);
        toast({
          variant: "destructive",
          title: "Erro ao remover",
          description: "Não foi possível remover o servidor.",
        });
    }
  };

  const visibleServers = selectedServers.slice(0, limit);
  const remainingCount = selectedServers.length - limit;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TooltipProvider>
        {visibleServers.map(server => (
          <Tooltip key={server.id}>
            <TooltipTrigger asChild>
              <button 
                onClick={(e) => handleRemove(e, server.id)}
                className="group relative inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium 
                           bg-indigo-50 text-indigo-700 border border-indigo-100 
                           dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800 
                           hover:bg-red-50 hover:text-red-700 hover:border-red-200 
                           dark:hover:bg-red-900/20 dark:hover:text-red-300 dark:hover:border-red-800
                           cursor-pointer transition-all duration-200"
              >
                <Server className="w-3 h-3 opacity-70 group-hover:hidden" />
                <X className="w-3 h-3 hidden group-hover:block" />
                <span className="max-w-[80px] truncate">{server.name}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clique para remover: {server.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      {remainingCount > 0 && (
        <span 
          className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={(e) => { e.stopPropagation(); onAddClick?.(); }}
          title="Gerenciar todos"
        >
          +{remainingCount}
        </span>
      )}
      
      <button 
        onClick={(e) => { e.stopPropagation(); onAddClick?.(); }}
        className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
        title="Adicionar servidor"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

export default ServerTagsDisplay;