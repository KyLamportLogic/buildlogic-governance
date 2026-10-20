/**
 * Test plan (TDD):
 * 1. Calls triggerHardwareShutdown with the block result's reason
 * 2. Defaults reason to "governance block" when result.reason is undefined
 * 3. Calls activateSoftwareKill("software", reason) after the hardware trip resolves
 * 4. Swallows errors when the hardware-governance module fails to load (hardware optional)
 * 5. Swallows errors when triggerHardwareShutdown itself rejects, and does not then
 *    call activateSoftwareKill (short-circuits on failure, doesn't half-run)
 * 6. Never throws/rejects back to the caller in any of the above cases
 */

import {
  createHardwareKillOnBlock,
  __setHardwareGovernanceModuleForTesting,
  __resetHardwareGovernanceModule,
} from "../hardware-kill";
import type { PreflightResult, ExecutionContext } from "../index.js";

const ctx: ExecutionContext = { userId: "test-user-001" };

function blockResult(reason?: string): PreflightResult {
  return { allowed: false, reason } as unknown as PreflightResult;
}

describe("createHardwareKillOnBlock", () => {
  afterEach(() => {
    __resetHardwareGovernanceModule();
  });

  test("trips hardware shutdown with the block's reason", async () => {
    const triggerHardwareShutdown = jest.fn().mockResolvedValue({ ok: true });
    const activateSoftwareKill = jest.fn();
    __setHardwareGovernanceModuleForTesting(async () => ({
      triggerHardwareShutdown,
      activateSoftwareKill,
    }));

    const onBlock = createHardwareKillOnBlock();
    await onBlock("some-action", blockResult("risk ceiling exceeded"), ctx);

    expect(triggerHardwareShutdown).toHaveBeenCalledWith({
      reason: "risk ceiling exceeded",
    });
  });

  test("defaults reason to 'governance block' when result.reason is undefined", async () => {
    const triggerHardwareShutdown = jest.fn().mockResolvedValue({ ok: true });
    const activateSoftwareKill = jest.fn();
    __setHardwareGovernanceModuleForTesting(async () => ({
      triggerHardwareShutdown,
      activateSoftwareKill,
    }));

    const onBlock = createHardwareKillOnBlock();
    await onBlock("some-action", blockResult(undefined), ctx);

    expect(triggerHardwareShutdown).toHaveBeenCalledWith({
      reason: "governance block",
    });
  });

  test("activates the software kill after the hardware trip resolves", async () => {
    const calls: string[] = [];
    const triggerHardwareShutdown = jest.fn().mockImplementation(async () => {
      calls.push("hardware");
      return { ok: true };
    });
    const activateSoftwareKill = jest.fn().mockImplementation(() => {
      calls.push("software");
    });
    __setHardwareGovernanceModuleForTesting(async () => ({
      triggerHardwareShutdown,
      activateSoftwareKill,
    }));

    const onBlock = createHardwareKillOnBlock();
    await onBlock("some-action", blockResult("policy deny"), ctx);

    expect(activateSoftwareKill).toHaveBeenCalledWith("software", "policy deny");
    expect(calls).toEqual(["hardware", "software"]);
  });

  test("swallows errors when the hardware-governance module fails to load", async () => {
    __setHardwareGovernanceModuleForTesting(async () => {
      throw new Error("module not found");
    });

    const onBlock = createHardwareKillOnBlock();
    await expect(
      onBlock("some-action", blockResult("policy deny"), ctx)
    ).resolves.toBeUndefined();
  });

  test("swallows errors when triggerHardwareShutdown rejects, and skips the software kill", async () => {
    const activateSoftwareKill = jest.fn();
    __setHardwareGovernanceModuleForTesting(async () => ({
      triggerHardwareShutdown: async () => {
        throw new Error("sentinel unreachable");
      },
      activateSoftwareKill,
    }));

    const onBlock = createHardwareKillOnBlock();
    await expect(
      onBlock("some-action", blockResult("policy deny"), ctx)
    ).resolves.toBeUndefined();
    expect(activateSoftwareKill).not.toHaveBeenCalled();
  });
});
