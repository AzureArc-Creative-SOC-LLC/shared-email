import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { escapeHtml, formatCurrency } from './format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Templates are static HTML files, cached in memory after first read so
// every send after the first doesn't re-hit the filesystem.
const templateCache = new Map();

async function loadTemplate(templateName) {
  if (templateCache.has(templateName)) return templateCache.get(templateName);

  const filePath = path.join(TEMPLATES_DIR, templateName);
  const html = await fs.readFile(filePath, 'utf-8');
  templateCache.set(templateName, html);
  return html;
}

/**
 * Renders the `<tr>` rows for the order items table. Product name is the only
 * free-text field here, so it's the only one that needs escaping — quantity
 * and price are coerced to numbers.
 */
function renderItemRows(items = [], currency) {
  return items
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const lineTotal = quantity * price;
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:center;">${quantity}</td>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(lineTotal, currency)}</td>
        </tr>`;
    })
    .join('');
}

/**
 * Replaces `__PLACEHOLDER__` tokens in the template with values from `data`.
 * Any token left in `data` as undefined is replaced with an empty string
 * rather than left in the output.
 *
 * Double-underscore (not `{{ }}`) is used deliberately: several placeholders
 * sit inside `style="..."` attributes, and editors/linters parse `style`
 * attribute contents as CSS. Curly braces are CSS block delimiters, so
 * `background-color:{{PRIMARY_COLOR}}` reads as malformed CSS to that parser.
 * Underscores are valid inside a CSS value token, so this avoids false
 * "syntax error" squiggles without changing what the template renders.
 */
function renderTemplate(template, data) {
  return template.replace(/__([A-Z0-9_]+)__/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export { loadTemplate, renderTemplate, renderItemRows };
