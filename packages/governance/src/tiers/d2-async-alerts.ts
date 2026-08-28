/**
 * D2 — Asynchronous Safety Alerts
 *
 * Enqueues completed agent-trace records into an in-process array and notifies
 * optional listeners. May re-run D1 regex checks on stored CoT/output.
 *
 * Scope (under-promise): not Kafka/SQS/SOC paging. Production brokers are
 * aspirational; tests and local callers use this in-memory queue only.
 */

import { monitorChainOfThought } from "./d1-cot-monitor";
import type { AgentTraceRecord, AsyncAlertResult } from "./types";

export interface MonitoringQueueEntry extends AgentTraceRecord {
  alertId: string;
  flagged: boolean;
  signals: string[];
  processedAt: string;
}

/** Isolated in-process monitoring queue (production would use external broker). */
const monitoringQueue: MonitoringQueueEntry[] = [];
const MAX_QUEUE_SIZE = 10_000;

export type TraceListener = (entry: MonitoringQueueEntry) => void;
const listeners: Set<TraceListener> = new Set();

/**
 * Register a listener for completed trace alerts.
 */
export function onTraceAlert(listener: TraceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Enqueue a completed agent trace for async safety analysis.
 */
export function enqueueCompletedTrace(trace: AgentTraceRecord): AsyncAlertResult {
  const alertId = `d2-${trace.traceId}-${Date.now()}`;
  const signals: string[] = [];

  // Post-hoc D1 analysis on completed trace
  if (trace.chainOfThought) {
    const d1 = monitorChainOfThought(trace2cotInput(trace));
    if (d1.flagged) {
      signals.push(...d1.signals.map((s) => `d1:${s}`));
    }
  }

  // Output-level suspicious patterns
  if (trace.output) {
    if (/\b(?:delete|rewrite|forge) (?:audit|log|history)\b/i.test(trace.output)) {
      signals.push("output:audit-tampering");
    }
    if (/\b(?:API_KEY|SECRET|PASSWORD)\s*=/i.test(trace.output)) {
      signals.push("output:secret-exfiltration");
    }
  }

  const flagged = signals.length > 0;
  const entry: MonitoringQueueEntry = {
    ...trace,
    alertId,
    flagged,
    signals,
    processedAt: new Date().toISOString(),
  };

  if (monitoringQueue.length >= MAX_QUEUE_SIZE) {
    monitoringQueue.shift();
  }
  monitoringQueue.push(entry);

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // Listener errors must not break the queue
    }
  }

  return {
    tier: "D2",
    enqueued: true,
    alertId,
    flagged,
    signals,
  };
}

/**
 * Drain the monitoring queue (for tests and batch processing).
 */
export function drainMonitoringQueue(): MonitoringQueueEntry[] {
  return monitoringQueue.splice(0, monitoringQueue.length);
}

/**
 * Peek at queue size without draining.
 */
export function getMonitoringQueueSize(): number {
  return monitoringQueue.length;
}

/** Reset queue state (testing only). */
export function resetMonitoringQueue(): void {
  monitoringQueue.length = 0;
  listeners.clear();
}

function trace2cotInput(trace: AgentTraceRecord) {
  return {
    chainOfThought: trace.chainOfThought ?? "",
    actionName: trace.actionName,
  };
}
