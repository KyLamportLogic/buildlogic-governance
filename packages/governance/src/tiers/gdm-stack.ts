/**
 * GDM Control Stack — library orchestrator for D1–D4 / R1–R3
 *
 * `runGdmControlStack` is the concrete meaning of “GDM” in this repo: given
 * optional inputs, run enabled detection/prevention checks and return allow/deny.
 *
 * Scope (under-promise): not a user-facing product, not fleet % blocked metrics,
 * not proof of production NLA/TAN UI. See docs/learning/LEARNING_GUIDE.md §8.1c.
 */

import { monitorChainOfThought } from "./d1-cot-monitor";
import { enqueueCompletedTrace } from "./d2-async-alerts";
import { detectSystemAnomaly } from "./d3-anomaly-detection";
import { verifyNlaActivationSchema } from "./d4-nla-simulator";
import { verifyPromptBindingWithKillEscalation } from "./r1-prompt-binding";
import { checkRiskCeilings } from "./r3-kill-ceilings";
import { computeAdaptiveScaffold, mayProceedWithPlan } from "./tan-protocol";
import type { GdmStackInput, GdmStackResult, TanApprovalCheckpoint, TanExecutionPlan } from "./types";

export interface RunGdmStackOptions {
  registryKey?: string;
  tanPlan?: TanExecutionPlan;
  tanCheckpoint?: TanApprovalCheckpoint;
  skipTiers?: Array<"D1" | "D2" | "D3" | "D4" | "R1" | "R3">;
}

/**
 * Run the full GDM control stack for an agent action.
 * Fail-close: first tier block stops execution.
 */
export function runGdmControlStack(
  input: GdmStackInput,
  options: RunGdmStackOptions = {}
): GdmStackResult {
  const skip = new Set(options.skipTiers ?? []);
  const stakes = input.stakes ?? "medium";
  const scaffold = computeAdaptiveScaffold(stakes);
  const timestamp = new Date().toISOString();

  const result: GdmStackResult = {
    allowed: true,
    detection: {},
    prevention: {},
    tan: scaffold,
    timestamp,
  };

  // T.A.N. negotiability gate
  if (options.tanPlan) {
    const tanGate = mayProceedWithPlan(options.tanPlan, options.tanCheckpoint);
    if (!tanGate.allowed) {
      return {
        ...result,
        allowed: false,
        blockedBy: "TAN",
        reason: tanGate.reason,
      };
    }
  }

  // R3 — Risk ceilings (always first among prevention)
  if (scaffold.enabledPrevention.includes("R3") && !skip.has("R3")) {
    const r3 = checkRiskCeilings(input.riskCheck ?? {});
    result.prevention.r3 = r3;
    if (r3.breached) {
      return block(result, "R3", r3.reason);
    }
  }

  // R1 — Prompt binding (with optional R3 kill escalation on injection drift)
  if (
    scaffold.enabledPrevention.includes("R1") &&
    !skip.has("R1") &&
    input.promptBinding &&
    options.registryKey
  ) {
    const escalation = verifyPromptBindingWithKillEscalation(
      options.registryKey,
      input.promptBinding,
      { escalate: true }
    );
    result.prevention.r1 = escalation.r1;
    if (escalation.r3) {
      result.prevention.r3 = escalation.r3;
    }
    if (!escalation.r1.ok) {
      if (escalation.killSwitchTriggered && escalation.r3) {
        return block(result, "R3", escalation.r3.reason);
      }
      return block(result, "R1", escalation.r1.reason);
    }
  }

  // D1 — CoT monitor
  if (scaffold.enabledTiers.includes("D1") && !skip.has("D1") && input.chainOfThought) {
    const d1 = monitorChainOfThought({ chainOfThought: input.chainOfThought, actionName: input.actionName });
    result.detection.d1 = d1;
    if (d1.flagged) {
      return block(result, "D1", d1.reason);
    }
  }

  // D3 — Anomaly detection
  if (scaffold.enabledTiers.includes("D3") && !skip.has("D3") && input.resourceMetrics) {
    const d3 = detectSystemAnomaly(input.resourceMetrics);
    result.detection.d3 = d3;
    if (d3.anomalous) {
      return block(result, "D3", d3.reason);
    }
  }

  // D4 — NLA simulator
  if (scaffold.enabledTiers.includes("D4") && !skip.has("D4") && input.nlaSchema) {
    const d4 = verifyNlaActivationSchema(input.nlaSchema);
    result.detection.d4 = d4;
    if (d4.flagged) {
      return block(result, "D4", d4.reason);
    }
  }

  // D2 — Async enqueue (post-action monitoring, non-blocking)
  if (scaffold.enabledTiers.includes("D2") && !skip.has("D2")) {
    const d2 = enqueueCompletedTrace({
      traceId: `trace-${input.actionName}-${Date.now()}`,
      actionName: input.actionName,
      userId: input.userId,
      completedAt: timestamp,
      chainOfThought: input.chainOfThought,
      output: input.proposedOutput,
    });
    result.detection.d2 = d2;
  }

  return result;
}

function block(
  result: GdmStackResult,
  tier: GdmStackResult["blockedBy"],
  reason?: string
): GdmStackResult {
  return {
    ...result,
    allowed: false,
    blockedBy: tier,
    reason,
  };
}
