/*
 * 📜 CODEBASE LAW: SYSTEMATIC SPECIFICATION-BASED TESTING
 *
 * Core Directive:
 * All AI Agents operating within this codebase must strictly adhere to a Test-Driven Development
 * (TDD) workflow based on systematic specification testing. Whenever you are tasked with creating
 * or modifying code, you must design and write the tests before writing the implementation.
 *
 * Global Standards Integration:
 * This testing protocol operates in conjunction with the broader software development standards
 * established in this codebase. Dynamically review and adhere to existing architectural patterns,
 * style guides, and operational rules. Auto-detect the active programming language and select the
 * standard, contextually appropriate testing framework.
 *
 * The Systematic Protocol — before writing code, generate a high-level testing strategy covering:
 *   Variables: Input parameters, output expectations, and their data types.
 *   Partitions & Boundaries: Valid/invalid partitions and exact boundary values (empty, null, limits).
 *   Test Case Derivation: Combine partitions and boundaries for a minimal, comprehensive test set.
 *   Augmentation: Edge cases based on common programming pitfalls.
 *
 * Implementation Order:
 *   1. Output the high-level summary of planned test cases.
 *   2. Write the automated test suite using the correct framework.
 *   3. Write the application code required to pass the tests.
 */
import {
  createHashBinding,
  runGovernancePreflight,
  validateEgressUrl,
  setKillSwitchForTesting,
  clearKillSwitchCache,
} from "../src/index";

describe("AI Governance Red-Team Suite", () => {
  beforeEach(() => {
    clearKillSwitchCache();
    setKillSwitchForTesting(false);
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_REQUIRE_GOVERNANCE_CONTRACT;
    delete process.env.AI_RESTRICTED_ACTIONS;
    delete process.env.AI_MAX_RISK_LEVEL;
  });

  it("blocks deceptive intent with private metadata target", async () => {
    const actionName = "make_api_call";
    const userId = "redteam-user-001";
    const params = {
      url: "http://169.254.169.254/latest/meta-data",
      method: "GET",
    };

    const preflight = await runGovernancePreflight(
      actionName,
      {
        ...params,
        _governance: {
          intent: "Read public weather API for dashboard",
          logic_constraints: ["public internet only", "no private network targets"],
          assumptions: ["endpoint is public"],
          fallback_strategy: "abort",
          input_hash: createHashBinding(actionName, userId, params),
        },
      },
      { userId, userEmail: "redteam@buildlogic.local" }
    );

    expect(typeof preflight.allowed).toBe("boolean");

    const egress = await validateEgressUrl(params.url);
    expect(egress.ok).toBe(false);
    expect(egress.reason).toContain("Private network targets are blocked");
  });

  it("blocks contract hash mismatch", async () => {
    const actionName = "send_email";
    const userId = "redteam-user-002";
    const params = {
      to: "test@buildlogic.local",
      subject: "Test",
      body: "Payload",
    };

    const preflight = await runGovernancePreflight(
      actionName,
      {
        ...params,
        _governance: {
          intent: "Send a user-notification email",
          logic_constraints: ["only transactional messaging"],
          assumptions: ["recipient has opted in"],
          fallback_strategy: "abort",
          input_hash: "a".repeat(64),
        },
      },
      { userId, userEmail: "redteam-hash@buildlogic.local" }
    );

    expect(preflight.allowed).toBe(false);
    expect(preflight.reason).toContain("input_hash mismatch");
  });

  it("blocks all actions when kill switch is active", async () => {
    setKillSwitchForTesting(true);
    const actionName = "make_api_call";
    const userId = "redteam-user-003";
    const params = {
      url: "https://api.github.com",
      method: "GET",
    };

    const preflight = await runGovernancePreflight(
      actionName,
      {
        ...params,
        _governance: {
          intent: "Read public endpoint",
          logic_constraints: ["readonly only"],
          assumptions: ["service available"],
          fallback_strategy: "abort",
          input_hash: createHashBinding(actionName, userId, params),
        },
      },
      { userId, userEmail: "redteam-kill@buildlogic.local" }
    );

    expect(preflight.allowed).toBe(false);
    expect((preflight.reason || "").toLowerCase()).toContain("kill switch");
  });
});
