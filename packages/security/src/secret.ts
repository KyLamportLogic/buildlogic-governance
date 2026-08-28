const REDACTED_SECRET = '[REDACTED_SECRET]';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SecretString {
  #value: string;

  constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('SecretString requires a non-empty string value.');
    }
    this.#value = value;
  }

  static from(value: string): SecretString {
    return new SecretString(value);
  }

  unwrap(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED_SECRET;
  }

  valueOf(): string {
    return REDACTED_SECRET;
  }

  toJSON(): never {
    throw new Error(
      'SecretString cannot be JSON serialized. Pass a reference identifier (claim-check pattern) instead of the raw secret value.'
    );
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return 'SecretString([REDACTED_SECRET])';
  }
}

export function secret(value: string): SecretString {
  return new SecretString(value);
}

export function isSecretString(value: unknown): value is SecretString {
  return value instanceof SecretString;
}

export function redactSecretsDeep<T>(input: T): T {
  const seen = new WeakMap<object, object>();

  function redact(value: unknown): unknown {
    if (value instanceof SecretString) {
      return REDACTED_SECRET;
    }

    if (Array.isArray(value)) {
      return value.map((item) => redact(item));
    }

    if (isPlainObject(value)) {
      if (seen.has(value)) {
        return seen.get(value);
      }

      const cloned: Record<string, unknown> = {};
      seen.set(value, cloned);

      for (const [key, nestedValue] of Object.entries(value)) {
        cloned[key] = redact(nestedValue);
      }

      return cloned;
    }

    return value;
  }

  return redact(input) as T;
}
