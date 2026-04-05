import { mergeConfig } from './KeepAliveConfig';

const LOG_KEY = 'supabase_ping_logs';

class SupabaseKeepAliveLogger {
  constructor() {
    this.config = mergeConfig();
  }

  setConfig(config) {
    this.config = mergeConfig(config);
  }

  _getLogs() {
    try {
      const logs = localStorage.getItem(LOG_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch (e) {
      console.warn('Failed to parse keep-alive logs:', e);
      return [];
    }
  }

  _saveLogs(logs) {
    try {
      // Keep only max entries (FIFO)
      const trimmedLogs = logs.slice(-(this.config.logMaxEntries || 50));
      localStorage.setItem(LOG_KEY, JSON.stringify(trimmedLogs));
    } catch (e) {
      console.warn('Failed to save keep-alive logs:', e);
    }
  }

  _addLog(entry) {
    const logs = this._getLogs();
    logs.push({
      ...entry,
      timestamp: new Date().toISOString()
    });
    this._saveLogs(logs);

    if (this.config.debugMode) {
      this._printToConsole(entry);
    }
  }

  _printToConsole(entry) {
    const time = new Date().toLocaleTimeString();
    const prefix = `[KeepAlive ${time}]`;
    
    switch (entry.type) {
      case 'ping_attempt':
        console.log(`%c${prefix} 🔄 ${entry.message}`, 'color: #3b82f6; font-weight: bold;');
        break;
      case 'ping_success':
        console.log(`%c${prefix} ✅ ${entry.message} (${entry.duration}ms)`, 'color: #10b981; font-weight: bold;');
        break;
      case 'ping_failure':
        console.log(`%c${prefix} ❌ ${entry.message}`, 'color: #ef4444; font-weight: bold;', entry.error || '');
        break;
      case 'service_start':
        console.log(`%c${prefix} 🚀 ${entry.message}`, 'color: #8b5cf6; font-weight: bold;');
        break;
      case 'service_stop':
        console.log(`%c${prefix} 🛑 ${entry.message}`, 'color: #f59e0b; font-weight: bold;');
        break;
      default:
        console.log(`${prefix} ${entry.message}`);
    }
  }

  logPingAttempt() {
    this._addLog({ type: 'ping_attempt', message: 'Initiating database ping' });
  }

  logPingSuccess(duration) {
    this._addLog({ type: 'ping_success', message: 'Ping successful', duration });
  }

  logPingFailure(error) {
    this._addLog({ type: 'ping_failure', message: 'Ping failed', error: error?.message || String(error) });
  }

  logServiceStart() {
    this._addLog({ type: 'service_start', message: 'Keep-alive service started' });
  }

  logServiceStop() {
    this._addLog({ type: 'service_stop', message: 'Keep-alive service stopped' });
  }

  getLogs() {
    return this._getLogs();
  }

  clearLogs() {
    localStorage.removeItem(LOG_KEY);
  }

  exportLogsAsJSON() {
    const logs = this.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supabase_keep_alive_logs_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

const logger = new SupabaseKeepAliveLogger();
export default logger;