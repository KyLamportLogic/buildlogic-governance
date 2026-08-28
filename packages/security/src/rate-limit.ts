/**
 * Rate Limiting — fixed-window counters + Next.js helpers.
 *
 * Fleet-safe identity limits: use checkUserRateLimit (Redis + Map fallback).
 * SSOT: docs/quality/distributed-user-rate-limit.md
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// CJS runtime — works from Jest (CJS), Next, and Express via package export.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const userRateLimitRuntime = require('./user-rate-limit-runtime.js') as {
  checkUserRateLimit: (
    key: string,
    opts?: { windowMs?: number; max?: number; prefix?: string }
  ) => Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    limit: number;
    count: number;
    backend: 'redis' | 'memory';
  }>;
  resetUserRateLimitMemoryForTests: () => void;
  setUserRateLimitRedisForTests: (client: unknown) => void;
};

export interface RateLimitConfig {
  /** Time window in seconds */
  window: number;
  /** Maximum requests per window */
  max: number;
  /** Custom key generator function */
  keyGenerator?: (request: NextRequest) => string;
  /** Redis URL (optional, uses env var if not provided) */
  redisUrl?: string;
  /** Custom message when rate limited */
  message?: string;
  /** Skip successful requests from count */
  skipSuccessfulRequests?: boolean;
  /** Skip failed requests from count */
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  total: number;
}

export interface UserRateLimitOptions {
  /** Window length in milliseconds (default 60000) */
  windowMs?: number;
  /** Max requests per window (default 20) */
  max?: number;
  /** Key prefix for namespacing (default user-rl) */
  prefix?: string;
}

export interface UserRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  count: number;
  backend: 'redis' | 'memory';
}

export const RATE_LIMIT_ERRORS = {
  REDIS_CONNECTION: 'Rate limiting unavailable - Redis connection failed',
  INVALID_CONFIG: 'Invalid rate limit configuration',
  MISSING_REQUEST: 'Request object is required',
} as const;

/**
 * One identity → one usage record (Redis when configured, else process Map).
 * Prefer this for AI agent / automation endpoints under multi-instance deploy.
 */
export async function checkUserRateLimit(
  key: string,
  opts: UserRateLimitOptions = {}
): Promise<UserRateLimitResult> {
  return userRateLimitRuntime.checkUserRateLimit(key, opts);
}

export function resetUserRateLimitMemoryForTests(): void {
  userRateLimitRuntime.resetUserRateLimitMemoryForTests();
}

export function setUserRateLimitRedisForTests(client: unknown): void {
  userRateLimitRuntime.setUserRateLimitRedisForTests(client);
}

/**
 * Legacy helper: window in seconds. Increments via checkUserRateLimit.
 */
export async function checkRateLimit(
  key: string,
  window: number,
  max: number
): Promise<RateLimitResult> {
  const result = await checkUserRateLimit(key, {
    windowMs: Math.max(1, window) * 1000,
    max,
    prefix: 'rate',
  });

  return {
    success: result.allowed,
    remaining: result.remaining,
    reset: result.resetAt,
    total: result.limit,
  };
}

function getClientKey(request: NextRequest, customKey?: string): string {
  if (customKey) return customKey;

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || 'unknown';

  const userId = request.headers.get('x-user-id');
  return userId ? userId : ip;
}

/**
 * Create a rate limiter middleware for Next.js API routes
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    window = 60,
    max = 100,
    keyGenerator,
    message = 'Too many requests. Please try again later.',
  } = config;

  if (window <= 0 || max <= 0) {
    throw new Error(RATE_LIMIT_ERRORS.INVALID_CONFIG);
  }

  return async function rateLimitMiddleware(
    request: NextRequest,
    handler: (request: NextRequest) => Promise<Response>
  ): Promise<Response> {
    const key = getClientKey(request, keyGenerator?.(request));
    const result = await checkUserRateLimit(key, {
      windowMs: window * 1000,
      max,
      prefix: 'next-rl',
    });

    if (!result.allowed) {
      return NextResponse.json(
        { error: message, retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const response = await handler(request);

    response.headers.set('X-RateLimit-Limit', String(result.limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(result.resetAt));

    return response;
  };
}

export const rateLimit = {
  strict: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({ window: 60, max: 10, ...config }),

  standard: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({ window: 60, max: 60, ...config }),

  lenient: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({ window: 60, max: 100, ...config }),

  auth: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({
      window: 60,
      max: 5,
      message: 'Too many authentication attempts. Please try again in 1 minute.',
      ...config,
    }),

  upload: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({ window: 3600, max: 10, ...config }),

  search: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({ window: 60, max: 30, ...config }),

  /** AI / agent endpoints: 20 requests per minute per identity */
  aiAgent: (config?: Partial<RateLimitConfig>) =>
    createRateLimiter({
      window: 60,
      max: 20,
      message: 'Too many AI requests. Please wait a moment before trying again.',
      ...config,
    }),
};

export function rateLimitDecorator(config: RateLimitConfig) {
  const limiter = createRateLimiter(config);

  return function <T extends (request: NextRequest) => Promise<Response>>(handler: T): T {
    return (async (request: NextRequest) => {
      return limiter(request, handler);
    }) as T;
  };
}
