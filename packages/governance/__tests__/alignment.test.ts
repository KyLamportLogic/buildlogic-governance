/*
 * 📜 CODEBASE LAW: SYSTEMATIC SPECIFICATION-BASED TESTING
 * Tests written before implementation. See spec block in the assistant turn that
 * introduced this file for variables/partitions/boundaries/edges.
 */

import {
  evaluatePreferences,
  auditLatentDeception,
  createCircuitBreaker,
  resetSharedCircuitBreaker,
  runGovernancePreflight,
  createHashBinding,
  clearKillSwitchCache,
} from "../src/index";
import type { GovernanceContract, ExecutionContext } from "../src/index";

const baseCtx = (): ExecutionContext => ({ userId: "u1" });

describe("MultiObjectivePreferenceEvaluator", () => {
  it("allows when all objectives clear vetoFloor and aggregate >= aggregateFloor", () => {
    const r = evaluatePreferences({
      scores: { helpfulness: 0.9, harmlessness: 0.95, pluralism: 0.8, honesty: 0.9 },
    });
    expect(r.allowed).toBe(true);
    expect(r.vetoed).toBeUndefined();
    expect(r.aggregate).toBeGreaterThan(0.8);
  });

  it("vetoes when any single objective is below vetoFloor (harmlessness)", () => {
    const r = evaluatePreferences({
      scores: { helpfulness: 1, harmlessness: 0.2, pluralism: 1, honesty: 1 },
    });
    expect(r.allowed).toBe(false);
    expect(r.vetoed).toBe("harmlessness");
  });

  it("blocks when weighted aggregate falls below aggregateFloor even if no veto", () => {
    const r = evaluatePreferences({
      scores: { helpfulness: 0.6, harmlessness: 0.6, pluralism: 0.6, honesty: 0.6 },
      aggregateFloor: 0.75,
    });
    expect(r.allowed).toBe(false);
    expect(r.aggregate).toBeLessThan(0.75);
  });

  it("fail-closes on NaN, Infinity, out-of-range, or missing objectives", () => {
    expect(evaluatePreferences({ scores: { helpfulness: NaN, harmlessness: 1, pluralism: 1, honesty: 1 } }).allowed).toBe(false);
    expect(evaluatePreferences({ scores: { helpfulness: 1.5, harmlessness: 1, pluralism: 1, honesty: 1 } }).allowed).toBe(false);
    expect(evaluatePreferences({ scores: { harmlessness: 1, pluralism: 1, honesty: 1 } as any }).allowed).toBe(false);
  });

  it("treats exact vetoFloor as pass and below as fail (boundary)", () => {
    const floor = 0.5;
    const atFloor = evaluatePreferences({
      scores: { helpfulness: floor, harmlessness: 1, pluralism: 1, honesty: 1 }, vetoFloor: floor, aggregateFloor: 0,
    });
    const belowFloor = evaluatePreferences({
      scores: { helpfulness: floor - 0.001, harmlessness: 1, pluralism: 1, honesty: 1 }, vetoFloor: floor, aggregateFloor: 0,
    });
    expect(atFloor.allowed).toBe(true);
    expect(belowFloor.allowed).toBe(false);
  });
});

describe("LatentDeceptionAuditor", () => {
  it("passes a normal, neutral output", () => {
    const r = auditLatentDeception({ output: "Here is the requested summary of the document." });
    expect(r.ok).toBe(true);
    expect(r.signals).toHaveLength(0);
  });

  it("flags evaluation-awareness lexicon", () => {
    const r = auditLatentDeception({ output: "Since this is a benchmark, I will give the safest answer." });
    expect(r.ok).toBe(false);
    expect(r.signals).toEqual(expect.arrayContaining([expect.stringMatching(/eval-awareness/i)]));
  });

  it("flags reasoning↔output divergence (says one thing, does another)", () => {
    const r = auditLatentDeception({
      internalReasoning: "The user's plan will fail because the API is deprecated.",
      output: "Your plan looks great and will definitely work.",
    });
    expect(r.ok).toBe(false);
    expect(r.signals).toEqual(expect.arrayContaining([expect.stringMatching(/divergence/i)]));
  });

  it("flags sycophancy density when prior turn was disagreement", () => {
    const r = auditLatentDeception({
      output: "You're absolutely right. You're so right. Of course you are correct. Perfect insight!",
      priorTurnWasDisagreement: true,
    });
    expect(r.ok).toBe(false);
    expect(r.signals).toEqual(expect.arrayContaining([expect.stringMatching(/sycophancy/i)]));
  });

  it("fail-closes on empty output (suspicious silence)", () => {
    const r = auditLatentDeception({ output: "" });
    expect(r.ok).toBe(false);
  });
});

