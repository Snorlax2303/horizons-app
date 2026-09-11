import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import KeepAliveMonitor from '@/components/Common/KeepAliveMonitor';

const pathToPage = {
  '/': 'dashboard',
  '/central': 'central',
  '/clientes': 'clientes',
  '/prospects': 'prospects',
  '/testes': 'testes',
  '/manuais': 'manuais',
  '/captacao': 'captacao',
  '/indicacoes': 'indicacoes',
  '/cobrancas': 'cobrancas',
  '/revisao': 'revisao',
  '/baixa': 'baixa',
  '/renovacoes': 'renovacoes',
  '/novo-acesso': 'novo-acesso',
  '/assistente': 'assistente',
  '/servidores': 'servidores',
  '/conexoes': 'conexoes',
  '/operacoes': 'operacoes',
  '/procedimentos': 'procedimentos',
  '/planos': 'planos',
  '/importacao': 'importacao',
  '/configuracoes': 'configuracoes',
  '/saude': 'saude',
  '/logs': 'logs',
  '/reparo-telefones': 'reparo-telefones',
};

const MainLayout = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = pathToPage[location.pathname] || 'dashboard';

  const closeSidebar = () => setIsMobileSidebarOpen(false);
  const handleNavigate = (path) => {
    navigate(path);
    closeSidebar();
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden relative">
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={closeSidebar} aria-hidden="true" />
      )}

      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isOpen={isMobileSidebarOpen}
        onClose={closeSidebar}
      />

      <div className="flex-1 flex flex-col w-full min-w-0">
        <Topbar onMenuClick={() => setIsMobileSidebarOpen((open) => !open)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>

      <KeepAliveMonitor position="bottom-right" />
    </div>
  );
};

export default MainLayout;
