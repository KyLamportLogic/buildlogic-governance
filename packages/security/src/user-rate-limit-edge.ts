/** Edge-safe distributed identity rate limiting. No Node/TCP dependencies. */
import { Redis } from '@upstash/redis';

export interface UserRateLimitOptions {
  windowMs?: number;
  max?: number;
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

interface UpstashEvalClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();
let upstashOverride: UpstashEvalClient | null | undefined;
let upstashClient: UpstashEvalClient | null | undefined;

const FIXED_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local remaining = tonumber(ARGV[2]) - count
if remaining < 0 then remaining = 0 end
return {count <= tonumber(ARGV[2]) and 1 or 0, remaining, ttl, count}
`;

function normalized(key: string, options: UserRateLimitOptions) {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('checkUserRateLimit: key is required (userId / tenantId)');
  }
  const windowMs = Number(options.windowMs ?? 60_000);
  const max = Number(options.max ?? 20);
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('checkUserRateLimit: windowMs must be >= 1');
  }
  if (!Number.isFinite(max) || max < 1) {
    throw new Error('checkUserRateLimit: max must be >= 1');
  }
  const prefix = typeof options.prefix === 'string' && options.prefix.trim()
    ? options.prefix.trim()
    : 'user-rl';
  return {
    storageKey: `${prefix}:${key.trim()}`,
    windowMs,
    windowSec: Math.max(1, Math.ceil(windowMs / 1000)),
    max,
  };
}

function getUpstash(): UpstashEvalClient | null {
  if (upstashOverride !== undefined) return upstashOverride;
  if (upstashClient !== undefined) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  upstashClient = url && token ? new Redis({ url, token }) : null;
  return upstashClient;
}

function memoryResult(storageKey: string, windowMs: number, max: number): UserRateLimitResult {
  const now = Date.now();
  const current = memoryStore.get(storageKey);
  const record = current && current.resetAt > now
    ? { count: current.count + 1, resetAt: current.resetAt }
    : { count: 1, resetAt: now + windowMs };
  memoryStore.set(storageKey, record);
  return {
    allowed: record.count <= max,
    remaining: Math.max(0, max - record.count),
    resetAt: record.resetAt,
    limit: max,
    count: record.count,
    backend: 'memory',
  };
}

export async function checkUserRateLimit(
  key: string,
  options: UserRateLimitOptions = {},
): Promise<UserRateLimitResult> {
  const { storageKey, windowMs, windowSec, max } = normalized(key, options);
  const redis = getUpstash();
  if (redis) {
    try {
      const raw = await redis.eval(FIXED_WINDOW_LUA, [storageKey], [String(windowSec), String(max)]);
      const [allowed, remaining, ttl, count] = raw as Array<number | string>;
      return {
        allowed: Number(allowed) === 1,
        remaining: Math.max(0, Number(remaining)),
        resetAt: Date.now() + Math.max(0, Number(ttl)) * 1000,
        limit: max,
        count: Number(count),
        backend: 'redis',
      };
    } catch {
      // Single-instance/dev fallback; production config should keep Upstash available.
    }
  }
  return memoryResult(storageKey, windowMs, max);
}

export function setUserRateLimitUpstashForTests(client: UpstashEvalClient | null): void {
  upstashOverride = client;
}

export function resetUserRateLimitEdgeForTests(): void {
  memoryStore.clear();
  upstashOverride = undefined;
  upstashClient = undefined;
}

