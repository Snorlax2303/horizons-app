import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, Server, Trash2, Edit2, MoreVertical, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '@/components/Common/Button';
import Input from '@/components/Common/Input';
import Table from '@/components/Common/Table';
import Modal from '@/components/Common/Modal';
import LoadingSpinner from '@/components/Common/LoadingSpinner';
import { formatDateTime } from '@/utils/formatters';
import { useToast as useToastNotification } from '@/hooks/useToast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

const Servidores = () => {
  const { user } = useAuth();
  const [servers, setServers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedServer, setSelectedServer] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: ''
  });

  const { success, error } = useToastNotification();

  useEffect(() => {
    if (user) {
      fetchServers();
    }
  }, [user]);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('servers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setServers(data || []);
      const { data: catalogData, error: catalogError } = await supabase
        .from('cinehub_servers')
        .select('id,code,name,provider,active,is_default_trial')
        .eq('user_id', user.id)
        .order('name');
      if (catalogError) throw catalogError;
      setCatalog(catalogData || []);
    } catch (err) {
      console.error('Erro ao buscar servidores:', err);
      error('Erro', 'Falha ao carregar lista de servidores.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setFormData({ name: '' });
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (server) => {
    setFormData({ name: server.name });
    setSelectedServer(server);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleOpenDelete = (server) => {
    setSelectedServer(server);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Erro', 'O nome do servidor é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'create') {
        const { data, error: err } = await supabase
          .from('servers')
          .insert([{ 
            user_id: user.id,
            name: formData.name 
          }])
          .select()
          .single();

        if (err) throw err;
        setServers([data, ...servers]);
        success('Sucesso', 'Servidor adicionado!');
      } else {
        const { data, error: err } = await supabase
          .from('servers')
          .update({ name: formData.name })
          .eq('id', selectedServer.id)
          .select()
          .single();

        if (err) throw err;
        setServers(servers.map(s => s.id === selectedServer.id ? data : s));
        success('Sucesso', 'Servidor atualizado!');
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Erro', 'Falha ao salvar servidor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedServer) return;
    try {
      const { error: err } = await supabase
        .from('servers')
        .delete()
        .eq('id', selectedServer.id);

      if (err) throw err;

      setServers(servers.filter(s => s.id !== selectedServer.id));
      success('Removido', 'Servidor removido com sucesso.');
      setIsDeleteModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Erro', 'Não foi possível remover o servidor. Verifique se existem clientes vinculados.');
    }
  };

  const filteredServers = servers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { 
      header: 'Nome do Servidor', 
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
            <Server size={18} />
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.name}</span>
        </div>
      )
    },
    { 
      header: 'Data de Criação', 
      render: (row) => formatDateTime(row.created_at) 
    },
    {
      header: 'Ações',
      render: (row) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors outline-none">
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenEdit(row)} className="cursor-pointer gap-2">
                <Edit2 className="w-4 h-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenDelete(row)} className="cursor-pointer gap-2 text-red-600 focus:text-red-600">
                <Trash2 className="w-4 h-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }
  ];

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return (
    <>
      <Helmet>
        <title>Servidores - Admin Panel</title>
      </Helmet>

      <div className="space-y-6">
        <section className="rounded-xl border bg-white p-5 dark:bg-gray-800">
          <h2 className="mb-1 text-lg font-semibold">Catálogo operacional (testes e acessos)</h2>
          <p className="mb-4 text-sm text-gray-500">Servidores usados em testes, entrega de acessos e migrações. Este catálogo é sincronizado com os endpoints protegidos.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{item.name}</span><span className={`rounded-full px-2 py-1 text-xs ${item.is_default_trial ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{item.is_default_trial ? 'Teste padrão' : item.active ? 'Ativo' : 'Inativo'}</span></div>
                <p className="mt-1 text-xs text-gray-500">Código: <code>{item.code}</code> · Provider: <code>{item.provider}</code></p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Servidores IPTV</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Gerencie os servidores disponíveis para seus clientes</p>
          </div>
          <Button variant="primary" icon={Plus} onClick={handleOpenCreate}>
            Novo Servidor
          </Button>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Buscar servidor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Table 
          columns={columns} 
          data={filteredServers}
          emptyMessage="Nenhum servidor cadastrado"
        />

        {/* Create/Edit Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={modalMode === 'create' ? "Novo Servidor" : "Editar Servidor"}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nome do Servidor"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Servidor Principal, Backup, etc."
              required
            />
            
            <div className="flex gap-3 justify-end mt-6">
              <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Modal */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Confirmar Exclusão"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-300">
              Deseja realmente excluir o servidor <strong>{selectedServer?.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
              <Button variant="danger" onClick={handleDelete}>Excluir</Button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
};

export default Servidores;