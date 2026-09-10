import {
  runGovernancePreflight,
} from "@kypython/buildlogic-governance";

import type { ExecutionContext, PreflightResult } from "@kypython/buildlogic-governance";

/**
 * Standalone preflight runner for use outside a full harness.
 * Useful when you control the invocation loop directly.
 */
export async function runPreflight(
  actionName: string,
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<PreflightResult> {
  return runGovernancePreflight(actionName, params, context);
}

/**
 * Assert that a preflight result allows execution.
 * Throws a structured error if the action is blocked — intended for use in
 * pipeline middleware where throwing is the natural control flow.
 */
export function assertAllowed(result: PreflightResult): void {
  if (!result.allowed) {
    const err = new GovernanceBlockedError(
      result.reason ?? "blocked by governance policy",
      result
    );
    throw err;
  }
}

export class GovernanceBlockedError extends Error {
  constructor(
    message: string,
    public readonly preflight: PreflightResult
  ) {
    super(message);
    this.name = "GovernanceBlockedError";
  }
}
