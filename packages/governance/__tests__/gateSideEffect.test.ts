/*
 * gateAiSideEffect / assertAiSideEffectAllowed — live call-site helper tests
 */

import {
  gateAiSideEffect,
  assertAiSideEffectAllowed,
  setKillSwitchForTesting,
  clearKillSwitchCache,
} from "../src/index";

describe("gateAiSideEffect", () => {
  beforeEach(() => {
    delete process.env.AI_ACTION_KILL_SWITCH;
    clearKillSwitchCache();
    setKillSwitchForTesting(false);
  });

  afterEach(() => {
    setKillSwitchForTesting(false);
    clearKillSwitchCache();
  });

  it("allows a contracted side effect when kill switch is off", async () => {
    const result = await gateAiSideEffect({
      actionName: "test.gate.allow",
      params: { foo: "bar" },
      context: { userId: "test-user" },
      intent: "unit test allow path",
      riskLevel: 0.1,
    });
    expect(result.allowed).toBe(true);
    expect(result.paramsWithContract._governance).toBeDefined();
  });

  it("denies when kill switch is active", async () => {
    setKillSwitchForTesting(true);
    const result = await gateAiSideEffect({
      actionName: "test.gate.deny",
      params: { foo: "bar" },
      context: { userId: "test-user" },
      intent: "unit test deny path",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason?.toLowerCase()).toMatch(/kill switch/);
  });

  it("assertAiSideEffectAllowed throws on deny", async () => {
    setKillSwitchForTesting(true);
    await expect(
      assertAiSideEffectAllowed({
        actionName: "test.gate.throw",
        params: {},
        context: { userId: "test-user" },
        intent: "unit test throw path",
      })
    ).rejects.toThrow(/Blocked by governance policy/);
  });

  it("forwards gdm.stakes and tanPlan into params for preflight GDM", async () => {
    const tanPlan = {
      planId: "plan-test",
      summary: "unit tan plan",
      toolDependencies: ["test.gate.gdm"],
      confidenceBoundaries: { min: 0, max: 1, assumptions: [] },
      stakes: "medium" as const,
      requiresHumanApproval: false,
    };
    const result = await gateAiSideEffect({
      actionName: "test.gate.gdm",
      params: { foo: "bar" },
      context: { userId: "test-user" },
      intent: "unit test gdm forwarding",
      riskLevel: 0.2,
      gdm: {
        stakes: "medium",
        tanPlan,
      },
    });
    expect(result.allowed).toBe(true);
    expect(result.paramsWithContract._gdm_stakes).toBe("medium");
    expect(result.paramsWithContract._tan_plan).toEqual(tanPlan);
  });

  it("denies params.url over plain HTTP by default (egress consumer)", async () => {
    const result = await gateAiSideEffect({
      actionName: "test.gate.http",
      params: { url: "http://8.8.8.8/" },
      context: { userId: "test-user" },
      intent: "unit test http egress",
      riskLevel: 0.1,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/egress denied/i);
  });

  it("allows https params.url when preflight passes", async () => {
    const result = await gateAiSideEffect({
      actionName: "test.gate.https",
      params: { url: "https://8.8.8.8/" },
      context: { userId: "test-user" },
      intent: "unit test https egress",
      riskLevel: 0.1,
    });
    expect(result.allowed).toBe(true);
  });
});
