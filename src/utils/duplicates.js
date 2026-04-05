import { supabase } from '@/lib/customSupabaseClient';

/**
 * Removes duplicate prospects based on phone match.
 * Performs a GLOBAL analysis across all groups (including ungrouped records).
 * Fetches ALL records using pagination to bypass default limits.
 * Keeps the oldest record by creation date.
 * 
 * @param {string} userId - The current user's ID
 * @param {boolean} dryRun - If true, only analyzes and returns potential deletions
 * @returns {Promise<Object>} Result object with detailed stats
 */
export const removeDuplicates = async (userId, dryRun = false) => {
  console.group('[DUPLICATES] --- STARTING PROCESS ---');
  console.log(`User ID: ${userId}`);
  console.log(`Mode: ${dryRun ? 'Dry Run (Analysis Only)' : 'Execution (Delete)'}`);

  const result = {
    totalFetched: 0,
    duplicateGroups: [],     // Array of { phone, count, keptId, idsToRemove }
    recordsToDelete: [],     // Array of IDs
    deletionResults: { 
      success: 0, 
      failed: 0 
    }
  };

  try {
    // 1. BATCH FETCHING
    let allRecords = [];
    let offset = 0;
    const BATCH_SIZE = 5000;
    let keepFetching = true;
    let batchIndex = 1;

    console.time('[FETCH] Total Time');
    console.log('[FETCH] Starting pagination loop...');

    while (keepFetching) {
      const from = offset;
      const to = offset + BATCH_SIZE - 1;

      const { data, error } = await supabase
        .from('prospects')
        .select('id, phone, created_at, name, group_id')
        .eq('user_id', userId)
        .range(from, to);

      if (error) {
        console.error(`[FETCH] Error in batch ${batchIndex}:`, error);
        throw new Error(`Failed to fetch batch ${batchIndex}: ${error.message}`);
      }

      if (data && data.length > 0) {
        allRecords = allRecords.concat(data);
        console.log(`[FETCH] Batch ${batchIndex}: Fetched ${data.length} records (Offset: ${from}-${to})`);
        
        if (data.length < BATCH_SIZE) {
          keepFetching = false;
        } else {
          offset += BATCH_SIZE;
        }
        batchIndex++;
      } else {
        keepFetching = false;
      }
    }
    console.timeEnd('[FETCH] Total Time');
    
    result.totalFetched = allRecords.length;
    console.log(`[FETCH] Completed. Total records fetched: ${result.totalFetched}`);

    if (result.totalFetched === 0) {
      console.log('[ANALYSIS] No records to process.');
      console.groupEnd();
      return result;
    }

    // 2. GROUPING
    console.log('[ANALYSIS] Grouping records by phone...');
    const phoneGroups = {};
    
    allRecords.forEach(record => {
      // Basic normalization: trim whitespace
      if (!record.phone) return;
      const phone = String(record.phone).trim();
      if (!phone) return;

      if (!phoneGroups[phone]) {
        phoneGroups[phone] = [];
      }
      phoneGroups[phone].push(record);
    });

    // 3. IDENTIFY DUPLICATES
    console.log('[ANALYSIS] Identifying duplicates...');
    
    Object.entries(phoneGroups).forEach(([phone, records]) => {
      if (records.length > 1) {
        // Sort by created_at ascending (Oldest first)
        records.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateA - dateB;
        });

        const kept = records[0]; // Keep oldest
        const duplicates = records.slice(1); // Remove others
        const duplicateIds = duplicates.map(r => r.id);

        result.duplicateGroups.push({
          phone,
          count: records.length,
          keptId: kept.id,
          idsToRemove: duplicateIds,
          preview: duplicates.map(d => `${d.name || 'Sem nome'} (Group: ${d.group_id || 'None'})`)
        });

        result.recordsToDelete.push(...duplicateIds);
      }
    });

    console.log(`[ANALYSIS] Duplicate groups found: ${result.duplicateGroups.length}`);
    console.log(`[ANALYSIS] Total records marked for deletion: ${result.recordsToDelete.length}`);

    // 4. DELETION (If not Dry Run)
    if (!dryRun && result.recordsToDelete.length > 0) {
      console.log('[DELETE] Executing deletion...');
      
      const allIdsToDelete = result.recordsToDelete;
      const DELETE_BATCH_SIZE = 1000; // Supabase limit is often generous, but 1000 is safe
      
      for (let i = 0; i < allIdsToDelete.length; i += DELETE_BATCH_SIZE) {
        const batchIds = allIdsToDelete.slice(i, i + DELETE_BATCH_SIZE);
        console.log(`[DELETE] Deleting batch ${Math.floor(i/DELETE_BATCH_SIZE) + 1} (${batchIds.length} records)...`);
        
        const { error } = await supabase
          .from('prospects')
          .delete()
          .in('id', batchIds);

        if (error) {
          console.error('[DELETE] Batch failure:', error);
          result.deletionResults.failed += batchIds.length;
        } else {
          result.deletionResults.success += batchIds.length;
        }
      }
      
      console.log(`[DELETE] Finished. Success: ${result.deletionResults.success}, Failed: ${result.deletionResults.failed}`);
    } else if (dryRun) {
      console.log('[DELETE] Dry run mode - skipping deletion.');
    } else {
      console.log('[DELETE] No duplicates to delete.');
    }

    console.groupEnd();
    return result;

  } catch (err) {
    console.error('[DUPLICATES] Critical failure:', err);
    console.groupEnd();
    throw err;
  }
};