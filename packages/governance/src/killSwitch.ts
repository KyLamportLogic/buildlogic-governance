/**
 * AI Governance Toll Booth — Kill Switch Controller
 *
 * Provides deterministic kill switch functionality for disabling all AI actions.
 * Syncs Redis / shared state-file kill bus before reading env so fleet replicas
 * and Hardware Sentinel trips share one fail-close latch.
 */

import type { KillSwitchResult } from "./types";

/**
 * Cache for kill switch state to avoid repeated env var lookups.
 */
let killSwitchCache: { active: boolean; checkedAt: number } | null = null;
const CACHE_TTL_MS = 5000; // 5 seconds

function syncKillBusFromHardwareGovernance(): void {
  try {
    // Soft require keeps unit tests usable if workspace link is mid-install.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hw = require("./hardware") as {
      syncGovernanceKillToEnv?: () => unknown;
    };
    hw.syncGovernanceKillToEnv?.();
  } catch {
    // Package missing or not built — env-only kill still works.
  }
}

/**
 * Check if the global AI action kill switch is active.
 *
 * When active, all AI-triggered side effects are blocked with fail-close semantics.
 * Returns cache if fresh, otherwise syncs kill bus + checks environment.
 *
 * @returns KillSwitchResult with state and optional reason
 */
export function checkKillSwitch(): KillSwitchResult {
  const now = Date.now();

  // Return cached result if fresh
  if (killSwitchCache && now - killSwitchCache.checkedAt < CACHE_TTL_MS) {
    return {
      active: killSwitchCache.active,
      reason: killSwitchCache.active
        ? "Global AI action kill switch is active (cached)"
        : undefined,
    };
  }

  syncKillBusFromHardwareGovernance();

  // Check environment variable
  const envValue = process.env.AI_ACTION_KILL_SWITCH;
  const active =
    envValue !== undefined && String(envValue).toLowerCase() === "true";

  // Update cache
  killSwitchCache = { active, checkedAt: now };

  return {
    active,
    reason: active ? "Global AI action kill switch is active" : undefined,
  };
}

/**
 * Force set kill switch state (for testing).
 * Clears cache so next check reads fresh state.
 *
 * @param active - Whether kill switch should be active
 */
export function setKillSwitchForTesting(active: boolean): void {
  killSwitchCache = null;
  if (active) {
    process.env.AI_ACTION_KILL_SWITCH = "true";
  } else {
    delete process.env.AI_ACTION_KILL_SWITCH;
  }
}

/**
 * Clear kill switch cache (for testing).
 */
export function clearKillSwitchCache(): void {
  killSwitchCache = null;
}
