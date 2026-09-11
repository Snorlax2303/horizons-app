import React from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Package,
  Upload,
  Settings,
  HeartPulse,
  ShieldCheck,
  ScrollText,
  Wrench,
  X,
  Server,
  UserPlus,
  Link2,
  ClipboardList,
  Megaphone,
  Gift, CreditCard, WalletCards
  ,BookOpen, TestTube2, BookOpenCheck, ReceiptText, Bot, Gauge, Tv
} from 'lucide-react';

const Sidebar = ({ currentPage, onNavigate, isOpen, onClose }) => {
  const menuItems = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'central', path: '/central', label: 'Central Operacional', icon: Gauge },
    { id: 'clientes', path: '/clientes', label: 'Clientes', icon: Users },
    { id: 'prospects', path: '/prospects', label: 'Possíveis Clientes', icon: UserPlus },
    { id: 'testes', path: '/testes', label: 'Testes', icon: TestTube2 },
    { id: 'manuais', path: '/manuais', label: 'Manuais', icon: BookOpenCheck },
    { id: 'captacao', path: '/captacao', label: 'Captação', icon: Megaphone },
    { id: 'indicacoes', path: '/indicacoes', label: 'Indicações', icon: Gift },
    { id: 'cobrancas', path: '/cobrancas', label: 'Cobranças Pix', icon: CreditCard },
    { id: 'revisao', path: '/revisao', label: 'Revisão financeira', icon: WalletCards },
    { id: 'baixa', path: '/baixa', label: 'Baixa de Pagamentos', icon: ShieldCheck },
    { id: 'novo-acesso', path: '/novo-acesso', label: 'Novo acesso (wizard)', icon: UserPlus },
    { id: 'wplay', path: '/wplay', label: 'WPlay (painel)', icon: Tv },
    { id: 'renovacoes', path: '/renovacoes', label: 'Renovações', icon: ReceiptText },
    { id: 'assistente', path: '/assistente', label: 'Assistente IA', icon: Bot },
    { id: 'servidores', path: '/servidores', label: 'Servidores', icon: Server },
    { id: 'conexoes', path: '/conexoes', label: 'Conexões de Painéis', icon: Link2 },
    { id: 'operacoes', path: '/operacoes', label: 'Operações', icon: ClipboardList },
    { id: 'procedimentos', path: '/procedimentos', label: 'Procedimentos', icon: BookOpen },
    { id: 'planos', path: '/planos', label: 'Planos', icon: Package },
    { id: 'importacao', path: '/importacao', label: 'Importação', icon: Upload },
    { id: 'logs', path: '/logs', label: 'Logs e auditoria', icon: ScrollText },
    { id: 'reparo-telefones', path: '/reparo-telefones', label: 'Reparo de telefones', icon: Wrench },
    { id: 'saude', path: '/saude', label: 'Saúde e integrações', icon: HeartPulse },
    { id: 'configuracoes', path: '/configuracoes', label: 'Configurações', icon: Settings }
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
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 font-bold text-white shadow-sm" aria-hidden="true">H</div>
          <div>
            <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100">Horizons</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Central de operações</p>
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
              onClick={() => onNavigate(item.path)}
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
        Operação segura e auditável
      </div>
    </aside>
  );
};

export default Sidebar;
