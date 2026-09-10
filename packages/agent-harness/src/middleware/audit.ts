import type { AuditEntry, AuditLogger } from "../types.js";

/**
 * Default audit logger — writes structured JSON to stdout.
 * Swap this for your own sink (Sentry, PostHog, SIEM, etc.) via HarnessConfig.auditLogger.
 */
export const defaultAuditLogger: AuditLogger = (entry: AuditEntry): void => {
  process.stdout.write(JSON.stringify({ audit: entry }) + "\n");
};

/**
 * No-op logger for testing environments.
 */
export const nullAuditLogger: AuditLogger = (_entry: AuditEntry): void => {
  // intentionally empty
};
