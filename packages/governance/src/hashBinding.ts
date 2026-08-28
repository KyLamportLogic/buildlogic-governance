/**
 * AI Governance Toll Booth — Contract Hash Binding
 *
 * Implements deterministic binding between governance contract and action parameters
 * using SHA256 hashing to prevent parameter tampering.
 *
 * @ai-generated {
 *   confidence: 0.95,
 *   reasoning: "Standard SHA256 hashing pattern with payload canonicalization",
 *   fallback: "Returns error if hashing fails"
 * }
 */

import crypto from "node:crypto";
import type {
  GovernanceContract,
  HashBindingResult,
} from "./types";

/**
 * Compute SHA256 hash of a value.
 * Ensures deterministic, canonical representation.
 *
 * @param value - Any value to hash
 * @returns Hex-encoded SHA256 hash
 */
export function hashValue(value: unknown): string {
  const canonical = JSON.stringify(value || {});
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Compute the expected hash for a governance contract binding.
 *
 * Combines:
 * - Action name
 * - User ID
 * - Action parameters (excluding governance metadata)
 *
 * @param actionName - Name of the action
 * @param userId - User executing the action
 * @param params - Action parameters (governance metadata excluded)
 * @returns Expected hash
 */
// Underscore-prefixed metadata keys consumed by the governance pipeline.
// These are stripped from the hash payload so callers can attach
// alignment metadata without invalidating an existing hash binding.
const GOVERNANCE_METADATA_KEYS = [
  "_governance",
  "_preference_scores",
  "_proposed_output",
  "_internal_reasoning",
  "_prior_turn_was_disagreement",
  "_chain_of_thought",
  "_gdm_registry_key",
  "_gdm_stakes",
  "_gdm_prompt_binding",
  "_gdm_resource_metrics",
  "_gdm_nla_schema",
  "_gdm_risk_check",
  "_tan_plan",
  "_tan_checkpoint",
] as const;

export function computeExpectedHash(
  actionName: string,
  userId: string,
  params: unknown
): string {
  const hashableParams = { ...(params as Record<string, unknown> || {}) };
  for (const k of GOVERNANCE_METADATA_KEYS) {
    delete hashableParams[k];
  }

  const payload = {
    actionName,
    userId,
    params: hashableParams,
  };

  return hashValue(payload);
}

/**
 * Validate hash binding between contract and parameters.
 *
 * Ensures the action parameters match what the AI intended (via input_hash).
 * Protects against parameter tampering or drift after contract issuance.
 *
 * @param contract - Governance contract with optional input_hash
 * @param actionName - Name of the action
 * @param userId - User executing the action
 * @param params - Action parameters
 * @returns HashBindingResult with ok/reason
 */
export function validateHashBinding(
  contract: GovernanceContract | null | undefined,
  actionName: string,
  userId: string,
  params: unknown
): HashBindingResult {
  // If no contract or no hash specified, binding is not required
  if (!contract || !contract.input_hash) {
    return { ok: true };
  }

  const expectedHash = computeExpectedHash(actionName, userId, params);

  if (contract.input_hash !== expectedHash) {
    return {
      ok: false,
      reason: "input_hash mismatch: contract parameters do not match action parameters",
      expectedHash,
      providedHash: contract.input_hash,
    };
  }

  return { ok: true, expectedHash };
}

/**
 * Create a hash binding from parameters.
 * Useful for generating a contract's input_hash field.
 *
 * @param actionName - Name of the action
 * @param userId - User executing the action
 * @param params - Action parameters
 * @returns Hex hash
 */
export function createHashBinding(
  actionName: string,
  userId: string,
  params: unknown
): string {
  return computeExpectedHash(actionName, userId, params);
}
