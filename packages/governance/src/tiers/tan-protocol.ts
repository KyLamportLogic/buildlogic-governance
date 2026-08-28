/**
 * T.A.N. — Transparency, Adaptivity, Negotiability
 *
 * Library helpers: map task stakes → which D/R tiers run, and gate high-stakes
 * plans on an in-memory approval checkpoint (Map), not a product UI.
 *
 * Scope (under-promise): no BuildLogic web route or RBAC “Accept plan” screen
 * ships with this file. Human approval in production requires a separate
 * authenticated surface — do not imply that surface exists here.
 */

import type {
  DetectionTier,
  PreventionTier,
  TanAdaptiveScaffold,
  TanApprovalCheckpoint,
  TanExecutionPlan,
  TaskStakes,
} from "./types";

const STAKES_TIER_MAP: Record<
  TaskStakes,
  { detection: DetectionTier[]; prevention: PreventionTier[]; intensity: number; requiresApproval: boolean }
> = {
  low: {
    detection: ["D2"],
    prevention: [],
    intensity: 0.5,
    requiresApproval: false,
  },
  medium: {
    detection: ["D1", "D2"],
    prevention: ["R1"],
    intensity: 0.75,
    requiresApproval: false,
  },
  high: {
    detection: ["D1", "D2", "D3"],
    prevention: ["R1", "R2"],
    intensity: 1.0,
    requiresApproval: true,
  },
  critical: {
    // D4 (mock NLA) is intentionally omitted from defaults — only enable when a
    // real activation schema exists; never invent nodes for production traffic.
    detection: ["D1", "D2", "D3"],
    prevention: ["R1", "R2", "R3"],
    intensity: 1.5,
    requiresApproval: true,
  },
};

/** Pending approval checkpoints awaiting human decision. */
const pendingCheckpoints = new Map<string, TanApprovalCheckpoint>();

/**
 * Build a human-readable execution plan metadata block (Transparency).
 */
export function buildExecutionPlan(input: {
  summary: string;
  toolDependencies: string[];
  assumptions: string[];
  confidenceMin?: number;
  confidenceMax?: number;
  stakes?: TaskStakes;
}): TanExecutionPlan {
  const stakes = input.stakes ?? "medium";
  const tierConfig = STAKES_TIER_MAP[stakes];

  return {
    planId: `tan-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    summary: input.summary,
    toolDependencies: input.toolDependencies,
    confidenceBoundaries: {
      min: input.confidenceMin ?? 0.0,
      max: input.confidenceMax ?? 1.0,
      assumptions: input.assumptions,
    },
    stakes,
    requiresHumanApproval: tierConfig.requiresApproval,
  };
}

/**
 * Format execution plan as human-readable metadata block.
 */
export function formatExecutionPlanBlock(plan: TanExecutionPlan): string {
  const lines = [
    "--- T.A.N. Execution Plan (Transparency) ---",
    `Plan ID: ${plan.planId}`,
    `Summary: ${plan.summary}`,
    `Stakes: ${plan.stakes}`,
    `Tools: ${plan.toolDependencies.join(", ") || "none"}`,
    `Confidence: [${plan.confidenceBoundaries.min}, ${plan.confidenceBoundaries.max}]`,
    `Assumptions:`,
    ...plan.confidenceBoundaries.assumptions.map((a) => `  - ${a}`),
    `Human approval required: ${plan.requiresHumanApproval ? "YES" : "no"}`,
    "---",
  ];
  return lines.join("\n");
}

/**
 * Compute adaptive security scaffold based on task stakes (Adaptivity).
 */
export function computeAdaptiveScaffold(stakes: TaskStakes): TanAdaptiveScaffold {
  const config = STAKES_TIER_MAP[stakes];
  return {
    stakes,
    enabledTiers: config.detection,
    enabledPrevention: config.prevention,
    intensityMultiplier: config.intensity,
  };
}

/**
 * Create a human-in-the-loop approval checkpoint (Negotiability).
 */
export function createApprovalCheckpoint(plan: TanExecutionPlan): TanApprovalCheckpoint {
  const checkpoint: TanApprovalCheckpoint = {
    checkpointId: `tan-cp-${plan.planId}`,
    planId: plan.planId,
    status: "pending",
  };
  pendingCheckpoints.set(checkpoint.checkpointId, checkpoint);
  return checkpoint;
}

/**
 * Approve a pending checkpoint.
 */
export function approveCheckpoint(checkpointId: string): TanApprovalCheckpoint {
  const cp = pendingCheckpoints.get(checkpointId);
  if (!cp) throw new Error(`Checkpoint '${checkpointId}' not found`);
  cp.status = "approved";
  return cp;
}

/**
 * Contest agent assumptions at a checkpoint.
 */
export function contestCheckpoint(
  checkpointId: string,
  contestedAssumptions: string[],
  editedGoals?: string
): TanApprovalCheckpoint {
  const cp = pendingCheckpoints.get(checkpointId);
  if (!cp) throw new Error(`Checkpoint '${checkpointId}' not found`);
  cp.status = "contested";
  cp.contestedAssumptions = contestedAssumptions;
  cp.editedGoals = editedGoals;
  return cp;
}

/**
 * Roll back a workflow at a checkpoint.
 */
export function rollbackCheckpoint(checkpointId: string): TanApprovalCheckpoint {
  const cp = pendingCheckpoints.get(checkpointId);
  if (!cp) throw new Error(`Checkpoint '${checkpointId}' not found`);
  cp.status = "rolled_back";
  return cp;
}

/**
 * Check if execution may proceed given plan and checkpoint state.
 */
export function mayProceedWithPlan(
  plan: TanExecutionPlan,
  checkpoint?: TanApprovalCheckpoint
): { allowed: boolean; reason?: string } {
  if (!plan.requiresHumanApproval) {
    return { allowed: true };
  }
  if (!checkpoint) {
    return { allowed: false, reason: "T.A.N.: human approval checkpoint required but not created" };
  }
  if (checkpoint.status === "approved") {
    return { allowed: true };
  }
  if (checkpoint.status === "contested") {
    return { allowed: false, reason: "T.A.N.: checkpoint contested — awaiting revised plan" };
  }
  if (checkpoint.status === "rolled_back") {
    return { allowed: false, reason: "T.A.N.: workflow rolled back by human operator" };
  }
  return { allowed: false, reason: "T.A.N.: checkpoint pending human approval" };
}

/** Reset checkpoint state (testing only). */
export function resetTanCheckpoints(): void {
  pendingCheckpoints.clear();
}

/** Get pending checkpoint (inspection). */
export function getCheckpoint(checkpointId: string): TanApprovalCheckpoint | undefined {
  return pendingCheckpoints.get(checkpointId);
}
