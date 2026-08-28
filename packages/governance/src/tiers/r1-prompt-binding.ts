/**
 * R1 — Cryptographic Prompt-Binding & System Prompt Locks
 *
 * Hashes system prompt / tools / config (SHA-256) and compares to an in-memory
 * registry. Injection-class drift can escalate to R3 kill latch.
 *
 * Scope (under-promise): registry is process-local unless callers register
 * bindings; not cloud KMS / signed prompt storage by itself.
 */

import crypto from "node:crypto";
import { triggerKillSwitchFromPromptInjection } from "./r3-kill-ceilings";
import type {
  PromptBindingEntry,
  PromptBindingPayload,
  PromptBindingVerifyResult,
  RiskCeilingResult,
} from "./types";

/** In-memory authorized governance registry. */
const authorizedRegistry = new Map<string, PromptBindingEntry>();

export class PromptBindingDriftError extends Error {
  constructor(
    public readonly mismatches: string[],
    message?: string
  ) {
    super(message ?? `Prompt binding drift: ${mismatches.join(", ")}`);
    this.name = "PromptBindingDriftError";
    Object.setPrototypeOf(this, PromptBindingDriftError.prototype);
  }
}

/**
 * Compute SHA-256 hash of a string payload.
 */
export function hashPromptComponent(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Compute composite binding hashes for a prompt payload.
 */
export function computePromptBindingHashes(payload: PromptBindingPayload): {
  systemPromptHash: string;
  toolsHash: string;
  configHash: string;
} {
  const systemPromptHash = hashPromptComponent(payload.systemPrompt.trim());
  const toolsHash = hashPromptComponent(stableStringify(payload.tools));
  const configHash = hashPromptComponent(stableStringify(payload.config));
  return { systemPromptHash, toolsHash, configHash };
}

/**
 * Register an authorized prompt binding in the governance registry.
 */
export function registerPromptBinding(
  registryKey: string,
  payload: PromptBindingPayload,
  authorizedBy?: string
): PromptBindingEntry {
  const hashes = computePromptBindingHashes(payload);
  const entry: PromptBindingEntry = {
    ...hashes,
    registeredAt: new Date().toISOString(),
    authorizedBy,
  };
  authorizedRegistry.set(registryKey, entry);
  return entry;
}

/**
 * Verify a prompt payload against the authorized registry.
 * Fail-close when registry key is missing or hashes drift.
 */
export function verifyPromptBinding(
  registryKey: string,
  payload: PromptBindingPayload
): PromptBindingVerifyResult {
  const authorized = authorizedRegistry.get(registryKey);
  if (!authorized) {
    return {
      tier: "R1",
      ok: false,
      driftDetected: true,
      mismatches: ["registry-key-not-found"],
      reason: `R1: no authorized binding for key '${registryKey}'`,
    };
  }

  const current = computePromptBindingHashes(payload);
  const mismatches: string[] = [];

  if (current.systemPromptHash !== authorized.systemPromptHash) {
    mismatches.push("system-prompt-drift");
  }
  if (current.toolsHash !== authorized.toolsHash) {
    mismatches.push("tools-drift");
  }
  if (current.configHash !== authorized.configHash) {
    mismatches.push("config-drift");
  }

  const driftDetected = mismatches.length > 0;

  return {
    tier: "R1",
    ok: !driftDetected,
    driftDetected,
    mismatches,
    reason: driftDetected
      ? `R1 prompt binding drift: ${mismatches.join(", ")}`
      : undefined,
  };
}

/**
 * Enforce prompt binding or throw (fail-close).
 */
export function enforcePromptBindingOrThrow(
  registryKey: string,
  payload: PromptBindingPayload
): void {
  const result = verifyPromptBinding(registryKey, payload);
  if (!result.ok) {
    throw new PromptBindingDriftError(result.mismatches, result.reason);
  }
}

/** Clear registry (testing only). */
export function clearPromptBindingRegistry(): void {
  authorizedRegistry.clear();
}

/** Known prompt-injection lexicon (used to classify R1 drift as injection). */
export const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all )?(?:previous|prior|above|system) instructions/i,
  /disregard (?:your|the) (?:system )?(?:prompt|instructions|rules)/i,
  /you are now (?:a |an )?(?:DAN|unrestricted|evil|jailbroken)/i,
  /\[SYSTEM\]\s*override/i,
  /<\|im_start\|>system\s*[\s\S]*ignore/i,
  /new instructions:\s*you must/i,
  /forget everything above/i,
];

export interface PromptBindingEscalationResult {
  r1: PromptBindingVerifyResult;
  r3?: RiskCeilingResult;
  escalated: boolean;
  killSwitchTriggered: boolean;
}

/**
 * Returns true when drift mismatches indicate a prompt-injection class attack.
 */
export function isPromptInjectionDrift(
  mismatches: string[],
  injectedSystemPrompt?: string
): boolean {
  if (mismatches.includes("system-prompt-drift")) return true;
  if (mismatches.includes("tools-drift")) return true;
  if (injectedSystemPrompt) {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(injectedSystemPrompt)) return true;
    }
  }
  return false;
}

/**
 * Verify prompt binding; on injection-class drift, escalate to R3 kill switch.
 */
export function verifyPromptBindingWithKillEscalation(
  registryKey: string,
  payload: PromptBindingPayload,
  options?: { escalate?: boolean }
): PromptBindingEscalationResult {
  const escalate = options?.escalate !== false;
  const r1 = verifyPromptBinding(registryKey, payload);

  if (r1.ok || !escalate || !r1.driftDetected) {
    return { r1, escalated: false, killSwitchTriggered: false };
  }

  if (!isPromptInjectionDrift(r1.mismatches, payload.systemPrompt)) {
    return { r1, escalated: false, killSwitchTriggered: false };
  }

  const r3 = triggerKillSwitchFromPromptInjection(r1.reason ?? "R1 prompt binding drift");
  return {
    r1,
    r3,
    escalated: true,
    killSwitchTriggered: true,
  };
}

/** Get registry entry (for inspection). */
export function getPromptBindingEntry(registryKey: string): PromptBindingEntry | undefined {
  return authorizedRegistry.get(registryKey);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
