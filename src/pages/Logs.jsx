import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Search, AlertCircle, Info, AlertTriangle, Copy, X } from 'lucide-react';
import Table from '@/components/Common/Table';
import Input from '@/components/Common/Input';
import Button from '@/components/Common/Button';
import Modal from '@/components/Common/Modal';
import { formatDateTime } from '@/utils/formatters';
import { getLogs, clearLogs } from '@/services/logs';
import { useToast as useToastNotification } from '@/hooks/useToast';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);
  const { success } = useToastNotification();

  useEffect(() => {
    refreshLogs();
  }, []);

  useEffect(() => {
    let result = logs;

    if (filterLevel !== 'all') {
      result = result.filter(log => log.level === filterLevel);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(log => 
        log.message.toLowerCase().includes(term) ||
        log.entity_type.toLowerCase().includes(term) ||
        (log.entity_id && String(log.entity_id).includes(term))
      );
    }

    setFilteredLogs(result);
  }, [searchTerm, filterLevel, logs]);

  const refreshLogs = () => {
    setLogs(getLogs());
  };

  const handleClear = () => {
    if (window.confirm('Tem certeza que deseja limpar todos os logs? Isso não pode ser desfeito.')) {
      clearLogs();
      refreshLogs();
    }
  };

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    success('Copiado', 'Conteúdo copiado para a área de transferência');
  };

  const getLevelIcon = (level) => {
    switch(level) {
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const renderDetailSection = (title, content, isJson = false) => {
    if (!content) return null;
    const text = isJson ? JSON.stringify(content, null, 2) : content;
    
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">{title}</span>
          <button 
            onClick={() => handleCopyToClipboard(text)}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            title="Copiar conteúdo"
          >
            <Copy className="w-3 h-3" /> Copiar
          </button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-auto max-h-48">
          <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {text}
          </pre>
        </div>
      </div>
    );
  };

  const columns = [
    {
      header: 'Nível',
      render: (row) => (
        <div className="flex items-center gap-2" title={row.level}>
          {getLevelIcon(row.level)}
          <span className="capitalize text-xs font-semibold hidden sm:inline-block">{row.level}</span>
        </div>
      )
    },
    { header: 'Data/Hora', render: (row) => <span className="text-xs">{formatDateTime(row.timestamp)}</span> },
    { 
      header: 'Entidade', 
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase text-gray-500">{row.entity_type}</span>
          <span className="text-sm">{row.entity_id || '-'}</span>
        </div>
      )
    },
    { 
      header: 'Mensagem', 
      render: (row) => <span className="text-sm truncate max-w-xs block" title={row.message}>{row.message}</span> 
    },
    {
      header: 'Detalhes',
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(row)}>
          Ver
        </Button>
      )
    }
  ];

  return (
    <>
      <Helmet>
        <title>Logs do Sistema - Admin Panel</title>
        <meta name="description" content="Monitore eventos e erros da aplicação" />
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Logs do Sistema</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Monitore eventos e erros da aplicação</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshLogs}>Atualizar</Button>
            <Button variant="danger" onClick={handleClear}>Limpar Logs</Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Buscar por mensagem, ID ou tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select 
            className="px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
          >
            <option value="all">Todos os Níveis</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <Table 
          columns={columns} 
          data={filteredLogs}
          emptyMessage="Nenhum log encontrado."
        />

        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title="Detalhes do Log"
          size="lg"
        >
          {selectedLog && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                {getLevelIcon(selectedLog.level)}
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedLog.message}</h3>
                  <p className="text-sm text-gray-500">{formatDateTime(selectedLog.timestamp)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <span className="font-semibold text-gray-500 block">Tipo de Entidade</span>
                  <span className="text-gray-900 dark:text-gray-100">{selectedLog.entity_type}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-500 block">ID da Entidade</span>
                  <span className="text-gray-900 dark:text-gray-100">{selectedLog.entity_id || 'N/A'}</span>
                </div>
              </div>

              {/* Enhanced Debugging Fields */}
              {selectedLog.details_json && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                     <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Informações de Depuração W-API</h4>
                     
                     <div className="grid grid-cols-2 gap-4 mb-4">
                        {renderDetailSection("Telefone Original", selectedLog.details_json.phone_original)}
                        {renderDetailSection("Telefone Normalizado (E.164)", selectedLog.details_json.phone_normalized)}
                     </div>

                     {renderDetailSection("Mensagem Enviada", selectedLog.details_json.message_content)}
                     
                     {renderDetailSection("Request Headers (Safe)", selectedLog.details_json.wapi_request_headers, true)}
                     {renderDetailSection("Request Body", selectedLog.details_json.wapi_request_body, true)}
                     
                     {selectedLog.details_json.wapi_response_status && (
                        <div className="mb-2">
                           <span className="font-semibold text-sm">Status da Resposta: </span>
                           <span className={`text-sm font-bold ${selectedLog.details_json.wapi_response_status >= 200 && selectedLog.details_json.wapi_response_status < 300 ? 'text-green-600' : 'text-red-600'}`}>
                              {selectedLog.details_json.wapi_response_status} {selectedLog.details_json.wapi_response_status_text}
                           </span>
                        </div>
                     )}

                     {renderDetailSection("Response Headers", selectedLog.details_json.wapi_response_headers, true)}
                     {renderDetailSection("Response Body", selectedLog.details_json.wapi_response_body, true)}
                  </div>

                   {/* Fallback for other details */}
                   {renderDetailSection("Outros Detalhes (Raw JSON)", selectedLog.details_json, true)}
                </>
              )}

              <div className="flex justify-end pt-4">
                <Button variant="secondary" onClick={() => setSelectedLog(null)}>Fechar</Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
};

export default Logs;