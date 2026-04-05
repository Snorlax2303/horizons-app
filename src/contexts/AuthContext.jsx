import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Clean up legacy local storage if it exists to avoid confusion
    localStorage.removeItem('admin-user');

    const initializeAuth = async () => {
      try {
        // Check if we have a session in local storage before attempting to get it
        // This prevents unnecessary network calls if no token exists
        const key = `sb-${new URL(supabase.supabaseUrl).hostname.split('.')[0]}-auth-token`;
        const storedSession = localStorage.getItem(key);
        
        if (!storedSession) {
          setLoading(false);
          return;
        }

        // Get initial session with error handling
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }
        
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('[AuthContext] Error checking session:', error);
        
        // Handle specific refresh token errors
        if (error.message?.includes('refresh_token_not_found') || 
            error.message?.includes('Invalid Refresh Token')) {
          // Clear invalid session data
          await supabase.auth.signOut();
          setUser(null);
          
          toast({
            variant: "destructive",
            title: "Sessão Expirada",
            description: "Por favor, faça login novamente.",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null);
        setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [toast]);

  // Flexible login to support both (email, password) and legacy object signatures
  const login = async (emailOrData, password) => {
    let email, pass;

    // Handle legacy signature: login({ email: '...', password: '...' })
    if (typeof emailOrData === 'object' && emailOrData.email) {
      email = emailOrData.email;
      pass = emailOrData.password || password;
    } else {
      email = emailOrData;
      pass = password;
    }

    if (!email || !pass) {
      toast({
        variant: "destructive",
        title: "Erro de Login",
        description: "Email e senha são obrigatórios.",
      });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      console.error('[AuthContext] Login failed:', error);
      toast({
        variant: "destructive",
        title: "Falha no Login",
        description: error.message || "Verifique suas credenciais.",
      });
      throw error;
    }

    return data;
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (error) {
      console.error('[AuthContext] Logout failed:', error);
      // Force local cleanup even if server request fails
      setUser(null);
      localStorage.clear(); 
      toast({
        variant: "destructive",
        title: "Erro ao sair",
        description: error.message,
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};