/**
 * Standing approvals — durable, time-bounded consent for automation side effects.
 *
 * Product contract (ZeroAPI RPA):
 * - User approves once at workflow setup (acknowledgedRisk required).
 * - Approval sticks for that automationId + scopes until expiry/revoke.
 * - Reminders fire long before expiry so automations are not missed.
 *
 * Persistence: this module owns the in-memory registry for tests/CI and the
 * pure decision helpers. Product stores (Supabase) mirror StandingApproval
 * records and call these helpers — do not re-implement expiry math in apps.
 */

export const DEFAULT_STANDING_APPROVAL_TTL_DAYS = 90;
export const DEFAULT_STANDING_REMINDER_LEAD_DAYS = 14;

/** Scopes that may email customers, call APIs, or otherwise burn spend/blast radius. */
export const HIGH_STAKES_AUTOMATION_SCOPES = new Set([
  "send_email",
  "gmail_send",
  "make_api_call",
  "scrape_website",
  "integration.reddit.analyze",
  "integration.reddit.insights",
]);

export type StandingApprovalStatus = "active" | "expired" | "revoked";
export type StandingAutomationKind = "workflow" | "task" | "agent_action";

export interface StandingApproval {
  approvalId: string;
  userId: string;
  automationId: string;
  automationKind: StandingAutomationKind;
  scopes: string[];
  status: StandingApprovalStatus;
  riskSummary: string;
  acknowledgedRisk: true;
  approvedAt: Date;
  expiresAt: Date;
  reminderSentAt?: Date;
  renewedAt?: Date;
}

export interface GrantStandingApprovalInput {
  userId: string;
  automationId: string;
  automationKind?: StandingAutomationKind;
  scopes: string[];
  riskSummary: string;
  acknowledgedRisk: boolean;
  ttlDays?: number;
  now?: Date;
  approvalId?: string;
}

const registry = new Map<string, StandingApproval>();

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} required`);
  }
}

function normalizeScopes(scopes: string[]): string[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error("scopes required (non-empty)");
  }
  const cleaned = [
    ...new Set(
      scopes
        .map((s) => String(s || "").trim())
        .filter(Boolean)
    ),
  ];
  if (cleaned.length === 0) {
    throw new Error("scopes required (non-empty)");
  }
  return cleaned;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function grantStandingApproval(
  input: GrantStandingApprovalInput
): StandingApproval {
  assertNonEmptyString(input.userId, "userId");
  assertNonEmptyString(input.automationId, "automationId");
  assertNonEmptyString(input.riskSummary, "riskSummary");
  if (input.acknowledgedRisk !== true) {
    throw new Error("acknowledgedRisk must be true to grant standing approval");
  }

  const now = input.now ?? new Date();
  const ttlDays = input.ttlDays ?? DEFAULT_STANDING_APPROVAL_TTL_DAYS;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new Error("ttlDays must be a positive number");
  }

  const scopes = normalizeScopes(input.scopes);
  const approvalId =
    input.approvalId ||
    `sa-${input.automationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const approval: StandingApproval = {
    approvalId,
    userId: input.userId.trim(),
    automationId: input.automationId.trim(),
    automationKind: input.automationKind ?? "workflow",
    scopes,
    status: "active",
    riskSummary: input.riskSummary.trim(),
    acknowledgedRisk: true,
    approvedAt: now,
    expiresAt: addDays(now, ttlDays),
  };

  // One active approval per user+automation — replace prior active rows.
  for (const [id, existing] of registry.entries()) {
    if (
      existing.userId === approval.userId &&
      existing.automationId === approval.automationId &&
      existing.status === "active"
    ) {
      existing.status = "revoked";
      registry.set(id, existing);
    }
  }

  registry.set(approvalId, approval);
  return { ...approval, scopes: [...approval.scopes] };
}

export function getStandingApproval(
  approvalId: string
): StandingApproval | undefined {
  const row = registry.get(approvalId);
  return row ? { ...row, scopes: [...row.scopes] } : undefined;
}

export function listStandingApprovalsForUser(
  userId: string
): StandingApproval[] {
  return [...registry.values()]
    .filter((a) => a.userId === userId)
    .map((a) => ({ ...a, scopes: [...a.scopes] }));
}

export function isStandingApprovalValid(
  approval: StandingApproval | null | undefined,
  scope: string,
  now: Date = new Date()
): boolean {
  if (!approval) return false;
  if (approval.status !== "active") return false;
  if (now.getTime() >= approval.expiresAt.getTime()) return false;
  return approval.scopes.includes(scope);
}

