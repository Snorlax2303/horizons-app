import { supabase } from '@/lib/customSupabaseClient';
import { mergeConfig } from './KeepAliveConfig';
import logger from './SupabaseKeepAliveLogger';

const LAST_PING_KEY = 'supabase_last_ping_timestamp';

class SupabaseKeepAliveService {
  constructor() {
    this.config = mergeConfig();
    this.isActive = false;
    this.timerId = null;
    this.status = 'idle'; // 'idle' | 'pinging' | 'success' | 'error'
    this.lastError = null;
    this.subscribers = new Set();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  _notifySubscribers() {
    this.subscribers.forEach(cb => cb(this.getPingStatus()));
  }

  start(config = {}) {
    this.config = mergeConfig({ ...this.config, ...config });
    logger.setConfig(this.config);

    if (!this.config.enabled || this.isActive) return;

    this.isActive = true;
    logger.logServiceStart();
    this._scheduleNext();
    this._notifySubscribers();
  }

  stop() {
    if (!this.isActive) return;
    
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    
    this.isActive = false;
    this.status = 'idle';
    logger.logServiceStop();
    this._notifySubscribers();
  }

  getLastPingTime() {
    return localStorage.getItem(LAST_PING_KEY) || null;
  }

  _setLastPingTime(isoString) {
    localStorage.setItem(LAST_PING_KEY, isoString);
  }

  getPingStatus() {
    const lastTime = this.getLastPingTime();
    let nextTime = null;
    
    if (this.isActive && lastTime) {
      nextTime = new Date(new Date(lastTime).getTime() + this.config.interval).toISOString();
    } else if (this.isActive) {
      nextTime = new Date().toISOString(); // Now
    }

    return {
      isServiceActive: this.isActive,
      lastPingTime: lastTime,
      nextPingTime: nextTime,
      pingStatus: this.status,
      lastError: this.lastError
    };
  }

  _scheduleNext() {
    if (!this.isActive) return;

    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    const lastPing = this.getLastPingTime();
    const now = Date.now();
    let delay = 0;

    if (lastPing) {
      const timeSinceLast = now - new Date(lastPing).getTime();
      delay = Math.max(0, this.config.interval - timeSinceLast);
    }

    if (delay === 0) {
      this.ping();
    } else {
      this.timerId = setTimeout(() => this.ping(), delay);
    }
  }

  async ping(attempt = 1) {
    if (this.status === 'pinging') return this._createResult(false, 'Already pinging');

    this.status = 'pinging';
    this.lastError = null;
    this._notifySubscribers();
    logger.logPingAttempt();

    const startTime = performance.now();

    try {
      // Lightweight query as requested
      const { error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (error) throw error;

      const duration = Math.round(performance.now() - startTime);
      const timestamp = new Date().toISOString();
      
      this._setLastPingTime(timestamp);
      this.status = 'success';
      logger.logPingSuccess(duration);
      this._notifySubscribers();
      
      this._scheduleNext();
      return this._createResult(true, null, timestamp);

    } catch (error) {
      this.lastError = error.message || 'Unknown error';
      logger.logPingFailure(error);

      if (attempt <= this.config.retryAttempts) {
        // Exponential backoff
        const backoffDelay = this.config.retryDelay * Math.pow(2, attempt - 1);
        if (this.config.debugMode) {
          console.log(`[KeepAlive] Retrying ping in ${backoffDelay}ms (Attempt ${attempt}/${this.config.retryAttempts})`);
        }
        
        setTimeout(() => {
          this.status = 'idle'; // Reset to let next attempt run
          this.ping(attempt + 1);
        }, backoffDelay);
        
        this.status = 'error';
        this._notifySubscribers();
        return this._createResult(false, `Retrying (${attempt}/${this.config.retryAttempts})`);
      } else {
        this.status = 'error';
        this._notifySubscribers();
        this._scheduleNext(); // Schedule next normal interval even if failed
        return this._createResult(false, this.lastError);
      }
    }
  }

  _createResult(success, errorMsg = null, timestamp = new Date().toISOString()) {
    return {
      success,
      timestamp,
      nextPingTime: new Date(new Date(timestamp).getTime() + this.config.interval).toISOString(),
      error: errorMsg
    };
  }
}

// Export singleton instance
const keepAliveService = new SupabaseKeepAliveService();
export default keepAliveService;