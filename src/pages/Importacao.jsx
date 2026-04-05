import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Upload, FileSpreadsheet, Download } from 'lucide-react';
import Button from '@/components/Common/Button';
import Card from '@/components/Common/Card';
import { useToast as useToastNotification } from '@/hooks/useToast';

const Importacao = () => {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const { success, info } = useToastNotification();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      info('Arquivo selecionado', `${selectedFile.name} pronto para importação`);
    }
  };

  const handleImport = () => {
    if (!file) return;
    
    setImporting(true);
    setTimeout(() => {
      success('Importação concluída', '45 clientes importados com sucesso');
      setImporting(false);
      setFile(null);
    }, 2000);
  };

  const downloadTemplate = () => {
    info('Download iniciado', 'Template CSV será baixado em breve');
  };

  return (
    <>
      <Helmet>
        <title>Importação - Admin Panel</title>
        <meta name="description" content="Importar clientes em massa" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Importação de Clientes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Importe clientes em massa via CSV ou XLSX</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">1. Baixe o Template</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Baixe nosso template CSV com os campos necessários para a importação
            </p>
            <Button variant="outline" icon={Download} onClick={downloadTemplate}>
              Baixar Template CSV
            </Button>
            
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Campos obrigatórios:</p>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>• nome (texto)</li>
                <li>• telefone (formato: +5511999999999)</li>
                <li>• plano (nome do plano)</li>
                <li>• dia_vencimento (1-28)</li>
              </ul>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">2. Faça Upload do Arquivo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Selecione o arquivo CSV ou XLSX com os dados dos clientes
            </p>
            
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mb-3" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {file ? file.name : 'Clique para selecionar arquivo'}
                </span>
              </label>
            </div>

            {file && (
              <Button 
                variant="primary" 
                icon={Upload} 
                onClick={handleImport}
                loading={importing}
                className="w-full mt-4"
              >
                Iniciar Importação
              </Button>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Histórico de Importações</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">clientes_dezembro.csv</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">45 registros importados</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Sucesso</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">01/12/2025 14:30</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
};

export default Importacao;