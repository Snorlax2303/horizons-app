import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Dashboard from '@/pages/Dashboard';
import Clientes from '@/pages/Clientes';
import Planos from '@/pages/Planos';
import Templates from '@/pages/Templates';
import Campanhas from '@/pages/Campanhas';
import Importacao from '@/pages/Importacao';
import Configuracoes from '@/pages/Configuracoes';
import Servidores from '@/pages/Servidores';
import Prospects from '@/pages/Prospects';
import KeepAliveMonitor from '@/components/Common/KeepAliveMonitor';

const MainLayout = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen);
  };

  const closeSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const handleNavigate = (pageId) => {
    setCurrentPage(pageId);
    closeSidebar(); // Close sidebar on mobile when navigating
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'clientes':
        return <Clientes />;
      case 'servidores':
        return <Servidores />;
      case 'prospects':
        return <Prospects />;
      case 'planos':
        return <Planos />;
      case 'templates':
        return <Templates />;
      case 'campanhas':
        return <Campanhas />;
      case 'importacao':
        return <Importacao />;
      case 'configuracoes':
        return <Configuracoes />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden relative">
      {/* Sidebar Overlay for Mobile */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar with responsive classes */}
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        isOpen={isMobileSidebarOpen}
        onClose={closeSidebar}
      />

      <div className="flex-1 flex flex-col w-full min-w-0">
        <Topbar onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto w-full">
            {renderPage()}
          </div>
        </main>
      </div>

      {/* Global Keep-Alive Monitor */}
      <KeepAliveMonitor showDebugPanel={true} position="bottom-right" />
    </div>
  );
};

export default MainLayout;