import { useState, useCallback } from 'react';

let toastId = 0;

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ title, description, type = 'info', duration = 3000 }) => {
    const id = toastId++;
    const toast = { id, title, description, type };
    
    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((title, description) => {
    return addToast({ title, description, type: 'success' });
  }, [addToast]);

  const error = useCallback((title, description) => {
    return addToast({ title, description, type: 'error' });
  }, [addToast]);

  const info = useCallback((title, description) => {
    return addToast({ title, description, type: 'info' });
  }, [addToast]);

  return { toasts, addToast, removeToast, success, error, info };
};