/**
 * Edge rate-limit specification.
 *
 * Variables: identity key, fixed-window options, and injected Upstash client.
 * Partitions: memory fallback, successful SDK execution, invalid input, SDK failure.
 * Boundaries: first hit, exactly max, and max + 1.
 * Augmentation: distributed failure fails over without importing the Node/TCP runtime.
 */

import {
  checkUserRateLimit,
  resetUserRateLimitEdgeForTests,
  setUserRateLimitUpstashForTests,
} from '../user-rate-limit-edge';

describe('Edge checkUserRateLimit', () => {
  beforeEach(() => resetUserRateLimitEdgeForTests());
  afterEach(() => resetUserRateLimitEdgeForTests());

  test('validates the identity and numeric boundaries', async () => {
    await expect(checkUserRateLimit('')).rejects.toThrow(/key/i);
    await expect(checkUserRateLimit('user', { max: 0 })).rejects.toThrow(/max/i);
    await expect(checkUserRateLimit('user', { windowMs: 0 })).rejects.toThrow(/windowMs/i);
  });

  test('uses memory fallback and blocks max + 1', async () => {
    const options = { max: 2, windowMs: 60_000, prefix: 'edge' };
    const first = await checkUserRateLimit('user', options);
    const boundary = await checkUserRateLimit('user', options);
    const blocked = await checkUserRateLimit('user', options);

    expect(first).toMatchObject({ allowed: true, count: 1, remaining: 1, backend: 'memory' });
    expect(boundary).toMatchObject({ allowed: true, count: 2, remaining: 0 });
    expect(blocked).toMatchObject({ allowed: false, count: 3, remaining: 0 });
  });

  test('uses the official Upstash-compatible eval contract', async () => {
    const evalMock = jest.fn().mockResolvedValue([1, 3, 60, 1]);
    setUserRateLimitUpstashForTests({ eval: evalMock });

    const result = await checkUserRateLimit('sdk-user', {
      max: 4,
      windowMs: 60_000,
      prefix: 'agent',
    });

    expect(evalMock).toHaveBeenCalledWith(expect.any(String), ['agent:sdk-user'], ['60', '4']);
    expect(result).toMatchObject({ allowed: true, count: 1, remaining: 3, backend: 'redis' });
  });

  test('falls back to memory when the SDK client fails', async () => {
    setUserRateLimitUpstashForTests({ eval: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(checkUserRateLimit('fallback', { max: 1 })).resolves.toMatchObject({
      allowed: true,
      backend: 'memory',
    });
  });
});
