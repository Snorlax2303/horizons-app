import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Input from '@/components/Common/Input';
import Button from '@/components/Common/Button';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { useNavigate } from 'react-router-dom';

// Utility to validate email format
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  
  const { login, user } = useAuth();
  const { success, error, info } = useToastNotification();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      console.log('[Login Page] User already authenticated, redirecting to dashboard...');
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const validateForm = () => {
    const errors = {};
    if (!email) errors.email = 'E-mail é obrigatório';
    else if (!isValidEmail(email)) errors.email = 'Formato de e-mail inválido';
    
    if (!password) errors.password = 'Senha é obrigatória';
    else if (password.length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres';

    setValidationErrors(errors);
    
    const isValid = Object.keys(errors).length === 0;
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      error('Erro de validação', 'Verifique os campos destacados.');
      return;
    }

    setLoading(true);

    try {
      await login(email, password);
      
      success('Login realizado', 'Bem-vindo de volta!');
      navigate('/');
      
    } catch (err) {
      console.error('[Login Page] Login Failed:', err.message);
      // Supabase specific error handling can be improved here if needed
      if (err.message.includes('Invalid login credentials')) {
         error('Falha no Login', 'E-mail ou senha incorretos.');
      } else {
         error('Falha no Login', err.message || 'Ocorreu um erro ao tentar entrar.');
      }
      setPassword(''); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Login - Admin Panel</title>
        <meta name="description" content="Faça login no painel administrativo" />
      </Helmet>
      
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-100 dark:border-gray-700"
        >
          <div className="flex flex-col items-center mb-8">
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Gerenciador de Campanhas</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationErrors.email) setValidationErrors({...validationErrors, email: null});
                }}
                className={`pl-10 ${validationErrors.email ? 'border-red-500 focus:ring-red-200' : ''}`}
                error={validationErrors.email}
                disabled={loading}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationErrors.password) setValidationErrors({...validationErrors, password: null});
                }}
                className={`pl-10 ${validationErrors.password ? 'border-red-500 focus:ring-red-200' : ''}`}
                error={validationErrors.password}
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading}
              className="w-full relative overflow-hidden"
            >
              {loading ? 'Autenticando...' : 'Entrar'}
            </Button>
            
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
            Esqueceu sua senha?{' '}
            <button 
              type="button" 
              onClick={() => info('Funcionalidade indisponível', 'Entre em contato com o suporte do sistema.')}
              className="text-green-600 hover:underline font-medium"
            >
              Recuperar acesso
            </button>
          </p>
        </motion.div>
      </div>
    </>
  );
};

export default Login;