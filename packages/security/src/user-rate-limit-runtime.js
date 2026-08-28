/**
 * Distributed per-user / per-tenant fixed-window rate limit.
 *
 * Abstraction: one identity key → one usage record, found quickly.
 * Fleet-safe when Redis (TCP or Upstash REST) is configured; otherwise
 * process-local Map fallback (single-instance / local only). Production
 * fail-closes unless RATE_LIMIT_ALLOW_MEMORY=true (documented exception).
 *
 * Law: docs/quality/distributed-user-rate-limit.md
 */

'use strict';

/** @type {Map<string, { count: number; resetAt: number }>} */
const memoryStore = new Map();

/** @type {null | { eval: Function } | 'pending' | false} */
let redisOverride = null;
/** @type {any} */
let redisClient = null;
let redisInitAttempted = false;

const FIXED_WINDOW_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, window)
end
local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIRE', key, window)
  ttl = window
end
local allowed = 0
if count <= max then
  allowed = 1
end
local remaining = max - count
if remaining < 0 then
  remaining = 0
end
return { allowed, remaining, ttl, count }
`;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {string} key
 * @param {{ windowMs?: number; max?: number; prefix?: string }} [opts]
 */
function buildStorageKey(key, opts = {}) {
  if (!nonEmptyString(key)) {
    throw new Error('checkUserRateLimit: key is required (userId / tenantId)');
  }
  const prefix = nonEmptyString(opts.prefix) ? opts.prefix.trim() : 'user-rl';
  return `${prefix}:${key.trim()}`;
}

/**
 * @param {{ windowMs?: number; max?: number }} opts
 */
function normalizeWindow(opts) {
  const windowMs = Number(opts.windowMs ?? 60_000);
  const max = Number(opts.max ?? 20);
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('checkUserRateLimit: windowMs must be >= 1');
  }
  if (!Number.isFinite(max) || max < 1) {
    throw new Error('checkUserRateLimit: max must be >= 1');
  }
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  return { windowMs, windowSec, max };
}

/**
 * Production multi-replica deploys must not silently fall back to a process-local
 * Map (limit × replica_count). Fail-close when:
 *   - RATE_LIMIT_REQUIRE_REDIS=true, or
 *   - NODE_ENV=production and RATE_LIMIT_ALLOW_MEMORY is not "true"
 * Tests and local/dev keep the Map unless the require flag is set.
 */
function memoryFallbackAllowed() {
  if (String(process.env.RATE_LIMIT_REQUIRE_REDIS || '').toLowerCase() === 'true') {
    return false;
  }
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return String(process.env.RATE_LIMIT_ALLOW_MEMORY || '').toLowerCase() === 'true';
  }
  return true;
}

function resetUserRateLimitMemoryForTests() {
  memoryStore.clear();
}

function setUserRateLimitRedisForTests(client) {
  redisOverride = client;
  if (client === null) {
    redisClient = null;
    redisInitAttempted = false;
  }
}

/**
 * TCP Redis only (redis:// / rediss://). Never pass Upstash REST HTTPS to ioredis.
 * @returns {Promise<any|null>}
 */
async function getTcpRedis() {
  if (redisOverride !== null && redisOverride !== 'pending' && redisOverride !== false) {
    return redisOverride;
  }
  if (redisOverride === false) return null;
  if (redisClient) return redisClient;
  if (redisInitAttempted) return redisClient;

  redisInitAttempted = true;
  const url =
    process.env.REDIS_URL ||
    process.env.REDISCLOUD_URL ||
    process.env.RATE_LIMIT_REDIS_URL ||
    '';

  if (!nonEmptyString(url) || /^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const Redis = require('ioredis');
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      enableOfflineQueue: false,
    });
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

/**
 * @param {string} storageKey
 * @param {number} windowSec
 * @param {number} max
 */
async function tryUpstashRest(storageKey, windowSec, max) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!nonEmptyString(base) || !nonEmptyString(token)) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    const incrRes = await fetch(`${base.replace(/\/$/, '')}/incr/${encodeURIComponent(storageKey)}`, {
      method: 'POST',
      headers,
    });
    if (!incrRes.ok) return null;
    const incrJson = await incrRes.json();
    const count = Number(incrJson.result ?? incrJson);
    if (!Number.isFinite(count)) return null;

    if (count === 1) {
      await fetch(
        `${base.replace(/\/$/, '')}/expire/${encodeURIComponent(storageKey)}/${windowSec}`,
        { method: 'POST', headers }
      );
    }

    let ttl = windowSec;
    try {
      const ttlRes = await fetch(`${base.replace(/\/$/, '')}/ttl/${encodeURIComponent(storageKey)}`, {
        method: 'GET',
        headers,
      });
      if (ttlRes.ok) {
        const ttlJson = await ttlRes.json();
        const t = Number(ttlJson.result ?? ttlJson);
        if (Number.isFinite(t) && t > 0) ttl = t;
      }
    } catch {
      /* keep windowSec */
    }

    const allowed = count <= max;
    return {
      allowed,
      remaining: Math.max(0, max - count),
      resetAt: Date.now() + ttl * 1000,
      limit: max,
      count,
      backend: /** @type {'redis'} */ ('redis'),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} storageKey
 * @param {number} windowMs
 * @param {number} max
 */
function checkMemory(storageKey, windowMs, max) {
  const now = Date.now();
  const existing = memoryStore.get(storageKey);

  if (existing && existing.resetAt > now) {
    existing.count += 1;
    memoryStore.set(storageKey, existing);
    return {
      allowed: existing.count <= max,
      remaining: Math.max(0, max - existing.count),
      resetAt: existing.resetAt,
      limit: max,
      count: existing.count,
      backend: /** @type {'memory'} */ ('memory'),
    };
  }

  const resetAt = now + windowMs;
  memoryStore.set(storageKey, { count: 1, resetAt });
  return {
    allowed: true,
    remaining: Math.max(0, max - 1),
    resetAt,
    limit: max,
    count: 1,
    backend: /** @type {'memory'} */ ('memory'),
  };
}

/**
 * @param {string} key userId / tenantId / stable identity
 * @param {{ windowMs?: number; max?: number; prefix?: string }} [opts]
 * @returns {Promise<{
 *   allowed: boolean;
 *   remaining: number;
 *   resetAt: number;
 *   limit: number;
 *   count: number;
 *   backend: 'redis' | 'memory';
 * }>}
 */
async function checkUserRateLimit(key, opts = {}) {
  const storageKey = buildStorageKey(key, opts);
  const { windowMs, windowSec, max } = normalizeWindow(opts);

  const tcp = await getTcpRedis();
  if (tcp && typeof tcp.eval === 'function') {
    try {
      const result = await tcp.eval(FIXED_WINDOW_LUA, 1, storageKey, windowSec, max);
      const allowed = Number(result[0]) === 1;
      const remaining = Number(result[1]);
      const ttl = Number(result[2]);
      const count = Number(result[3]);
      return {
        allowed,
        remaining: Math.max(0, remaining),
        resetAt: Date.now() + Math.max(0, ttl) * 1000,
        limit: max,
        count,
        backend: 'redis',
      };
    } catch {
      /* fall through */
    }
  }

  const upstash = await tryUpstashRest(storageKey, windowSec, max);
  if (upstash) return upstash;

  if (!memoryFallbackAllowed()) {
    throw new Error(
      'checkUserRateLimit: shared Redis/Upstash store required (RATE_LIMIT_REQUIRE_REDIS or NODE_ENV=production). Process-local Map fallback is banned for multi-replica production. Set REDIS_URL / UPSTASH_REDIS_REST_* or RATE_LIMIT_ALLOW_MEMORY=true for a documented single-instance exception.'
    );
  }

  return checkMemory(storageKey, windowMs, max);
}

module.exports = {
  checkUserRateLimit,
  resetUserRateLimitMemoryForTests,
  setUserRateLimitRedisForTests,
  memoryFallbackAllowed,
  FIXED_WINDOW_LUA,
};
