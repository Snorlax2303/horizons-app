import React, { useState } from 'react';
import { Archive, ScanLine } from 'lucide-react';
import Button from '@/components/Common/Button';
import { horizonsApi } from '@/services/horizonsApi';
import { useToast as useToastNotification } from '@/hooks/useToast';

// Manutenção do backlog: sempre mostra a prévia (dry run) antes de executar.
export default function ReceiptMaintenance({ onChanged }) {
  const { success, error } = useToastNotification();
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState('');

  const call = (path, body) => horizonsApi(path, { method: 'POST', body: JSON.stringify(body) });

  const reprocess = async () => {
    setBusy('reprocess');
    try {
      const preview = await call('/payments/receipts/reprocess', { dry_run: true, limit: 20 });
      if (!preview.ai_configured) { error('IA não configurada', 'Salve a chave e o modelo de visão em Configurações.'); return; }
      if (!preview.candidates) { setSummary('Nenhum comprovante com falha de clientes conhecidos para reprocessar.'); return; }
      if (!window.confirm(`Reprocessar ${preview.candidates} comprovante(s) com a IA? Nada é enviado ao cliente; o resultado vai para a sua conferência.`)) return;
      const result = await call('/payments/receipts/reprocess', { dry_run: false, limit: 20 });
      setSummary(`Lidos: ${result.completed} · mídia indisponível: ${result.media_unavailable} · falha na leitura: ${result.extraction_failed}`);
      success('Reprocessamento concluído', 'Confira os comprovantes lidos na fila.');
      onChanged?.();
    } catch (err) {
      error('Erro ao reprocessar', err.message);
    } finally {
      setBusy('');
    }
  };

  const dismissGroups = async () => {
    setBusy('groups');
    try {
      const preview = await call('/payments/receipts/dismiss-groups', { dry_run: true });
      if (!preview.renewals) { setSummary('Nenhuma ocorrência aberta por imagem de grupo.'); return; }
      if (!window.confirm(`Arquivar ${preview.renewals} ocorrência(s) abertas por imagens de GRUPOS do WhatsApp? Elas ficam como "rejeitadas" (não são apagadas).`)) return;
      const result = await call('/payments/receipts/dismiss-groups', { dry_run: false });
      setSummary(`${result.renewals} ocorrência(s) de grupo arquivadas.`);
      success('Fila limpa', 'Ocorrências de grupos arquivadas.');
      onChanged?.();
    } catch (err) {
      error('Erro ao arquivar', err.message);
    } finally {
      setBusy('');
    }
  };

  return <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-sm dark:bg-gray-800">
    <span className="font-medium">Manutenção de comprovantes</span>
    <Button variant="secondary" icon={ScanLine} loading={busy === 'reprocess'} onClick={reprocess}>Reprocessar falhas com IA</Button>
    <Button variant="secondary" icon={Archive} loading={busy === 'groups'} onClick={dismissGroups}>Arquivar imagens de grupos</Button>
    {summary && <span className="text-gray-600 dark:text-gray-400">{summary}</span>}
  </div>;
}
