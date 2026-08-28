/**
 * AI Governance Toll Booth — Core Types
 *
 * Defines the deterministic contract for all AI-triggered side effects.
 */

/**
 * Governance contract that must be validated before any AI action executes.
 * This is the "toll ticket" that the AI action must possess.
 */
export interface GovernanceContract {
  /**
   * Human-readable description of what the AI intends to do.
   * Must be specific and meaningful (minimum 5 chars).
   */
  intent: string;

  /**
   * Array of constraints that MUST be satisfied during execution.
   * Example: ["no private network calls", "no user data exfiltration"]
   */
  logic_constraints: string[];

  /**
   * Array of assumptions the AI is making.
   * Example: ["input is valid JSON", "user has permission"]
   */
  assumptions: string[];

  /**
   * What to do if something goes wrong.
   * One of: "human_escalation", "retry_with_constraints", "abort"
   */
  fallback_strategy: "human_escalation" | "retry_with_constraints" | "abort";

  /**
   * Optional: Risk level (0.0-1.0). Actions with risk > 0.85 are blocked.
   */
  risk_level?: number;

  /**
   * Optional: SHA256 hash of (actionName, userId, params) for binding.
   * If provided, must match computed hash or action is blocked.
   */
  input_hash?: string;

  /**
   * Optional: Reasoning trace from the AI model.
   * Useful for debugging and audit trails.
   */
  reasoning_trace?: string | object | unknown[];

  /**
   * Optional: Timestamp when this contract was issued.
   */
  issued_at?: string;

  /**
   * Optional: TTL in seconds. After this, contract is expired.
   */
  ttl_seconds?: number;
}

/**
 * Result of governance preflight validation.
 * Contains decision (allowed/blocked) and metrics.
 *
 * HUMAN: `allowed` is the only go/no-go for the side effect from preflight.
 * AI_CANONICAL:preflight.egress.mode=deferred_to_validateEgressUrl
 *   — do not treat decisions.egressAllowed as “SSRF validated”.
 */
export interface PreflightResult {
  /**
   * Whether the action is allowed to proceed past preflight.
   */
  allowed: boolean;

  /**
   * If blocked, reason for the block.
   */
  reason?: string;

  /**
   * Component timings (kill switch, policy/contract, hash binding, etc).
   * `egressValidationMs` here stays 0 unless a caller also ran validateEgressUrl
   * and merged metrics — preflight itself does not time egress.
   */
  timings: {
    governanceDecisionMs: number;
    hashBindingMs: number;
    egressValidationMs: number;
    killSwitchCheckMs: number;
    totalMs: number;
  };

  /**
   * Policy decisions made (for observability).
   *
   * AI_CANONICAL:preflight.egress — `egressCheckedInPreflight` is always false
   * from runGovernancePreflight. `egressAllowed` means only “preflight did not
   * deny for egress” (legacy name; egress was never checked).
   */
  decisions: {
    killSwitchActive: boolean;
    contractValidated: boolean;
    hashMatched: boolean;
    /**
     * Legacy flag: true when preflight did not block on egress.
     * Preflight never validates URLs — prefer `egressCheckedInPreflight`.
     */
    egressAllowed: boolean;
    /**
     * Always false from runGovernancePreflight.
     * Call validateEgressUrl / validateEgressUrlsBatch before outbound HTTP.
     */
    egressCheckedInPreflight: boolean;
    policyApproved: boolean;
    preferenceEvaluated?: boolean;
    deceptionAudited?: boolean;
    circuitBreakerState?: CircuitBreakerState;
    gdmStackEvaluated?: boolean;
    gdmBlockedBy?: string;
  };

  /**
   * Audit information for trust telemetry.
   */
  audit: {
    actionName: string;
    userId: string;
    timestamp: string;
    contractHash?: string;
  };
}

/**
 * Context passed to executeAction. Contains user info and governance state.
 */
export interface ExecutionContext {
  userId: string;
  userEmail?: string;
  timezone?: string;
  // Internal governance state (not passed by caller)
  __governancePreflight?: PreflightResult;
  __trustMetrics?: TrustMetrics;
}

/**
 * Trust metrics aggregated during action execution.
 * Tracks safety overhead and governance latencies.
 */
export interface TrustMetrics {
  governanceDecisionMs?: number;
  hashBindingMs?: number;
  egressValidationMs?: number;
  killSwitchCheckMs?: number;
  outboundValidationMs?: number;
  outboundValidationChecks?: number;
  trustPipelineMs?: number;
}

/**
 * Policy that controls AI action execution.
 */
export interface GovernancePolicy {
  /**
   * Kill switch: if true, all AI actions are blocked.
   */
  killSwitchActive: boolean;

  /**
   * Require governance contracts before any action executes.
   */
  requireContracts: boolean;

  /**
   * Actions that are always blocked.
   */
  restrictedActions: Set<string>;

  /**
   * Maximum risk level allowed (0.0-1.0).
   * Actions exceeding this are blocked.
   */
  maxRiskLevel: number;

  /**
   * Per-action risk ceilings, stricter than maxRiskLevel, for specific
   * high-stakes action names or `prefix.*` patterns (e.g. external sends).
   * Parsed from AI_ACTION_RISK_CEILINGS. Can only tighten maxRiskLevel,
   * never loosen it — see getEffectiveMaxRiskLevel.
   */
  actionRiskCeilings: Array<{ pattern: string; maxRiskLevel: number }>;

