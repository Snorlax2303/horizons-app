import { supabase } from '@/lib/customSupabaseClient';

export async function horizonsApi(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'A operação não foi concluída.');
  return payload;
}
