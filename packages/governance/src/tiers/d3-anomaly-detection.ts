/**
 * D3 — System-Level Anomaly Detection
 *
 * Z-score checks on caller-supplied API/token/directory-scan counts against an
 * in-memory sliding window.
 *
 * Scope (under-promise): does not scrape hosts or auto-instrument apps.
 * Anomaly only if the caller passes snapshots; no fleet telemetry pipeline.
 */

import type { AnomalyDetectionResult, ResourceMetricsSnapshot } from "./types";

const DEFAULT_WINDOW_SIZE = 20;
const DEFAULT_Z_THRESHOLD = 2.5;

interface MetricWindow {
  apiCallCounts: number[];
  tokenUsages: number[];
  directoryScanCounts: number[];
}

const globalWindow: MetricWindow = {
  apiCallCounts: [],
  tokenUsages: [],
  directoryScanCounts: [],
};

/**
 * Record a metrics snapshot and evaluate for anomalies.
 */
export function detectSystemAnomaly(
  snapshot: Omit<ResourceMetricsSnapshot, "timestamp">,
  options?: { windowSize?: number; zThreshold?: number }
): AnomalyDetectionResult {
  const windowSize = options?.windowSize ?? DEFAULT_WINDOW_SIZE;
  const zThreshold = options?.zThreshold ?? DEFAULT_Z_THRESHOLD;

  pushMetric(globalWindow.apiCallCounts, snapshot.apiCallCount, windowSize);
  pushMetric(globalWindow.tokenUsages, snapshot.tokenUsage, windowSize);
  pushMetric(globalWindow.directoryScanCounts, snapshot.directoryScanCount, windowSize);

  const zApi = computeZScore(snapshot.apiCallCount, globalWindow.apiCallCounts);
  const zToken = computeZScore(snapshot.tokenUsage, globalWindow.tokenUsages);
  const zDir = computeZScore(snapshot.directoryScanCount, globalWindow.directoryScanCounts);

  const driftTriggers: string[] = [];

  if (zApi >= zThreshold) driftTriggers.push("api-call-density-surge");
  if (zToken >= zThreshold) driftTriggers.push("token-usage-surge");
  if (zDir >= zThreshold) driftTriggers.push("directory-scan-frequency-anomaly");

  const anomalous = driftTriggers.length > 0;

  return {
    tier: "D3",
    anomalous,
    driftTriggers,
    zScores: {
      apiCallDensity: round(zApi),
      tokenUsageSurge: round(zToken),
      directoryScanFrequency: round(zDir),
    },
    reason: anomalous
      ? `D3 anomaly: ${driftTriggers.join(", ")} (z-threshold=${zThreshold})`
      : undefined,
  };
}

/** Reset metric window (testing only). */
export function resetAnomalyWindow(): void {
  globalWindow.apiCallCounts.length = 0;
  globalWindow.tokenUsages.length = 0;
  globalWindow.directoryScanCounts.length = 0;
}

function pushMetric(arr: number[], value: number, maxSize: number): void {
  arr.push(value);
  if (arr.length > maxSize) arr.shift();
}

function computeZScore(value: number, history: number[]): number {
  if (history.length < 3) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance =
    history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return value === mean ? 0 : zThresholdFallback(value, mean);
  return (value - mean) / stdDev;
}

function zThresholdFallback(value: number, mean: number): number {
  return value > mean * 3 ? DEFAULT_Z_THRESHOLD + 1 : 0;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
