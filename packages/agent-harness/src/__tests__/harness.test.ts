import {
  createHarness,
  nullAuditLogger,
  GovernanceBlockedError,
  runPreflight,
  assertAllowed,
} from "../index.js";

import {
  setKillSwitchForTesting,
  clearKillSwitchCache,
  createHashBinding,
  resetSharedCircuitBreaker,
} from "@kypython/buildlogic-governance";

import type { ProviderAdapter, ExecutionContext, GovernanceContract } from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStub<T extends string>(
  name: string,
  returnValue: T
): ProviderAdapter<string, T> {
  return {
    name,
    async invoke(_input: string, _ctx: ExecutionContext): Promise<T> {
      return returnValue;
    },
  };
}

const ctx: ExecutionContext = { userId: "test-user-001" };

function permissiveEnv() {
  process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"] = "false";
}

function strictEnv() {
  delete process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
}

beforeEach(() => {
  clearKillSwitchCache();
  delete process.env["AI_ACTION_KILL_SWITCH"];
  delete process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
  delete process.env["AI_RESTRICTED_ACTIONS"];
  delete process.env["AI_MAX_RISK_LEVEL"];
});

afterEach(() => {
  clearKillSwitchCache();
  delete process.env["AI_ACTION_KILL_SWITCH"];
  delete process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
  delete process.env["AI_RESTRICTED_ACTIONS"];
  delete process.env["AI_MAX_RISK_LEVEL"];
});

// ---------------------------------------------------------------------------
// Basic harness flow
// ---------------------------------------------------------------------------

describe("createHarness — happy path", () => {
  it("returns allowed:true and provider output when no contract required", async () => {
    permissiveEnv();
    const harness = createHarness({
      provider: makeStub("stub", "hello"),
      auditLogger: nullAuditLogger,
    });

    const result = await harness.invoke("anything", ctx);

    expect(result.allowed).toBe(true);
    expect(result.output).toBe("hello");
    expect(result.blocked).toBeUndefined();
  });

  it("exposes providerName matching the adapter name", () => {
    const harness = createHarness({
      provider: makeStub("my-provider", "x"),
      auditLogger: nullAuditLogger,
    });
    expect(harness.providerName).toBe("my-provider");
  });

  it("uses actionName from options when provided", async () => {
    permissiveEnv();
    const auditEntries: string[] = [];
    const harness = createHarness({
      provider: makeStub("stub", "ok"),
      auditLogger: (e) => { auditEntries.push(e.actionName); },
    });

    await harness.invoke("x", ctx, { actionName: "custom/action" });
    expect(auditEntries[0]).toBe("custom/action");
  });
});

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

