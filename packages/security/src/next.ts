/** Next.js-only adapters. Importing the package root does not load Next.js. */

export {
  createRateLimiter,
  rateLimit,
  rateLimitDecorator,
} from './rate-limit';
export type { RateLimitConfig } from './rate-limit';
export { securityMiddleware, securityProfiles } from './middleware';
export type { SecurityMiddlewareConfig } from './middleware';
export {
  CSP_CONFIG,
  HSTS_CONFIG,
  getSecurityHeaders,
  securityHeaders,
  withSecurityHeaders,
} from './headers';
export type { SecurityHeadersConfig } from './headers';
