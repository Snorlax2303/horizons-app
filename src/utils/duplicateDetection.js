/**
 * Detects duplicate prospects based on normalized phone numbers.
 * Keeps the oldest record (by created_at) and marks all newer ones as duplicates.
 * 
 * @param {Array} prospects - Array of prospect objects { id, phone, created_at, name, ... }
 * @returns {Object} { duplicates: Array, summary: Object }
 */
export const findDuplicatesByPhone = (prospects) => {
  const phoneGroups = {};
  const duplicates = [];
  const affectedGroups = new Set();
  
  // 1. Group by Normalized Phone
  prospects.forEach(p => {
    if (!p.phone) return;
    
    // Normalize: remove all non-digits
    const rawPhone = String(p.phone).replace(/\D/g, '');
    
    // Basic validation (e.g., ensure minimum length like 10 or 11 digits for BR)
    // For now, we'll just require at least 8 digits to be safe globally
    if (rawPhone.length < 8) return; 

    if (!phoneGroups[rawPhone]) {
      phoneGroups[rawPhone] = [];
    }
    phoneGroups[rawPhone].push(p);
  });

  // 2. Identify Duplicates
  Object.entries(phoneGroups).forEach(([phone, records]) => {
    if (records.length > 1) {
      // Sort by created_at ascending (Oldest first is kept)
      // Handle null created_at by treating it as "very old" or "very new" depending on policy.
      // Usually treating it as "now" prevents deletion if dates are missing, but here we assume valid dates.
      records.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });

      const kept = records[0];
      const toRemove = records.slice(1);

      toRemove.forEach(dup => {
        duplicates.push({
          ...dup,
          originalId: kept.id, // Reference to the record being kept
          originalDate: kept.created_at
        });
        if (dup.group_id) affectedGroups.add(dup.group_id);
      });
    }
  });

  return {
    duplicates,
    summary: {
      totalDuplicates: duplicates.length,
      groupsAffected: Array.from(affectedGroups),
      uniquePhonesChecked: Object.keys(phoneGroups).length
    }
  };
};