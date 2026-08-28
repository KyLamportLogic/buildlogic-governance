/**
 * @kypython/buildlogic-security - Security utilities
 * 
 * Export all security modules from a single entry point
 */

export {
  rateLimit,
  createRateLimiter,
  RATE_LIMIT_ERRORS,
  checkRateLimit,
  checkUserRateLimit,
  resetUserRateLimitMemoryForTests,
  setUserRateLimitRedisForTests,
} from './rate-limit';
export { 
  validateRequest, 
  sanitizeInput,
  authSchemas, 
  apiSchemas,
  userSchemas,
  VALIDATION_ERRORS 
} from './validation';
export { securityHeaders, CSP_CONFIG, HSTS_CONFIG } from './headers';
export {
  sanitizeHtml,
  escapeHtml,
  preventXSS,
  detectSQLInjection,
  detectXSS,
  SECURITY_PATTERNS,
} from './sanitization';
export { sanitizeClaimCheckPayload, findSecretFieldViolations, assertNoSensitivePayloadFields } from './claim-check';
export { fingerprintContent, verifyContentFingerprint } from './content-integrity';
export { SecretString, isSecretString, redactSecretsDeep, secret } from './secret';
export type { ContentFingerprint } from './content-integrity';
export { extractApiKey, parseApiKeys, verifyApiKey, timingSafeEqualStr } from './api-key-auth';
export type { ApiKeyVerification } from './api-key-auth';

// Security middleware for Next.js
export { securityMiddleware, securityProfiles } from './middleware';

// Re-export types
export type {
  RateLimitConfig,
  RateLimitResult,
  UserRateLimitOptions,
  UserRateLimitResult,
} from './rate-limit';
export type { ValidationSchema, ValidationResult } from './validation';
export type { SecurityHeadersConfig } from './headers';
