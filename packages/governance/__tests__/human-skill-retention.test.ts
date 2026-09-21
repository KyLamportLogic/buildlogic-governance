import {
  HUMAN_SKILL_RETENTION_BLOCKED,
  assertHumanSkillRetention,
  evaluateHumanSkillRetention,
} from "../src/humanSkillRetention";

describe("human skill retention gate", () => {
  it("passes when no protected capability is triggered", () => {
    const result = evaluateHumanSkillRetention([]);
    expect(result.allowed).toBe(true);
    expect(result.taskGate).toBe(1);
  });

  it("passes only when every triggered capability has human-first, human-final, evidence, and no AI final authority", () => {
    const result = evaluateHumanSkillRetention(
      ["rubric-design", "llm-output-evaluation"],
      [
        {
          skillId: "rubric-design",
          humanFirstPass: true,
          humanFinalJudgment: true,
          evidenceRefs: ["docs/rubric-v1.md"],
          aiFinalAuthority: false,
        },
        {
          skillId: "llm-output-evaluation",
          humanFirstPass: true,
          humanFinalJudgment: true,
          evidenceRefs: ["evals/run-17-human-review.json"],
          aiFinalAuthority: false,
        },
      ]
    );

    expect(result.allowed).toBe(true);
    expect(result.taskGate).toBe(1);
    expect(result.perSkill).toEqual({
      "rubric-design": 1,
      "llm-output-evaluation": 1,
    });
  });

  it.each([
    ["no human first pass", { humanFirstPass: false }],
    ["no human final judgment", { humanFinalJudgment: false }],
    ["no evidence", { evidenceRefs: [] }],
    ["AI final authority", { aiFinalAuthority: true }],
  ])("fails closed for %s", (_label, override) => {
    const result = evaluateHumanSkillRetention(["critical-thinking-ambiguity"], [
      {
        skillId: "critical-thinking-ambiguity",
        humanFirstPass: true,
        humanFinalJudgment: true,
        evidenceRefs: ["evidence.txt"],
        aiFinalAuthority: false,
        ...override,
      },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.taskGate).toBe(0);
    expect(result.reason).toBe(HUMAN_SKILL_RETENTION_BLOCKED);
  });

  it("fails when any one of multiple protected skills fails", () => {
    const result = evaluateHumanSkillRetention(
      ["qa-attention-detail", "document-review-consistency"],
      [
        {
          skillId: "qa-attention-detail",
          humanFirstPass: true,
          humanFinalJudgment: true,
          evidenceRefs: ["qa.md"],
          aiFinalAuthority: false,
        },
        {
          skillId: "document-review-consistency",
          humanFirstPass: true,
          humanFinalJudgment: false,
          evidenceRefs: ["review.md"],
          aiFinalAuthority: false,
        },
      ]
    );

    expect(result.allowed).toBe(false);
    expect(result.perSkill["qa-attention-detail"]).toBe(1);
    expect(result.perSkill["document-review-consistency"]).toBe(0);
  });

  it("fails closed on missing or duplicate evidence rows", () => {
    const missing = evaluateHumanSkillRetention(["rubric-design"], []);
    expect(missing.allowed).toBe(false);
    expect(missing.missingSkillIds).toEqual(["rubric-design"]);

    const duplicate = evaluateHumanSkillRetention(["rubric-design"], [
      {
        skillId: "rubric-design",
        humanFirstPass: true,
        humanFinalJudgment: true,
        evidenceRefs: ["a"],
        aiFinalAuthority: false,
      },
      {
        skillId: "rubric-design",
        humanFirstPass: true,
        humanFinalJudgment: true,
        evidenceRefs: ["b"],
        aiFinalAuthority: false,
      },
    ]);
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.duplicateSkillIds).toEqual(["rubric-design"]);
  });

  it("assertion helper throws the canonical block marker", () => {
    expect(() =>
      assertHumanSkillRetention(["action-success-judgment"], [])
    ).toThrow(HUMAN_SKILL_RETENTION_BLOCKED);
  });
});
