/**
 * CommonJS entry for @kypython/buildlogic-security/headers - used by Next.js under
 * plain Node (e.g. Cloudflare/Vercel CI) where .ts cannot be required.
 * Keep behavior aligned with src/headers.ts (manual sync when changing headers).
 */

'use strict';

const HSTS_CONFIG = {
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true,
};

function buildCSP() {
  const csp = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  if (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) {
    csp['script-src'].push('https://www.googletagmanager.com');
    csp['script-src'].push('https://www.google-analytics.com');
  }
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    csp['connect-src'].push('https://*.sentry.io');
  }
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    csp['connect-src'].push(host);
  }
  if (process.env.NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID) {
    csp['connect-src'].push('https://*.newrelic.com');
  }
  if (process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID) {
    csp['connect-src'].push('https://*.clarity.ms');
  }

  return csp;
}

function generateCSP(csp) {
  const dynamicCSP = buildCSP();
  const policy = { ...dynamicCSP };
  if (csp) {
    Object.entries(csp).forEach(([key, values]) => {
      if (values && values.length > 0) {
        policy[key] = [...(policy[key] || []), ...values];
      }
    });
  }
  return Object.entries(policy)
    .filter(([, values]) => values && values.length > 0)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: generateCSP() },
  {
    key: 'Strict-Transport-Security',
    value: `max-age=${HSTS_CONFIG.maxAge}; includeSubDomains${
      HSTS_CONFIG.includeSubDomains ? '; includeSubDomains' : ''
    }${HSTS_CONFIG.preload ? '; preload' : ''}`,
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

function withSecurityHeaders(config, extras) {
  const previousHeaders = config.headers;
  const headersList = extras && extras.csp
    ? [
        { key: 'Content-Security-Policy', value: generateCSP(extras.csp) },
        ...securityHeaders.filter((h) => h.key !== 'Content-Security-Policy'),
      ]
    : securityHeaders;
  return {
    ...config,
    async headers() {
      const existing = previousHeaders
        ? await (typeof previousHeaders === 'function' ? previousHeaders() : previousHeaders)
        : [];
      return [
        {
          source: '/:path*',
          headers: headersList,
        },
        ...existing,
      ];
    },
  };
}

function getSecurityHeaders() {
  return securityHeaders.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});
}

module.exports = {
  withSecurityHeaders,
  getSecurityHeaders,
  securityHeaders,
};
