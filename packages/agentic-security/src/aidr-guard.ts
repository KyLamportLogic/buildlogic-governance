/**
 * CrowdStrike Falcon AIDR — official SDK wrapper (@crowdstrike/aidr).
 * No hand-rolled HTTPS. Activate with CS_AIDR_TOKEN (+ optional base URL).
 */

import type { AidrGuardInput, AidrGuardResult } from "./types";
import { resolveSecret } from "./secrets-jit";

export interface AidrClientLike {
  guardChatCompletions(
    body: {
      guard_input: {
        messages: Array<{ role: string; content: string }>;
      };
      recipe?: string;
    },
    options?: unknown
  ): Promise<{
    result?: {
      blocked?: boolean;
      detectors?: Record<string, unknown>;
      [key: string]: unknown;
    };
    request_id?: string;
    [key: string]: unknown;
  }>;
}

type ClientFactory = () => AidrClientLike;

let clientFactoryOverride: ClientFactory | null = null;
let cachedClient: AidrClientLike | null = null;

/** Test seam — inject mock AIDR client. */
export function __setAidrClientFactoryForTesting(factory: ClientFactory): void {
  clientFactoryOverride = factory;
  cachedClient = null;
}

export function __resetAidrClientFactory(): void {
  clientFactoryOverride = null;
  cachedClient = null;
}

function isAidrRequired(): boolean {
  return String(process.env.CS_AIDR_REQUIRED ?? "").toLowerCase() === "true";
}

/** Resolve CS_AIDR_TOKEN via JIT vault when configured, else legible env fallback. */
async function getToken(): Promise<string | undefined> {
  const resolution = await resolveSecret("CS_AIDR_TOKEN");
  return resolution.ok ? resolution.value : undefined;
}

function getBaseUrlTemplate(): string {
  return (
    process.env.CS_AIDR_BASE_URL_TEMPLATE?.trim() ||
    "https://api.crowdstrike.com/aidr/{SERVICE_NAME}"
  );
}

async function createDefaultClient(token: string): Promise<AidrClientLike> {
  const { AIGuard } = await import("@crowdstrike/aidr");
  return new AIGuard({
    token,
    baseURLTemplate: getBaseUrlTemplate(),
  }) as unknown as AidrClientLike;
}

async function getClient(token: string): Promise<AidrClientLike> {
  if (clientFactoryOverride) {
    return clientFactoryOverride();
  }
  if (!cachedClient) {
    cachedClient = await createDefaultClient(token);
  }
  return cachedClient;
}

/**
 * Guard chat/completions content via Falcon AIDR.
 * Fail-close when CS_AIDR_REQUIRED=true and token missing or cloud blocks.
 * When token absent and not required: skip (local @kypython/buildlogic-governance remains SSOT).
 */
export async function guardChatWithAidr(
  input: AidrGuardInput
): Promise<AidrGuardResult> {
  const token = await getToken();
  if (!token) {
    if (isAidrRequired()) {
      return {
        allowed: false,
        skipped: false,
        reason:
          "CS_AIDR_REQUIRED=true but CS_AIDR_TOKEN is missing — fail-close (Falcon AIDR)",
      };
    }
    return {
      allowed: true,
      skipped: true,
      reason:
        "AIDR skipped — no CS_AIDR_TOKEN; local governance (@kypython/buildlogic-governance) remains authoritative",
    };
  }

  try {
    const client = await getClient(token);
    const body: {
      guard_input: { messages: Array<{ role: string; content: string }> };
      recipe?: string;
    } = {
      guard_input: { messages: input.messages },
    };
    if (input.recipe) {
      body.recipe = input.recipe;
    }

    const response = await client.guardChatCompletions(body);
    const result = response?.result;
    const blocked = Boolean(result?.blocked);

    if (blocked) {
      return {
        allowed: false,
        skipped: false,
        blocked: true,
        reason: "Falcon AIDR blocked prompt/completion (policy or detector)",
        requestId: response?.request_id,
        detectors: result?.detectors,
      };
    }

    return {
      allowed: true,
      skipped: false,
      blocked: false,
      reason: "Falcon AIDR allowed",
      requestId: response?.request_id,
      detectors: result?.detectors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fail-close on AIDR transport/API errors when required or always for configured token
    return {
      allowed: false,
      skipped: false,
      reason: `Falcon AIDR error (fail-close): ${message}`,
    };
  }
}

/**
 * Extract user/assistant text from harness input shapes for AIDR.
 */
export function messagesFromHarnessInput(input: unknown): AidrGuardInput["messages"] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  if (Array.isArray(input)) {
    return input.map((m) => {
      if (typeof m === "string") return { role: "user", content: m };
      if (m && typeof m === "object") {
        const rec = m as Record<string, unknown>;
        return {
          role: String(rec.role ?? "user"),
          content: String(rec.content ?? JSON.stringify(m)),
        };
      }
      return { role: "user", content: String(m) };
    });
  }
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    if (Array.isArray(rec.messages)) {
      return messagesFromHarnessInput(rec.messages);
    }
    if (typeof rec.content === "string") {
      return [{ role: "user", content: rec.content }];
    }
    if (typeof rec.input === "string") {
      return [{ role: "user", content: rec.input }];
    }
  }
  return [{ role: "user", content: JSON.stringify(input ?? "") }];
}
