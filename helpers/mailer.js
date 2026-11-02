import nodemailer from 'nodemailer';

// Provider-agnostic mail transport: tries Resend (HTTP API) first, then
// falls back to SMTP via nodemailer if Resend isn't configured or fails.
// Credentials are read from process.env (see .env.example).
//
// SMTP supports an optional per-domain override, e.g. for jupyterlabs.net:
//   SMTP_HOST_JUPYTERLABS_NET / SMTP_PORT_JUPYTERLABS_NET /
//   SMTP_SECURE_JUPYTERLABS_NET / SMTP_USER_JUPYTERLABS_NET / SMTP_PASS_JUPYTERLABS_NET
// A domain without its own mailbox configured falls back to the shared
// SMTP_HOST / EMAIL_USER / EMAIL_PASS. This matters because SMTP providers
// (Gmail included) require the authenticated account to match (or be a
// verified alias of) the "From" address — a single shared mailbox can't
// legitimately send as a dozen different brand domains.

const env = (name, fallback = '') => {
  const value = process.env[name];
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
};

/** Turns "jupyterlabs.net" into "JUPYTERLABS_NET" for env var lookups. */
function domainEnvKey(domain) {
  return String(domain || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

// Per-domain SMTP only. There is deliberately no shared-mailbox fallback: a
// single Gmail account rewrites "From" to itself, which exposed the shared
// sender address on every brand's emails.
function resolveSmtpConfig(domain) {
  const key = domainEnvKey(domain);
  return {
    host: env(`SMTP_HOST_${key}`, env('SMTP_HOST', 'smtp.gmail.com')),
    port: Number(env(`SMTP_PORT_${key}`, env('SMTP_PORT', '587'))),
    secure: env(`SMTP_SECURE_${key}`, env('SMTP_SECURE', 'false')) === 'true',
    user: env(`SMTP_USER_${key}`),
    pass: env(`SMTP_PASS_${key}`),
  };
}

// ── TurboSMTP (same TURBOSMTP_{n}_* env vars as user-order-service) ──────────
const TURBOSMTP_MAX_ACCOUNTS = 3;

function turboSmtpAccount(n) {
  const user = env(`TURBOSMTP_${n}_USER`).trim();
  const pass = env(`TURBOSMTP_${n}_PASS`).trim();
  if (!user || !pass) return null;
  const domains = env(`TURBOSMTP_${n}_DOMAINS`)
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean);
  return {
    n, user, pass, domains,
    host: env('TURBOSMTP_HOST', 'pro.turbo-smtp.com').trim(),
    port: Number(env('TURBOSMTP_PORT', '587')) || 587,
  };
}

/** The TurboSMTP account housing `domain`, the fallback account, or null. */
function resolveTurboSmtpAccount(domain) {
  const d = String(domain || '').trim().toLowerCase().replace(/^www\./, '');
  const accounts = [];
  for (let n = 1; n <= TURBOSMTP_MAX_ACCOUNTS; n++) {
    const account = turboSmtpAccount(n);
    if (account) accounts.push(account);
  }
  const hit = d && accounts.find((a) => a.domains.includes(d));
  if (hit) return hit;
  const fallback = Number(env('TURBOSMTP_FALLBACK_ACCOUNT'));
  return accounts.find((a) => a.n === fallback) || null;
}

const turboTransporters = new Map();
function getTurboTransporter(account) {
  const key = `${account.n}:${account.host}:${account.port}:${account.user}`;
  if (!turboTransporters.has(key)) {
    turboTransporters.set(key, nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.port === 465,
      auth: { user: account.user, pass: account.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    }));
  }
  return turboTransporters.get(key);
}

async function sendViaTurboSmtp({ domain, from, fromName, to, replyTo, subject, html }) {
  const account = resolveTurboSmtpAccount(domain);
  if (!account) return { success: false, error: `No TurboSMTP account configured for "${domain}"` };

  try {
    const info = await getTurboTransporter(account).sendMail({
      from: `${fromName} <${from}>`,
      to,
      replyTo,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId, provider: `turbosmtp:${account.n}` };
  } catch (err) {
    return { success: false, error: err?.response || err.message };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// This account's Resend API key is shared with an unrelated project (Nexus
// Blue HR), which sends against the same 2-req/sec limit. A single retry
// after the 1s rate-limit window clears most collisions with that traffic.
const RESEND_RATE_LIMIT_RETRIES = 2;

async function sendViaResend({ from, fromName, to, replyTo, subject, html }) {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

  const body = JSON.stringify({
    from: `${fromName} <${from}>`,
    to: [to],
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  let res, data;
  for (let attempt = 0; attempt <= RESEND_RATE_LIMIT_RETRIES; attempt++) {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (res.status !== 429 || attempt === RESEND_RATE_LIMIT_RETRIES) break;

    const retryAfterSeconds = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 1100);
  }

  data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data?.message || `Resend send failed (${res.status})`, details: data };
  }

  return { success: true, messageId: data?.id, provider: 'resend' };
}

// One transporter per resolved (host, user) pair — domains sharing the
// fallback mailbox share a transporter; domains with their own mailbox get
// their own, cached by domain key so repeated sends don't reconnect.
const smtpTransporters = new Map();
function getSmtpTransporter(domain) {
  const key = domainEnvKey(domain);
  if (smtpTransporters.has(key)) return smtpTransporters.get(key);

  const config = resolveSmtpConfig(domain);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  smtpTransporters.set(key, transporter);
  return transporter;
}

async function sendViaSmtp({ domain, from, fromName, to, replyTo, subject, html }) {
  const { user, pass } = resolveSmtpConfig(domain);
  if (!user || !pass) return { success: false, error: `SMTP credentials not configured for "${domain}"` };

  try {
    const info = await getSmtpTransporter(domain).sendMail({
      from: `${fromName} <${from}>`,
      to,
      replyTo,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId, provider: 'smtp' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sends an email through the brand's own TurboSMTP account (same routing as
 * the newsletter / branded emails), then Resend, then a per-domain SMTP
 * mailbox if one is configured. Never uses a shared mailbox.
 * Returns a normalized { success, messageId?, provider?, error? } result —
 * callers should not need to know which provider actually delivered it.
 */
async function sendMail({ domain, from, fromName, to, replyTo, subject, html }) {
  const turboResult = await sendViaTurboSmtp({ domain, from, fromName, to, replyTo, subject, html });
  if (turboResult.success) return turboResult;

  const resendResult = await sendViaResend({ from, fromName, to, replyTo, subject, html });
  if (resendResult.success) return resendResult;

  const smtpResult = await sendViaSmtp({ domain, from, fromName, to, replyTo, subject, html });
  if (smtpResult.success) return smtpResult;

  return {
    success: false,
    error: `All providers failed. TurboSMTP: ${turboResult.error}. Resend: ${resendResult.error}. SMTP: ${smtpResult.error}`,
  };
}

export { sendMail };
