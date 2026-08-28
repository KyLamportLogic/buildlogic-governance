/**
 * Security Middleware Module
 * 
 * Comprehensive security middleware combining rate limiting,
 * headers, and request sanitization for Next.js applications.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSecurityHeaders } from './headers';
import { securityCheck, preventXSS } from './sanitization';
import { checkRateLimit } from './rate-limit';

/**
 * Security middleware configuration
 */
export interface SecurityMiddlewareConfig {
  /** Enable rate limiting */
  rateLimit?: {
    window: number;
    max: number;
  };
  /** Enable XSS protection */
  xssProtection?: boolean;
  /** Enable SQL injection protection */
  sqlInjectionProtection?: boolean;
  /** Custom rate limit key */
  rateLimitKey?: (request: NextRequest) => string;
}

/**
 * Default security middleware configuration
 */
const DEFAULT_CONFIG: SecurityMiddlewareConfig = {
  rateLimit: {
    window: 60,
    max: 100,
  },
  xssProtection: true,
  sqlInjectionProtection: true,
};

/**
 * Create security middleware
 */
export function securityMiddleware(config: SecurityMiddlewareConfig = DEFAULT_CONFIG) {
  const { rateLimit, xssProtection, sqlInjectionProtection, rateLimitKey } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return async function (request: NextRequest): Promise<NextResponse> {
    // 1. Rate Limiting
    if (rateLimit) {
      const key = rateLimitKey 
        ? rateLimitKey(request) 
        : `middleware:${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'}`;
      
      const result = await checkRateLimit(key, rateLimit.window, rateLimit.max);
      
      if (!result.success) {
        return NextResponse.json(
          { error: 'Too many requests', retryAfter: Math.ceil((result.reset - Date.now()) / 1000) },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(result.total),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(result.reset),
              'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
            },
          }
        );
      }
    }

    // 2. Request Body Sanitization (for POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      // Note: In Next.js middleware, we can't read the body directly
      // This would need to be handled in API route handlers
    }

    // 3. Add Security Headers
    const response = NextResponse.next();
    const headers = getSecurityHeaders();
    
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // 4. Check for malicious query parameters
    const url = new URL(request.url);
    const maliciousParams: string[] = [];
    
    url.searchParams.forEach((value, key) => {
      if (xssProtection && preventXSS(value) !== value) {
        maliciousParams.push(key);
      }
      if (sqlInjectionProtection && securityCheck(value).threats.includes('SQL_INJECTION')) {
        maliciousParams.push(key);
      }
    });

    if (maliciousParams.length > 0) {
      return NextResponse.json(
        { error: 'Malicious request detected', suspiciousParams: maliciousParams },
        { status: 400 }
      );
    }

    return response;
  };
}

/**
 * Pre-configured security middleware options
 */
export const securityProfiles = {
  /** Strict security (low limits) */
  strict: {
    rateLimit: { window: 60, max: 10 },
    xssProtection: true,
    sqlInjectionProtection: true,
  } as SecurityMiddlewareConfig,

  /** Standard security (balanced) */
  standard: {
    rateLimit: { window: 60, max: 100 },
    xssProtection: true,
    sqlInjectionProtection: true,
  } as SecurityMiddlewareConfig,

  /** API-focused security */
  api: {
    rateLimit: { window: 60, max: 200 },
    xssProtection: true,
    sqlInjectionProtection: true,
  } as SecurityMiddlewareConfig,
};
