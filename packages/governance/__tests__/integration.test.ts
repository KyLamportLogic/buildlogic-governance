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
/**
 * AI Governance — Toll Booth Integration Tests
 *
 * Tests the complete governance flow with all components.
 */

import {
  runGovernancePreflight,
  validateHashBinding,
  createHashBinding,
  validateContract,
  checkKillSwitch,
  setKillSwitchForTesting,
  clearKillSwitchCache,
  loadGovernancePolicy,
} from "../src/index";

import type { GovernanceContract, ExecutionContext } from "../src/index";

describe("AI Governance Toll Booth — Integration Tests", () => {
  beforeEach(() => {
    clearKillSwitchCache();
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_REQUIRE_GOVERNANCE_CONTRACT;
  });

  describe("runGovernancePreflight", () => {
    it("should allow action with valid contract and hash", async () => {
      const actionName = "create_task";
      const userId = "user-123";
      const params = { title: "My Task" };

      const inputHash = createHashBinding(actionName, userId, params);

      const contract: GovernanceContract = {
        intent: "Create a new task for the user",
        logic_constraints: ["must validate task name", "must check user permissions"],
        assumptions: ["user is authenticated"],
        fallback_strategy: "abort",
        risk_level: 0.3,
        input_hash: inputHash,
      };

      const context: ExecutionContext = {
        userId,
        userEmail: "user@example.com",
      };

      const result = await runGovernancePreflight(
        actionName,
        { ...params, _governance: contract },
        context
      );

      expect(result.allowed).toBe(true);
      expect(result.decisions.policyApproved).toBe(true);
      expect(result.decisions.contractValidated).toBe(true);
      expect(result.decisions.hashMatched).toBe(true);
      // Under-promise: preflight never validates URLs
      expect(result.decisions.egressCheckedInPreflight).toBe(false);
      expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);
    });

    it("should block action when kill switch is active", async () => {
      setKillSwitchForTesting(true);

      const result = await runGovernancePreflight(
        "create_task",
        { title: "Task" },
        { userId: "user-123" }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("kill switch");
      expect(result.decisions.killSwitchActive).toBe(true);
    });

    it("should block action without contract when required", async () => {
      process.env.AI_REQUIRE_GOVERNANCE_CONTRACT = "true";

      const result = await runGovernancePreflight(
        "send_email",
        { to: "user@example.com", body: "Hello" },
        { userId: "user-123" }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Governance contract is required");
    });

    it("should block action with invalid contract", async () => {
      const invalidContract = {
        intent: "short",
        // Missing required fields
      };

      const result = await runGovernancePreflight(
        "create_task",
        { _governance: invalidContract },
        { userId: "user-123" }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid governance contract");
    });

    it("should block action with hash mismatch", async () => {
      const actionName = "create_task";
      const userId = "user-123";
      const params = { title: "My Task" };

      const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const contract: GovernanceContract = {
        intent: "Create a new task for the user",
        logic_constraints: ["task must be valid"],
        assumptions: ["user authenticated"],
        fallback_strategy: "abort",
        input_hash: wrongHash,
      };

      const result = await runGovernancePreflight(
        actionName,
        { ...params, _governance: contract },
        { userId }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("input_hash mismatch");
    });

    it("should block action exceeding risk threshold", async () => {
      const contract: GovernanceContract = {
        intent: "Perform high-risk operation",
        logic_constraints: ["dangerous action"],
        assumptions: [],
        fallback_strategy: "abort",
        risk_level: 0.95, // Exceeds max of 0.85
      };

      const result = await runGovernancePreflight(
        "dangerous_action",
        { _governance: contract },
        { userId: "user-123" }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/risk.?level/i);
    });
  });

  describe("validateHashBinding", () => {
    it("should validate correct hash", () => {
      const actionName = "send_email";
      const userId = "user-456";
      const params = { to: "recipient@example.com" };

      const contract: GovernanceContract = {
        intent: "Send an email notification",
        logic_constraints: ["no spam"],
        assumptions: [],
        fallback_strategy: "abort",
        input_hash: createHashBinding(actionName, userId, params),
      };

      const result = validateHashBinding(contract, actionName, userId, params);

      expect(result.ok).toBe(true);
    });

    it("should reject mismatched hash", () => {
      const contract: GovernanceContract = {
        intent: "Send an email notification",
        logic_constraints: ["no spam"],
        assumptions: [],
        fallback_strategy: "abort",
        input_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      };

      const result = validateHashBinding(
        contract,
        "send_email",
        "user-456",
        { to: "other@example.com" }
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("mismatch");
    });
  });

  describe("validateContract", () => {
    it("should accept valid contract", () => {
      const contract: GovernanceContract = {
        intent: "This is a valid governance contract for testing purposes",
        logic_constraints: ["constraint 1", "constraint 2"],
        assumptions: ["assumption 1"],
        fallback_strategy: "abort",
      };

      const result = validateContract(contract);

      expect(result.ok).toBe(true);
    });

    it("should reject contract missing required fields", () => {
      const invalid = {
        intent: "Too short",
        logic_constraints: ["constraint"],
        // Missing fallback_strategy and assumptions
      };

      const result = validateContract(invalid);

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Missing required");
    });

    it("should reject contract with high risk level", () => {
      const contract: GovernanceContract = {
        intent: "This is a valid governance contract for testing purposes",
        logic_constraints: ["constraint"],
        assumptions: [],
        fallback_strategy: "abort",
        risk_level: 0.99,
      };

      const result = validateContract(contract);

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("exceeds maximum");
    });
  });

  describe("killSwitch", () => {
    it("should detect active kill switch", () => {
      setKillSwitchForTesting(true);
      const result = checkKillSwitch();

      expect(result.active).toBe(true);
      expect(result.reason).toContain("active");
    });

    it("should detect inactive kill switch", () => {
      setKillSwitchForTesting(false);
      const result = checkKillSwitch();

      expect(result.active).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it("should cache kill switch state", () => {
      setKillSwitchForTesting(true);
      const result1 = checkKillSwitch();
      const result2 = checkKillSwitch();

      expect(result1.active).toBe(result2.active);
    });

    it("should activate via hardware-governance state file without prior env", () => {
      const { mkdtempSync, rmSync } = require("node:fs");
      const { join } = require("node:path");
      const { tmpdir } = require("node:os");
      const {
        activateSoftwareKill,
      } = require("../src/hardware");

      const dir = mkdtempSync(join(tmpdir(), "ai-gov-kill-"));
      const path = join(dir, "governance-state.json");
      process.env.BUILDLOGIC_GOVERNANCE_STATE_PATH = path;
      process.env.AI_HST_TOKEN = "test-hst-token";
      delete process.env.AI_ACTION_KILL_SWITCH;
      clearKillSwitchCache();

      activateSoftwareKill("hardware", "integration test", path);
      clearKillSwitchCache();
      const result = checkKillSwitch();

      expect(result.active).toBe(true);

      rmSync(dir, { recursive: true, force: true });
      delete process.env.BUILDLOGIC_GOVERNANCE_STATE_PATH;
      delete process.env.AI_HST_TOKEN;
      delete process.env.AI_ACTION_KILL_SWITCH;
      clearKillSwitchCache();
    });
  });
});