  /**
   * If true, require parallel preflight checks (Promise.all).
   */
  parallelPreflightChecks: boolean;

  /**
   * Opt-in alignment extensions (off by default to preserve existing flows).
   */
  enablePreferenceEvaluator: boolean;
  enableDeceptionAuditor: boolean;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;

  /**
   * GDM control stack (D1–D4, R1–R3, T.A.N.) — mandatory, non-overrideable BuildLogic law.
   * Always true; env vars and harness overrides cannot disable.
   */
  enableGdmStack: boolean;
}

/**
 * Egress validation result for outbound actions.
 */
export interface EgressValidationResult {
  ok: boolean;
  reason?: string;
  checked?: boolean;
}

/**
 * Hash binding validation result.
 */
export interface HashBindingResult {
  ok: boolean;
  reason?: string;
  expectedHash?: string;
  providedHash?: string;
}

/**
 * Contract validation result.
 */
export interface ContractValidationResult {
  ok: boolean;
  reason?: string;
  inputHash?: string;
}

/**
 * Kill switch check result.
 */
export interface KillSwitchResult {
  active: boolean;
  reason?: string;
}

/**
 * Multi-objective preference scoring across alignment dimensions.
 * Each score is in [0,1].
 */
export interface PreferenceScores {
  helpfulness: number;
  harmlessness: number;
  pluralism: number;
  honesty: number;
}

export interface PreferenceEvaluationInput {
  scores: PreferenceScores;
  weights?: Partial<PreferenceScores>;
  vetoFloor?: number;
  aggregateFloor?: number;
}

export interface PreferenceEvaluationResult {
  allowed: boolean;
  aggregate: number;
  perObjective: PreferenceScores;
  vetoed?: keyof PreferenceScores | "missing_scores";
  reason?: string;
}

/**
 * Latent deception / eval-awareness auditor I/O.
 */
export interface DeceptionAuditInput {
  output: string;
  internalReasoning?: string;
  priorTurnWasDisagreement?: boolean;
  evaluationContext?: { isBenchmark?: boolean };
  confidenceThreshold?: number;
}

export interface DeceptionAuditResult {
  ok: boolean;
  signals: string[];
  confidence: number;
  reason?: string;
}

/**
 * Fail-close circuit breaker contract.
 */
export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  halfOpenProbes?: number;
}

export interface CircuitBreakerGuardResult {
  allowed: boolean;
  state: CircuitBreakerState;
  reason?: string;
}

export interface CircuitBreaker {
  guard(): CircuitBreakerGuardResult;
  recordSuccess(): void;
  recordFailure(): void;
  forceOpen(reason: string): void;
  reset(): void;
  getState(): CircuitBreakerState;
}

/**
 * Governance contract for dependency decisions.
 * Required when building from scratch instead of using an existing library.
 * 
 * @example
 * // In code comments or governance metadata:
 * // _governance: {
 * //   type: "DEPENDENCY_DECISION",
 * //   operation: "JSON canonicalization",
 * //   library_considered: "canonical-json",
 * //   exclusion_reason: "Need zero dependencies for edge runtime without node_modules",
 * //   risk_accepted: "Maintenance burden, potential for subtle bugs in edge cases"
 * // }
 */
export interface DependencyDecision {
  /** Type identifier for this contract */
  type: "DEPENDENCY_DECISION";
  
  /** The operation being implemented (e.g., "JSON canonicalization", "UUID generation") */
  operation: string;
  
  /** The library that exists and could have been used */
  library_considered: string;
  
  /** Why the library was not used — must be substantive, not "I wanted to" */
  exclusion_reason: string;
  
  /** What could go wrong by building from scratch */
  risk_accepted: string;
  
  /** SHA256 hash of the decision rationale for immutability */
  decision_hash?: string;
  
  /** Timestamp of decision for audit trail */
  timestamp?: string;
}

/**
 * Governance contract for the Systems Thinking Operating System law.
 * Required (fail-close) when structural paths change — see
 * `docs/quality/systems-thinking-operating-system.md` and
 * `.systems-thinking/contracts/`. CI: `pnpm validate:systems-thinking`.
 *
 * Seven steps (mandatory order): event → pattern → structure → archetype →
 * intervention → leading_indicators → transfer.
 */
export interface SystemsThinkingContract {
  /** Type identifier for this contract */
  type: "SYSTEMS_THINKING_CONTRACT";

  /** Short label for the change under analysis */
  title: string;

  /** Path prefixes this contract covers (must cover structural files in the PR) */
  scope: string[];

  /** Surface symptom / what just happened */
  event: string;

  /** Recurring timeline (here or isomorphic systems) */
  pattern: string;

  /** Goals, incentives, delays, capacity limits, feedback polarity */
  structure: string;

  /** Named systems archetype and why it fits */
  archetype: string;

  /** Structural intervention (gates/capacity/incentives), not event-only patch */
  intervention: string;

  /** Leading metrics before lagging crisis metrics */
  leading_indicators: string;

  /** Isomorphic twin in another domain (proves mechanism) */
  transfer: string;

  /** Optional ISO date for audit trail */
  date?: string;

  /** Optional SHA-256 of contract body for immutability */
  decision_hash?: string;
}
