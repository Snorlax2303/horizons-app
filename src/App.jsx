import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { KeepAliveProvider } from '@/contexts/KeepAliveContext';
import MainLayout from '@/components/Layout/MainLayout';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import LeadPublico from '@/pages/LeadPublico';
import Dashboard from '@/pages/Dashboard';
import CentralOperacional from '@/pages/CentralOperacional';
import Clientes from '@/pages/Clientes';
import Prospects from '@/pages/Prospects';
import Testes from '@/pages/Testes';
import ManuaisInstalacao from '@/pages/ManuaisInstalacao';
import Captacao from '@/pages/Captacao';
import Indicacoes from '@/pages/Indicacoes';
import CobrancasPix from '@/pages/CobrancasPix';
import Renovacoes from '@/pages/Renovacoes';
import AssistenteAdmin from '@/pages/AssistenteAdmin';
import Servidores from '@/pages/Servidores';
import ConexoesPaineis from '@/pages/ConexoesPaineis';
import OperacoesPaineis from '@/pages/OperacoesPaineis';
import ProcedimentosPaineis from '@/pages/ProcedimentosPaineis';
import Planos from '@/pages/Planos';
import Importacao from '@/pages/Importacao';
import Configuracoes from '@/pages/Configuracoes';
import PhoneNumberRepairPage from '@/pages/PhoneNumberRepairPage';
import SaudeIntegracoes from '@/pages/SaudeIntegracoes';
import LogsAuditoria from '@/pages/LogsAuditoria';
import RevisaoFinanceira from '@/pages/RevisaoFinanceira';
import BaixaPagamentos from '@/pages/BaixaPagamentos';
import NovoAcessoWizard from '@/pages/NovoAcessoWizard';
import WplayPanel from '@/pages/WplayPanel';

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
                <Routes>
                  <Route path="/lead" element={<LeadPublico />} />
                  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                  <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
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
              </BrowserRouter>
            </KeepAliveProvider>
          </ConfigProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
