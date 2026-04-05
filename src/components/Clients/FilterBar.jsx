import React from 'react';
import { Search, Server, Filter, CreditCard, Activity, Package } from 'lucide-react';

const FilterBar = ({ 
  servers = [], 
  plans = [], 
  filters, 
  onFilterChange 
}) => {
  
  const handleChange = (key, value) => {
    console.log(`Filter changed: ${key} = ${value}`);
    onFilterChange(key, value);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
      <div className="flex items-center gap-2 mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">
        <Filter className="w-4 h-4" />
        <span>Filtros</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Search Input */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              value={filters.search}
              onChange={(e) => handleChange('search', e.target.value)}
              placeholder="Nome ou Telefone"
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-100"
            />
          </div>
        </div>

        {/* Server Select */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Servidor</label>
          <div className="relative">
            <Server className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filters.server}
              onChange={(e) => handleChange('server', e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:text-gray-100"
            >
              <option value="">Todos os Servidores</option>
              {servers.map(server => (
                <option key={server.id} value={server.id}>{server.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Payment Status Select */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Pagamento</label>
          <div className="relative">
            <CreditCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filters.paymentStatus}
              onChange={(e) => handleChange('paymentStatus', e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:text-gray-100"
            >
              <option value="">Todos</option>
              <option value="paid">Pagos</option>
              <option value="unpaid">Não Pagos</option>
            </select>
          </div>
        </div>

        {/* Active Status Select */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <div className="relative">
            <Activity className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filters.activeStatus}
              onChange={(e) => handleChange('activeStatus', e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:text-gray-100"
            >
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>
        </div>

        {/* Plan Select */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Plano</label>
          <div className="relative">
            <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filters.plan}
              onChange={(e) => handleChange('plan', e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none appearance-none dark:text-gray-100"
            >
              <option value="">Todos os Planos</option>
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FilterBar;