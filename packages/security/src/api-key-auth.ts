/**
 * Shared API-key authentication for HTTP routes (Node and edge runtimes).
 *
 * Fail-close by design: a service with no configured keys refuses every
 * caller with 503 instead of silently running open. The verified keyId is a
 * non-reversible fingerprint suitable as a rate-limit identity, replacing
 * spoofable client-supplied headers like x-user-id.
 *
 * Edge-compatible: no node:crypto — usable from Next.js edge routes.
 */

export interface ApiKeyVerification {
  ok: boolean;
  status: 200 | 401 | 503;
  reason: 'ok' | 'not-configured' | 'missing-key' | 'invalid-key';
  /** Non-reversible identity for the matched key (rate-limit safe). */
  keyId?: string;
}

/** Parse a comma-separated key list: trim, drop blanks, dedupe. */
export function parseApiKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const key = part.trim();
    if (key) seen.add(key);
  }
  return [...seen];
}

/**
 * Constant-time string comparison. Always walks the longer input so the
 * comparison time does not reveal the match prefix length.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** FNV-1a 32-bit — non-reversible fingerprint, not a password hash. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Extract the caller's key: `x-api-key` first, then `Authorization: Bearer`. */
export function extractApiKey(headers: { get(name: string): string | null }): string | null {
  const direct = headers.get('x-api-key')?.trim();
  if (direct) return direct;
  const authorization = headers.get('authorization')?.trim();
  if (authorization && /^bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^bearer\s+/i, '').trim();
    if (token) return token;
  }
  return null;
}

/**
 * Verify a provided key against the configured comma-separated key list.
 * Compares against every configured key (no early exit) so timing does not
 * reveal which key position matched.
 */
export function verifyApiKey(
  providedKey: string | null | undefined,
  configuredKeys: string | null | undefined
): ApiKeyVerification {
  const keys = parseApiKeys(configuredKeys);
  if (keys.length === 0) {
    return { ok: false, status: 503, reason: 'not-configured' };
  }
  if (!providedKey) {
    return { ok: false, status: 401, reason: 'missing-key' };
  }
  let matched: string | null = null;
  for (const key of keys) {
    if (timingSafeEqualStr(providedKey, key)) matched = key;
  }
  if (matched === null) {
    return { ok: false, status: 401, reason: 'invalid-key' };
  }
  return { ok: true, status: 200, reason: 'ok', keyId: `apikey-${fingerprint(matched)}` };
}
