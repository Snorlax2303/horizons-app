import { useState, useEffect, useCallback } from 'react';
import keepAliveService from '@/utils/SupabaseKeepAliveService';
import logger from '@/utils/SupabaseKeepAliveLogger';

export function useSupabaseKeepAlive(config = {}, callbacks = {}) {
  const [state, setState] = useState(() => keepAliveService.getPingStatus());

  useEffect(() => {
    // Start service if enabled (defaults to true) and not already active
    if (config.enabled !== false && !keepAliveService.isActive) {
      keepAliveService.start(config);
    }

    const unsubscribe = keepAliveService.subscribe((newState) => {
      setState(prevState => {
        // Handle callbacks
        if (prevState.pingStatus === 'pinging' && newState.pingStatus === 'success') {
          callbacks.onPingSuccess?.(newState);
        } else if (prevState.pingStatus === 'pinging' && newState.pingStatus === 'error') {
          callbacks.onPingError?.(newState.lastError);
        }
        return newState;
      });
    });

    return () => {
      unsubscribe();
      // We don't stop the service on unmount of a single component because it might be used globally
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manualPing = useCallback(async () => {
    return await keepAliveService.ping();
  }, []);

  const getServiceStatus = useCallback(() => {
    return keepAliveService.getPingStatus();
  }, []);

  const getRecentLogs = useCallback(() => {
    return logger.getLogs();
  }, []);

  return {
    ...state,
    manualPing,
    getServiceStatus,
    getRecentLogs
  };
}