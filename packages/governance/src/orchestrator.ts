/**
 * AI Governance Toll Booth — Preflight Orchestrator
 *
 * HUMAN: One function that says allow/deny before an AI side effect runs.
 * AI_CANONICAL:preflight.egress.mode=deferred_to_validateEgressUrl
 * AI_FORBIDDEN_CLAIM: do-not-claim preflight performs SSRF or URL egress checks
 *
 * Deterministic fail-close. Parallel hash+risk when policy allows.
 * SSOT for agents/CI: config/ai-governance-semantics.json
 *
 * @ai-generated {
 *   confidence: 0.93,
 *   reasoning: "Orchestrates all governance components with timing and parallel execution",
 *   fallback: "Falls back to blocking if any check fails"
 * }
 */

import { checkKillSwitch } from "./killSwitch";
import { validateHashBinding } from "./hashBinding";
import { validateOutboundUrl, validateOutboundUrlsBatch } from "./egressValidator";
import { validateContract } from "./contractValidator";
import {
  loadGovernancePolicy,
  isActionAllowedByPolicy,
  isRiskLevelAllowed,
  getEffectiveMaxRiskLevel,
} from "./policyEngine";
import {
  createTrustMetrics,
  recordComponentTiming,
  computeTrustPipelineMs,
} from "./trustMetrics";
import { evaluatePreferences } from "./preferenceEvaluator";
import { auditLatentDeception } from "./deceptionAuditor";
import { getSharedCircuitBreaker } from "./circuitBreaker";
import { runGdmControlStack } from "./tiers/gdm-stack";

import type {
  GovernanceContract,
  PreflightResult,
  ExecutionContext,
  CircuitBreaker,
} from "./types";
import type {
  GdmStackInput,
  PromptBindingPayload,
  NlaActivationSchema,
  RiskCeilingCheckInput,
  TaskStakes,
  TanApprovalCheckpoint,
  TanExecutionPlan,
} from "./tiers/types";

/**
 * Run complete governance preflight checks before AI action execution.
 *
 * Checks (in order of fail-close priority):
 * 0. Circuit breaker (opt-in; may run before kill switch)
 * 1. Kill switch (if active, block all actions)
 * 2. Policy check (is action restricted?)
 * 3. Contract validation (has required fields?)
 * 4. Hash binding (do params match contract?)
 * 5. Risk level (exceeds max?)
 * 6. Preference / deception auditors (opt-in)
 * 7. GDM control stack (mandatory)
 *
 * Egress/SSRF is NOT performed here — call validateEgressUrl(s) separately.
 * Hash + risk may run via Promise.all when parallel preflight is enabled.
 * Returns detailed result with timings for observability.
 *
 * @param actionName - Name of the action
 * @param params - Action parameters (may include _governance contract)
 * @param context - Execution context (userId, etc)
 * @returns PreflightResult with allowed/reason/timings
 */
