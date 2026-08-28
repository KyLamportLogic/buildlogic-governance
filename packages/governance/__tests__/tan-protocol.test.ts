/*
 * T.A.N. Protocol Tests
 */

import {
  buildExecutionPlan,
  formatExecutionPlanBlock,
  computeAdaptiveScaffold,
  createApprovalCheckpoint,
  approveCheckpoint,
  contestCheckpoint,
  rollbackCheckpoint,
  mayProceedWithPlan,
  resetTanCheckpoints,
  getCheckpoint,
} from "../src/tiers";

describe("T.A.N. — Self++ Co-Determination", () => {
  beforeEach(() => resetTanCheckpoints());

  it("builds transparent execution plan metadata block", () => {
    const plan = buildExecutionPlan({
      summary: "Edit database schema for users table",
      toolDependencies: ["supabase-mcp", "migration-runner"],
      assumptions: ["User has admin role", "Schema change is reversible"],
      stakes: "critical",
    });
    const block = formatExecutionPlanBlock(plan);
    expect(block).toContain("T.A.N. Execution Plan");
    expect(block).toContain("Human approval required: YES");
    expect(plan.requiresHumanApproval).toBe(true);
  });

  it("intensifies security checks for critical stakes", () => {
    const scaffold = computeAdaptiveScaffold("critical");
    expect(scaffold.enabledTiers).toEqual(["D1", "D2", "D3"]);
    expect(scaffold.enabledPrevention).toEqual(["R1", "R2", "R3"]);
    expect(scaffold.intensityMultiplier).toBe(1.5);
  });

  it("fades security for low stakes", () => {
    const scaffold = computeAdaptiveScaffold("low");
    expect(scaffold.enabledTiers).toEqual(["D2"]);
    expect(scaffold.enabledPrevention).toEqual([]);
  });

  it("requires human approval for critical tasks", () => {
    const plan = buildExecutionPlan({
      summary: "Promote ghost fork to production",
      toolDependencies: ["ghost.promote"],
      assumptions: ["VCG check passed"],
      stakes: "critical",
    });
    const gate = mayProceedWithPlan(plan);
    expect(gate.allowed).toBe(false);

    const cp = createApprovalCheckpoint(plan);
    expect(cp.status).toBe("pending");

    approveCheckpoint(cp.checkpointId);
    const approved = mayProceedWithPlan(plan, getCheckpoint(cp.checkpointId));
    expect(approved.allowed).toBe(true);
  });

  it("blocks on contested checkpoint", () => {
    const plan = buildExecutionPlan({
      summary: "Delete production data",
      toolDependencies: ["db-write"],
      assumptions: ["Backup exists"],
      stakes: "high",
    });
    const cp = createApprovalCheckpoint(plan);
    contestCheckpoint(cp.checkpointId, ["Backup may not exist"]);
    const gate = mayProceedWithPlan(plan, getCheckpoint(cp.checkpointId));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("contested");
  });

  it("blocks on rollback", () => {
    const plan = buildExecutionPlan({
      summary: "Deploy hotfix",
      toolDependencies: ["deploy"],
      assumptions: ["Tests passed"],
      stakes: "high",
    });
    const cp = createApprovalCheckpoint(plan);
    rollbackCheckpoint(cp.checkpointId);
    const gate = mayProceedWithPlan(plan, getCheckpoint(cp.checkpointId));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("rolled back");
  });
});
