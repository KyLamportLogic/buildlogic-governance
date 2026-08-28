/*
 * Per-action risk ceilings — AI_ACTION_RISK_CEILINGS
 *
 * The global AI_MAX_RISK_LEVEL is a single ceiling for every action. This
 * lets specific high-stakes action names (or `prefix.*` patterns) be pinned
 * to a *stricter* ceiling than the global one, without ever loosening it.
 *
 * TDD: written before the policyEngine implementation.
 */

import {
  loadGovernancePolicy,
  isRiskLevelAllowed,
  getEffectiveMaxRiskLevel,
  createDefaultPolicy,
} from "../src/index";

const ENV_KEYS = ["AI_MAX_RISK_LEVEL", "AI_ACTION_RISK_CEILINGS"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("AI_ACTION_RISK_CEILINGS parsing", () => {
  it("defaults to no per-action ceilings — global maxRiskLevel applies everywhere", () => {
    const policy = loadGovernancePolicy();
    expect(policy.actionRiskCeilings).toEqual([]);
    expect(getEffectiveMaxRiskLevel("send_email", policy)).toBe(policy.maxRiskLevel);
  });

  it("parses exact-match pattern:value pairs", () => {
    process.env.AI_ACTION_RISK_CEILINGS = "send_email:0.3,make_api_call:0.4";
    const policy = loadGovernancePolicy();
    expect(policy.actionRiskCeilings).toEqual([
      { pattern: "send_email", maxRiskLevel: 0.3 },
      { pattern: "make_api_call", maxRiskLevel: 0.4 },
    ]);
  });

  it("skips malformed entries instead of throwing", () => {
    process.env.AI_ACTION_RISK_CEILINGS = "send_email:0.3,garbage,:0.5,also_bad:notanumber,ok_action:0.2";
    const policy = loadGovernancePolicy();
    expect(policy.actionRiskCeilings).toEqual([
      { pattern: "send_email", maxRiskLevel: 0.3 },
      { pattern: "ok_action", maxRiskLevel: 0.2 },
    ]);
  });

  it("clamps out-of-range values to [0,1]", () => {
    process.env.AI_ACTION_RISK_CEILINGS = "over:1.5,under:-0.2";
    const policy = loadGovernancePolicy();
    expect(policy.actionRiskCeilings).toEqual([
      { pattern: "over", maxRiskLevel: 1 },
      { pattern: "under", maxRiskLevel: 0 },
    ]);
  });
});

describe("getEffectiveMaxRiskLevel", () => {
  it("tightens the ceiling for an exact-match action", () => {
    process.env.AI_MAX_RISK_LEVEL = "0.85";
    process.env.AI_ACTION_RISK_CEILINGS = "send_email:0.3";
    const policy = loadGovernancePolicy();
    expect(getEffectiveMaxRiskLevel("send_email", policy)).toBe(0.3);
    expect(getEffectiveMaxRiskLevel("some_other_action", policy)).toBe(0.85);
  });

  it("matches trailing-wildcard patterns as a prefix match", () => {
    process.env.AI_ACTION_RISK_CEILINGS = "integration.reddit.*:0.4";
    const policy = loadGovernancePolicy();
    expect(getEffectiveMaxRiskLevel("integration.reddit.analyze", policy)).toBe(0.4);
    expect(getEffectiveMaxRiskLevel("integration.reddit.insights", policy)).toBe(0.4);
    expect(getEffectiveMaxRiskLevel("integration.slack.analyze", policy)).toBe(0.85);
  });

  it("can never loosen above the global ceiling, even if misconfigured higher", () => {
    process.env.AI_MAX_RISK_LEVEL = "0.5";
    process.env.AI_ACTION_RISK_CEILINGS = "send_email:0.9";
    const policy = loadGovernancePolicy();
    // min(global 0.5, action-specific 0.9) => 0.5: per-action config can only tighten.
    expect(getEffectiveMaxRiskLevel("send_email", policy)).toBe(0.5);
  });

  it("takes the strictest ceiling when multiple patterns match the same action", () => {
    process.env.AI_ACTION_RISK_CEILINGS = "send_*:0.5,send_email:0.2";
    const policy = loadGovernancePolicy();
    expect(getEffectiveMaxRiskLevel("send_email", policy)).toBe(0.2);
  });
});

describe("isRiskLevelAllowed with actionName", () => {
  it("blocks a risk level that passes the global ceiling but fails the action-specific one", () => {
    process.env.AI_MAX_RISK_LEVEL = "0.85";
    process.env.AI_ACTION_RISK_CEILINGS = "send_email:0.3";
    const policy = loadGovernancePolicy();
    expect(isRiskLevelAllowed(0.6, policy, "send_email")).toBe(false);
    expect(isRiskLevelAllowed(0.6, policy, "unscoped_action")).toBe(true);
  });

  it("stays backward compatible when actionName is omitted", () => {
    const policy = createDefaultPolicy();
    expect(isRiskLevelAllowed(0.5, policy)).toBe(true);
    expect(isRiskLevelAllowed(0.9, policy)).toBe(false);
  });
});
