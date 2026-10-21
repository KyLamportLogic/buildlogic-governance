/**
 * Deterministic Human Skill Retention Gate.
 *
 * This evaluator does not decide which skills are semantically triggered.
 * The caller supplies the protected skill IDs. Once C is identified, the
 * decision is deterministic and fail-closed.
 *
 * P_c = H_c * J_c * E_c * (1 - A_c)
 * TaskGate = 1 when C is empty, otherwise min(P_c)
 * PASS iff TaskGate === 1
 */

export const HUMAN_SKILL_RETENTION_BLOCKED =
  "BLOCKED — HUMAN SKILL REP REQUIRED" as const;

export interface HumanSkillEvidenceItem {
  skillId: string;
  humanFirstPass: boolean;
  humanFinalJudgment: boolean;
  evidenceRefs: string[];
  aiFinalAuthority: boolean;
}

export interface HumanSkillRetentionResult {
  allowed: boolean;
  taskGate: 0 | 1;
  perSkill: Record<string, 0 | 1>;
  reason?: string;
  missingSkillIds: string[];
  duplicateSkillIds: string[];
}

export function evaluateHumanSkillRetention(
  protectedSkillIds: readonly string[],
  evidence: readonly HumanSkillEvidenceItem[] = []
): HumanSkillRetentionResult {
  const requested = [...new Set(protectedSkillIds.map((id) => id.trim()).filter(Boolean))];

  if (requested.length === 0) {
    return {
      allowed: true,
      taskGate: 1,
      perSkill: {},
      missingSkillIds: [],
      duplicateSkillIds: [],
    };
  }

  const bySkill = new Map<string, HumanSkillEvidenceItem[]>();
  for (const item of evidence) {
    const id = item.skillId?.trim();
    if (!id) continue;
    const bucket = bySkill.get(id) ?? [];
    bucket.push(item);
    bySkill.set(id, bucket);
  }

  const missingSkillIds: string[] = [];
  const duplicateSkillIds: string[] = [];
  const perSkill: Record<string, 0 | 1> = {};

  for (const skillId of requested) {
    const matches = bySkill.get(skillId) ?? [];
    if (matches.length === 0) {
      missingSkillIds.push(skillId);
      perSkill[skillId] = 0;
      continue;
    }
    if (matches.length > 1) {
      duplicateSkillIds.push(skillId);
      perSkill[skillId] = 0;
      continue;
    }

    const item = matches[0];
    const H = item.humanFirstPass === true ? 1 : 0;
    const J = item.humanFinalJudgment === true ? 1 : 0;
    const E =
      Array.isArray(item.evidenceRefs) &&
      item.evidenceRefs.some((ref) => typeof ref === "string" && ref.trim().length > 0)
        ? 1
        : 0;
    const A = item.aiFinalAuthority === true ? 1 : 0;

    perSkill[skillId] = (H * J * E * (1 - A)) as 0 | 1;
  }

  const taskGate = Math.min(...Object.values(perSkill)) as 0 | 1;
  const allowed =
    taskGate === 1 &&
    missingSkillIds.length === 0 &&
    duplicateSkillIds.length === 0;

  return {
    allowed,
    taskGate: allowed ? 1 : 0,
    perSkill,
    reason: allowed
      ? undefined
      : HUMAN_SKILL_RETENTION_BLOCKED,
    missingSkillIds,
    duplicateSkillIds,
  };
}

export function assertHumanSkillRetention(
  protectedSkillIds: readonly string[],
  evidence: readonly HumanSkillEvidenceItem[] = []
): HumanSkillRetentionResult {
  const result = evaluateHumanSkillRetention(protectedSkillIds, evidence);
  if (!result.allowed) {
    const details = [
      result.missingSkillIds.length
        ? `missing=${result.missingSkillIds.join(",")}`
        : "",
      result.duplicateSkillIds.length
        ? `duplicate=${result.duplicateSkillIds.join(",")}`
        : "",
    ].filter(Boolean);

    throw new Error(
      `${HUMAN_SKILL_RETENTION_BLOCKED}${details.length ? `: ${details.join("; ")}` : ""}`
    );
  }
  return result;
}