export function findActiveStandingApproval(input: {
  userId: string;
  automationId: string;
  scope: string;
  now?: Date;
}): StandingApproval | undefined {
  const now = input.now ?? new Date();
  for (const approval of registry.values()) {
    if (approval.userId !== input.userId) continue;
    if (approval.automationId !== input.automationId) continue;
    if (isStandingApprovalValid(approval, input.scope, now)) {
      return { ...approval, scopes: [...approval.scopes] };
    }
  }
  return undefined;
}

export function mayProceedWithStandingApproval(input: {
  userId: string;
  automationId: string;
  scope: string;
  now?: Date;
}): { allowed: boolean; approval?: StandingApproval; reason?: string } {
  const approval = findActiveStandingApproval(input);
  if (!approval) {
    return {
      allowed: false,
      reason:
        "No active standing approval for this automation/scope. Approve at workflow setup or renew before expiry.",
    };
  }
  return { allowed: true, approval };
}

export function revokeStandingApproval(approvalId: string): StandingApproval {
  const row = registry.get(approvalId);
  if (!row) throw new Error(`Standing approval '${approvalId}' not found`);
  row.status = "revoked";
  registry.set(approvalId, row);
  return { ...row, scopes: [...row.scopes] };
}

export function renewStandingApproval(
  approvalId: string,
  opts: { now?: Date; ttlDays?: number; acknowledgedRisk: boolean }
): StandingApproval {
  if (opts.acknowledgedRisk !== true) {
    throw new Error("acknowledgedRisk must be true to renew standing approval");
  }
  const row = registry.get(approvalId);
  if (!row) throw new Error(`Standing approval '${approvalId}' not found`);
  const now = opts.now ?? new Date();
  const ttlDays = opts.ttlDays ?? DEFAULT_STANDING_APPROVAL_TTL_DAYS;
  row.status = "active";
  row.renewedAt = now;
  row.approvedAt = now;
  row.expiresAt = addDays(now, ttlDays);
  row.reminderSentAt = undefined;
  registry.set(approvalId, row);
  return { ...row, scopes: [...row.scopes] };
}

export function expireStandingApprovals(now: Date = new Date()): StandingApproval[] {
  const expired: StandingApproval[] = [];
  for (const [id, row] of registry.entries()) {
    if (row.status !== "active") continue;
    if (now.getTime() >= row.expiresAt.getTime()) {
      row.status = "expired";
      registry.set(id, row);
      expired.push({ ...row, scopes: [...row.scopes] });
    }
  }
  return expired;
}

/**
 * Approvals that expire within `leadDays` and have not been reminded yet.
 */
export function listApprovalsNeedingReminder(
  now: Date = new Date(),
  leadDays: number = DEFAULT_STANDING_REMINDER_LEAD_DAYS
): StandingApproval[] {
  const leadMs = leadDays * 24 * 60 * 60 * 1000;
  return [...registry.values()]
    .filter((a) => {
      if (a.status !== "active") return false;
      if (a.reminderSentAt) return false;
      const msLeft = a.expiresAt.getTime() - now.getTime();
      return msLeft > 0 && msLeft <= leadMs;
    })
    .map((a) => ({ ...a, scopes: [...a.scopes] }));
}

export function markStandingApprovalReminded(
  approvalId: string,
  now: Date = new Date()
): StandingApproval {
  const row = registry.get(approvalId);
  if (!row) throw new Error(`Standing approval '${approvalId}' not found`);
  row.reminderSentAt = now;
  registry.set(approvalId, row);
  return { ...row, scopes: [...row.scopes] };
}

/** Test / process reset helper. */
export function resetStandingApprovals(): void {
  registry.clear();
}

/** Hydrate registry from durable store (e.g. after Supabase load). */
export function hydrateStandingApprovals(rows: StandingApproval[]): void {
  for (const row of rows) {
    registry.set(row.approvalId, {
      ...row,
      scopes: [...row.scopes],
      approvedAt: new Date(row.approvedAt),
      expiresAt: new Date(row.expiresAt),
      reminderSentAt: row.reminderSentAt
        ? new Date(row.reminderSentAt)
        : undefined,
      renewedAt: row.renewedAt ? new Date(row.renewedAt) : undefined,
    });
  }
}

export function isHighStakesAutomationScope(scope: string): boolean {
  return HIGH_STAKES_AUTOMATION_SCOPES.has(scope);
}
