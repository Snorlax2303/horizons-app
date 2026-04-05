export const normalizeToE164 = (phone) => {
  if (!phone) return '';
  
  // 1. Clean: Remove all non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // 2. Remove leading zeros (e.g. 011... -> 11...)
  while (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // 3. Ensure Country Code 55 (Brazil)
  // If the number already starts with '55', ensure it's not duplicated
  if (cleaned.startsWith('55')) {
    // If it starts with 55 and has country code, ensure correct length
    // No change needed here
  } else if (cleaned.length >= 10 && cleaned.length <= 11) { // Assumes DDD + 8 or 9 digits
    cleaned = '55' + cleaned;
  } else {
    // For other cases, if it doesn't start with 55, prepend it (e.g. if it's already an international number without +55)
    cleaned = '55' + cleaned;
  }

  // Final check to remove any leading '+' if present in the original input
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  return cleaned; // Return without the '+' symbol
};

export const isValidBrazilianPhone = (phone) => {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  
  // Basic validation logic
  // Case 1: DDD + Number (10 or 11 digits)
  if (cleaned.length === 10 || cleaned.length === 11) {
    return true;
  }
  
  // Case 2: 55 + DDD + Number (12 or 13 digits)
  if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
    return true;
  }

  return false;
};

export const formatPhoneInput = (value) => {
  const cleaned = value.replace(/\D/g, '');
  
  if (cleaned.length === 0) return '';
  
  // Format as (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  let formatted = '';
  
  if (cleaned.length <= 2) {
    formatted = `(${cleaned}`;
  } else if (cleaned.length <= 7) { // (DD) XXXXX
    formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
  } else if (cleaned.length <= 11) { // (DD) XXXXX-XXXX
    formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  } else { // Handle extra digits if user types more, truncate to 11 national digits visually or just show them
    // Better to handle 55 case or just standard display
    // If it's huge, just show it
    if (cleaned.length > 11) {
        return value; // Return raw if doesn't fit mask
    }
  }
  
  return formatted;
};

export const formatPhoneDisplay = (phone) => {
  if (!phone) return '';
  // Try to format E.164 back to readable (XX) XXXXX-XXXX
  // Input expected: +5511999999999 or 5511999999999
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55')) cleaned = cleaned.substring(2);
  
  return formatPhoneInput(cleaned);
};