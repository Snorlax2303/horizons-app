import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { KeepAliveProvider } from '@/contexts/KeepAliveContext';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Clientes from '@/pages/Clientes';
import Campanhas from '@/pages/Campanhas';
import Planos from '@/pages/Planos';
import Servidores from '@/pages/Servidores';
import Templates from '@/pages/Templates';
import Configuracoes from '@/pages/Configuracoes';
import Logs from '@/pages/Logs';
import Importacao from '@/pages/Importacao';
import Prospects from '@/pages/Prospects';
import MainLayout from '@/components/Layout/MainLayout';
import LoadingSpinner from '@/components/Common/LoadingSpinner';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen size="lg" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen size="lg" />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-800">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Algo deu errado.</h2>
            <p className="mb-4">Ocorreu um erro inesperado na aplicação.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ConfigProvider>
            <KeepAliveProvider>
              <BrowserRouter>
                <Routes>
                  <Route 
                    path="/login" 
                    element={
                      <PublicRoute>
                        <Login />
                      </PublicRoute>
                    } 
                  />
                  
                  <Route 
                    path="/register" 
                    element={
                      <PublicRoute>
                        <Register />
                      </PublicRoute>
                    } 
                  />
                  
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Dashboard />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/clientes"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Clientes />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/servidores"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Servidores />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/prospects"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Prospects />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/campanhas"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Campanhas />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/planos"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Planos />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/templates"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Templates />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/importacao"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Importacao />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/configuracoes"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Configuracoes />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/logs"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Logs />
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </KeepAliveProvider>
          </ConfigProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;