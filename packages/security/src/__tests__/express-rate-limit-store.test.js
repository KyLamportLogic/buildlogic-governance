'use strict';

const { createExpressRateLimitStore } = require('../express-rate-limit-store.js');
const {
  resetUserRateLimitMemoryForTests,
  setUserRateLimitRedisForTests,
} = require('../user-rate-limit-runtime.js');

describe('createExpressRateLimitStore', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetUserRateLimitMemoryForTests();
    setUserRateLimitRedisForTests(null);
    process.env.NODE_ENV = 'test';
    delete process.env.RATE_LIMIT_REQUIRE_REDIS;
    delete process.env.RATE_LIMIT_ALLOW_MEMORY;
  });

  afterEach(() => {
    resetUserRateLimitMemoryForTests();
    setUserRateLimitRedisForTests(null);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  test('v7 increment counts hits', async () => {
    const store = createExpressRateLimitStore({ prefix: 'test-ip', windowMs: 60_000 });
    const a = await store.increment('1.2.3.4');
    const b = await store.increment('1.2.3.4');
    expect(a.totalHits).toBe(1);
    expect(b.totalHits).toBe(2);
    expect(a.resetTime).toBeInstanceOf(Date);
  });

  test('v6 incr uses callback', (done) => {
    const store = createExpressRateLimitStore({ prefix: 'test-ip-v6', windowMs: 60_000 });
    store.incr('9.9.9.9', (err, hits, reset) => {
      expect(err).toBeNull();
      expect(hits).toBe(1);
      expect(reset).toBeInstanceOf(Date);
      done();
    });
  });

  test('throws in production without Redis', () => {
    process.env.NODE_ENV = 'production';
    setUserRateLimitRedisForTests(false);
    expect(() => createExpressRateLimitStore({ prefix: 'prod-ip' })).toThrow(
      /Redis\/Upstash is required/
    );
  });
});
