import { useToast as useRadixToast } from '@/components/ui/use-toast';

/**
 * Compatibilidade para páginas que usam a API semântica success/error/info.
 * A implementação única fica em components/ui/use-toast.
 */
export const useToast = () => useRadixToast();
