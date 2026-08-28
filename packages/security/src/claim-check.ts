const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|api[_-]?key|private[_-]?key|totp|otp|refresh[_-]?token|access[_-]?token|session[_-]?token|client[_-]?secret|authorization|auth[_-]?token|cookie)/i;
const REFERENCE_KEY_PATTERN = /(credential[_-]?id|secret[_-]?ref|vault[_-]?path|token[_-]?id|key[_-]?id)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeClaimCheckPayload<T>(input: T): T {
  const seen = new WeakMap<object, object>();

  function sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    if (seen.has(value)) {
      return seen.get(value);
    }

    const cloned: Record<string, unknown> = {};
    seen.set(value, cloned);

    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key) && !REFERENCE_KEY_PATTERN.test(key)) {
        continue;
      }
      cloned[key] = sanitize(nestedValue);
    }

    return cloned;
  }

  return sanitize(input) as T;
}

export function findSecretFieldViolations(input: unknown, allowList: string[] = []): string[] {
  const findings: string[] = [];
  const seen = new WeakSet<object>();
  const allow = new Set(allowList);

  function scan(value: unknown, path = ''): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}[${index}]`));
      return;
    }

    if (!isPlainObject(value)) {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    for (const [key, nestedValue] of Object.entries(value)) {
      const keyPath = path ? `${path}.${key}` : key;
      if (allow.has(keyPath)) {
        continue;
      }

      const suspiciousKey = SENSITIVE_KEY_PATTERN.test(key) && !REFERENCE_KEY_PATTERN.test(key);
      const hasMaterialValue = nestedValue !== undefined && nestedValue !== null && nestedValue !== '';

      if (suspiciousKey && hasMaterialValue) {
        findings.push(keyPath);
      }

      scan(nestedValue, keyPath);
    }
  }

  scan(input);
  return findings;
}

export function assertNoSensitivePayloadFields(input: unknown, context: string): void {
  const findings = findSecretFieldViolations(input);
  if (findings.length > 0) {
    throw new Error(
      `Rejected ${context}: secret-bearing fields are not allowed in outbound payloads (${findings.join(', ')}). Use claim-check references instead.`
    );
  }
}
