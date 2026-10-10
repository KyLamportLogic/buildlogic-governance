/** Host-neutral distributed identity rate limiting. */

// CJS runtime works in Node, Jest, Express, and Next.js consumers.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const userRateLimitRuntime = require('./user-rate-limit-runtime.js') as {
  checkUserRateLimit: (
    key: string,
    opts?: { windowMs?: number; max?: number; prefix?: string }
  ) => Promise<UserRateLimitResult>;
  resetUserRateLimitMemoryForTests: () => void;
  setUserRateLimitRedisForTests: (client: unknown) => void;
};

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  total: number;
}

export interface UserRateLimitOptions {
  /** Window length in milliseconds (default 60000). */
  windowMs?: number;
  /** Max requests per window (default 20). */
  max?: number;
  /** Key prefix for namespacing (default user-rl). */
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

/** One identity maps to one usage record in Redis, or memory for local/single-instance use. */
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

/** Legacy fixed-window helper whose window is expressed in seconds. */
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
