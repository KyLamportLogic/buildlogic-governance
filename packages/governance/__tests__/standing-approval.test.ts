/*
 * 📜 CODEBASE LAW: SYSTEMATIC SPECIFICATION-BASED TESTING
 *
 * Planned cases (standing approvals for automations):
 * Variables: userId, automationId, scopes[], ttlDays, now, reminderLeadDays, acknowledgedRisk
 * Valid: grant with risk ack → active; mayProceed for covered scope before expiry
 * Invalid: no risk ack; wrong scope; revoked; expired; missing automation
 * Boundaries: expires exactly at now → invalid; reminder window start inclusive
 * Edge: renew extends expiry; reminder marks remindedAt so it is not re-sent until lead resets
 */
import {
  DEFAULT_STANDING_APPROVAL_TTL_DAYS,
  DEFAULT_STANDING_REMINDER_LEAD_DAYS,
  HIGH_STAKES_AUTOMATION_SCOPES,
  grantStandingApproval,
  isStandingApprovalValid,
  listApprovalsNeedingReminder,
  mayProceedWithStandingApproval,
  markStandingApprovalReminded,
  renewStandingApproval,
  resetStandingApprovals,
  revokeStandingApproval,
  expireStandingApprovals,
  getStandingApproval,
} from "../src/tiers/standing-approval";

describe("Standing approvals (durable workflow consent)", () => {
  beforeEach(() => resetStandingApprovals());

  const baseInput = {
    userId: "user-1",
    automationId: "wf-amazon-email",
    automationKind: "workflow" as const,
    scopes: ["send_email", "gmail_send"],
    riskSummary:
      "This automation may send email on your behalf to recipients you configure.",
    acknowledgedRisk: true,
  };

  it("refuses grant without acknowledgedRisk", () => {
    expect(() =>
      grantStandingApproval({ ...baseInput, acknowledgedRisk: false })
    ).toThrow(/acknowledgedRisk/);
  });

  it("refuses empty scopes", () => {
    expect(() =>
      grantStandingApproval({ ...baseInput, scopes: [] })
    ).toThrow(/scopes/);
  });

  it("grants active approval that covers scopes until expiry", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const approval = grantStandingApproval({ ...baseInput, now });

    expect(approval.status).toBe("active");
    expect(approval.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    expect(DEFAULT_STANDING_APPROVAL_TTL_DAYS).toBeGreaterThanOrEqual(30);
    expect(
      isStandingApprovalValid(approval, "send_email", now)
    ).toBe(true);
    expect(
      mayProceedWithStandingApproval({
        userId: "user-1",
        automationId: "wf-amazon-email",
        scope: "gmail_send",
        now,
      }).allowed
    ).toBe(true);
  });

  it("does not allow a different automation or uncovered scope", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    grantStandingApproval({ ...baseInput, now });

    expect(
      mayProceedWithStandingApproval({
        userId: "user-1",
        automationId: "wf-other",
        scope: "send_email",
        now,
      }).allowed
    ).toBe(false);

    expect(
      mayProceedWithStandingApproval({
        userId: "user-1",
        automationId: "wf-amazon-email",
        scope: "make_api_call",
        now,
      }).allowed
    ).toBe(false);
  });

  it("expires at boundary and blocks proceed", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const approval = grantStandingApproval({
      ...baseInput,
      now,
      ttlDays: 1,
    });
    const atExpiry = new Date(approval.expiresAt);

    expect(isStandingApprovalValid(approval, "send_email", atExpiry)).toBe(
      false
    );
    const expired = expireStandingApprovals(atExpiry);
    expect(expired).toHaveLength(1);
    expect(getStandingApproval(approval.approvalId)?.status).toBe("expired");
  });

  it("lists reminders long before expiry and marks reminded", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    // TTL inside the lead window so a reminder is due immediately after grant.
    const approval = grantStandingApproval({
      ...baseInput,
      now,
      ttlDays: Math.max(1, DEFAULT_STANDING_REMINDER_LEAD_DAYS - 4),
    });

    const needing = listApprovalsNeedingReminder(now);
    expect(needing.map((a) => a.approvalId)).toContain(approval.approvalId);
    expect(DEFAULT_STANDING_REMINDER_LEAD_DAYS).toBeGreaterThanOrEqual(7);

    markStandingApprovalReminded(approval.approvalId, now);
    expect(listApprovalsNeedingReminder(now)).toHaveLength(0);
  });

  it("revoke blocks proceed; renew restores window", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const approval = grantStandingApproval({ ...baseInput, now });
    revokeStandingApproval(approval.approvalId);
    expect(
      mayProceedWithStandingApproval({
        userId: "user-1",
        automationId: "wf-amazon-email",
        scope: "send_email",
        now,
      }).allowed
    ).toBe(false);

    const renewed = renewStandingApproval(approval.approvalId, {
      now,
      ttlDays: 60,
      acknowledgedRisk: true,
    });
    expect(renewed.status).toBe("active");
    expect(
      mayProceedWithStandingApproval({
        userId: "user-1",
        automationId: "wf-amazon-email",
        scope: "send_email",
        now,
      }).allowed
    ).toBe(true);
  });

  it("exports the high-stakes automation scope set used by product gates", () => {
    expect(HIGH_STAKES_AUTOMATION_SCOPES.has("send_email")).toBe(true);
    expect(HIGH_STAKES_AUTOMATION_SCOPES.has("gmail_send")).toBe(true);
  });
});
