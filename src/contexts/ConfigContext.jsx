import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

const ConfigContext = createContext();

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiConfigs, setApiConfigs] = useState({
    wapi: { wapi_instance_id: '', wapi_token: '' },
    groq: { api_key: '' }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadConfigs();
    } else {
      // Clear configs on logout
      setApiConfigs({
        wapi: { wapi_instance_id: '', wapi_token: '' },
        groq: { api_key: '' }
      });
      setLoading(false);
    }
  }, [user]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_api_configs')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const newConfigs = { 
        wapi: { wapi_instance_id: '', wapi_token: '' },
        groq: { api_key: '' }
      };
      
      if (data) {
        data.forEach(item => {
          if (item.provider === 'wapi') {
            newConfigs.wapi = { ...newConfigs.wapi, ...item.config_data };
          } else if (item.provider === 'groq') {
            newConfigs.groq = { ...newConfigs.groq, ...item.config_data };
          }
        });
      }
      
      setApiConfigs(newConfigs);
    } catch (err) {
      console.error('Error loading API configs:', err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar configurações",
        description: "Não foi possível carregar suas credenciais de API.",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (provider, configData) => {
    if (!user) return;

    try {
      // Check if exists first to decide on upsert strategy or use UPSERT directly
      const { error } = await supabase
        .from('user_api_configs')
        .upsert({ 
          user_id: user.id, 
          provider: provider, 
          config_data: configData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, provider' });

      if (error) throw error;

      // Update local state
      setApiConfigs(prev => ({
        ...prev,
        [provider]: configData
      }));

      return true;
    } catch (err) {
      console.error(`Error saving ${provider} config:`, err);
      throw err;
    }
  };

  return (
    <ConfigContext.Provider value={{ apiConfigs, saveConfig, loading, refreshConfigs: loadConfigs }}>
      {children}
    </ConfigContext.Provider>
  );
};