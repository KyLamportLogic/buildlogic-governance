/**
 * Convenience toll booth for app call sites.
 *
 * Builds a governance contract + hash binding, runs runGovernancePreflight,
 * and returns a typed allow/deny result. Prefer this over marker-only imports.
 *
 * Scope (under-promise): callers must still pass honest GDM fields (prompt
 * binding, resource metrics). Do not invent D4 NLA schemas for production.
 */

import { createHashBinding } from "./hashBinding";
import { runGovernancePreflight, validateEgressUrl } from "./orchestrator";
import type { ExecutionContext, PreflightResult } from "./types";

export interface GateAiSideEffectOptions {
  actionName: string;
  params: Record<string, unknown>;
  context: ExecutionContext;
  intent: string;
  logicConstraints?: string[];
  assumptions?: string[];
  riskLevel?: number;
  fallbackStrategy?: string;
  /** Optional GDM extras merged into params (never fabricate D4 NLA). */
  gdm?: {
    registryKey?: string;
    promptBinding?: {
      systemPrompt: string;
      tools: unknown[];
      config: Record<string, unknown>;
    };
    resourceMetrics?: {
      apiCallCount: number;
      tokenUsage: number;
      directoryScanCount: number;
    };
    chainOfThought?: string;
    /** Task stakes for T.A.N. scaffold (high/critical require human approval). */
    stakes?: "low" | "medium" | "high" | "critical";
    /** Pre-built T.A.N. plan (from buildExecutionPlan). */
    tanPlan?: Record<string, unknown>;
    /** Approved checkpoint from operator UI / createApprovalCheckpoint. */
    tanCheckpoint?: Record<string, unknown>;
  };
  /**
   * Skip params.url / params.urls SSRF checks. Default false — gateAiSideEffect
   * is the default consumer of validateEgressUrl. Preflight still does not
   * check URLs.
   */
  skipEgress?: boolean;
}

export interface GateAiSideEffectResult {
  allowed: boolean;
  reason?: string;
  preflight: PreflightResult;
  paramsWithContract: Record<string, unknown>;
}

/**
 * Gate an AI-triggered side effect. Fail-close when preflight denies.
 */
export async function gateAiSideEffect(
  options: GateAiSideEffectOptions
): Promise<GateAiSideEffectResult> {
  const {
    actionName,
    params,
    context,
    intent,
    logicConstraints = ["Fail closed on governance deny", "No silent bypass"],
    assumptions = ["Caller supplied the real side-effect parameters"],
    riskLevel = 0.35,
    fallbackStrategy = "abort",
    gdm,
    skipEgress = false,
  } = options;

  const input_hash = createHashBinding(actionName, context.userId, params);
  const paramsWithContract: Record<string, unknown> = {
    ...params,
    _governance: {
      intent,
      logic_constraints: logicConstraints,
      assumptions,
      fallback_strategy: fallbackStrategy,
      risk_level: riskLevel,
      input_hash,
    },
  };

  if (gdm?.registryKey) {
    paramsWithContract._gdm_registry_key = gdm.registryKey;
  }
  if (gdm?.promptBinding) {
    paramsWithContract._gdm_prompt_binding = gdm.promptBinding;
  }
  if (gdm?.resourceMetrics) {
    paramsWithContract._gdm_resource_metrics = gdm.resourceMetrics;
  }
  if (gdm?.chainOfThought) {
    paramsWithContract._chain_of_thought = gdm.chainOfThought;
  }
  if (gdm?.stakes) {
    paramsWithContract._gdm_stakes = gdm.stakes;
  }
  if (gdm?.tanPlan) {
    paramsWithContract._tan_plan = gdm.tanPlan;
  }
  if (gdm?.tanCheckpoint) {
    paramsWithContract._tan_checkpoint = gdm.tanCheckpoint;
  }

  const preflight = await runGovernancePreflight(
    actionName,
    paramsWithContract,
    context
  );

  if (!skipEgress && preflight.allowed) {
    const urls = collectOutboundUrls(params);
    for (const url of urls) {
      const egress = await validateEgressUrl(url, context);
      if (!egress.ok) {
        const reason = `egress denied: ${egress.reason ?? "blocked"}`;
        return {
          allowed: false,
          reason,
          preflight: {
            ...preflight,
            allowed: false,
            reason,
            decisions: {
              ...preflight.decisions,
              egressAllowed: false,
            },
          },
          paramsWithContract,
        };
      }
    }
  }

  return {
    allowed: preflight.allowed,
    reason: preflight.reason,
    preflight,
    paramsWithContract,
  };
}

function collectOutboundUrls(params: Record<string, unknown>): string[] {
  const urls: string[] = [];
  if (typeof params.url === "string" && params.url.length > 0) {
    urls.push(params.url);
  }
  if (Array.isArray(params.urls)) {
    for (const candidate of params.urls) {
      if (typeof candidate === "string" && candidate.length > 0) {
        urls.push(candidate);
      }
    }
  }
  return urls;
}

/**
 * Throw if side effect is denied (fail-close for sync call sites).
 */
export async function assertAiSideEffectAllowed(
  options: GateAiSideEffectOptions
): Promise<GateAiSideEffectResult> {
  const result = await gateAiSideEffect(options);
  if (!result.allowed) {
    throw new Error(
      `Blocked by governance policy: ${result.reason ?? "denied"}`
    );
  }
  return result;
}
