/**
 * AI Governance Toll Booth — Trust Metrics Aggregator
 *
 * Tracks and aggregates timing and decision metrics throughout governance checks.
 * Provides observability into the "safety tax" of governance enforcement.
 *
 * @ai-generated {
 *   confidence: 0.94,
 *   reasoning: "Simple metric aggregation with timestamp tracking",
 *   fallback: "Returns zero/default if metric missing"
 * }
 */

import type { TrustMetrics, PreflightResult } from "./types";

/**
 * Create an empty metrics container.
 */
export function createTrustMetrics(): TrustMetrics {
  return {
    governanceDecisionMs: 0,
    hashBindingMs: 0,
    egressValidationMs: 0,
    killSwitchCheckMs: 0,
    outboundValidationMs: 0,
    outboundValidationChecks: 0,
    trustPipelineMs: 0,
  };
}

/**
 * Record a component's execution time.
 *
 * @param metrics - Metrics object to update
 * @param component - Component name (key in metrics)
 * @param durationMs - Duration in milliseconds
 */
export function recordComponentTiming(
  metrics: TrustMetrics,
  component:
    | "governanceDecisionMs"
    | "hashBindingMs"
    | "egressValidationMs"
    | "killSwitchCheckMs"
    | "outboundValidationMs",
  durationMs: number
): void {
  metrics[component] = (metrics[component] || 0) + durationMs;
}

/**
 * Record outbound validation check count.
 *
 * @param metrics - Metrics object to update
 * @param count - Number of checks (default 1)
 */
export function recordOutboundValidationCheck(
  metrics: TrustMetrics,
  count: number = 1
): void {
  metrics.outboundValidationChecks =
    (metrics.outboundValidationChecks || 0) + count;
}

/**
 * Compute total trust pipeline time.
 * Sum of all governance component timings.
 *
 * @param metrics - Metrics object
 * @returns Total milliseconds spent on governance checks
 */
export function computeTrustPipelineMs(metrics: TrustMetrics): number {
  return (
    (metrics.governanceDecisionMs || 0) +
    (metrics.hashBindingMs || 0) +
    (metrics.egressValidationMs || 0) +
    (metrics.killSwitchCheckMs || 0) +
    (metrics.outboundValidationMs || 0)
  );
}

/**
 * Merge metrics from multiple sources.
 *
 * @param metrics - Base metrics
 * @param partial - Partial metrics to merge in
 */
export function mergeMetrics(
  metrics: TrustMetrics,
  partial: Partial<TrustMetrics>
): void {
  Object.entries(partial).forEach(([key, value]) => {
    if (value !== undefined) {
      const mKey = key as keyof TrustMetrics;
      if (typeof value === "number" && typeof metrics[mKey] === "number") {
        metrics[mKey] = (metrics[mKey] as number) + value;
      }
    }
  });
}

/**
 * Create a summary of metrics for logging/telemetry.
 *
 * @param metrics - Metrics to summarize
 * @returns Human-readable summary
 */
export function summarizeMetrics(metrics: TrustMetrics): string {
  const parts: string[] = [];

  if (metrics.trustPipelineMs) {
    parts.push(`total=${metrics.trustPipelineMs}ms`);
  }
  if (metrics.governanceDecisionMs) {
    parts.push(`decision=${metrics.governanceDecisionMs}ms`);
  }
  if (metrics.hashBindingMs) {
    parts.push(`binding=${metrics.hashBindingMs}ms`);
  }
  if (metrics.egressValidationMs) {
    parts.push(`egress=${metrics.egressValidationMs}ms`);
  }
  if (metrics.outboundValidationChecks) {
    parts.push(`outboundChecks=${metrics.outboundValidationChecks}`);
  }

  return parts.length > 0 ? parts.join(", ") : "no metrics";
}

/**
 * Extract metrics from a preflight result for logging.
 *
 * @param result - Preflight result
 * @returns Metrics for observability
 */
export function extractMetricsFromPreflight(result: PreflightResult): TrustMetrics {
  const metrics: TrustMetrics = {
    governanceDecisionMs: result.timings.governanceDecisionMs,
    hashBindingMs: result.timings.hashBindingMs,
    egressValidationMs: result.timings.egressValidationMs,
    killSwitchCheckMs: result.timings.killSwitchCheckMs,
    trustPipelineMs: result.timings.totalMs,
  };
  return metrics;
}
