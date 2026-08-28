/*
 * 📜 CODEBASE LAW: SYSTEMATIC SPECIFICATION-BASED TESTING
 *
 * Core Directive:
 * All AI Agents operating within this codebase must strictly adhere to a Test-Driven Development
 * (TDD) workflow based on systematic specification testing. Whenever you are tasked with creating
 * or modifying code, you must design and write the tests before writing the implementation.
 *
 * Global Standards Integration:
 * This testing protocol operates in conjunction with the broader software development standards
 * established in this codebase. Dynamically review and adhere to existing architectural patterns,
 * style guides, and operational rules. Auto-detect the active programming language and select the
 * standard, contextually appropriate testing framework.
 *
 * The Systematic Protocol — before writing code, generate a high-level testing strategy covering:
 *   Variables: Input parameters, output expectations, and their data types.
 *   Partitions & Boundaries: Valid/invalid partitions and exact boundary values (empty, null, limits).
 *   Test Case Derivation: Combine partitions and boundaries for a minimal, comprehensive test set.
 *   Augmentation: Edge cases based on common programming pitfalls.
 *
 * Implementation Order:
 *   1. Output the high-level summary of planned test cases.
 *   2. Write the automated test suite using the correct framework.
 *   3. Write the application code required to pass the tests.
 */
import { SecretString, isSecretString, redactSecretsDeep, secret } from '../secret';

describe('SecretString', () => {
  it('redacts string conversion', () => {
    const value = new SecretString('super-secret-value');

    expect(String(value)).toBe('[REDACTED_SECRET]');
    expect(value.valueOf()).toBe('[REDACTED_SECRET]');
  });

  it('throws during JSON serialization', () => {
    const payload = {
      task: 'login',
      secret: new SecretString('top-secret'),
    };

    expect(() => JSON.stringify(payload)).toThrow(
      'SecretString cannot be JSON serialized. Pass a reference identifier (claim-check pattern) instead of the raw secret value.'
    );
  });

  it('unwraps only through explicit method', () => {
    const value = secret('abc123');

    expect(value.unwrap()).toBe('abc123');
    expect(isSecretString(value)).toBe(true);
    expect(isSecretString('abc123')).toBe(false);
  });
});

describe('redactSecretsDeep', () => {
  it('replaces SecretString instances in nested data structures', () => {
    const input = {
      user: {
        id: 'u_123',
        totp: new SecretString('JBSWY3DPEHPK3PXP'),
      },
      jobs: [
        {
          task: 'login',
          credential: secret('sensitive-token'),
        },
      ],
    };

    const redacted = redactSecretsDeep(input);

    expect(redacted).toEqual({
      user: {
        id: 'u_123',
        totp: '[REDACTED_SECRET]',
      },
      jobs: [
        {
          task: 'login',
          credential: '[REDACTED_SECRET]',
        },
      ],
    });
  });
});
