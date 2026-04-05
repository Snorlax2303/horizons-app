import React from 'react';
import { Moon, Sun, LogOut, User, Menu } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/Common/Button';

const Topbar = ({ onMenuClick }) => {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger Menu - Visible only on mobile */}
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Toggle Menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px] md:max-w-none">
          Bem-vindo, {user?.name?.split(' ')[0] || 'Admin'}
        </h2>
      </div>
      
      <div className="flex items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          icon={isDark ? Sun : Moon}
          className="hidden md:flex"
        >
          {isDark ? 'Claro' : 'Escuro'}
        </Button>

        {/* Mobile Theme Toggle (Icon only) */}
        <button 
          onClick={toggleTheme}
          className="md:hidden p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          {isDark ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
        </button>
        
        <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">{user?.email}</span>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          icon={LogOut}
        >
          <span className="hidden md:inline">Sair</span>
          <span className="md:hidden">Sair</span>
        </Button>
      </div>
    </header>
  );
};

export default Topbar;