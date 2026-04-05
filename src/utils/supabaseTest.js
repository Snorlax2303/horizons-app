import { supabase } from '@/lib/customSupabaseClient';

/**
 * Tests the connection to Supabase by fetching a single row from the 'prospects' table.
 * Used for debugging CORB/Connection issues.
 */
export const testSupabaseConnection = async (userId) => {
  console.log('[CONNECTION TEST] Starting...');
  console.log('[CONNECTION TEST] Checking URL/Key availability...');
  
  // Note: Env vars are usually baked in at build time, accessing them via import.meta.env or process.env depending on setup
  // but here we just check if client works.
  
  try {
    // Attempt a very simple query
    const { count, error } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true }) // head: true means just get metadata/count, no data transfer
      .eq('user_id', userId);

    if (error) {
      console.error('[CONNECTION TEST] Failed:', error);
      return { 
        success: false, 
        message: `Erro Supabase: ${error.message} (Code: ${error.code})` 
      };
    }

    console.log('[CONNECTION TEST] Success. Count result:', count);
    return { 
      success: true, 
      count: count,
      message: 'Conexão estabelecida com sucesso.' 
    };

  } catch (err) {
    console.error('[CONNECTION TEST] Exception:', err);
    return { 
      success: false, 
      message: `Exceção: ${err.message}` 
    };
  }
};