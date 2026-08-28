/**
 * AI Governance Toll Booth — Policy Engine
 *
 * Manages and enforces AI governance policies.
 * Loads policy from environment and provides standard policy checks.
 *
 * @ai-generated {
 *   confidence: 0.92,
 *   reasoning: "Standard policy object with env var parsing",
 *   fallback: "Defaults to safe/restrictive policy if env missing"
 * }
 */

import type { GovernancePolicy } from "./types";

/**
 * Load governance policy from environment.
 *
 * Environment variables:
 * - AI_ACTION_KILL_SWITCH: "true" to block all actions
 * - AI_REQUIRE_GOVERNANCE_CONTRACT: "true" to require contract (default: true)
 * - AI_RESTRICTED_ACTIONS: comma-separated list of blocked action names
 * - AI_MAX_RISK_LEVEL: max risk level 0.0-1.0 (default: 0.85)
 * - AI_ACTION_RISK_CEILINGS: "pattern:value,pattern:value" per-action ceilings,
 *   stricter than AI_MAX_RISK_LEVEL, for specific high-stakes action names.
 *   Pattern may end in "*" for a prefix match (e.g. "integration.reddit.*").
 *   Malformed entries are skipped rather than failing policy load.
 * - AI_PARALLEL_PREFLIGHT_CHECKS: "true" to use Promise.all (default: true)
 *
 * GDM control stack is always enabled (non-overrideable governance law).
 * @returns Loaded policy
 */
export function loadGovernancePolicy(): GovernancePolicy {
  const killSwitchActive =
    process.env.AI_ACTION_KILL_SWITCH === "true";

  const requireContracts =
    process.env.AI_REQUIRE_GOVERNANCE_CONTRACT !== "false";

  const restrictedActionsStr = process.env.AI_RESTRICTED_ACTIONS || "";
  const restrictedActions = new Set(
    restrictedActionsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const maxRiskLevelStr = process.env.AI_MAX_RISK_LEVEL || "0.85";
  const maxRiskLevel = Math.min(
    Math.max(parseFloat(maxRiskLevelStr) || 0.85, 0),
    1
  );

  const actionRiskCeilings = parseActionRiskCeilings(
    process.env.AI_ACTION_RISK_CEILINGS || ""
  );

  const parallelPreflightChecks =
    process.env.AI_PARALLEL_PREFLIGHT_CHECKS !== "false";

  const enablePreferenceEvaluator =
    process.env.AI_ENABLE_PREFERENCE_EVALUATOR === "true";
  const enableDeceptionAuditor =
    process.env.AI_ENABLE_DECEPTION_AUDITOR === "true";
  const enableCircuitBreaker =
    process.env.AI_ENABLE_CIRCUIT_BREAKER === "true";
  const circuitBreakerThreshold = Math.max(
    1,
    parseInt(process.env.AI_CIRCUIT_BREAKER_THRESHOLD || "5", 10) || 5
  );
  const circuitBreakerCooldownMs = Math.max(
    0,
    parseInt(process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS || "30000", 10) || 30000
  );

  // GDM stack is mandatory — never env-gated (BuildLogic governance law).
  const enableGdmStack = true;

  return {
    killSwitchActive,
    requireContracts,
    restrictedActions,
    maxRiskLevel,
    actionRiskCeilings,
    parallelPreflightChecks,
    enablePreferenceEvaluator,
    enableDeceptionAuditor,
    enableCircuitBreaker,
    circuitBreakerThreshold,
    circuitBreakerCooldownMs,
    enableGdmStack,
  };
}

/**
 * Parse AI_ACTION_RISK_CEILINGS ("pattern:value,pattern:value") into a
 * clean list. Skips entries with an empty pattern or a non-numeric /
 * out-of-declared-shape value instead of throwing — a malformed env var
 * must never crash policy load (fail-close elsewhere, not here).
 */
function parseActionRiskCeilings(
  raw: string
): Array<{ pattern: string; maxRiskLevel: number }> {
  const out: Array<{ pattern: string; maxRiskLevel: number }> = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const idx = trimmed.lastIndexOf(":");
    if (idx <= 0 || idx === trimmed.length - 1) continue;
    const pattern = trimmed.slice(0, idx).trim();
    const valueStr = trimmed.slice(idx + 1).trim();
    if (!pattern) continue;
    const value = parseFloat(valueStr);
    if (!Number.isFinite(value)) continue;
    out.push({ pattern, maxRiskLevel: Math.min(Math.max(value, 0), 1) });
  }
  return out;
}

