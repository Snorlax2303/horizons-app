import React from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  FileText, 
  Send, 
  Upload, 
  Settings,
  X,
  Server,
  UserPlus
} from 'lucide-react';

const Sidebar = ({ currentPage, onNavigate, isOpen, onClose }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'prospects', label: 'Possíveis Clientes', icon: UserPlus },
    { id: 'servidores', label: 'Servidores', icon: Server },
    { id: 'planos', label: 'Planos', icon: Package },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'campanhas', label: 'Campanhas', icon: Send },
    { id: 'importacao', label: 'Importação', icon: Upload },
    { id: 'configuracoes', label: 'Configurações', icon: Settings }
  ];

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 
        flex flex-col h-full transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src="https://horizons-cdn.hostinger.com/70fe8520-3e0e-41f0-9575-743c8f556b9c/cec1c52118a3352491511b7b6f9dd867.png" alt="Admin Panel Logo" className="w-8 h-8 shrink-0" />
          <div>
            <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100">Admin Panel</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">WhatsApp Manager</p>
          </div>
        </div>
        {/* Mobile Close Button */}
        <button 
          onClick={onClose}
          className="md:hidden p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <nav className="flex-1 p-4 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <motion.button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
                isActive 
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="font-medium">{item.label}</span>
            </motion.button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-xs text-center text-gray-400 dark:text-gray-500">
        v1.0.0
      </div>
    </aside>
  );
};

export default Sidebar;