// Small formatting + sanitization helpers shared by the template renderer.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes HTML-significant characters. Every piece of customer/order data
 * (name, address, product titles, etc.) is user-supplied and must be escaped
 * before being interpolated into the HTML template, otherwise a crafted
 * customer name or product title could inject markup into the email.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Formats a numeric amount as currency. Falls back to plain 2-decimal
 * formatting if `Intl.NumberFormat` doesn't recognize the currency code.
 */
function formatCurrency(amount, currency = 'USD') {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export { escapeHtml, formatCurrency, formatDate };
