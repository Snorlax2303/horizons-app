import React, { useState, useEffect } from 'react';
import { Server, Check, X, Search } from 'lucide-react';
import Modal from '@/components/Common/Modal';
import Button from '@/components/Common/Button';

const ServerSelectionModal = ({ isOpen, onClose, onConfirm, initialSelectedIds = [], servers = [] }) => {
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds || []);
      setSearchTerm('');
    }
  }, [isOpen, initialSelectedIds]);

  const toggleServer = (serverId) => {
    setSelectedIds(prev => 
      prev.includes(serverId) 
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(servers.map(s => s.id));
  };

  const handleClearAll = () => {
    setSelectedIds([]);
  };

  const filteredServers = servers.filter(server => 
    server.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar Servidores" size="md">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-center">
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Buscar servidor..." 
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
                <button 
                    onClick={handleSelectAll}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                    Selecionar Todos
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button 
                    onClick={handleClearAll}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    Limpar
                </button>
            </div>
        </div>

        <div className="min-h-[200px] max-h-[400px] overflow-y-auto p-1">
            {filteredServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <Server className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">Nenhum servidor encontrado</p>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {filteredServers.map(server => {
                        const isSelected = selectedIds.includes(server.id);
                        return (
                            <button
                                key={server.id}
                                onClick={() => toggleServer(server.id)}
                                className={`
                                    group flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-200
                                    ${isSelected 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20' 
                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700'
                                    }
                                `}
                            >
                                <span className="font-medium">{server.name}</span>
                                {isSelected ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 block" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-500">
                {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-3">
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={() => onConfirm(selectedIds)}>Salvar Alterações</Button>
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default ServerSelectionModal;