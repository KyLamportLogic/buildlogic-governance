import {
  setKillSwitchForTesting,
  clearKillSwitchCache,
  loadGovernancePolicy,
} from "@kypython/buildlogic-governance";
import { isAdminAuthorized } from "../tools/admin-auth.js";
import { registerKillTool } from "../tools/kill.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ---------------------------------------------------------------------------
// Direct handler tests — call the underlying governance functions the tools
// delegate to, without spinning up a full McpServer + transport.
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearKillSwitchCache();
  delete process.env["AI_ACTION_KILL_SWITCH"];
  delete process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
  delete process.env["AI_RESTRICTED_ACTIONS"];
  delete process.env["AI_MAX_RISK_LEVEL"];
  delete process.env["AGENT_ADMIN_TOKEN"];
});

afterEach(() => {
  clearKillSwitchCache();
  delete process.env["AI_ACTION_KILL_SWITCH"];
  delete process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"];
});

// ---------------------------------------------------------------------------
// governance/status — verifies the policy snapshot shape
// ---------------------------------------------------------------------------

describe("governance/status — underlying data", () => {
  it("returns killSwitchActive:false by default", () => {
    const { checkKillSwitch } = require("@kypython/buildlogic-governance");
    const result = checkKillSwitch();
    expect(result.active).toBe(false);
  });

  it("reflects active kill switch", () => {
    const { checkKillSwitch } = require("@kypython/buildlogic-governance");
    setKillSwitchForTesting(true);
    const result = checkKillSwitch();
    expect(result.active).toBe(true);
    expect(result.reason).toMatch(/kill switch/i);
  });

  it("policy has expected shape", () => {
    const policy = loadGovernancePolicy();
    expect(typeof policy.requireContracts).toBe("boolean");
    expect(typeof policy.maxRiskLevel).toBe("number");
    expect(policy.restrictedActions instanceof Set).toBe(true);
    expect(typeof policy.parallelPreflightChecks).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// governance/preflight — tests runGovernancePreflight via ai-governance directly
// ---------------------------------------------------------------------------

describe("governance/preflight — underlying logic", () => {
  const { runGovernancePreflight } = require("@kypython/buildlogic-governance");
  const ctx = { userId: "mcp-test-user" };

  it("returns allowed:false when kill switch is active", async () => {
    setKillSwitchForTesting(true);
    const result = await runGovernancePreflight("test-action", {}, ctx);
    expect(result.allowed).toBe(false);
    expect(result.decisions.killSwitchActive).toBe(true);
  });

  it("returns allowed:true when permissive policy and no contract required", async () => {
    process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"] = "false";
    const result = await runGovernancePreflight("test-action", {}, ctx);
    expect(result.allowed).toBe(true);
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("returns allowed:false when action is in restricted list", async () => {
    process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"] = "false";
    process.env["AI_RESTRICTED_ACTIONS"] = "banned-action,another-banned";
    const result = await runGovernancePreflight("banned-action", {}, ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/restricted by policy/i);
  });

  it("includes audit object with actionName and userId", async () => {
    process.env["AI_REQUIRE_GOVERNANCE_CONTRACT"] = "false";
    const result = await runGovernancePreflight("my-action", {}, ctx);
    expect(result.audit.actionName).toBe("my-action");
    expect(result.audit.userId).toBe("mcp-test-user");
    expect(typeof result.audit.timestamp).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// governance/kill + governance/revive — env + cache state
// ---------------------------------------------------------------------------

describe("governance/kill + governance/revive — state transitions", () => {
  it("the registered kill tool invalidates a cached allow immediately", async () => {
    const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
    const server = {
      registerTool(name: string, _definition: unknown, handler: (args: unknown) => Promise<unknown>) {
        handlers.set(name, handler);
      },
    } as unknown as McpServer;
    registerKillTool(server, { adminToken: "secret-token-abc" });

    const { checkKillSwitch } = require("@kypython/buildlogic-governance");
    expect(checkKillSwitch().active).toBe(false);

    await handlers.get("governance/kill")?.({
      adminToken: "secret-token-abc",
      reason: "operator stop",
    });

    expect(checkKillSwitch().active).toBe(true);
  });

  it("activating kill switch makes checkKillSwitch return active:true", () => {
    const { checkKillSwitch } = require("@kypython/buildlogic-governance");

    // Simulate what the kill tool does
    process.env["AI_ACTION_KILL_SWITCH"] = "true";
    clearKillSwitchCache();

    const result = checkKillSwitch();
    expect(result.active).toBe(true);
  });

  it("clearKillSwitchCache + deleting env revives the switch", () => {
    const { checkKillSwitch } = require("@kypython/buildlogic-governance");

    process.env["AI_ACTION_KILL_SWITCH"] = "true";
    clearKillSwitchCache();
    expect(checkKillSwitch().active).toBe(true);

    // Simulate what revive tool does
    delete process.env["AI_ACTION_KILL_SWITCH"];
    clearKillSwitchCache();
    expect(checkKillSwitch().active).toBe(false);
  });

  it("round-trips kill → revive without residual state", () => {
    const { checkKillSwitch } = require("@kypython/buildlogic-governance");

    setKillSwitchForTesting(true);
    expect(checkKillSwitch().active).toBe(true);

    setKillSwitchForTesting(false);
    clearKillSwitchCache();
    expect(checkKillSwitch().active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Admin token guard — validates the pattern used in kill/revive tools
// ---------------------------------------------------------------------------

describe("admin token guard (isAdminAuthorized — fail-closed)", () => {
  it("rejects when token does not match", () => {
    expect(isAdminAuthorized("secret-token-abc", "wrong-token-abc")).toBe(false);
  });

  it("accepts when token matches the configured secret", () => {
    expect(isAdminAuthorized("secret-token-abc", "secret-token-abc")).toBe(true);
  });

  it("fails closed when the server has no configured token", () => {
    expect(isAdminAuthorized("", "")).toBe(false);
    expect(isAdminAuthorized(undefined, "anything")).toBe(false);
  });

  it("rejects known placeholder/default tokens even on exact match", () => {
    expect(isAdminAuthorized("changeme", "changeme")).toBe(false);
    expect(isAdminAuthorized("change-me", "change-me")).toBe(false);
    expect(isAdminAuthorized("replace-with-long-random-secret", "replace-with-long-random-secret")).toBe(false);
  });
});
