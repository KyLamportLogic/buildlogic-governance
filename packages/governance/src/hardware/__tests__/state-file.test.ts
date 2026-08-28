import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  activateSoftwareKill,
  clearSoftwareKill,
  defaultHstToken,
  isHardwareKillActive,
  readGovernanceStateFile,
  syncGovernanceKillToEnv,
} from "../state-file";
import {
  getCachedRedisKillPayload,
  setRedisClientForTests,
  stopRedisKillBusPoller,
  writeRedisKillPayload,
} from "../redis-kill-bus";

describe("governance state file", () => {
  let dir: string;
  let path: string;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hw-gov-"));
    path = join(dir, "governance-state.json");
    originalNodeEnv = process.env.NODE_ENV;
    process.env.AI_HST_TOKEN = "test-hst-token";
    process.env.BUILDLOGIC_GOVERNANCE_STATE_PATH = path;
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_HST_KILL_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.BUILDLOGIC_KILL_BUS_REDIS_URL;
    delete process.env.HARDWARE_SENTINEL_URL;
    setRedisClientForTests(null);
    stopRedisKillBusPoller();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AI_HST_TOKEN;
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_HST_KILL_TOKEN;
    delete process.env.BUILDLOGIC_GOVERNANCE_STATE_PATH;
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.BUILDLOGIC_KILL_BUS_REDIS_URL;
    delete process.env.HARDWARE_SENTINEL_URL;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    setRedisClientForTests(null);
    stopRedisKillBusPoller();
  });

  it("activates kill and syncs env", () => {
    activateSoftwareKill("hardware", "threshold breach", path);
    const state = readGovernanceStateFile(path);
    expect(state?.aiActionKillSwitch).toBe(true);
    expect(state?.aiHstKillToken).toBe("test-hst-token");

    syncGovernanceKillToEnv(path);
    expect(process.env.AI_ACTION_KILL_SWITCH).toBe("true");
    expect(process.env.AI_HST_KILL_TOKEN).toBe("test-hst-token");
    expect(isHardwareKillActive(path)).toBe(true);
  });

  it("allows the published loopback token only when sentinel is local and Redis is unset", () => {
    delete process.env.AI_HST_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.BUILDLOGIC_KILL_BUS_REDIS_URL;
    delete process.env.HARDWARE_SENTINEL_URL;
    process.env.NODE_ENV = "test";
    expect(defaultHstToken()).toBe("buildlogic-hst-dev");
  });

  it("refuses the published token when the sentinel is network-bound", () => {
    delete process.env.AI_HST_TOKEN;
    process.env.HARDWARE_SENTINEL_URL = "http://10.0.0.5:8765";
    process.env.NODE_ENV = "test";
    expect(() => defaultHstToken()).toThrow(/AI_HST_TOKEN/);
  });

  it("refuses the published token when the Redis kill bus is configured", () => {
    delete process.env.AI_HST_TOKEN;
    delete process.env.HARDWARE_SENTINEL_URL;
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.NODE_ENV = "test";
    expect(() => defaultHstToken()).toThrow(/AI_HST_TOKEN/);
  });

  it("refuses the published token in production even on loopback", () => {
    delete process.env.AI_HST_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.HARDWARE_SENTINEL_URL;
    process.env.NODE_ENV = "production";
    expect(() => defaultHstToken()).toThrow(/AI_HST_TOKEN/);
  });

  it("clears kill on revive", () => {
    activateSoftwareKill("mcp", "test", path);
    clearSoftwareKill(path);
    const state = readGovernanceStateFile(path);
    expect(state?.aiActionKillSwitch).toBe(false);
    syncGovernanceKillToEnv(path);
    expect(process.env.AI_ACTION_KILL_SWITCH).toBeUndefined();
  });
});

describe("redis kill bus cache", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    delete process.env.AI_ACTION_KILL_SWITCH;
    process.env.AI_HST_TOKEN = "test-hst-token";
    setRedisClientForTests({
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => {
        store.set(key, value);
      },
      del: async (key) => {
        store.delete(key);
      },
    });
    stopRedisKillBusPoller();
  });

  afterEach(() => {
    setRedisClientForTests(null);
    stopRedisKillBusPoller();
    delete process.env.AI_HST_TOKEN;
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_HST_KILL_TOKEN;
  });

  it("writes redis payload and applies cache to env via sync", async () => {
    await writeRedisKillPayload({
      active: true,
      updatedAt: new Date().toISOString(),
      source: "hardware",
      reason: "relay trip",
      aiHstKillToken: "test-hst-token",
    });
    expect(getCachedRedisKillPayload()?.active).toBe(true);
    syncGovernanceKillToEnv("/tmp/nonexistent-gov-state-for-redis-test.json");
    expect(process.env.AI_ACTION_KILL_SWITCH).toBe("true");
  });
});
