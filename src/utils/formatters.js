export const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

export const formatDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR');
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('pt-BR');
};

export const formatMonth = (monthIndex) => {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return months[monthIndex] || '';
};

export const maskPhone = (phone) => {
  if (!phone) return '';
  // Format: 55119****5678 (mask middle digits)
  if (phone.length >= 13) {
    return `${phone.slice(0, 6)}****${phone.slice(-4)}`;
  }
  return phone;
};

export const formatPhoneDisplay = (phone) => {
  if (!phone) return '';
  // Format E.164 to readable: +55 (11) 99999-9999
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
};

export const formatPhoneInput = (value) => {
  if (!value) return '';
  
  // Remove all non-digit characters
  const numbers = value.replace(/\D/g, '');
  
  // Limit to 11 digits (2 for DDD + 9 for number)
  const truncated = numbers.slice(0, 11);
  
  // Apply formatting
  if (truncated.length <= 2) {
    return truncated;
  }
  
  if (truncated.length <= 7) {
    return `(${truncated.slice(0, 2)}) ${truncated.slice(2)}`;
  }
  
  if (truncated.length <= 11) {
    return `(${truncated.slice(0, 2)}) ${truncated.slice(2, 7)}-${truncated.slice(7)}`;
  }
  
  return `(${truncated.slice(0, 2)}) ${truncated.slice(2, 7)}-${truncated.slice(7, 11)}`;
};