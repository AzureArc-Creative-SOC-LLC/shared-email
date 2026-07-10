# shared-email

Centralized order confirmation email service used by every frontend domain
on this VPS. The order-creation backend never sends email — it only returns
the order response. Each frontend's own server-side API imports this module
and triggers the confirmation email itself, passing its domain so the right
brand/template/from-address is used.

## Deployment

This module lives outside every frontend/backend project, e.g.:

```
/var/www/shared-email/
    order-email.js
    brand-config.js
    helpers/
    templates/
        order-confirmation.html
    .env
```

Install once:

```bash
cd /var/www/shared-email
npm install
cp .env.example .env   # fill in RESEND_API_KEY and/or SMTP_* / EMAIL_USER / EMAIL_PASS
```

## Adding a new domain

Add an entry to [brand-config.js](brand-config.js) keyed by the bare hostname
(no protocol/www/port — `getBrandConfig` normalizes incoming domains before
lookup):

```js
'newbrand.com': {
  name: 'New Brand',
  from: 'orders@newbrand.com',
  fromName: 'New Brand',
  logo: 'https://newbrand.com/logos/newbrand.png',
  website: 'https://newbrand.com',
  primaryColor: '#111827',
  supportEmail: 'support@newbrand.com',
},
```

No other code changes are needed — the template and send logic are shared.

## Usage from a frontend

Each frontend's server-side API route imports the module directly (adjust
the relative path to wherever the frontend project sits relative to
`/var/www/shared-email`) and calls it after the backend confirms the order:

```js
// e.g. src/app/api/orders/route.js (Next.js) — after calling the order backend
import { sendOrderConfirmationEmail } from '../../../../../shared-email/order-email.js';

export async function POST(request) {
  const body = await request.json();

  // 1. Call the shared backend to create the order (unchanged).
  const orderRes = await fetch('https://api.internal/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const order = await orderRes.json();

  if (!orderRes.ok) {
    return Response.json(order, { status: orderRes.status });
  }

  // 2. This frontend triggers its own confirmation email.
  const emailResult = await sendOrderConfirmationEmail({
    domain: request.headers.get('host'),
    customer: { name: body.customer.name, email: body.customer.email },
    order,
  });

  if (!emailResult.success) {
    // Don't fail the order response over an email delivery issue — just log it.
    console.error('Order confirmation email failed:', emailResult.error);
  }

  return Response.json(order);
}
```

`sendOrderConfirmationEmail` never throws — it always resolves to
`{ success: true, messageId, provider }` or `{ success: false, error }`, so
callers can decide how to handle a failed send without extra try/catch.

## Order shape

```js
{
  orderNumber: 'ORD-10234',
  currency: 'USD',              // optional, defaults to USD
  createdAt: '2026-07-09T00:00:00Z', // optional, defaults to now
  items: [{ name: 'Widget', quantity: 2, price: 19.99 }],
  subtotal: 39.98,
  shipping: 5.00,
  tax: 3.20,
  discount: 0,                   // optional, omitted from email when 0
  total: 48.18,
  shippingAddress: '123 Main St, Springfield, IL 62704',
}
```
