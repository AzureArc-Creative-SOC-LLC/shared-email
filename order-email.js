// Shared order confirmation email service.
//
// Used by every frontend domain's server-side API after the shared backend
// returns a successful order response. The backend itself never sends email —
// each frontend calls this module directly, passing the domain it's running
// on so the correct brand/template/from-address is used.
//
// Usage (from any frontend's server-side API route):
//
//   import { sendOrderConfirmationEmail } from '../../../shared-email/order-email.js';
//
//   await sendOrderConfirmationEmail({
//     domain: request.headers.host,
//     customer: { name: 'Jane Doe', email: 'jane@example.com' },
//     order: {
//       orderNumber: 'ORD-10234',
//       currency: 'USD',
//       items: [{ name: 'Widget', quantity: 2, price: 19.99 }],
//       subtotal: 39.98,
//       shipping: 5.00,
//       tax: 3.20,
//       discount: 0,
//       total: 48.18,
//       shippingAddress: '123 Main St, Springfield, IL 62704',
//     },
//   });

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBrandConfig } from './brand-config.js';
import { loadTemplate, renderTemplate, renderItemRows } from './helpers/render-template.js';
import { escapeHtml, formatCurrency, formatDate } from './helpers/format.js';
import { sendMail } from './helpers/mailer.js';

// Loaded relative to this file, not the importing process's CWD — every
// frontend imports this module from a different working directory, and a
// bare `import 'dotenv/config'` would silently look for `.env` in whichever
// directory each of those processes happened to start from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * Builds the fully-rendered HTML body for an order confirmation email.
 */
async function buildEmailHtml({ brand, customer, order }) {
  const template = await loadTemplate('order-confirmation.html');
  const currency = order.currency || 'USD';

  const discount = Number(order.discount) || 0;
  const discountRow = discount > 0
    ? `<tr><td style="padding:4px 0;">Discount</td><td align="right" style="padding:4px 0;">-${formatCurrency(discount, currency)}</td></tr>`
    : '';

  return renderTemplate(template, {
    BRAND_NAME: escapeHtml(brand.name),
    LOGO_URL: brand.logo,
    PRIMARY_COLOR: brand.primaryColor || '#111827',
    CUSTOMER_NAME: escapeHtml(customer.name),
    ORDER_NUMBER: escapeHtml(order.orderNumber),
    ORDER_DATE: formatDate(order.createdAt),
    ITEM_ROWS: renderItemRows(order.items, currency),
    SUBTOTAL: formatCurrency(order.subtotal, currency),
    SHIPPING: formatCurrency(order.shipping, currency),
    TAX: formatCurrency(order.tax, currency),
    DISCOUNT_ROW: discountRow,
    TOTAL: formatCurrency(order.total, currency),
    SHIPPING_ADDRESS: escapeHtml(order.shippingAddress),
    SUPPORT_EMAIL: escapeHtml(brand.supportEmail),
    YEAR: new Date().getFullYear(),
  });
}

function validateInput({ domain, customer, order }) {
  if (!domain) throw new Error('"domain" is required.');
  if (!customer?.email) throw new Error('"customer.email" is required.');
  if (!order?.orderNumber) throw new Error('"order.orderNumber" is required.');
  if (!Array.isArray(order?.items) || order.items.length === 0) {
    throw new Error('"order.items" must be a non-empty array.');
  }
}

/**
 * Sends a branded order confirmation email for the given domain.
 *
 * @param {object} params
 * @param {string} params.domain - The frontend's hostname (e.g. request.headers.host).
 * @param {{name: string, email: string}} params.customer
 * @param {object} params.order - Order details (orderNumber, items, totals, shippingAddress, ...).
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendOrderConfirmationEmail({ domain, customer, order }) {
  try {
    validateInput({ domain, customer, order });

    const brand = getBrandConfig(domain);
    const html = await buildEmailHtml({ brand, customer, order });

    const result = await sendMail({
      domain: brand.domain,
      from: brand.from,
      fromName: brand.fromName,
      to: customer.email,
      replyTo: brand.replyTo,
      subject: `Your ${brand.name} order #${order.orderNumber} is confirmed`,
      html,
    });

    if (!result.success) {
      console.error(`[shared-email] Failed to send order confirmation for ${domain}:`, result.error);
    }

    return result;
  } catch (err) {
    console.error(`[shared-email] Error sending order confirmation for domain "${domain}":`, err.message);
    return { success: false, error: err.message };
  }
}

export { sendOrderConfirmationEmail };
export default sendOrderConfirmationEmail;