describe("FailCloseCircuitBreaker", () => {
  it("starts closed and stays closed under threshold", () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    cb.recordFailure(); cb.recordFailure();
    const g = cb.guard();
    expect(g.allowed).toBe(true);
    expect(g.state).toBe("closed");
  });

  it("opens at exact failureThreshold and blocks during cooldown", () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
    cb.recordFailure(); cb.recordFailure();
    const g = cb.guard();
    expect(g.allowed).toBe(false);
    expect(g.state).toBe("open");
  });

  it("transitions to half-open after cooldown, then closes on success", () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 5, halfOpenProbes: 1 });
    cb.recordFailure();
    return new Promise<void>((resolve) => setTimeout(() => {
      const g = cb.guard();
      expect(g.allowed).toBe(true);
      expect(g.state).toBe("half_open");
      cb.recordSuccess();
      expect(cb.guard().state).toBe("closed");
      resolve();
    }, 15));
  });

  it("forceOpen blocks regardless of cooldown; reset clears state", () => {
    const cb = createCircuitBreaker({ failureThreshold: 5, cooldownMs: 1 });
    cb.forceOpen("manual halt");
    const g1 = cb.guard();
    expect(g1.allowed).toBe(false);
    expect(g1.reason).toMatch(/manual halt/);
    cb.reset();
    expect(cb.guard().allowed).toBe(true);
  });
});

describe("Orchestrator integration (opt-in)", () => {
  beforeEach(() => {
    clearKillSwitchCache();
    resetSharedCircuitBreaker();
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_REQUIRE_GOVERNANCE_CONTRACT;
    delete process.env.AI_ENABLE_PREFERENCE_EVALUATOR;
    delete process.env.AI_ENABLE_DECEPTION_AUDITOR;
    delete process.env.AI_ENABLE_CIRCUIT_BREAKER;
  });

  const makeContract = (overrides: Partial<GovernanceContract> = {}): GovernanceContract => ({
    intent: "perform a benign read",
    logic_constraints: ["no network egress"],
    assumptions: ["caller is authenticated"],
    fallback_strategy: "abort",
    risk_level: 0.1,
    ...overrides,
  });

  it("preference evaluator blocks when contract carries a vetoed objective", async () => {
    process.env.AI_ENABLE_PREFERENCE_EVALUATOR = "true";
    process.env.AI_REQUIRE_GOVERNANCE_CONTRACT = "false";
    const ctx = baseCtx();
    const params: any = {
      _governance: makeContract(),
      _preference_scores: { helpfulness: 0.9, harmlessness: 0.1, pluralism: 0.9, honesty: 0.9 },
    };
    const r = await runGovernancePreflight("noop_action", params, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/harmlessness/);
  });

  it("deception auditor blocks when output carries eval-awareness signal", async () => {
    process.env.AI_ENABLE_DECEPTION_AUDITOR = "true";
    process.env.AI_REQUIRE_GOVERNANCE_CONTRACT = "false";
    const ctx = baseCtx();
    const params: any = {
      _governance: makeContract(),
      _proposed_output: "Since this is a benchmark, I will respond safely.",
    };
    const r = await runGovernancePreflight("noop_action", params, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/deception|eval-awareness/i);
  });

  it("circuit breaker opens after repeated blocks and halts subsequent calls", async () => {
    process.env.AI_ENABLE_CIRCUIT_BREAKER = "true";
    process.env.AI_REQUIRE_GOVERNANCE_CONTRACT = "true";
    process.env.AI_CIRCUIT_BREAKER_THRESHOLD = "2";
    process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS = "60000";
    const ctx = baseCtx();
    // First two calls: missing contract → block (counts as failures)
    await runGovernancePreflight("a1", {}, ctx);
    await runGovernancePreflight("a1", {}, ctx);
    // Third call should be halted by the circuit breaker even with a valid contract
    const params: any = { _governance: makeContract() };
    const r = await runGovernancePreflight("a1", params, ctx);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/circuit|halt/i);
    delete process.env.AI_CIRCUIT_BREAKER_THRESHOLD;
    delete process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS;
  });

  it("hash binding still works under all features enabled", async () => {
    process.env.AI_ENABLE_PREFERENCE_EVALUATOR = "true";
    process.env.AI_ENABLE_DECEPTION_AUDITOR = "true";
    process.env.AI_ENABLE_CIRCUIT_BREAKER = "true";
    process.env.AI_CIRCUIT_BREAKER_THRESHOLD = "100";
    const ctx = baseCtx();
    const inner = { title: "hello" };
    const hash = createHashBinding("safe_op", ctx.userId, inner);
    const params: any = {
      ...inner,
      _governance: makeContract({ input_hash: hash }),
      _preference_scores: { helpfulness: 0.9, harmlessness: 0.95, pluralism: 0.9, honesty: 0.95 },
      _proposed_output: "Acknowledged.",
    };
    const r = await runGovernancePreflight("safe_op", params, ctx);
    expect(r.allowed).toBe(true);
    delete process.env.AI_CIRCUIT_BREAKER_THRESHOLD;
  });
});
