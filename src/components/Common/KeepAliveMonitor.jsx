import React, { useState } from 'react';
import { useSupabaseKeepAlive } from '@/hooks/useSupabaseKeepAlive';
import { Activity, RefreshCw, ChevronDown, ChevronUp, Download, X } from 'lucide-react';
import logger from '@/utils/SupabaseKeepAliveLogger';

const KeepAliveMonitor = ({ showDebugPanel = false, position = 'bottom-right' }) => {
  const { isServiceActive, lastPingTime, nextPingTime, pingStatus, lastError, manualPing, getRecentLogs } = useSupabaseKeepAlive();
  const [isOpen, setIsOpen] = useState(false);
  
  if (!isServiceActive && !isOpen) return null;

  const logs = getRecentLogs().slice().reverse().slice(0, 10);

  const getStatusColor = () => {
    if (!isServiceActive) return 'bg-gray-400';
    if (pingStatus === 'pinging') return 'bg-yellow-400 animate-pulse';
    if (pingStatus === 'error') return 'bg-red-500';
    return 'bg-green-500';
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Nunca';
    return new Date(isoString).toLocaleString();
  };

  const positionClasses = {
    'top-right': 'top-16 right-4',
    'top-left': 'top-16 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  return (
    <div className={`fixed z-50 ${positionClasses[position]} flex flex-col items-end`}>
      {/* Badge Indicator */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm hover:shadow transition-shadow text-xs font-medium text-gray-700 dark:text-gray-300"
        title="Supabase Keep-Alive Status"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`}></span>
        <span className="hidden sm:inline">DB Ativo</span>
        <Activity size={14} className="text-gray-400" />
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Activity size={14} /> Keep-Alive Monitor
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X size={16} />
            </button>
          </div>
          
          <div className="p-3 space-y-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <div className="flex justify-between"><span>Status:</span> <span className="font-medium capitalize">{pingStatus}</span></div>
              <div className="flex justify-between"><span>Último Ping:</span> <span>{formatDate(lastPingTime)}</span></div>
              <div className="flex justify-between"><span>Próximo:</span> <span>{formatDate(nextPingTime)}</span></div>
              {lastError && <div className="text-red-500 mt-1 line-clamp-2" title={lastError}>Erro: {lastError}</div>}
            </div>

            <button
              onClick={manualPing}
              disabled={pingStatus === 'pinging'}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-md text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={pingStatus === 'pinging' ? 'animate-spin' : ''} />
              {pingStatus === 'pinging' ? 'Pinging...' : 'Forçar Ping Agora'}
            </button>
          </div>

          {showDebugPanel && (
            <div className="border-t border-gray-100 dark:border-gray-700">
              <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Últimos Logs</span>
                <button onClick={() => logger.exportLogsAsJSON()} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Exportar Logs">
                  <Download size={14} />
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto p-2 bg-gray-900 text-gray-300 font-mono text-[10px] space-y-1">
                {logs.length === 0 ? (
                  <div className="text-gray-500 italic text-center py-2">Sem logs</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`pb-1 border-b border-gray-800 last:border-0 ${log.type.includes('error') || log.type.includes('fail') ? 'text-red-400' : log.type.includes('success') ? 'text-green-400' : ''}`}>
                      <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KeepAliveMonitor;