// Per-domain branding for the shared order confirmation email service.
// Add one entry per frontend domain. Every field is required except `replyTo`
// and `supportEmail`, which fall back to `from` when omitted.

// change brand-config.js's from for Vora to the authenticated Gmail account

const BRANDS = {
  'zyrahealthcare.com': {
    name: 'Zyra Healthcare',
    from: 'orders@zyrahealthcare.com',
    fromName: 'Zyra Healthcare',
    logo: '',
    website: 'https://zyrahealthcare.com',
    primaryColor: '#052d83',
    supportEmail: 'support@zyrahealthcare.com',
  },
  'vyralabs.co': {
    name: 'Vyra Labs',
    from: 'orders@vyralabs.co',
    fromName: 'Vyra Labs',
    logo: '',
    website: 'https://vyralabs.co',
    primaryColor: '#181d4e',
    supportEmail: 'support@vyralabs.co',
  },
  'luxenlabs.shop': {
    name: 'Luxen',
    from: 'orders@luxenlabs.shop',
    fromName: 'Luxen',
    logo: '',
    website: 'https://luxenlabs.shop',
    primaryColor: '#111827',
    supportEmail: 'support@luxenlabs.shop',
  },
  'noverafitness.com': {
    name: 'Novera',
    from: 'orders@noverafitness.com',
    fromName: 'Novera',
    logo: '',
    website: 'https://noverafitness.com',
    primaryColor: '#0f766e',
    supportEmail: 'support@noverafitness.com',
  },
  'lumivexlabs.co': {
    name: 'Lumivex Labs',
    from: 'orders@lumivexlabs.co',
    fromName: 'Lumivex Labs',
    logo: '',
    website: '',
    primaryColor: '#2563eb',
    supportEmail: 'support@lumivexlabs.co',
  },
  'peptiqlabs.io': {
    name: 'Peptiq',
    from: 'orders@peptiqlabs.io',
    fromName: 'Peptiq',
    logo: '',
    website: 'https://peptiqlabs.io',
    primaryColor: '#be123c',
    supportEmail: 'support@peptiqlabs.io',
  },
  'vorahealthcare.com': {
    name: 'Vora Healthcare',
    from: 'orders@vorahealthcare.com',
    fromName: 'Vora Healthcare',
    logo: '',
    website: 'https://vorahealthcare.com',
    primaryColor: '#0f766e',
    supportEmail: 'support@vorahealthcare.com',
  },
  'jupyterlabs.net': {
    name: 'Jupyter Labs',
    from: 'orders@jupyterlabs.net',
    fromName: 'Jupyter Labs',
    logo: '',
    website: 'https://jupyterlabs.net',
    primaryColor: '#0f766e',
    supportEmail: 'support@jupyterlabs.net',
  },
    'liorahealthcare.com': {
    name: 'Liora healthcare',
    from: 'orders@liorahealthcare.com',
    fromName: 'Liora Healthcare',
    logo: '',
    website: 'https://liorahealthcare.com',
    primaryColor: '#080808',
    supportEmail: 'support@liorahealthcare.com',
  },
  'localhost': {
  name: 'luxen',
  from: 'orders@noverafitness.com',
  fromName: 'Novera',
  logo: '',
  website: 'https://noverafitness.com',
  primaryColor: '#0f766e',
  supportEmail: 'support@noverafitness.com',
},
};

/**
 * Strips protocol, "www.", port and path from a raw host string so lookups
 * are consistent regardless of how the domain was captured on the frontend
 * (e.g. `request.headers.host` includes the port in local/dev environments).
 */
function normalizeDomain(rawDomain) {
  if (!rawDomain || typeof rawDomain !== 'string') return '';
  return rawDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
}

/**
 * Resolves the brand configuration for a given domain.
 * Throws instead of silently falling back, so a missing/misspelled brand
 * entry surfaces as a loud failure rather than sending mis-branded email.
 */
function getBrandConfig(rawDomain) {
  const domain = normalizeDomain(rawDomain);

  if (!domain) {
    throw new Error('sendOrderConfirmationEmail: "domain" is required.');
  }

  const brand = BRANDS[domain];
  if (!brand) {
    throw new Error(`sendOrderConfirmationEmail: no brand config found for domain "${domain}".`);
  }

  return {
    ...brand,
    domain,
    replyTo: brand.replyTo || brand.from,
    supportEmail: brand.supportEmail || brand.from,
  };
}

export { BRANDS, normalizeDomain, getBrandConfig };
