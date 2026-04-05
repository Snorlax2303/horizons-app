import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import Input from '@/components/Common/Input';
import Button from '@/components/Common/Button';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { useNavigate, Link } from 'react-router-dom';

// Utility to validate email format
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  
  const { success, error: toastError } = useToastNotification();
  const navigate = useNavigate();

  const validateForm = () => {
    const errors = {};
    if (!name.trim()) errors.name = 'Nome é obrigatório';
    
    if (!email) errors.email = 'E-mail é obrigatório';
    else if (!isValidEmail(email)) errors.email = 'Formato de e-mail inválido';
    
    if (!password) errors.password = 'Senha é obrigatória';
    else if (password.length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres';

    if (password !== confirmPassword) errors.confirmPassword = 'As senhas não coincidem';

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toastError('Erro de validação', 'Verifique os campos destacados.');
      return;
    }

    setLoading(true);

    try {
      // 1. Sign Up with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
          // IMPORTANT: Redirect user to login page after they click the email link
          emailRedirectTo: `${window.location.origin}/login`
        },
      });

      if (error) throw error;

      // 2. Handle Success
      // If data.session exists, the user is logged in (email confirmation might be off).
      // If only data.user exists, email confirmation is required.
      if (data.session) {
        success('Conta criada!', 'Bem-vindo ao sistema. Você será redirecionado.');
        navigate('/');
      } else if (data.user) {
        // Email verification required flow
        success(
          'Verifique seu e-mail', 
          'Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail. Por favor, confirme antes de fazer login.'
        );
        navigate('/login');
      }

    } catch (err) {
      console.error('[Register Page] Registration Failed:', err);
      toastError('Falha no Registro', err.message || 'Ocorreu um erro ao criar sua conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Criar Conta - Admin Panel</title>
        <meta name="description" content="Crie sua conta para acessar o painel administrativo" />
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Criar Nova Conta</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Junte-se ao Admin Panel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Seu Nome Completo"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationErrors.name) setValidationErrors({...validationErrors, name: null});
                }}
                className={`pl-10 ${validationErrors.name ? 'border-red-500 focus:ring-red-200' : ''}`}
                error={validationErrors.name}
                disabled={loading}
              />
            </div>

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

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="password"
                placeholder="Confirme sua senha"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (validationErrors.confirmPassword) setValidationErrors({...validationErrors, confirmPassword: null});
                }}
                className={`pl-10 ${validationErrors.confirmPassword ? 'border-red-500 focus:ring-red-200' : ''}`}
                error={validationErrors.confirmPassword}
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
              {loading ? 'Criando conta...' : 'Registrar'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Já tem uma conta?{' '}
            <Link 
              to="/login" 
              className="text-green-600 hover:underline font-medium"
            >
              Fazer Login
            </Link>
          </p>
        </motion.div>
      </div>
    </>
  );
};

export default Register;