/**
 * AI Governance Toll Booth — Fail-Close Circuit Breaker
 *
 * In-memory circuit breaker for the AI-action toll booth and for RPA
 * (Playwright/BeatLogic) execution pipelines. Three states:
 *   - closed:    normal operation; failures increment a counter
 *   - open:      all guards refused until `cooldownMs` elapses
 *   - half_open: a small number of probe guards are admitted; one success closes,
 *                one failure re-opens with a fresh cooldown
 *
 * `guard()` is the call-site contract: invoke it before any side-effectful
 * action and abort if `allowed === false`.
 *
 * @ai-generated {
 *   confidence: 0.93,
 *   reasoning: "Standard CB FSM with probe slots and force-open override",
 *   fallback: "Default state is closed; forceOpen for manual halt"
 * }
 */

import type {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitBreakerState,
  CircuitBreakerGuardResult,
} from "./types";

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenProbes: 1,
};

/**
 * Create an in-memory fail-close circuit breaker instance.
 */
export function createCircuitBreaker(
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const opts: Required<CircuitBreakerOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let state: CircuitBreakerState = "closed";
  let failureCount = 0;
  let openedAt = 0;
  let probesInFlight = 0;
  let forceReason: string | undefined;

  const computeState = (): CircuitBreakerState => {
    if (forceReason) return "open";
    if (state === "open") {
      if (Date.now() - openedAt >= opts.cooldownMs) {
        state = "half_open";
        probesInFlight = 0;
      }
    }
    return state;
  };

  const guard = (): CircuitBreakerGuardResult => {
    const s = computeState();
    if (s === "closed") {
      return { allowed: true, state: "closed" };
    }
    if (s === "open") {
      return {
        allowed: false,
        state: "open",
        reason: forceReason
          ? `circuit forced open: ${forceReason}`
          : "circuit open: too many recent failures, in cooldown",
      };
    }
    // half_open: admit up to halfOpenProbes
    if (probesInFlight < opts.halfOpenProbes) {
      probesInFlight++;
      return { allowed: true, state: "half_open" };
    }
    return {
      allowed: false,
      state: "half_open",
      reason: "circuit half-open: probe slots exhausted",
    };
  };

  const recordSuccess = (): void => {
    if (state === "half_open") {
      state = "closed";
      failureCount = 0;
      probesInFlight = 0;
      forceReason = undefined;
    } else if (state === "closed") {
      // healthy operation - decay failure count toward zero
      failureCount = Math.max(0, failureCount - 1);
    }
  };

  const recordFailure = (): void => {
    if (forceReason) return; // already manually halted
    if (state === "half_open") {
      state = "open";
      openedAt = Date.now();
      probesInFlight = 0;
      return;
    }
    if (state === "open") return; // no-op while open
    failureCount++;
    if (failureCount >= opts.failureThreshold) {
      state = "open";
      openedAt = Date.now();
    }
  };

  const forceOpen = (reason: string): void => {
    forceReason = reason || "manual halt";
    state = "open";
    openedAt = Date.now();
  };

  const reset = (): void => {
    state = "closed";
    failureCount = 0;
    openedAt = 0;
    probesInFlight = 0;
    forceReason = undefined;
  };

  const getState = (): CircuitBreakerState => computeState();

  return { guard, recordSuccess, recordFailure, forceOpen, reset, getState };
}

// Module-level singleton used by the orchestrator (opt-in via policy).
let sharedBreaker: CircuitBreaker | null = null;

export function getSharedCircuitBreaker(
  options?: CircuitBreakerOptions
): CircuitBreaker {
  if (!sharedBreaker) {
    sharedBreaker = createCircuitBreaker(options);
  }
  return sharedBreaker;
}

export function resetSharedCircuitBreaker(): void {
  sharedBreaker = null;
}
