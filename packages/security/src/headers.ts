/**
 * Security Headers Module
 * 
 * Provides CSP, HSTS, X-Frame-Options, and other security headers
 * for Next.js applications.
 * 
 * CSP configuration is dynamically built from environment variables:
 * - NEXT_PUBLIC_GA_MEASUREMENT_ID: Google Analytics
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry
 * - NEXT_PUBLIC_POSTHOG_KEY: PostHog
 * - NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID: New Relic
 * - NEXT_PUBLIC_CLARITY_PROJECT_ID: Microsoft Clarity
 */

import type { NextConfig } from 'next';

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  /** Content Security Policy */
  csp?: {
    'default-src'?: string[];
    'script-src'?: string[];
    'style-src'?: string[];
    'img-src'?: string[];
    'font-src'?: string[];
    'connect-src'?: string[];
    'frame-ancestors'?: string[];
    'base-uri'?: string[];
    'form-action'?: string[];
  };
  /** Strict Transport Security (HSTS) */
  hsts?: {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  /** X-Frame-Options */
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | string;
  /** X-Content-Type-Options */
  xContentTypeOptions?: boolean;
  /** X-XSS-Protection */
  xXSSProtection?: boolean;
  /** Referrer Policy */
  referrerPolicy?: string;
  /** Permissions Policy */
  permissionsPolicy?: Record<string, string[]>;
}

/**
 * Default Content Security Policy
 * 
 * Dynamically builds CSP based on environment variables.
 * Unused sources are omitted from the policy.
 */
export const CSP_CONFIG: Readonly<{
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'font-src': string[];
  'connect-src': string[];
  'frame-ancestors': string[];
  'base-uri': string[];
  'form-action': string[];
}> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"], // Next.js requires unsafe-inline for SSR
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", "data:", "https:", "blob:"],
  'font-src': ["'self'", "data:"],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/**
 * Build dynamic CSP configuration from environment variables
 */
function buildCSP(): Record<string, string[]> {
  const csp: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", "data:", "https:", "blob:"],
    'font-src': ["'self'", "data:"],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  // Google Analytics
  if (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) {
    csp['script-src']!.push('https://www.googletagmanager.com');
    csp['script-src']!.push('https://www.google-analytics.com');
  }

  // Sentry
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    csp['connect-src']!.push('https://*.sentry.io');
  }

  // PostHog
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    csp['connect-src']!.push(host);
  }

  // New Relic
  if (process.env.NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID) {
    csp['connect-src']!.push('https://*.newrelic.com');
  }

  // Microsoft Clarity
  if (process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID) {
    csp['connect-src']!.push('https://*.clarity.ms');
  }

  return csp;
}

/**
 * Default HSTS Configuration
 */
export const HSTS_CONFIG = {
  maxAge: 31536000, // 1 year
  includeSubDomains: true,
  preload: true,
} as const;

/**
 * Generate CSP header value (uses dynamic build from env vars)
 */
function generateCSP(csp?: Partial<Record<string, string[]>>): string {
  // Build CSP from environment variables
  const dynamicCSP = buildCSP();
  
  // Merge with any custom overrides
  const policy = { ...dynamicCSP };
  if (csp) {
    Object.entries(csp).forEach(([key, values]) => {
      if (values && values.length > 0) {
        policy[key] = [...(policy[key] || []), ...values];
      }
    });
  }
  
  return Object.entries(policy)
    .filter(([_, values]) => values && values.length > 0)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Security headers for Next.js
 */
export const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: generateCSP(),
  },
  {
    key: 'Strict-Transport-Security',
    value: `max-age=${HSTS_CONFIG.maxAge}; includeSubDomains${HSTS_CONFIG.includeSubDomains ? '; includeSubDomains' : ''}${HSTS_CONFIG.preload ? '; preload' : ''}`,
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none',
  },
  {
    key: 'Cross-Origin-Embedder-Policy',
    value: 'require-corp',
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
];

/**
 * Add security headers to Next.js config.
 * Merges with any existing `headers()` so app-specific headers (Document-Policy)
 * are preserved. Optional `extras.csp` appends to the shared CSP directives.
 */
export function withSecurityHeaders(
  config: NextConfig,
  extras?: { csp?: Partial<Record<string, string[]>> },
): NextConfig {
  const previousHeaders = config.headers;
  const headersList = extras?.csp
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

/**
 * Get security headers as object (for middleware)
 */
export function getSecurityHeaders(): Record<string, string> {
  return securityHeaders.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
}
