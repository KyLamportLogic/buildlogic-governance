/**
 * R2 — Ghost Database Forking & Rollback
 *
 * API to run operations via a GhostForkAdapter; discard on detection flag and
 * append traceback to an in-process WORM-style array. Default adapter is in-memory.
 *
 * Scope (under-promise): not automatically invoked by every runGdmControlStack
 * call; not a real Postgres/Neon branch unless you supply a production adapter.
 */

import type {
  GhostForkHandle,
  GhostForkOperation,
  GhostForkResult,
  GhostForkTracebackEntry,
} from "./types";

export interface GhostForkAdapter {
  createFork(): Promise<{ forkId: string }>;
  promote(forkId: string): Promise<void>;
  discard(forkId: string): Promise<void>;
}

/** WORM (Write-Once-Read-Many) audit log for fork tracebacks. */
const wormLog: GhostForkTracebackEntry[] = [];

/** In-memory mock fork adapter for testing and local dev. */
export class InMemoryGhostForkAdapter implements GhostForkAdapter {
  private counter = 0;
  private activeForks = new Set<string>();
  private forkState = new Map<string, Record<string, unknown>>();

  async createFork(): Promise<{ forkId: string }> {
    const forkId = `ghost-fork-${++this.counter}-${Date.now()}`;
    this.activeForks.add(forkId);
    this.forkState.set(forkId, {});
    return { forkId };
  }

  async promote(forkId: string): Promise<void> {
    if (!this.activeForks.has(forkId)) {
      throw new Error(`Ghost fork '${forkId}' not found or already finalized`);
    }
    this.activeForks.delete(forkId);
  }

  async discard(forkId: string): Promise<void> {
    if (!this.activeForks.has(forkId)) {
      throw new Error(`Ghost fork '${forkId}' not found or already finalized`);
    }
    this.forkState.delete(forkId);
    this.activeForks.delete(forkId);
  }

  /** Test helper: inspect fork state. */
  getForkState(forkId: string): Record<string, unknown> | undefined {
    return this.forkState.get(forkId);
  }
}

export interface GhostForkExecuteOptions {
  adapter: GhostForkAdapter;
  flaggedByDetection?: boolean;
  flagReason?: string;
}

/**
 * Execute agent operations inside a ghost fork with automatic rollback on flag.
 */
export async function executeInGhostFork<T>(
  operations: GhostForkOperation<T>[],
  options: GhostForkExecuteOptions
): Promise<GhostForkResult<T>> {
  const traceback: GhostForkTracebackEntry[] = [];
  const { adapter, flaggedByDetection = false, flagReason } = options;

  const { forkId } = await adapter.createFork();
  const handle: GhostForkHandle = {
    forkId,
    createdAt: new Date().toISOString(),
    status: "active",
  };

  traceback.push({
    step: "fork-created",
    timestamp: new Date().toISOString(),
    detail: forkId,
  });

  if (flaggedByDetection) {
    await adapter.discard(forkId);
    handle.status = "discarded";
    traceback.push({
      step: "fork-discarded-detection-flag",
      timestamp: new Date().toISOString(),
      detail: flagReason ?? "D-tier detection flagged",
    });
    appendWormLog(traceback);

    return {
      tier: "R2",
      ok: false,
      forkId,
      promoted: false,
      discarded: true,
      traceback,
      reason: flagReason ?? "R2: ghost fork discarded due to detection tier flag",
    };
  }

  let lastResult: T | undefined;
  try {
    for (const op of operations) {
      traceback.push({
        step: `execute:${op.label}`,
        timestamp: new Date().toISOString(),
      });
      lastResult = await op.execute(forkId);
    }

    await adapter.promote(forkId);
    handle.status = "promoted";
    traceback.push({
      step: "fork-promoted",
      timestamp: new Date().toISOString(),
    });

    return {
      tier: "R2",
      ok: true,
      forkId,
      promoted: true,
      discarded: false,
      result: lastResult,
      traceback,
    };
  } catch (err) {
    await adapter.discard(forkId);
    handle.status = "discarded";
    const message = err instanceof Error ? err.message : String(err);
    traceback.push({
      step: "fork-discarded-error",
      timestamp: new Date().toISOString(),
      detail: message,
    });
    appendWormLog(traceback);

    return {
      tier: "R2",
      ok: false,
      forkId,
      promoted: false,
      discarded: true,
      traceback,
      reason: `R2: ghost fork discarded on error: ${message}`,
    };
  }
}

/**
 * Read WORM log entries (immutable audit trail).
 */
export function readWormLog(): readonly GhostForkTracebackEntry[] {
  return [...wormLog];
}

/** Clear WORM log (testing only). */
export function clearWormLog(): void {
  wormLog.length = 0;
}

function appendWormLog(entries: GhostForkTracebackEntry[]): void {
  for (const entry of entries) {
    wormLog.push({ ...entry });
  }
}
