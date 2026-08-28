import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { GovernanceKillSource, GovernanceStateFile } from "./types";
import {
  applyRedisKillCacheToEnv,
  ensureRedisKillBusPoller,
  getCachedRedisKillPayload,
  resolveRedisUrl,
  writeRedisKillPayload,
} from "./redis-kill-bus";
import { resolveSentinelBaseUrl } from "./sentinel-client";

const DEFAULT_DIR = join(homedir(), ".buildlogic");
const DEFAULT_FILE = join(DEFAULT_DIR, "governance-state.json");
const LOOPBACK_HST_TOKEN = "buildlogic-hst-dev";

export function resolveGovernanceStatePath(): string {
  return process.env.BUILDLOGIC_GOVERNANCE_STATE_PATH ?? DEFAULT_FILE;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

/**
 * Loopback + non-production + no Redis: keep the published local token so a
 * hardware kill switch still works with zero env setup.
 * Production, fleet Redis, or a network-bound sentinel: require AI_HST_TOKEN.
 */
export function defaultHstToken(): string {
  if (process.env.AI_HST_TOKEN) return process.env.AI_HST_TOKEN;

  const production = process.env.NODE_ENV === "production";
  const fleetBound = Boolean(resolveRedisUrl());
  let loopbackOnly = false;
  try {
    loopbackOnly = isLoopbackHostname(new URL(resolveSentinelBaseUrl()).hostname);
  } catch {
    loopbackOnly = false;
  }

  if (!production && loopbackOnly && !fleetBound) {
    return LOOPBACK_HST_TOKEN;
  }

  throw new Error(
    "AI_HST_TOKEN is required when Hardware Sentinel is not loopback-only, Redis kill bus is configured, or NODE_ENV=production"
  );
}

export function readGovernanceStateFile(
  path: string = resolveGovernanceStatePath()
): GovernanceStateFile | null {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as GovernanceStateFile;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGovernanceStateFile(
  partial: Partial<GovernanceStateFile> & {
    aiActionKillSwitch: boolean;
    source: GovernanceKillSource;
    reason?: string;
  },
  path: string = resolveGovernanceStatePath()
): GovernanceStateFile {
  const existing = readGovernanceStateFile(path);
  const next: GovernanceStateFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    aiActionKillSwitch: partial.aiActionKillSwitch,
    aiHstKillToken: partial.aiActionKillSwitch
      ? partial.aiHstKillToken ?? defaultHstToken()
      : undefined,
    source: partial.source,
    reason: partial.reason,
    sentinel: partial.sentinel ?? existing?.sentinel,
  };

  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, path);
  return next;
}

/**
 * Apply shared kill bus into process.env for ai-governance readers.
 * Order: Redis cache (fleet) → state file (single-host) → leave env alone.
 *
 * Fail-open on Redis miss/errors only when no kill is cached and state file
 * is not killed. If Redis or state file says killed → fail-close via env.
 */
export function syncGovernanceKillToEnv(
  path: string = resolveGovernanceStatePath()
): GovernanceStateFile | null {
  ensureRedisKillBusPoller();
  const redisPayload = applyRedisKillCacheToEnv();
  if (redisPayload?.active) {
    if (!process.env.AI_HST_TOKEN) {
      process.env.AI_HST_TOKEN = defaultHstToken();
    }
    return {
      version: 1,
      updatedAt: redisPayload.updatedAt,
      aiActionKillSwitch: true,
      aiHstKillToken: redisPayload.aiHstKillToken,
      source: redisPayload.source,
      reason: redisPayload.reason,
    };
  }

  const state = readGovernanceStateFile(path);
  if (!state) return null;

  if (state.aiActionKillSwitch) {
    process.env.AI_ACTION_KILL_SWITCH = "true";
    if (state.aiHstKillToken) {
      process.env.AI_HST_KILL_TOKEN = state.aiHstKillToken;
    }
    if (!process.env.AI_HST_TOKEN) {
      process.env.AI_HST_TOKEN = defaultHstToken();
    }
  } else if (!redisPayload?.active) {
    // Only clear env when both Redis and file say not killed.
    // Do not delete a manually set AI_ACTION_KILL_SWITCH unless file explicitly false
    // and we are syncing from file — clear when file says false.
    delete process.env.AI_ACTION_KILL_SWITCH;
    delete process.env.AI_HST_KILL_TOKEN;
  }
  return state;
}

/** @deprecated Use syncGovernanceKillToEnv */
export const syncGovernanceStateToEnv = syncGovernanceKillToEnv;

export function activateSoftwareKill(
  source: GovernanceKillSource,
  reason?: string,
  path: string = resolveGovernanceStatePath()
): GovernanceStateFile {
  const token = defaultHstToken();
  const state = writeGovernanceStateFile(
    {
      aiActionKillSwitch: true,
      aiHstKillToken: token,
      source,
      reason,
    },
    path
  );
  void writeRedisKillPayload({
    active: true,
    updatedAt: state.updatedAt,
    source,
    reason,
    aiHstKillToken: token,
  });
  syncGovernanceKillToEnv(path);
  return state;
}

export function clearSoftwareKill(
  path: string = resolveGovernanceStatePath()
): GovernanceStateFile {
  const state = writeGovernanceStateFile(
    {
      aiActionKillSwitch: false,
      source: "software",
      reason: "revived",
    },
    path
  );
  void writeRedisKillPayload({
    active: false,
    updatedAt: state.updatedAt,
    source: "software",
    reason: "revived",
  });
  syncGovernanceKillToEnv(path);
  return state;
}

export function isHardwareKillActive(
  path: string = resolveGovernanceStatePath()
): boolean {
  const redis = getCachedRedisKillPayload();
  const token = process.env.AI_HST_TOKEN ?? defaultHstToken();
  if (redis?.active) {
    return !redis.aiHstKillToken || redis.aiHstKillToken === token;
  }
  const state = readGovernanceStateFile(path);
  if (!state?.aiActionKillSwitch) return false;
  return state.aiHstKillToken === token;
}
