/**
 * API-key auth specification.
 *
 * Variables: configured key list (comma-separated env string), provided key
 * (request header), outputs { ok, status, reason, keyId }.
 * Partitions: unconfigured service, missing key, invalid key, valid key,
 * multi-key rotation.
 * Boundaries: empty/blank config, empty provided key, one key, duplicate keys.
 * Augmentation: header extraction precedence (x-api-key over Bearer),
 * constant-time comparison with unequal lengths, keyId never leaks the key.
 */

import {
  extractApiKey,
  parseApiKeys,
  timingSafeEqualStr,
  verifyApiKey,
} from '../api-key-auth';

function headersOf(entries: Record<string, string>): { get(name: string): string | null } {
  const lower = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

describe('parseApiKeys', () => {
  test('undefined, null, empty, and blank configs yield no keys', () => {
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys(null)).toEqual([]);
    expect(parseApiKeys('')).toEqual([]);
    expect(parseApiKeys('  ,  , ')).toEqual([]);
  });

  test('splits on commas, trims whitespace, and dedupes', () => {
    expect(parseApiKeys(' alpha , beta,alpha ')).toEqual(['alpha', 'beta']);
  });

  test('a single key parses to one entry', () => {
    expect(parseApiKeys('only-key')).toEqual(['only-key']);
  });
});

describe('timingSafeEqualStr', () => {
  test('equal strings compare true', () => {
    expect(timingSafeEqualStr('secret-1', 'secret-1')).toBe(true);
  });

  test('different content of the same length compares false', () => {
    expect(timingSafeEqualStr('secret-1', 'secret-2')).toBe(false);
  });

  test('different lengths compare false', () => {
    expect(timingSafeEqualStr('short', 'a-much-longer-value')).toBe(false);
    expect(timingSafeEqualStr('a-much-longer-value', 'short')).toBe(false);
  });
});

describe('extractApiKey', () => {
  test('reads x-api-key first', () => {
    const headers = headersOf({ 'x-api-key': ' k1 ', authorization: 'Bearer k2' });
    expect(extractApiKey(headers)).toBe('k1');
  });

  test('falls back to Authorization: Bearer', () => {
    expect(extractApiKey(headersOf({ authorization: 'Bearer tok-9' }))).toBe('tok-9');
    expect(extractApiKey(headersOf({ authorization: 'bearer tok-9' }))).toBe('tok-9');
  });

  test('non-bearer Authorization and absent headers yield null', () => {
    expect(extractApiKey(headersOf({ authorization: 'Basic Zm9v' }))).toBeNull();
    expect(extractApiKey(headersOf({}))).toBeNull();
    expect(extractApiKey(headersOf({ authorization: 'Bearer   ' }))).toBeNull();
  });
});

describe('verifyApiKey', () => {
  test('FAIL-CLOSE: unconfigured service refuses every caller with 503', () => {
    for (const config of [undefined, null, '', '  ,  ']) {
      const result = verifyApiKey('any-key', config);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      expect(result.reason).toBe('not-configured');
    }
  });

  test('missing key is rejected with 401', () => {
    const result = verifyApiKey(null, 'real-key');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.reason).toBe('missing-key');
  });

  test('invalid key is rejected with 401', () => {
    const result = verifyApiKey('wrong-key', 'real-key');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.reason).toBe('invalid-key');
  });

  test('valid key is accepted with a stable keyId', () => {
    const first = verifyApiKey('real-key', 'real-key');
    const second = verifyApiKey('real-key', 'real-key');
    expect(first.ok).toBe(true);
    expect(first.status).toBe(200);
    expect(first.keyId).toBeDefined();
    expect(first.keyId).toBe(second.keyId);
  });

  test('rotation: each configured key matches and gets a distinct keyId', () => {
    const a = verifyApiKey('key-a', 'key-a,key-b');
    const b = verifyApiKey('key-b', 'key-a,key-b');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.keyId).not.toBe(b.keyId);
  });

  test('keyId never contains the raw key material', () => {
    const result = verifyApiKey('super-secret-key-value', 'super-secret-key-value');
    expect(result.keyId).not.toContain('super-secret-key-value');
  });
});
