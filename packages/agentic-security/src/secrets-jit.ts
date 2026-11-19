/**
 * JIT secrets resolution — Infisical SDK wrapper with a legible env fallback.
 *
 * §3B of the Agentic Security Defense Architecture: "Never inject long-lived
 * API tokens as plaintext environment variables... Use a secrets manager
 * with JIT access." Call sites use resolveSecret() instead of process.env
 * directly, so:
 *   - which source served the value is always recorded (`source`), never silent
 *   - the raw value never appears in a thrown error or reason string
 *   - migrating a given secret onto the vault is a config change (set
 *     INFISICAL_TOKEN + INFISICAL_PROJECT_ID), not a call-site rewrite
 *
 * Activate JIT mode with INFISICAL_TOKEN + INFISICAL_PROJECT_ID (+ optional
 * INFISICAL_ENVIRONMENT, default "prod"). Until then — or if the vault call
 * fails — this falls back to reading the named process.env var, which is
 * today's actual state for most secrets in this repo. Set
 * ALLOW_ENV_SECRET_FALLBACK=false to fail-close instead once a secret has
 * been migrated onto the vault.
 */

import type { SecretResolution, SecretSource } from "./types";

export interface InfisicalClientLike {
  secrets(): {
    getSecret(opts: {
      environment: string;
      projectId: string;
      secretName: string;
    }): Promise<{ secretValue?: string } | undefined>;
  };
}

type ClientFactory = () => InfisicalClientLike;

let clientFactoryOverride: ClientFactory | null = null;
let cachedClient: InfisicalClientLike | null = null;

/** Only JIT-vault reads are cached — env reads are already free and must stay live. */
const vaultCache = new Map<string, { value: string; expiresAt: number }>();

/** Test seam — inject a mock Infisical client. */
export function __setSecretsClientFactoryForTesting(factory: ClientFactory): void {
  clientFactoryOverride = factory;
  cachedClient = null;
}

export function __resetSecretsClientFactory(): void {
  clientFactoryOverride = null;
  cachedClient = null;
}

export function __clearSecretsCacheForTesting(): void {
  vaultCache.clear();
}

function isVaultConfigured(): boolean {
  return Boolean(
    process.env.INFISICAL_TOKEN?.trim() && process.env.INFISICAL_PROJECT_ID?.trim()
  );
}

function isEnvFallbackAllowed(): boolean {
  return String(process.env.ALLOW_ENV_SECRET_FALLBACK ?? "true").toLowerCase() !== "false";
}

function redact(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

async function createDefaultClient(): Promise<InfisicalClientLike> {
  const { InfisicalSDK } = await import("@infisical/sdk");
  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || undefined,
  });
  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID ?? "",
    clientSecret: process.env.INFISICAL_TOKEN ?? "",
  });
  return client as unknown as InfisicalClientLike;
}

async function getClient(): Promise<InfisicalClientLike> {
  if (clientFactoryOverride) {
    return clientFactoryOverride();
  }
  if (!cachedClient) {
    cachedClient = await createDefaultClient();
  }
  return cachedClient;
}

function envFallback(name: string, ttlSourceLabel: SecretSource = "env-fallback"): SecretResolution {
  const envValue = process.env[name]?.trim();
  if (!envValue) {
    return { ok: false, reason: `${name} not found in Infisical vault or process.env` };
  }
  if (!isEnvFallbackAllowed()) {
    return {
      ok: false,
      reason: `${name} only available via long-lived env var and ALLOW_ENV_SECRET_FALLBACK=false (fail-close)`,
    };
  }
  return {
    ok: true,
    value: envValue,
    source: ttlSourceLabel,
    redacted: redact(envValue),
    warning: `${name} resolved from long-lived process.env — migrate to Infisical JIT when convenient`,
  };
}

/**
 * Resolve a named secret. Tries the JIT vault first when configured, then
 * falls back to process.env (fail-closes instead if fallback is disabled).
 */
export async function resolveSecret(
  name: string,
  options: { ttlMs?: number } = {}
): Promise<SecretResolution> {
  const ttlMs = options.ttlMs ?? 5 * 60_000;

  const cached = vaultCache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, value: cached.value, source: "jit-vault", redacted: redact(cached.value) };
  }

  if (isVaultConfigured()) {
    try {
      const client = await getClient();
      const secret = await client.secrets().getSecret({
        environment: process.env.INFISICAL_ENVIRONMENT || "prod",
        projectId: process.env.INFISICAL_PROJECT_ID!,
        secretName: name,
      });
      const value = secret?.secretValue;
      if (value) {
        vaultCache.set(name, { value, expiresAt: Date.now() + ttlMs });
        return { ok: true, value, source: "jit-vault", redacted: redact(value) };
      }
    } catch (err) {
      if (!isEnvFallbackAllowed()) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          reason: `Infisical resolve failed for ${name} and env fallback disabled (fail-close): ${message}`,
        };
      }
      // Vault reachable-but-erroring falls through to env fallback below.
    }
  }

  return envFallback(name);
}

/** Drop a cached JIT-vault read, forcing the next resolveSecret() to refetch. */
export function revokeSecret(name: string): void {
  vaultCache.delete(name);
}
