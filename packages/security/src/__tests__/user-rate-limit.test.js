/**
 * Spec: checkUserRateLimit — one user/tenant key → one usage record, fleet-safe when Redis is up.
 *
 * Test plan:
 * - Variables: key, windowMs, max, optional redis client
 * - Partitions: memory backend; redis backend; missing/empty key; window expiry
 * - Boundaries: max exactly, max+1 blocked; first hit creates window
 * - Augmentation: resetMemoryStoreForTests isolation; same key increments; different keys independent
 */

'use strict';

const {
  checkUserRateLimit,
  resetUserRateLimitMemoryForTests,
  setUserRateLimitRedisForTests,
} = require('../user-rate-limit-runtime.js');

describe('checkUserRateLimit (memory backend)', () => {
  beforeEach(() => {
    resetUserRateLimitMemoryForTests();
    setUserRateLimitRedisForTests(null);
  });

  afterEach(() => {
    resetUserRateLimitMemoryForTests();
    setUserRateLimitRedisForTests(null);
  });

  test('rejects empty key', async () => {
    await expect(
      checkUserRateLimit('', { windowMs: 60_000, max: 5 })
    ).rejects.toThrow(/key/i);
  });

  test('first hit allowed with remaining max-1', async () => {
    const r = await checkUserRateLimit('user-A', { windowMs: 60_000, max: 5, prefix: 'ai' });
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
    expect(r.remaining).toBe(4);
    expect(r.limit).toBe(5);
    expect(r.backend).toBe('memory');
  });

  test('increments same key and blocks after max', async () => {
    const key = 'user-C';
    const opts = { windowMs: 60_000, max: 2, prefix: 'ai' };

    const a = await checkUserRateLimit(key, opts);
    const b = await checkUserRateLimit(key, opts);
    const c = await checkUserRateLimit(key, opts);

    expect(a.allowed).toBe(true);
    expect(a.count).toBe(1);
    expect(b.allowed).toBe(true);
    expect(b.count).toBe(2);
    expect(c.allowed).toBe(false);
    expect(c.count).toBe(3);
    expect(c.remaining).toBe(0);
  });

  test('different keys stay independent', async () => {
    const opts = { windowMs: 60_000, max: 1, prefix: 'ai' };
    const a = await checkUserRateLimit('user-A', opts);
    const b = await checkUserRateLimit('user-B', opts);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
  });

  test('window expiry resets count', async () => {
    const opts = { windowMs: 50, max: 1, prefix: 'ai' };
    const first = await checkUserRateLimit('user-expire', opts);
    expect(first.allowed).toBe(true);
    const blocked = await checkUserRateLimit('user-expire', opts);
    expect(blocked.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 60));
    const after = await checkUserRateLimit('user-expire', opts);
    expect(after.allowed).toBe(true);
    expect(after.count).toBe(1);
  });
});

describe('checkUserRateLimit (production fail-close)', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRequire = process.env.RATE_LIMIT_REQUIRE_REDIS;
  const previousAllow = process.env.RATE_LIMIT_ALLOW_MEMORY;

  beforeEach(() => {
    resetUserRateLimitMemoryForTests();
    setUserRateLimitRedisForTests(false);
    delete process.env.RATE_LIMIT_ALLOW_MEMORY;
  });

  afterEach(() => {
    setUserRateLimitRedisForTests(null);
    resetUserRateLimitMemoryForTests();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRequire === undefined) delete process.env.RATE_LIMIT_REQUIRE_REDIS;
    else process.env.RATE_LIMIT_REQUIRE_REDIS = previousRequire;
    if (previousAllow === undefined) delete process.env.RATE_LIMIT_ALLOW_MEMORY;
    else process.env.RATE_LIMIT_ALLOW_MEMORY = previousAllow;
  });

  test('throws in production when Redis is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RATE_LIMIT_REQUIRE_REDIS;
    await expect(
      checkUserRateLimit('user-prod', { windowMs: 60_000, max: 5 })
    ).rejects.toThrow(/shared Redis\/Upstash store required/i);
  });

  test('throws when RATE_LIMIT_REQUIRE_REDIS=true even outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_REQUIRE_REDIS = 'true';
    await expect(
      checkUserRateLimit('user-require', { windowMs: 60_000, max: 5 })
    ).rejects.toThrow(/shared Redis\/Upstash store required/i);
  });

  test('allows Map fallback in production only with RATE_LIMIT_ALLOW_MEMORY=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_ALLOW_MEMORY = 'true';
    const r = await checkUserRateLimit('user-exception', { windowMs: 60_000, max: 5 });
    expect(r.backend).toBe('memory');
    expect(r.allowed).toBe(true);
  });
});

describe('checkUserRateLimit (redis mock backend)', () => {
  beforeEach(() => {
    resetUserRateLimitMemoryForTests();
  });

  afterEach(() => {
    setUserRateLimitRedisForTests(null);
    resetUserRateLimitMemoryForTests();
  });

  test('uses redis INCR path when client provided', async () => {
    const store = new Map();
    const redis = {
      async eval(_script, _numKeys, key, windowSec, max) {
        const prev = store.get(key) || { count: 0, ttl: Number(windowSec) };
        prev.count += 1;
        if (prev.count === 1) prev.ttl = Number(windowSec);
        store.set(key, prev);
        const allowed = prev.count <= Number(max) ? 1 : 0;
        const remaining = Math.max(0, Number(max) - prev.count);
        return [allowed, remaining, prev.ttl, prev.count];
      },
    };
    setUserRateLimitRedisForTests(redis);

    const opts = { windowMs: 60_000, max: 2, prefix: 'ai' };
    const a = await checkUserRateLimit('user-redis', opts);
    const b = await checkUserRateLimit('user-redis', opts);
    const c = await checkUserRateLimit('user-redis', opts);

    expect(a.backend).toBe('redis');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(c.count).toBe(3);
  });
});
