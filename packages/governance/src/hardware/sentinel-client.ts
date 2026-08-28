import type { SentinelHealth, SentinelTelemetry } from "./types";

const DEFAULT_BASE = "http://127.0.0.1:8765";

export function resolveSentinelBaseUrl(): string {
  return (
    process.env.HARDWARE_SENTINEL_URL ??
    process.env.SENTINEL_BASE_URL ??
    process.env.SENTINEL_DAEMON_URL ??
    DEFAULT_BASE
  ).replace(/\/$/, "");
}

const PLACEHOLDER_ADMIN_TOKENS = new Set([
  "changeme",
  "change-me",
  "change_me",
  "replace-with-long-random-secret",
]);

/**
 * Resolve the sentinel admin token. Fails closed: rather than falling back to a
 * guessable literal (which silently makes a real deployment's kill bus
 * authenticate with a value published in this source file), callers get a clear
 * error surfaced as `{ ok: false, message }` by the mutating helpers below.
 */
function adminTokenFrom(options?: { adminToken?: string }): string {
  const token = (options?.adminToken ?? process.env.AGENT_ADMIN_TOKEN ?? "").trim();
  if (!token || PLACEHOLDER_ADMIN_TOKENS.has(token.toLowerCase())) {
    throw new Error(
      "AGENT_ADMIN_TOKEN is not configured (or is a placeholder) — refusing to call the Hardware Sentinel with a guessable admin token"
    );
  }
  return token;
}

export async function fetchSentinelHealth(
  baseUrl: string = resolveSentinelBaseUrl()
): Promise<SentinelHealth | null> {
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SentinelHealth;
  } catch {
    return null;
  }
}

export async function fetchSentinelTelemetry(
  baseUrl: string = resolveSentinelBaseUrl()
): Promise<SentinelTelemetry | null> {
  try {
    const res = await fetch(`${baseUrl}/telemetry`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SentinelTelemetry;
    return Object.keys(data).length ? data : null;
  } catch {
    return null;
  }
}

export async function fetchSentinelCapabilities(
  baseUrl: string = resolveSentinelBaseUrl()
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${baseUrl}/capabilities`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function triggerHardwareShutdown(
  options: { adminToken?: string; reason?: string; baseUrl?: string } = {}
): Promise<{ ok: boolean; status?: string; message?: string }> {
  const baseUrl = (options.baseUrl ?? resolveSentinelBaseUrl()).replace(
    /\/$/,
    ""
  );
  try {
    const res = await fetch(`${baseUrl}/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminToken: adminTokenFrom(options),
        reason: options.reason ?? "governance hardware shutdown",
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = (await res.json()) as {
      status?: string;
      message?: string;
    };
    return {
      ok: res.ok && payload.status === "SHUTDOWN_TRIGGERED",
      status: payload.status,
      message: payload.message,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "sentinel unreachable",
    };
  }
}

export async function triggerHardwareRevive(
  options: { adminToken?: string; reason?: string; baseUrl?: string } = {}
): Promise<{ ok: boolean; status?: string; message?: string }> {
  const baseUrl = (options.baseUrl ?? resolveSentinelBaseUrl()).replace(
    /\/$/,
    ""
  );
  try {
    const res = await fetch(`${baseUrl}/revive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminToken: adminTokenFrom(options),
        reason: options.reason ?? "governance hardware revive",
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = (await res.json()) as {
      status?: string;
      message?: string;
    };
    return {
      ok: res.ok && payload.status === "REVIVED",
      status: payload.status,
      message: payload.message,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "sentinel unreachable",
    };
  }
}

/**
 * Push a 0..1 risk scalar (e.g. Colab activation summary). Firmware auto-trips at risk_trip.
 */
export async function pushHardwareRisk(
  score: number,
  options: {
    adminToken?: string;
    source?: string;
    baseUrl?: string;
  } = {}
): Promise<{
  ok: boolean;
  status?: string;
  risk?: number;
  tripped?: boolean;
  message?: string;
}> {
  const baseUrl = (options.baseUrl ?? resolveSentinelBaseUrl()).replace(
    /\/$/,
    ""
  );
  try {
    const res = await fetch(`${baseUrl}/risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminToken: adminTokenFrom(options),
        score,
        source: options.source ?? "host",
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = (await res.json()) as {
      status?: string;
      risk?: number;
      tripped?: boolean;
      message?: string;
    };
    return {
      ok: res.ok && payload.status === "RISK_ACK",
      status: payload.status,
      risk: payload.risk,
      tripped: payload.tripped,
      message: payload.message,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "sentinel unreachable",
    };
  }
}
