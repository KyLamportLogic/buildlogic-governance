/**
 * AI Governance Toll Booth — Contract Validator
 *
 * Validates governance contracts ensure they meet minimum requirements.
 * Enforces required fields, types, constraints on intent/risk_level.
 *
 * @ai-generated {
 *   confidence: 0.93,
 *   reasoning: "Standard contract validation with field checks and type guards",
 *   fallback: "Returns error if contract missing required fields"
 * }
 */

import type {
  GovernanceContract,
  ContractValidationResult,
} from "./types";

/**
 * Validate a governance contract has all required fields and valid values.
 *
 * Required fields:
 * - intent: string (min 5 chars, max 500 chars)
 * - logic_constraints: non-empty string array
 * - assumptions: string array
 * - fallback_strategy: one of (human_escalation, retry_with_constraints, abort)
 *
 * Optional fields:
 * - risk_level: number 0.0-1.0 (if present, max 0.85)
 * - input_hash: string (if present, must be 64-char hex)
 * - ttl_seconds: positive integer (if present)
 *
 * @param contract - Contract to validate
 * @returns ContractValidationResult with ok/reason
 */
export function validateContract(
  contract: unknown
): ContractValidationResult {
  if (!contract || typeof contract !== "object") {
    return { ok: false, reason: "Governance contract is required and must be an object" };
  }

  const c = contract as Record<string, unknown>;

  // Check required fields
  const requiredFields = [
    "intent",
    "logic_constraints",
    "assumptions",
    "fallback_strategy",
  ];
  for (const field of requiredFields) {
    if (!(field in c)) {
      return {
        ok: false,
        reason: `Missing required governance contract field: ${field}`,
      };
    }
  }

  // Validate intent
  if (typeof c.intent !== "string") {
    return { ok: false, reason: "intent must be a string" };
  }
  if (c.intent.trim().length < 5) {
    return {
      ok: false,
      reason: "intent must be at least 5 characters",
    };
  }
  if (c.intent.length > 500) {
    return {
      ok: false,
      reason: "intent must be at most 500 characters",
    };
  }

  // Validate logic_constraints
  if (!Array.isArray(c.logic_constraints)) {
    return { ok: false, reason: "logic_constraints must be an array" };
  }
  if (c.logic_constraints.length === 0) {
    return {
      ok: false,
      reason: "logic_constraints must contain at least one constraint",
    };
  }
  if (!c.logic_constraints.every((v) => typeof v === "string")) {
    return {
      ok: false,
      reason: "logic_constraints must contain only strings",
    };
  }

  // Validate assumptions
  if (!Array.isArray(c.assumptions)) {
    return { ok: false, reason: "assumptions must be an array" };
  }
  if (!c.assumptions.every((v) => typeof v === "string" || v === null)) {
    return {
      ok: false,
      reason: "assumptions must contain only strings",
    };
  }

  // Validate fallback_strategy
  const validStrategies = [
    "human_escalation",
    "retry_with_constraints",
    "abort",
  ];
  if (!validStrategies.includes(String(c.fallback_strategy))) {
    return {
      ok: false,
      reason: `fallback_strategy must be one of: ${validStrategies.join(", ")}`,
    };
  }

  // Validate optional risk_level
  if ("risk_level" in c) {
    if (typeof c.risk_level !== "number") {
      return { ok: false, reason: "risk_level must be a number" };
    }
    if (c.risk_level < 0 || c.risk_level > 1) {
      return { ok: false, reason: "risk_level must be between 0.0 and 1.0" };
    }
    if (c.risk_level > 0.85) {
      return {
        ok: false,
        reason: "risk_level exceeds maximum allowed (0.85)",
      };
    }
  }

  // Validate optional input_hash
  if ("input_hash" in c && c.input_hash !== null && c.input_hash !== undefined) {
    if (typeof c.input_hash !== "string") {
      return { ok: false, reason: "input_hash must be a string" };
    }
    if (!/^[a-f0-9]{64}$/.test(c.input_hash)) {
      return {
        ok: false,
        reason:
          "input_hash mismatch: input_hash must be a valid SHA256 hex string (64 chars)",
      };
    }
  }

  // Validate optional ttl_seconds
  if ("ttl_seconds" in c && c.ttl_seconds !== null && c.ttl_seconds !== undefined) {
    if (typeof c.ttl_seconds !== "number") {
      return { ok: false, reason: "ttl_seconds must be a number" };
    }
    if (c.ttl_seconds <= 0) {
      return { ok: false, reason: "ttl_seconds must be positive" };
    }
  }

  // Validate optional issued_at and check expiration
  if ("issued_at" in c && c.issued_at && "ttl_seconds" in c && c.ttl_seconds) {
    try {
      const issuedTime = new Date(String(c.issued_at)).getTime();
      const expiryTime = issuedTime + (c.ttl_seconds as number) * 1000;
      if (Date.now() > expiryTime) {
        return {
          ok: false,
          reason: "Governance contract has expired",
        };
      }
    } catch {
      return { ok: false, reason: "issued_at is not a valid timestamp" };
    }
  }

  return { ok: true };
}

/**
 * Type guard: check if an object is a valid GovernanceContract.
 *
 * @param obj - Object to check
 * @returns true if valid contract
 */
export function isValidGovernanceContract(
  obj: unknown
): obj is GovernanceContract {
  const result = validateContract(obj);
  return result.ok;
}
