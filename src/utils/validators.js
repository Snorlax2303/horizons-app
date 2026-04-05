export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  // E.164 format validation: +[country][area][number]
  const re = /^\+?[1-9]\d{1,14}$/;
  return re.test(phone);
};

export const validateE164Phone = (phone) => {
  // Strict E.164 for Brazil: +55XXYYYYYYYY (13 digits total)
  const re = /^\+55\d{10,11}$/;
  return re.test(phone);
};

export const validateDayOfMonth = (day) => {
  const d = parseInt(day, 10);
  return !isNaN(d) && d >= 1 && d <= 31; // Updated to accept days 1 to 31
};

export const validateRequired = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
};

export const validateNumber = (value) => {
  return !isNaN(parseFloat(value)) && isFinite(value);
};