export async function runGovernancePreflight(
  actionName: string,
  params: Record<string, unknown> | unknown,
  context: ExecutionContext
): Promise<PreflightResult> {
  const startTime = Date.now();
  const metrics = createTrustMetrics();
  const decisions: PreflightResult["decisions"] = {
    killSwitchActive: false,
    contractValidated: false,
    hashMatched: false,
    // Legacy: “not denied for egress”. Preflight never validates URLs.
    egressAllowed: false,
    egressCheckedInPreflight: false,
    policyApproved: false,
  };

  // Extract governance contract from params
  const paramObj =
    params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  const contract = paramObj._governance as GovernanceContract | undefined;

  // Load policy
  const policy = loadGovernancePolicy();

  // Optional shared circuit breaker (opt-in).
  let breaker: CircuitBreaker | null = null;
  if (policy.enableCircuitBreaker) {
    breaker = getSharedCircuitBreaker({
      failureThreshold: policy.circuitBreakerThreshold,
      cooldownMs: policy.circuitBreakerCooldownMs,
    });
    const guardResult = breaker.guard();
    decisions.circuitBreakerState = guardResult.state;
    if (!guardResult.allowed) {
      const totalMs = computeTrustPipelineMs(metrics);
      return {
        allowed: false,
        reason: `Action halted by circuit breaker: ${guardResult.reason}`,
        timings: {
          governanceDecisionMs: 0,
          hashBindingMs: 0,
          egressValidationMs: 0,
          killSwitchCheckMs: 0,
          totalMs,
        },
        decisions,
        audit: {
          actionName,
          userId: context.userId,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  const result: PreflightResult = await (async (): Promise<PreflightResult> => {
  // STEP 1: Check kill switch (fast path)
  const killSwitchStart = Date.now();
  const killSwitch = checkKillSwitch();
  const killSwitchDuration = Date.now() - killSwitchStart;
  recordComponentTiming(metrics, "killSwitchCheckMs", killSwitchDuration);
  decisions.killSwitchActive = killSwitch.active;

  if (killSwitch.active) {
    const totalMs = computeTrustPipelineMs(metrics);
    return {
      allowed: false,
      reason: killSwitch.reason || "Kill switch is active",
      timings: {
        governanceDecisionMs: 0,
        hashBindingMs: 0,
        egressValidationMs: 0,
        killSwitchCheckMs: killSwitchDuration,
        totalMs,
      },
      decisions,
      audit: {
        actionName,
        userId: context.userId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // STEP 2: Check policy
  const policyStart = Date.now();
  const policyApproved = isActionAllowedByPolicy(actionName, policy);
  const policyDuration = Date.now() - policyStart;
  recordComponentTiming(metrics, "governanceDecisionMs", policyDuration);
  decisions.policyApproved = policyApproved;

  if (!policyApproved) {
    const totalMs = computeTrustPipelineMs(metrics);
    return {
      allowed: false,
      reason: `Action '${actionName}' is restricted by policy`,
      timings: {
        governanceDecisionMs: policyDuration,
        hashBindingMs: 0,
        egressValidationMs: 0,
        killSwitchCheckMs: killSwitchDuration,
        totalMs,
      },
      decisions,
      audit: {
        actionName,
        userId: context.userId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // STEP 3: Validate contract if required
  if (policy.requireContracts && !contract) {
    const totalMs = computeTrustPipelineMs(metrics);
    return {
      allowed: false,
      reason: "Governance contract is required but not provided",
      timings: {
        governanceDecisionMs: policyDuration,
        hashBindingMs: 0,
        egressValidationMs: 0,
        killSwitchCheckMs: killSwitchDuration,
        totalMs,
      },
      decisions,
      audit: {
        actionName,
        userId: context.userId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // If no contract, contract validation passes (by policy)
  if (!contract) {
    decisions.contractValidated = true;
  } else {
    const contractStart = Date.now();
    const contractValidation = validateContract(contract);
    const contractDuration = Date.now() - contractStart;
    recordComponentTiming(metrics, "governanceDecisionMs", contractDuration);

    if (!contractValidation.ok) {
      const totalMs = computeTrustPipelineMs(metrics);
      return {
        allowed: false,
        reason: `Invalid governance contract: ${contractValidation.reason}`,
        timings: {
          governanceDecisionMs: policyDuration + contractDuration,
          hashBindingMs: 0,
          egressValidationMs: 0,
          killSwitchCheckMs: killSwitchDuration,
          totalMs,
        },
        decisions,
        audit: {
          actionName,
          userId: context.userId,
          timestamp: new Date().toISOString(),
          contractHash: contract.input_hash,
        },
      };
    }

    decisions.contractValidated = true;

    // STEP 4: Parallel checks if policy allows
    const parallelChecks: Promise<{ hashResult: any; riskResult: any }> = (async () => {
      const [hashResult, riskOk] = await Promise.all([
        (async () => {
          const hashStart = Date.now();
          const result = validateHashBinding(contract, actionName, context.userId, params);
          const hashDuration = Date.now() - hashStart;
          recordComponentTiming(metrics, "hashBindingMs", hashDuration);
          return { result, duration: hashDuration };
        })(),
        isRiskLevelAllowed(contract.risk_level || 0, policy, actionName),
      ]);

      if (!hashResult.result.ok) {
        return { hashResult: { ok: false, reason: hashResult.result.reason }, riskResult: riskOk };
      }

      decisions.hashMatched = true;

      if (!riskOk) {
        const ceiling = getEffectiveMaxRiskLevel(actionName, policy);
        return {
          hashResult: hashResult.result,
          riskResult: {
            ok: false,
            reason: `Risk level ${contract.risk_level ?? 0} exceeds maximum allowed (${ceiling}) for ${actionName}`,
          },
        };
      }

      return {
        hashResult: hashResult.result,
        riskResult: { ok: true },
      };
    })();

    const { hashResult, riskResult } = await parallelChecks;

    if (!hashResult.ok) {
      const totalMs = computeTrustPipelineMs(metrics);
      return {
        allowed: false,
        reason: hashResult.reason,
        timings: {
          governanceDecisionMs: policyDuration,
          hashBindingMs: metrics.hashBindingMs || 0,
          egressValidationMs: 0,
          killSwitchCheckMs: killSwitchDuration,
          totalMs,
        },
        decisions,
        audit: {
          actionName,
          userId: context.userId,
          timestamp: new Date().toISOString(),
          contractHash: contract.input_hash,
        },
      };
    }

    if (!riskResult.ok) {
      const totalMs = computeTrustPipelineMs(metrics);
      return {
        allowed: false,
        reason: "Contract risk level exceeds maximum allowed",
        timings: {
          governanceDecisionMs: policyDuration,
          hashBindingMs: metrics.hashBindingMs || 0,
          egressValidationMs: 0,
          killSwitchCheckMs: killSwitchDuration,
          totalMs,
        },
        decisions,
        audit: {
          actionName,
          userId: context.userId,
          timestamp: new Date().toISOString(),
          contractHash: contract.input_hash,
        },
      };
    }
  }

  // HUMAN: We are not claiming SSRF was checked — only that preflight does not
  // block on egress. AI_CANONICAL:preflight.egress.mode=deferred_to_validateEgressUrl
  decisions.egressAllowed = true;
  decisions.egressCheckedInPreflight = false;

  // STEP 5: Multi-objective preference evaluation (opt-in).
  if (policy.enablePreferenceEvaluator) {
    const prefScores = paramObj._preference_scores as
      | import("./types").PreferenceScores
      | undefined;
    if (prefScores) {
      const prefResult = evaluatePreferences({ scores: prefScores });
      decisions.preferenceEvaluated = prefResult.allowed;
      if (!prefResult.allowed) {
        const totalMs = computeTrustPipelineMs(metrics);
        return {
          allowed: false,
          reason: `Preference evaluator blocked: ${prefResult.reason || prefResult.vetoed}`,
          timings: {
            governanceDecisionMs: metrics.governanceDecisionMs || 0,
            hashBindingMs: metrics.hashBindingMs || 0,
            egressValidationMs: 0,
            killSwitchCheckMs: killSwitchDuration,
            totalMs,
          },
          decisions,
          audit: {
            actionName,
            userId: context.userId,
            timestamp: new Date().toISOString(),
            contractHash: contract?.input_hash,
          },
        };
      }
    }
  }

  // STEP 6: Latent deception / eval-awareness audit (opt-in).
  if (policy.enableDeceptionAuditor) {
    const proposed = paramObj._proposed_output;
    if (typeof proposed === "string") {
      const dec = auditLatentDeception({
        output: proposed,
        internalReasoning: typeof paramObj._internal_reasoning === "string"
          ? (paramObj._internal_reasoning as string)
          : undefined,
        priorTurnWasDisagreement:
          paramObj._prior_turn_was_disagreement === true,
      });
      decisions.deceptionAudited = dec.ok;
      if (!dec.ok) {
        const totalMs = computeTrustPipelineMs(metrics);
        return {
          allowed: false,
          reason: `Deception auditor blocked: ${dec.reason} (signals=${dec.signals.join(",")})`,
          timings: {
            governanceDecisionMs: metrics.governanceDecisionMs || 0,
            hashBindingMs: metrics.hashBindingMs || 0,
            egressValidationMs: 0,
            killSwitchCheckMs: killSwitchDuration,
            totalMs,
          },
          decisions,
          audit: {
            actionName,
            userId: context.userId,
            timestamp: new Date().toISOString(),
            contractHash: contract?.input_hash,
          },
        };
      }
    }
  }

  // STEP 7: GDM control stack (mandatory — non-overrideable governance law).
  {
    const gdmStart = Date.now();
    const gdmInput = buildGdmStackInputFromParams(actionName, context.userId, paramObj);
    const gdmResult = runGdmControlStack(gdmInput, {
      registryKey:
        typeof paramObj._gdm_registry_key === "string"
          ? paramObj._gdm_registry_key
          : undefined,
      tanPlan: paramObj._tan_plan as TanExecutionPlan | undefined,
      tanCheckpoint: paramObj._tan_checkpoint as TanApprovalCheckpoint | undefined,
    });
    const gdmDuration = Date.now() - gdmStart;
    recordComponentTiming(metrics, "governanceDecisionMs", gdmDuration);
    decisions.gdmStackEvaluated = true;
    decisions.gdmBlockedBy = gdmResult.blockedBy;

    if (!gdmResult.allowed) {
      const totalMs = computeTrustPipelineMs(metrics);
      return {
        allowed: false,
        reason: `GDM stack blocked: ${gdmResult.reason ?? gdmResult.blockedBy}`,
        timings: {
          governanceDecisionMs: metrics.governanceDecisionMs || 0,
          hashBindingMs: metrics.hashBindingMs || 0,
          egressValidationMs: 0,
          killSwitchCheckMs: killSwitchDuration,
          totalMs,
        },
        decisions,
        audit: {
          actionName,
          userId: context.userId,
          timestamp: new Date().toISOString(),
          contractHash: contract?.input_hash,
        },
      };
    }
  }

  const totalMs = computeTrustPipelineMs(metrics);
  return {
    allowed: true,
    timings: {
      governanceDecisionMs: metrics.governanceDecisionMs || 0,
      hashBindingMs: metrics.hashBindingMs || 0,
      egressValidationMs: metrics.egressValidationMs || 0,
      killSwitchCheckMs: killSwitchDuration,
      totalMs,
    },
    decisions,
    audit: {
      actionName,
      userId: context.userId,
      timestamp: new Date().toISOString(),
      contractHash: contract?.input_hash,
    },
  };
  })();

  // Record circuit-breaker outcome (skip self-halt to avoid double counting).
  if (breaker) {
    const reason = String(result.reason || "");
    if (result.allowed) {
      breaker.recordSuccess();
    } else if (!reason.startsWith("Action halted by circuit breaker")) {
      breaker.recordFailure();
    }
    decisions.circuitBreakerState = breaker.getState();
  }

  // Store preflight result in context for later reference
  context.__governancePreflight = result;
  context.__trustMetrics = metrics;

  return result;
}

/**
 * Validate one outbound URL (SSRF / private-IP defenses).
 *
 * HUMAN: Call this yourself when the action will hit the network.
 * AI_CANONICAL: egress lives here — NOT inside runGovernancePreflight.
 *
 * @param url - URL to validate
 * @param context - Execution context with trust metrics
 * @returns Promise<{ok: boolean, reason?: string}>
 */
export async function validateEgressUrl(
  url: string,
  context?: ExecutionContext
): Promise<{ ok: boolean; reason?: string }> {
  const startTime = Date.now();
  const result = await validateOutboundUrl(url);
  const duration = Date.now() - startTime;

  if (context?.__trustMetrics) {
    context.__trustMetrics.outboundValidationMs =
      (context.__trustMetrics.outboundValidationMs || 0) + duration;
    context.__trustMetrics.outboundValidationChecks =
      (context.__trustMetrics.outboundValidationChecks || 0) + 1;
  }

  return result;
}

/**
 * Validate multiple outbound URLs in batch (parallel).
 *
 * @param urls - URLs to validate
 * @param context - Execution context with trust metrics
 * @returns Promise<Map<url, {ok, reason?}>>
 */
export async function validateEgressUrlsBatch(
  urls: string[],
  context?: ExecutionContext
): Promise<Map<string, { ok: boolean; reason?: string }>> {
  const startTime = Date.now();
  const results = await validateOutboundUrlsBatch(urls);
  const duration = Date.now() - startTime;

  if (context?.__trustMetrics) {
    context.__trustMetrics.outboundValidationMs =
      (context.__trustMetrics.outboundValidationMs || 0) + duration;
    context.__trustMetrics.outboundValidationChecks =
      (context.__trustMetrics.outboundValidationChecks || 0) + urls.length;
  }

  return results;
}

function buildGdmStackInputFromParams(
  actionName: string,
  userId: string,
  paramObj: Record<string, unknown>
): GdmStackInput {
  return {
    actionName,
    userId,
    chainOfThought:
      typeof paramObj._chain_of_thought === "string"
        ? paramObj._chain_of_thought
        : undefined,
    proposedOutput:
      typeof paramObj._proposed_output === "string"
        ? paramObj._proposed_output
        : undefined,
    stakes: paramObj._gdm_stakes as TaskStakes | undefined,
    promptBinding: paramObj._gdm_prompt_binding as PromptBindingPayload | undefined,
    resourceMetrics: paramObj._gdm_resource_metrics as
      | GdmStackInput["resourceMetrics"]
      | undefined,
    nlaSchema: paramObj._gdm_nla_schema as NlaActivationSchema | undefined,
    riskCheck: paramObj._gdm_risk_check as RiskCeilingCheckInput | undefined,
  };
}
