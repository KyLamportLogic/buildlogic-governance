import {
  runGovernancePreflight,
  loadGovernancePolicy,
} from "@kypython/buildlogic-governance";
import {
  guardChatWithAidr,
  messagesFromHarnessInput,
} from "@kypython/buildlogic-agentic-security";

import { defaultAuditLogger } from "./middleware/audit.js";

import type {
  HarnessConfig,
  HarnessResult,
  Harness,
  InvokeOptions,
  AuditEntry,
} from "./types.js";

import type { ExecutionContext, GovernancePolicy } from "@kypython/buildlogic-governance";

/**
 * Creates a fail-close harness wrapping any ProviderAdapter.
 *
 * Every call to harness.invoke() runs a full governance preflight before the
 * provider is contacted. If preflight blocks, the provider is never called.
 *
 * Usage:
 *   const harness = createHarness({ provider: myOpenAIAdapter });
 *   const result = await harness.invoke(messages, { userId: "u_123" });
 *   if (!result.allowed) { handle block }
 */
export function createHarness<TInput, TOutput>(
  config: HarnessConfig<TInput, TOutput>
): Harness<TInput, TOutput> {
  const auditLogger = config.auditLogger ?? defaultAuditLogger;

  return {
    providerName: config.provider.name,

    async invoke(
      input: TInput,
      context: ExecutionContext,
      options: InvokeOptions = {}
    ): Promise<HarnessResult<TOutput>> {
      const actionName =
        options.actionName ?? `${config.provider.name}/invoke`;

      // Apply policy overrides by temporarily patching env vars.
      // runGovernancePreflight reads env via loadGovernancePolicy() internally,
      // so we apply additive fail-close overrides before the call and restore after.
      const envSnapshot = applyPolicyOverrides(config.policyOverrides);

      let preflight: Awaited<ReturnType<typeof runGovernancePreflight>>;
      try {
        const params: Record<string, unknown> = {
          ...(typeof input === "object" && input !== null
            ? (input as Record<string, unknown>)
            : { input }),
          ...(options.contract ? { _governance: options.contract } : {}),
          ...(options.preferenceScores
            ? { _preference_scores: options.preferenceScores }
            : {}),
          ...(options.proposedOutput !== undefined
            ? { _proposed_output: options.proposedOutput }
            : {}),
          ...(options.internalReasoning !== undefined
            ? { _internal_reasoning: options.internalReasoning }
            : {}),
          ...(options.priorTurnWasDisagreement !== undefined
            ? { _prior_turn_was_disagreement: options.priorTurnWasDisagreement }
            : {}),
          ...(options.chainOfThought !== undefined
            ? { _chain_of_thought: options.chainOfThought }
            : {}),
          ...(options.gdmRegistryKey !== undefined
            ? { _gdm_registry_key: options.gdmRegistryKey }
            : {}),
          ...(options.gdmStakes !== undefined
            ? { _gdm_stakes: options.gdmStakes }
            : {}),
          ...(options.gdmPromptBinding !== undefined
            ? { _gdm_prompt_binding: options.gdmPromptBinding }
            : {}),
          ...(options.gdmResourceMetrics !== undefined
            ? { _gdm_resource_metrics: options.gdmResourceMetrics }
            : {}),
          ...(options.gdmNlaSchema !== undefined
            ? { _gdm_nla_schema: options.gdmNlaSchema }
            : {}),
          ...(options.gdmRiskCheck !== undefined
            ? { _gdm_risk_check: options.gdmRiskCheck }
            : {}),
          ...(options.tanPlan !== undefined
            ? { _tan_plan: options.tanPlan }
            : {}),
          ...(options.tanCheckpoint !== undefined
            ? { _tan_checkpoint: options.tanCheckpoint }
            : {}),
        };

        preflight = await runGovernancePreflight(actionName, params, context);
      } finally {
        restoreEnv(envSnapshot);
      }

      const auditEntry: AuditEntry = {
        ts: new Date().toISOString(),
        actionName,
        userId: context.userId,
        allowed: preflight.allowed,
        reason: preflight.reason,
        timings: preflight.timings,
        decisions: preflight.decisions,
      };

      await Promise.resolve(auditLogger(auditEntry));

      if (!preflight.allowed) {
        if (config.onBlock) {
          await Promise.resolve(config.onBlock(actionName, preflight, context));
        }
        return {
          allowed: false,
          blocked: { reason: preflight.reason ?? "blocked by governance policy", preflight },
          audit: preflight.audit,
          timings: preflight.timings,
        };
      }

      // Falcon AIDR prompt-layer guard (official @crowdstrike/aidr SDK).
      // Skips when CS_AIDR_TOKEN unset unless CS_AIDR_REQUIRED=true.
      const aidr = await guardChatWithAidr({
        messages: messagesFromHarnessInput(input),
      });
      if (!aidr.allowed) {
        const aidrPreflight = {
          ...preflight,
          allowed: false,
          reason: aidr.reason,
        };
        if (config.onBlock) {
          await Promise.resolve(
            config.onBlock(actionName, aidrPreflight, context)
          );
        }
        return {
          allowed: false,
          blocked: {
            reason: aidr.reason,
            preflight: aidrPreflight,
          },
          audit: preflight.audit,
          timings: preflight.timings,
        };
      }

      const output = await config.provider.invoke(input, context);

      return {
        allowed: true,
        output,
        audit: preflight.audit,
        timings: preflight.timings,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Policy override helpers
// ---------------------------------------------------------------------------

type EnvSnapshot = Record<string, string | undefined>;

/**
 * Applies policyOverrides as env var mutations (additive fail-close only).
 * Returns a snapshot of the original values so they can be restored.
 */
function applyPolicyOverrides(
  overrides: Partial<GovernancePolicy> | undefined
): EnvSnapshot {
  if (!overrides) return {};

  const snapshot: EnvSnapshot = {};

  if (overrides.killSwitchActive === true) {
    snapshot["AI_ACTION_KILL_SWITCH"] = process.env["AI_ACTION_KILL_SWITCH"];
    process.env["AI_ACTION_KILL_SWITCH"] = "true";
  }

  if (overrides.requireContracts === true) {
    snapshot["AI_REQUIRE_GOVERNANCE_CONTRACT"] =
      process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
    process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"] = "true";
  }

  if (
    overrides.maxRiskLevel !== undefined &&
    overrides.maxRiskLevel < (parseFloat(process.env["AI_MAX_RISK_LEVEL"] ?? "0.85") || 0.85)
  ) {
    // Only tighten — never loosen
    snapshot["AI_MAX_RISK_LEVEL"] = process.env["AI_MAX_RISK_LEVEL"];
    process.env["AI_MAX_RISK_LEVEL"] = String(overrides.maxRiskLevel);
  }

  if (overrides.restrictedActions && overrides.restrictedActions.size > 0) {
    snapshot["AI_RESTRICTED_ACTIONS"] = process.env["AI_RESTRICTED_ACTIONS"];
    const existing = (process.env["AI_RESTRICTED_ACTIONS"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = Array.from(
      new Set([...existing, ...overrides.restrictedActions])
    );
    process.env["AI_RESTRICTED_ACTIONS"] = merged.join(",");
  }

  // enableGdmStack is non-overrideable governance law — intentionally not handled here.

  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