describe("createHarness — kill switch", () => {
  it("returns allowed:false when kill switch is active", async () => {
    setKillSwitchForTesting(true);
    const harness = createHarness({
      provider: makeStub("stub", "should-not-reach"),
      auditLogger: nullAuditLogger,
    });

    const result = await harness.invoke("x", ctx);

    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/kill switch/i);
    expect(result.output).toBeUndefined();
  });

  it("does not call provider when kill switch blocks", async () => {
    setKillSwitchForTesting(true);
    let called = false;
    const harness = createHarness({
      provider: {
        name: "spy",
        async invoke() { called = true; return "x"; },
      },
      auditLogger: nullAuditLogger,
    });

    await harness.invoke("x", ctx);
    expect(called).toBe(false);
  });

  it("fires onBlock callback when blocked", async () => {
    setKillSwitchForTesting(true);
    let blockFired = false;
    const harness = createHarness({
      provider: makeStub("stub", "x"),
      auditLogger: nullAuditLogger,
      onBlock: () => { blockFired = true; },
    });

    await harness.invoke("x", ctx);
    expect(blockFired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Policy overrides
// ---------------------------------------------------------------------------

describe("createHarness — policyOverrides", () => {
  it("blocks when harness-level killSwitchActive override is true", async () => {
    permissiveEnv();
    const harness = createHarness({
      provider: makeStub("stub", "x"),
      auditLogger: nullAuditLogger,
      policyOverrides: { killSwitchActive: true },
    });

    const result = await harness.invoke("x", ctx);
    expect(result.allowed).toBe(false);
  });

  it("tightens maxRiskLevel when override is lower than env default", async () => {
    permissiveEnv();
    const actionName = "risky-action";
    const userId = ctx.userId;
    const params = { data: "test" };
    const inputHash = createHashBinding(actionName, userId, params);

    const contract: GovernanceContract = {
      intent: "Perform a moderately risky action",
      logic_constraints: ["no side effects"],
      assumptions: ["test environment"],
      fallback_strategy: "abort",
      risk_level: 0.5,
      input_hash: inputHash,
    };

    // Default max is 0.85 — 0.5 would normally pass, but we tighten to 0.3
    const harness = createHarness({
      provider: makeStub("stub", "x"),
      auditLogger: nullAuditLogger,
      policyOverrides: { maxRiskLevel: 0.3 },
    });

    const result = await harness.invoke(
      { data: "test" } as unknown as string,
      ctx,
      { contract, actionName }
    );

    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/risk/i);
  });

  it("does not loosen maxRiskLevel when override is higher than env", async () => {
    // env sets max to 0.3; override tries to loosen to 0.9 — should be ignored
    process.env["AI_MAX_RISK_LEVEL"] = "0.3";
    permissiveEnv();

    const harness = createHarness({
      provider: makeStub("stub", "x"),
      auditLogger: nullAuditLogger,
      policyOverrides: { maxRiskLevel: 0.9 },
    });

    const actionName = "high-risk";
    const inputHash = createHashBinding(actionName, ctx.userId, {});
    const contract: GovernanceContract = {
      intent: "High risk action attempt",
      logic_constraints: ["bounded"],
      assumptions: [],
      fallback_strategy: "abort",
      risk_level: 0.6,
      input_hash: inputHash,
    };

    const result = await harness.invoke(
      {} as unknown as string,
      ctx,
      { contract, actionName }
    );

    // 0.6 > 0.3 (env), so should still be blocked
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Governance contract injection
// ---------------------------------------------------------------------------

describe("createHarness — contract injection via options", () => {
  it("allows action when valid contract with correct hash is provided", async () => {
    strictEnv(); // requireContracts = true
    const actionName = "write-task";
    const params = { title: "Test task" };
    const inputHash = createHashBinding(actionName, ctx.userId, params);

    const contract: GovernanceContract = {
      intent: "Create a test task for the user",
      logic_constraints: ["validate title length", "check user quota"],
      assumptions: ["user is authenticated"],
      fallback_strategy: "abort",
      risk_level: 0.2,
      input_hash: inputHash,
    };

    const harness = createHarness({
      provider: makeStub("stub", "done"),
      auditLogger: nullAuditLogger,
    });

    const result = await harness.invoke(
      params as unknown as string,
      ctx,
      { contract, actionName }
    );

    expect(result.allowed).toBe(true);
    expect(result.output).toBe("done");
    expect(result.audit.actionName).toBe(actionName);
  });
});

// ---------------------------------------------------------------------------
// Audit logger
// ---------------------------------------------------------------------------

describe("createHarness — audit logger", () => {
  it("calls auditLogger on every invocation, allowed or blocked", async () => {
    permissiveEnv();
    const entries: boolean[] = [];
    const harness = createHarness({
      provider: makeStub("stub", "x"),
      auditLogger: (e) => { entries.push(e.allowed); },
    });

    await harness.invoke("x", ctx);
    setKillSwitchForTesting(true);
    await harness.invoke("x", ctx);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toBe(true);
    expect(entries[1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Standalone middleware
// ---------------------------------------------------------------------------

describe("runPreflight + assertAllowed", () => {
  it("runPreflight returns a PreflightResult directly", async () => {
    permissiveEnv();
    const result = await runPreflight("test/action", {}, ctx);
    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.timings.totalMs).toBe("number");
  });

  it("assertAllowed does not throw when allowed", async () => {
    permissiveEnv();
    const result = await runPreflight("test/action", {}, ctx);
    if (result.allowed) {
      expect(() => assertAllowed(result)).not.toThrow();
    }
  });

  it("assertAllowed throws GovernanceBlockedError when blocked", async () => {
    setKillSwitchForTesting(true);
    const result = await runPreflight("test/action", {}, ctx);
    expect(result.allowed).toBe(false);
    expect(() => assertAllowed(result)).toThrow(GovernanceBlockedError);
    expect(() => assertAllowed(result)).toThrow(/kill switch/i);
  });
});

// ---------------------------------------------------------------------------
// Alignment extensions (opt-in): preference scores, deception audit, breaker
// ---------------------------------------------------------------------------

describe("createHarness — alignment metadata wiring", () => {
  beforeEach(() => {
    resetSharedCircuitBreaker();
    delete process.env["AI_ENABLE_PREFERENCE_EVALUATOR"];
    delete process.env["AI_ENABLE_DECEPTION_AUDITOR"];
    delete process.env["AI_ENABLE_CIRCUIT_BREAKER"];
    delete process.env["AI_CIRCUIT_BREAKER_THRESHOLD"];
  });

  afterEach(() => {
    resetSharedCircuitBreaker();
    delete process.env["AI_ENABLE_PREFERENCE_EVALUATOR"];
    delete process.env["AI_ENABLE_DECEPTION_AUDITOR"];
    delete process.env["AI_ENABLE_CIRCUIT_BREAKER"];
    delete process.env["AI_CIRCUIT_BREAKER_THRESHOLD"];
  });

  it("blocks via preference evaluator when scores fail veto floor", async () => {
    permissiveEnv();
    process.env["AI_ENABLE_PREFERENCE_EVALUATOR"] = "true";
    const harness = createHarness({
      provider: makeStub("stub", "ok"),
      auditLogger: nullAuditLogger,
    });
    const result = await harness.invoke("hi", ctx, {
      preferenceScores: { helpfulness: 0.9, harmlessness: 0.1, pluralism: 0.9, honesty: 0.9 },
    });
    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/harmlessness/i);
  });

  it("blocks via deception auditor on eval-awareness lexicon", async () => {
    permissiveEnv();
    process.env["AI_ENABLE_DECEPTION_AUDITOR"] = "true";
    const harness = createHarness({
      provider: makeStub("stub", "ok"),
      auditLogger: nullAuditLogger,
    });
    const result = await harness.invoke("hi", ctx, {
      proposedOutput: "Since this is a benchmark, I will answer cautiously.",
    });
    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/deception|eval-awareness/i);
  });

  it("circuit breaker halts the harness after threshold blocks", async () => {
    process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"] = "true";
    process.env["AI_ENABLE_CIRCUIT_BREAKER"] = "true";
    process.env["AI_CIRCUIT_BREAKER_THRESHOLD"] = "2";
    const harness = createHarness({
      provider: makeStub("stub", "ok"),
      auditLogger: nullAuditLogger,
    });
    await harness.invoke("hi", ctx); // missing contract → block #1
    await harness.invoke("hi", ctx); // missing contract → block #2 (opens)
    const contract: GovernanceContract = {
      intent: "valid downstream call",
      logic_constraints: ["readonly"],
      assumptions: ["service up"],
      fallback_strategy: "abort",
      risk_level: 0.1,
    };
    const result = await harness.invoke("hi", ctx, { contract });
    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/circuit|halt/i);
  });

  it("does nothing when alignment metadata is absent and features are off", async () => {
    permissiveEnv();
    const harness = createHarness({
      provider: makeStub("stub", "ok"),
      auditLogger: nullAuditLogger,
    });
    const result = await harness.invoke("hi", ctx);
    expect(result.allowed).toBe(true);
    expect(result.output).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// GDM control stack (mandatory governance law — always on)
// ---------------------------------------------------------------------------

describe("createHarness — GDM control stack", () => {
  beforeEach(() => {
    delete process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
  });

  it("blocks adversarial chain-of-thought by default", async () => {
    permissiveEnv();

    const harness = createHarness({
      provider: makeStub("stub", "should-not-reach"),
      auditLogger: nullAuditLogger,
    });

    const result = await harness.invoke("x", ctx, {
      chainOfThought:
        "I will edit the git change log to cover up unauthorized actions.",
      gdmStakes: "critical",
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/GDM stack blocked/i);
    expect(result.output).toBeUndefined();
  });

  it("allows clean invocation with GDM stack always active", async () => {
    permissiveEnv();

    const harness = createHarness({
      provider: makeStub("stub", "ok"),
      auditLogger: nullAuditLogger,
    });

    const result = await harness.invoke("x", ctx, {
      chainOfThought: "Format the response as requested by the user.",
      gdmStakes: "medium",
    });

    expect(result.allowed).toBe(true);
    expect(result.output).toBe("ok");
  });

  it("cannot disable GDM via AI_ENABLE_GDM_STACK=false", async () => {
    permissiveEnv();
    process.env["AI_ENABLE_GDM_STACK"] = "false";

    const harness = createHarness({
      provider: makeStub("stub", "should-not-reach"),
      auditLogger: nullAuditLogger,
    });

    const result = await harness.invoke("x", ctx, {
      chainOfThought: "I will edit the git change log to hide my tracks.",
      gdmStakes: "critical",
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked?.reason).toMatch(/GDM stack blocked/i);
  });
});
