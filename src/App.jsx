import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { KeepAliveProvider } from '@/contexts/KeepAliveContext';
import MainLayout from '@/components/Layout/MainLayout';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
const Login = lazy(() => import('@/pages/Login'));
const LeadPublico = lazy(() => import('@/pages/LeadPublico'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const CentralOperacional = lazy(() => import('@/pages/CentralOperacional'));
const Clientes = lazy(() => import('@/pages/Clientes'));
const Prospects = lazy(() => import('@/pages/Prospects'));
const Testes = lazy(() => import('@/pages/Testes'));
const ManuaisInstalacao = lazy(() => import('@/pages/ManuaisInstalacao'));
const Captacao = lazy(() => import('@/pages/Captacao'));
const Indicacoes = lazy(() => import('@/pages/Indicacoes'));
const CobrancasPix = lazy(() => import('@/pages/CobrancasPix'));
const Renovacoes = lazy(() => import('@/pages/Renovacoes'));
const AssistenteAdmin = lazy(() => import('@/pages/AssistenteAdmin'));
const Servidores = lazy(() => import('@/pages/Servidores'));
const ConexoesPaineis = lazy(() => import('@/pages/ConexoesPaineis'));
const OperacoesPaineis = lazy(() => import('@/pages/OperacoesPaineis'));
const ProcedimentosPaineis = lazy(() => import('@/pages/ProcedimentosPaineis'));
const Planos = lazy(() => import('@/pages/Planos'));
const Importacao = lazy(() => import('@/pages/Importacao'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));
const PhoneNumberRepairPage = lazy(() => import('@/pages/PhoneNumberRepairPage'));
const SaudeIntegracoes = lazy(() => import('@/pages/SaudeIntegracoes'));
const LogsAuditoria = lazy(() => import('@/pages/LogsAuditoria'));
const RevisaoFinanceira = lazy(() => import('@/pages/RevisaoFinanceira'));
const BaixaPagamentos = lazy(() => import('@/pages/BaixaPagamentos'));
const NovoAcessoWizard = lazy(() => import('@/pages/NovoAcessoWizard'));
const WplayPanel = lazy(() => import('@/pages/WplayPanel'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen size="lg" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen size="lg" />;
  if (user) return <Navigate to="/" replace />;
  return children;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-800">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Algo deu errado.</h2>
            <p className="mb-4">Ocorreu um erro inesperado na aplicação.</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const protectedPages = [
  { index: true, element: <Dashboard /> },
  { path: 'central', element: <CentralOperacional /> },
  { path: 'clientes', element: <Clientes /> },
  { path: 'prospects', element: <Prospects /> },
  { path: 'testes', element: <Testes /> },
  { path: 'manuais', element: <ManuaisInstalacao /> },
  { path: 'captacao', element: <Captacao /> },
  { path: 'indicacoes', element: <Indicacoes /> },
  { path: 'cobrancas', element: <CobrancasPix /> },
  { path: 'revisao', element: <RevisaoFinanceira /> },
  { path: 'baixa', element: <BaixaPagamentos /> },
  { path: 'renovacoes', element: <Renovacoes /> },
  { path: 'novo-acesso', element: <NovoAcessoWizard /> },
  { path: 'wplay', element: <WplayPanel /> },
  { path: 'assistente', element: <AssistenteAdmin /> },
  { path: 'servidores', element: <Servidores /> },
  { path: 'conexoes', element: <ConexoesPaineis /> },
  { path: 'operacoes', element: <OperacoesPaineis /> },
  { path: 'procedimentos', element: <ProcedimentosPaineis /> },
  { path: 'planos', element: <Planos /> },
  { path: 'importacao', element: <Importacao /> },
  { path: 'configuracoes', element: <Configuracoes /> },
  { path: 'saude', element: <SaudeIntegracoes /> },
  { path: 'logs', element: <LogsAuditoria /> },
  { path: 'reparo-telefones', element: <PhoneNumberRepairPage /> },
];

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ConfigProvider>
            <KeepAliveProvider>
              <BrowserRouter>
                <Suspense fallback={<LoadingSpinner fullScreen size="lg" />}>
                <Routes>
                  <Route path="/lead" element={<LeadPublico />} />
                  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                  {/* Cadastro público desativado: contas novas só pelo proprietário no Supabase. */}
                  <Route path="/register" element={<Navigate to="/login" replace />} />
                  <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                    {protectedPages.map((route) => (
                      <Route
                        key={route.index ? 'dashboard' : route.path}
                        index={route.index}
                        path={route.path}
                        element={route.element}
                      />
                    ))}
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
              </BrowserRouter>
            </KeepAliveProvider>
          </ConfigProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
