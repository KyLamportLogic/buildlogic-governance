# Human Skill Retention Gate

**Marker:** `HUMAN_SKILL_RETENTION_GATE`

## Purpose

These are verified human capabilities that must remain **human-retained skills**, not capabilities silently replaced by AI. AI may perform mechanical support around them, but it may never be the sole or final authority for the judgment-bearing part of a protected skill.

This gate tightens the Human Agency Runtime. It does **not** ban automation, testing, linting, search, formatting, or second-pass analysis. It bans AI from becoming the credit-bearing / decisive actor for the protected competencies.

## Protected capabilities

1. `data-entry-qa-regulated` — Data entry QA & data validation in regulated/audit-sensitive domains
2. `reconciliation-common-formats` — Error detection & reconciliation across common data/file formats
3. `ai-eval-task-authoring` — Task authoring for AI evaluation (benchmarking)
4. `rubric-design` — Rubric design & grading criteria development
5. `technical-evaluation-qa` — Technical evaluation/QA mindset (rubric-based grading, edge cases, documentation)
6. `llm-output-evaluation` — LLM output evaluation & instruction-following assessment
7. `analytical-discrepancy-detection` — Analytical review & discrepancy detection
8. `structured-documentation` — Structured documentation & remote execution
9. `actionable-feedback` — Actionable feedback & communication clarity
10. `llm-comparative-evaluation` — LLM prompting & comparative evaluation (ChatGPT vs Claude)
11. `remote-async-professional-english` — Remote async collaboration & professional written English
12. `american-english-communication` — American English verbal & written communication (clear, structured feedback)
13. `video-timestamping` — Advanced timestamping / event marking in video
14. `video-annotation` — Video data annotation & labeling (short clips)
15. `pattern-recognition` — Pattern Recognition
16. `instruction-comprehension-collaboration` — English instruction comprehension & remote collaboration
17. `bug-identification-reporting` — Technical Communication (Bug Identification & Reporting)
18. `qa-attention-detail` — Quality assurance & attention to detail
19. `written-verbal-collaboration` — Written & verbal communication (remote collaboration)
20. `critical-thinking-ambiguity` — Critical thinking & ambiguity resolution
21. `process-documentation-improvement` — Process documentation & continuous improvement
22. `action-success-judgment` — Action Success Judgment
23. `document-review-consistency` — Consistency in Document Review

## Deterministic gate

For a task, let **C** be the set of protected capability IDs materially exercised by the task.

For each `c ∈ C`:

- `H_c = 1` only when KyJahn made the first substantive human observation / attempt / judgment for that capability before the decisive AI output.
- `J_c = 1` only when KyJahn made the final judgment / grade / reconciliation / approval for that capability.
- `E_c = 1` only when at least one concrete evidence reference exists for the human work (note, diff, test result, rubric result, timestamped observation, or other auditable artifact).
- `A_c = 1` when AI was the sole or final authority for that capability; otherwise `A_c = 0`.

```text
P_c = H_c * J_c * E_c * (1 - A_c)
TaskGate = 1                         when C = ∅
TaskGate = min(P_c for c in C)      when C ≠ ∅
PASS iff TaskGate = 1
```

No weights. No averaging. One failed protected capability fails the task gate.

## Required runtime behavior

When a protected capability is triggered:

1. AI may inspect evidence, retrieve files, run tests, calculate, sort, format, or generate a **candidate** second-pass analysis.
2. AI must not provide the decisive answer first when doing so would replace the protected human rep.
3. AI must not write the human-first observation, human final judgment, human grade, or human evidence attestation on KyJahn's behalf.
4. KyJahn performs the first substantive pass and final judgment.
5. AI may then challenge, compare, stress-test, automate follow-up mechanics, and verify consistency.
6. If the human rep is absent, the agent returns `BLOCKED — HUMAN SKILL REP REQUIRED` and states the smallest human action needed.
7. The urgent/fatigued override may remove ceremony, but it may not convert AI into the final authority for a protected capability.
8. Sub-agents inherit this gate and may not weaken, bypass, reclassify, or self-attest it.

## Evidence block

Use this shape when a task exercises protected capabilities:

```yaml
HUMAN_SKILL_EVIDENCE:
  protected_skill_ids: [example-id]
  human_first_pass: true
  human_judgment_recorded: true
  evidence_refs:
    - path/or/url/or/test-result
  ai_final_authority: false
```

AI may validate this block for completeness. AI may **not** author the human attestation fields as if they were KyJahn's work.

## Examples

- AI can run a reconciliation script; KyJahn must independently inspect the discrepancy and own the final reconciliation judgment.
- AI can generate candidate rubric criteria; KyJahn must author or materially judge the rubric and own the final grading rule.
- AI can flag likely bugs; KyJahn must perform the protected bug-identification/reporting judgment when that is the capability being practiced or claimed.
- AI can summarize model outputs; KyJahn must perform the final LLM quality / instruction-following assessment.
- AI can format documentation; KyJahn must own the substantive document-review consistency judgment and any capability claim based on it.

## Claim boundary

Repository ownership, commits, PRs, green CI, AI-generated artifacts, or an AI-completed evidence block do not prove retained human capability. Only actual human performance plus evidence may support a human skill claim.
