/**
 * Test plan (TDD):
 * 1. No vault configured + env var set + fallback allowed (default) → ok, source=env-fallback, warning present
 * 2. No vault configured + env var unset → ok=false, reason mentions not found
 * 3. No vault configured + env var set + ALLOW_ENV_SECRET_FALLBACK=false → ok=false, fail-close, reason never contains the raw value
 * 4. Vault configured (mocked) → ok, source=jit-vault, mock called with projectId/environment/secretName; env var (even if set) is not preferred
 * 5. Vault configured but mock throws + fallback allowed + env var set → falls back to env-fallback (resilience)
 * 6. Vault configured but mock throws + fallback disabled → ok=false, fail-close, does not throw
 * 7. Caching: two resolves in a row hit the mocked vault client only once
 * 8. revokeSecret() clears the cache, forcing a refetch
 * 9. redacted never equals/contains the full raw value for values > 4 chars
 */

import {
  resolveSecret,
  revokeSecret,
  __setSecretsClientFactoryForTesting,
  __resetSecretsClientFactory,
  __clearSecretsCacheForTesting,
} from "./secrets-jit";

const ENV_KEYS = [
  "INFISICAL_TOKEN",
  "INFISICAL_PROJECT_ID",
  "INFISICAL_ENVIRONMENT",
  "ALLOW_ENV_SECRET_FALLBACK",
  "TEST_SECRET_NAME",
] as const;

describe("resolveSecret", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) prev[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
    __clearSecretsCacheForTesting();
  });

  afterEach(() => {
    __resetSecretsClientFactory();
    __clearSecretsCacheForTesting();
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  test("falls back to env var when no vault configured", async () => {
    process.env.TEST_SECRET_NAME = "super-secret-value";
    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.ok).toBe(true);
    expect(result.value).toBe("super-secret-value");
    expect(result.source).toBe("env-fallback");
    expect(result.warning).toMatch(/long-lived/i);
  });

  test("fails closed (with reason) when nothing is configured", async () => {
    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  test("fails closed when env fallback is explicitly disabled", async () => {
    process.env.TEST_SECRET_NAME = "super-secret-value";
    process.env.ALLOW_ENV_SECRET_FALLBACK = "false";
    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).not.toContain("super-secret-value");
  });

  test("prefers the JIT vault over env when both are available", async () => {
    process.env.INFISICAL_TOKEN = "tok";
    process.env.INFISICAL_PROJECT_ID = "proj_123";
    process.env.TEST_SECRET_NAME = "env-value-should-not-win";
    const getSecret = jest.fn().mockResolvedValue({ secretValue: "vault-value" });
    __setSecretsClientFactoryForTesting(() => ({
      secrets: () => ({ getSecret }),
    }));

    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.ok).toBe(true);
    expect(result.value).toBe("vault-value");
    expect(result.source).toBe("jit-vault");
    expect(getSecret).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj_123", secretName: "TEST_SECRET_NAME" })
    );
  });

  test("falls back to env when the vault call throws and fallback is allowed", async () => {
    process.env.INFISICAL_TOKEN = "tok";
    process.env.INFISICAL_PROJECT_ID = "proj_123";
    process.env.TEST_SECRET_NAME = "env-rescue-value";
    __setSecretsClientFactoryForTesting(() => ({
      secrets: () => ({
        getSecret: async () => {
          throw new Error("vault unreachable");
        },
      }),
    }));

    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("env-fallback");
    expect(result.value).toBe("env-rescue-value");
  });

  test("fails closed when the vault throws and fallback is disabled", async () => {
    process.env.INFISICAL_TOKEN = "tok";
    process.env.INFISICAL_PROJECT_ID = "proj_123";
    process.env.TEST_SECRET_NAME = "should-not-be-used";
    process.env.ALLOW_ENV_SECRET_FALLBACK = "false";
    __setSecretsClientFactoryForTesting(() => ({
      secrets: () => ({
        getSecret: async () => {
          throw new Error("vault unreachable");
        },
      }),
    }));

    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/fail-close/i);
  });

  test("caches JIT vault reads so repeated resolves don't refetch", async () => {
    process.env.INFISICAL_TOKEN = "tok";
    process.env.INFISICAL_PROJECT_ID = "proj_123";
    const getSecret = jest.fn().mockResolvedValue({ secretValue: "vault-value" });
    __setSecretsClientFactoryForTesting(() => ({
      secrets: () => ({ getSecret }),
    }));

    await resolveSecret("TEST_SECRET_NAME");
    await resolveSecret("TEST_SECRET_NAME");
    expect(getSecret).toHaveBeenCalledTimes(1);
  });

  test("revokeSecret forces a refetch on the next resolve", async () => {
    process.env.INFISICAL_TOKEN = "tok";
    process.env.INFISICAL_PROJECT_ID = "proj_123";
    const getSecret = jest.fn().mockResolvedValue({ secretValue: "vault-value" });
    __setSecretsClientFactoryForTesting(() => ({
      secrets: () => ({ getSecret }),
    }));

    await resolveSecret("TEST_SECRET_NAME");
    revokeSecret("TEST_SECRET_NAME");
    await resolveSecret("TEST_SECRET_NAME");
    expect(getSecret).toHaveBeenCalledTimes(2);
  });

  test("redacted value never exposes the raw secret", async () => {
    process.env.TEST_SECRET_NAME = "abcdefghijklmnop";
    const result = await resolveSecret("TEST_SECRET_NAME");
    expect(result.redacted).toBeDefined();
    expect(result.redacted).not.toBe(result.value);
    expect(result.redacted).not.toContain("cdefghijklmn");
  });
});
