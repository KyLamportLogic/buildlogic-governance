/**
 * Redis-backed express-rate-limit store (v6 callback + v7 async).
 *
 * Replaces the default MemoryStore so IP limits stay fleet-safe across replicas.
 * Fail-closes in production the same way checkUserRateLimit does.
 */
'use strict';

const {
  checkUserRateLimit,
  memoryFallbackAllowed,
} = require('./user-rate-limit-runtime.js');

/**
 * @param {{ prefix?: string; windowMs?: number }} [opts]
 */
function createExpressRateLimitStore(opts = {}) {
  const prefix = opts.prefix || 'ip-rl';
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : 60_000;

  if (!memoryFallbackAllowed()) {
    const hasRedis =
      Boolean(process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.RATE_LIMIT_REDIS_URL) ||
      (Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN));
    if (!hasRedis) {
      throw new Error(
        'createExpressRateLimitStore: Redis/Upstash is required in production (MemoryStore is not fleet-safe). Set REDIS_URL or RATE_LIMIT_ALLOW_MEMORY=true.'
      );
    }
  }

  async function hit(key) {
    const result = await checkUserRateLimit(String(key), {
      windowMs,
      max: Number.MAX_SAFE_INTEGER,
      prefix,
    });
    return {
      totalHits: result.count,
      resetTime: new Date(result.resetAt),
    };
  }

  return {
    // express-rate-limit v7
    async increment(key) {
      return hit(key);
    },
    async decrement() {
      /* fixed-window stores do not decrement */
    },
    async resetKey() {
      /* no-op: windows expire via TTL */
    },
    // express-rate-limit v6
    incr(key, cb) {
      hit(key)
        .then((value) => cb(null, value.totalHits, value.resetTime))
        .catch((err) => cb(err));
    },
  };
}

module.exports = {
  createExpressRateLimitStore,
};