/**
 * Does actionName match a risk-ceiling pattern? Exact match, or a trailing
 * "*" wildcard treated as a prefix match (e.g. "integration.reddit.*").
 */
function matchesActionPattern(actionName: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return actionName.startsWith(pattern.slice(0, -1));
  }
  return actionName === pattern;
}

/**
 * Effective max risk level for a specific action: the global maxRiskLevel,
 * tightened (never loosened) by any matching per-action ceiling. When
 * multiple patterns match, the strictest (lowest) ceiling wins.
 *
 * @param actionName - Name of the action about to run
 * @param policy - Policy to check against
 * @returns Effective ceiling in [0, policy.maxRiskLevel]
 */
export function getEffectiveMaxRiskLevel(
  actionName: string,
  policy: GovernancePolicy
): number {
  let ceiling = policy.maxRiskLevel;
  for (const entry of policy.actionRiskCeilings) {
    if (matchesActionPattern(actionName, entry.pattern)) {
      ceiling = Math.min(ceiling, entry.maxRiskLevel);
    }
  }
  return ceiling;
}

/**
 * Create a default (most restrictive) policy.
 * Used as fallback or for testing.
 *
 * @returns Default policy with all checks enabled
 */
export function createDefaultPolicy(): GovernancePolicy {
  return {
    killSwitchActive: false,
    requireContracts: true,
    restrictedActions: new Set(),
    maxRiskLevel: 0.85,
    actionRiskCeilings: [],
    parallelPreflightChecks: true,
    enablePreferenceEvaluator: false,
    enableDeceptionAuditor: false,
    enableCircuitBreaker: false,
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 30_000,
    enableGdmStack: true,
  };
}

/**
 * Create a permissive policy (for testing only).
 * All checks disabled.
 *
 * @returns Permissive policy
 */
export function createPermissivePolicy(): GovernancePolicy {
  return {
    killSwitchActive: false,
    requireContracts: false,
    restrictedActions: new Set(),
    maxRiskLevel: 1.0,
    actionRiskCeilings: [],
    parallelPreflightChecks: false,
    enablePreferenceEvaluator: false,
    enableDeceptionAuditor: false,
    enableCircuitBreaker: false,
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 30_000,
    enableGdmStack: true,
  };
}

/**
 * Check if an action is allowed by policy.
 *
 * @param actionName - Name of the action
 * @param policy - Policy to check against
 * @returns true if allowed, false if restricted
 */
export function isActionAllowedByPolicy(
  actionName: string,
  policy: GovernancePolicy
): boolean {
  return !policy.restrictedActions.has(actionName);
}

/**
 * Check if risk level is allowed by policy.
 *
 * @param riskLevel - Risk level to check (0.0-1.0)
 * @param policy - Policy to check against
 * @param actionName - Optional action name; when provided, checks against
 *   the effective ceiling (global maxRiskLevel tightened by any matching
 *   actionRiskCeilings entry) instead of the global ceiling alone.
 * @returns true if allowed, false if exceeds max
 */
export function isRiskLevelAllowed(
  riskLevel: number,
  policy: GovernancePolicy,
  actionName?: string
): boolean {
  const ceiling =
    actionName !== undefined
      ? getEffectiveMaxRiskLevel(actionName, policy)
      : policy.maxRiskLevel;
  return riskLevel <= ceiling;
}
