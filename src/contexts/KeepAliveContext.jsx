import React, { createContext, useContext, useEffect } from 'react';
import { useSupabaseKeepAlive } from '@/hooks/useSupabaseKeepAlive';
import defaultConfig from '@/utils/KeepAliveConfig';

const KeepAliveContext = createContext(null);

export const useKeepAliveContext = () => useContext(KeepAliveContext);

export const KeepAliveProvider = ({ children }) => {
  const keepAliveState = useSupabaseKeepAlive(defaultConfig);

  useEffect(() => {
    if (defaultConfig.debugMode) {
      console.log('Keep-alive service initialized globally:', keepAliveState.isServiceActive);
    }
  }, [keepAliveState.isServiceActive]);

  return (
    <KeepAliveContext.Provider value={keepAliveState}>
      {children}
    </KeepAliveContext.Provider>
  );
};