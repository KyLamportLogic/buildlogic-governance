/**
 * Optional AWS GuardDuty posture poll via official AWS SDK.
 * Continuous intrusion signal for AI runtime accounts.
 */

import type { GuardDutyPostureResult } from "./types";

/**
 * List recent GuardDuty findings. Skips when detector/credentials absent.
 */
export async function pollGuardDutyPosture(options?: {
  detectorId?: string;
  maxResults?: number;
}): Promise<GuardDutyPostureResult> {
  const detectorId =
    options?.detectorId ||
    process.env.AGENTIC_GUARDDUTY_DETECTOR_ID?.trim() ||
    "";

  if (!detectorId) {
    return {
      ok: true,
      skipped: true,
      reason:
        "GuardDuty skipped — set AGENTIC_GUARDDUTY_DETECTOR_ID after enabling GuardDuty in the AI runtime AWS account",
    };
  }

  try {
    const { GuardDutyClient, ListFindingsCommand, GetFindingsCommand } =
      await import("@aws-sdk/client-guardduty");
    const client = new GuardDutyClient({});
    const listed = await client.send(
      new ListFindingsCommand({
        DetectorId: detectorId,
        MaxResults: options?.maxResults ?? 50,
      })
    );
    const ids = listed.FindingIds ?? [];
    if (ids.length === 0) {
      return {
        ok: true,
        skipped: false,
        findingCount: 0,
        highSeverityCount: 0,
        reason: "GuardDuty: no open findings",
      };
    }

    const details = await client.send(
      new GetFindingsCommand({
        DetectorId: detectorId,
        FindingIds: ids.slice(0, 50),
      })
    );
    const findings = details.Findings ?? [];
    const high = findings.filter((f) => (f.Severity ?? 0) >= 7).length;

    return {
      ok: high === 0,
      skipped: false,
      findingCount: findings.length,
      highSeverityCount: high,
      reason:
        high > 0
          ? `GuardDuty: ${high} high-severity finding(s) — isolate AI runtime`
          : `GuardDuty: ${findings.length} finding(s), none high-severity`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message) ||
      (err as NodeJS.ErrnoException)?.code === "MODULE_NOT_FOUND"
    ) {
      return {
        ok: true,
        skipped: true,
        reason:
          "@aws-sdk/client-guardduty not installed — optional peer; install to enable continuous GuardDuty polls",
      };
    }
    return {
      ok: false,
      skipped: false,
      reason: `GuardDuty poll failed: ${message}`,
    };
  }
}
