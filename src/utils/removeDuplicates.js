import { supabase } from '@/lib/customSupabaseClient';

/**
 * Clean utility to remove duplicate prospects.
 * Strategy:
 * 1. Fetch all prospects for user (minimal fields).
 * 2. Group by EXACT phone string.
 * 3. Keep oldest created_at, delete others.
 * 4. Return summary stats.
 * 
 * @param {string} userId 
 * @returns {Promise<{duplicatesFound: number, recordsDeleted: number, success: boolean, error: string|null}>}
 */
export const removeDuplicates = async (userId) => {
  console.log('[removeDuplicates] Starting for user:', userId);

  try {
    // 1. Fetch
    const { data: prospects, error: fetchError } = await supabase
      .from('prospects')
      .select('id, phone, created_at')
      .eq('user_id', userId);

    if (fetchError) {
      console.error('[removeDuplicates] Fetch error:', fetchError);
      return { duplicatesFound: 0, recordsDeleted: 0, success: false, error: fetchError.message };
    }

    if (!prospects || prospects.length === 0) {
      return { duplicatesFound: 0, recordsDeleted: 0, success: true, error: null };
    }

    // 2. Group by Exact Phone
    const groups = {};
    prospects.forEach(p => {
      // Treat null/undefined as empty string, skip empty
      if (!p.phone) return;
      const key = p.phone; // Exact match, no normalization as requested
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(p);
    });

    // 3. Identify Duplicates
    let duplicatesFound = 0;
    const idsToDelete = [];

    Object.entries(groups).forEach(([phone, group]) => {
      if (group.length > 1) {
        duplicatesFound++;
        
        // Sort by created_at ASC (Oldest first)
        // If created_at is null, treat as new (push to end) to preserve existing with dates
        group.sort((a, b) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : Infinity;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : Infinity;
          return timeA - timeB;
        });

        // Keep the first (oldest), mark rest for deletion
        const toRemove = group.slice(1);
        toRemove.forEach(record => idsToDelete.push(record.id));
      }
    });

    console.log(`[removeDuplicates] Found ${duplicatesFound} duplicate groups. IDs to delete: ${idsToDelete.length}`);

    if (idsToDelete.length === 0) {
      return { duplicatesFound: 0, recordsDeleted: 0, success: true, error: null };
    }

    // 4. Delete
    // Supabase handles array in .in() well.
    const { error: deleteError } = await supabase
      .from('prospects')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      console.error('[removeDuplicates] Delete error:', deleteError);
      return { 
        duplicatesFound, 
        recordsDeleted: 0, 
        success: false, 
        error: `Erro ao deletar: ${deleteError.message}` 
      };
    }

    return { 
      duplicatesFound, 
      recordsDeleted: idsToDelete.length, 
      success: true, 
      error: null 
    };

  } catch (err) {
    console.error('[removeDuplicates] Unexpected error:', err);
    return { 
      duplicatesFound: 0, 
      recordsDeleted: 0, 
      success: false, 
      error: err.message || 'Erro inesperado' 
    };
  }
};