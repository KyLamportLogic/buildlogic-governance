/**
 * Strict Hash Binding Utility
 *
 * - Computes a deterministic SHA-256 binding between an AI-proposed action payload
 *   and the original user intent string.
 * - Uses a canonical JSON representation (sorted object keys) to ensure reproducible
 *   hashes across runtime environments.
 * - Provides a deny-by-default enforcement function that throws GovernanceDriftError
 *   when the computed hash does not match the expected hash at execution time.
 *
 * @governance {
 *   "type": "DEPENDENCY_DECISION",
 *   "operation": "JSON canonicalization for deterministic hashing",
 *   "library_considered": "canonical-json (npm)",
 *   "exclusion_reason": "Library has known issues with nested object handling; our implementation needs explicit control over edge cases (undefined, functions, circular refs) for security-critical governance path",
 *   "risk_accepted": "Maintenance burden if JSON spec changes; potential subtle bugs in edge cases — mitigated by comprehensive test coverage"
 * }
 */

import crypto from "node:crypto";

/** Error thrown when payloads drift from the original governance binding. */
export class GovernanceDriftError extends Error {
  public readonly expectedHash: string;
  public readonly actualHash: string;
  public readonly payload: unknown;
  public readonly timestamp: string;

  constructor(expectedHash: string, actualHash: string, payload: unknown, message?: string) {
    super(message ?? "Governance drift detected: payload does not match original contract hash.");
    this.name = "GovernanceDriftError";
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
    this.payload = payload;
    this.timestamp = new Date().toISOString();
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, GovernanceDriftError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      expectedHash: this.expectedHash,
      actualHash: this.actualHash,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Deterministically canonicalize a value for stable JSON serialization.
 * - Objects have keys sorted lexicographically
 * - Arrays preserve order (array order is semantically significant)
 * - Primitives and null returned as-is
 * - Functions, symbols, undefined are canonicalized to null for safety
 *
 * See @governance block in file header for dependency decision rationale.
 */
function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  if (t === "object") {
    // Record ordering must be deterministic: sort keys
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const k of keys) {
      result[k] = canonicalize(obj[k]);
    }
    return result;
  }
  // For functions, symbols, undefined: represent as null to avoid nondeterminism
  return null;
}

/** Stable JSON stringify using canonicalize. */
function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Compute a strict SHA-256 hex hash that binds an AI payload to the original user intent.
 * The canonicalized input is: { intent: <trimmed intent>, payload: <canonicalized payload> }
 *
 * @param payload - AI-proposed action payload (any JSON-compatible structure)
 * @param userIntent - Original user intent string
 * @returns Hex-encoded SHA-256 digest
 */
export function computeStrictHash(payload: unknown, userIntent: string): string {
  if (typeof userIntent !== "string" || userIntent.trim().length === 0) {
    throw new TypeError("userIntent must be a non-empty string");
  }

  const canonical = {
    intent: userIntent.trim(),
    payload: canonicalize(payload),
  };

  const serialized = stableStringify(canonical);
  const hash = crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
  return hash;
}

/**
 * Enforce the strict binding at execution time.
 * If the computed hash does not match expectedHash, throws GovernanceDriftError (fail-close).
 *
 * This function implements "deny-by-default": absence of an expectedHash or mismatch
 * leads to an exception. Callers should catch GovernanceDriftError at the platform boundary
 * to ensure fail-close behavior and human escalation.
 *
 * @param payload - AI-proposed action payload to be executed
 * @param userIntent - Original user intent string that was bound
 * @param expectedHash - Expected hex-encoded SHA-256 hash recorded in the contract
 */
export function enforceStrictBindingOrThrow(payload: unknown, userIntent: string, expectedHash: string): void {
  if (typeof expectedHash !== "string" || expectedHash.length === 0) {
    // Deny-by-default: missing expected hash is a policy violation
    throw new GovernanceDriftError("", "", payload, "Missing expected contract hash: deny-by-default enforcement");
  }

  const actualHash = computeStrictHash(payload, userIntent);

  if (actualHash !== expectedHash) {
    // Here we fail-close by throwing a rich error describing the mismatch
    throw new GovernanceDriftError(expectedHash, actualHash, payload, `Governance drift detected: expected ${expectedHash} but computed ${actualHash}`);
  }
}
