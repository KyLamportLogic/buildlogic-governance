import type { BlockHandler } from "./types";

export interface HardwareGovernanceModuleLike {
  triggerHardwareShutdown(options: { reason?: string }): Promise<unknown>;
  activateSoftwareKill(source: string, reason?: string): unknown;
}

type ModuleLoader = () => Promise<HardwareGovernanceModuleLike>;

let moduleLoaderOverride: ModuleLoader | null = null;

/** Test seam — inject a mock hardware-governance adapter. */
export function __setHardwareGovernanceModuleForTesting(loader: ModuleLoader): void {
  moduleLoaderOverride = loader;
}

export function __resetHardwareGovernanceModule(): void {
  moduleLoaderOverride = null;
}

async function loadHardwareGovernance(): Promise<HardwareGovernanceModuleLike> {
  if (moduleLoaderOverride) {
    return moduleLoaderOverride();
  }
  const governance = await import("@kypython/buildlogic-governance");
  return governance.hardwareGovernance as unknown as HardwareGovernanceModuleLike;
}

/**
 * Harness onBlock handler: trip physical relay when governance blocks an action.
 * Hardware is optional — any failure (module missing, sentinel unreachable) is
 * swallowed so a missing physical kill switch never breaks the software gate;
 * software fail-close via @kypython/buildlogic-governance remains authoritative.
 */
export function createHardwareKillOnBlock(): BlockHandler {
  return async (_actionName, result) => {
    const reason = result.reason ?? "governance block";
    try {
      const hw = await loadHardwareGovernance();
      await hw.triggerHardwareShutdown({ reason });
      hw.activateSoftwareKill("software", reason);
    } catch {
      // Hardware optional — software kill via env remains operator responsibility.
    }
  };
}
