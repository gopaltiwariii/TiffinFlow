function isValidDateString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmedValue = value.trim();
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(trimmedValue)) {
    return false;
  }

  const [year, month, day] = trimmedValue.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day;
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') {
    return '';
  }

  const clean = phone.replace(/\D/g, '');
  return clean;
}

function validatePhone(phone) {
  const clean = normalizePhone(phone);
  return clean.length >= 10 && clean.length <= 15;
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

function assertValidDate(value, fieldName = 'date') {
  if (!isValidDateString(value)) {
    const error = new Error(`${fieldName} must be a valid date in YYYY-MM-DD format`);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  isValidDateString,
  normalizePhone,
  validatePhone,
  validateEmail,
  validatePassword,
  assertValidDate,
};
