# AI Execution Prompt — Human Skill Retention Gate Rollout

Use this prompt when installing the gate into another repository.

---

You are modifying an existing codebase to install a **Human Skill Retention Gate** without weakening existing governance, security, CI, authorship, or repository-specific rules.

## Objective

Preserve a defined set of human-retained capabilities so AI can accelerate production without silently replacing the human judgment reps that maintain those skills.

The gate must be **deterministic, fail-closed, additive, and auditable**.

## Protected capability rule

For each protected capability `c` materially exercised by a task:

- `H_c = 1` only if the human made the first substantive observation / attempt / judgment before the decisive AI output.
- `J_c = 1` only if the human made the final judgment / grade / reconciliation / approval.
- `E_c = 1` only if at least one concrete evidence reference exists.
- `A_c = 1` if AI was the sole or final authority; otherwise `0`.

```text
P_c = H_c * J_c * E_c * (1 - A_c)
TaskGate = 1                         when C = ∅
TaskGate = min(P_c for c in C)      when C ≠ ∅
PASS iff TaskGate = 1
```

No weights. No averages. No compensating strengths.

## Required semantics

AI may still:
- inspect repositories, logs, tests, files, and runtime evidence;
- calculate, search, sort, transform, format, and scaffold;
- run automated checks;
- generate candidate second-pass analyses after the human first pass;
- challenge the human's reasoning;
- automate follow-up mechanics after the human judgment is established.

AI may not:
- perform the protected human rep *instead* of the human;
- supply the decisive answer first when that would eliminate the human rep;
- act as sole/final evaluator for a protected capability;
- author a human attestation, human grade, human judgment, or evidence claim;
- let a sub-agent bypass, weaken, relabel, or self-attest the gate;
- treat repository ownership, commits, PRs, or green CI as proof of human capability.

If required human evidence is absent, return exactly:

`BLOCKED — HUMAN SKILL REP REQUIRED`

Then state the smallest human action required to unblock.

## Install procedure

1. Audit existing governance before editing:
   - `AGENTS.md`
   - `CLAUDE.md`, `GEMINI.md`
   - `.cursor/rules/`
   - `.github/copilot-instructions.md`
   - governance / truth-map / doctrine docs
   - PR templates
   - CI workflows
   - agent harnesses and sub-agent configs
2. Preserve all existing rules. Merge; do not overwrite.
3. Add one canonical policy doc named `HUMAN_SKILL_RETENTION_GATE.md`.
4. Add machine-readable `config/human-skill-retention.json`.
5. Propagate a concise marker and pointer to every supported agent instruction surface.
6. Add an always-applied Cursor rule when Cursor is used.
7. Add a deterministic validator that checks:
   - exact policy marker;
   - exact formula;
   - unique protected capability IDs;
   - human-first = required;
   - human-final = required;
   - evidence = required;
   - AI final authority = false;
   - required agent surfaces contain the marker.
8. Wire the validator into CI using immutable action SHAs and minimum permissions.
9. Reuse existing governance infrastructure where possible; do not create a parallel conflicting doctrine.
10. For learning / deliberate-practice repos, tighten the gate: AI must not provide paste-ready learner solutions.
11. For production repos, preserve velocity: mechanical AI assistance remains allowed; only the judgment-bearing protected slice is human-reserved.
12. For archived or third-party/employer-owned repos, do not mutate history or external governance without explicit authority.
13. Run all existing governance / doctrine / propagation validators plus the new gate.
14. Open a PR. Do not merge if any gate is red.

## Evidence block

```yaml
HUMAN_SKILL_EVIDENCE:
  protected_skill_ids: [id]
  human_first_pass: true
  human_judgment_recorded: true
  evidence_refs:
    - path/or/url/or/test-result
  ai_final_authority: false
```

AI may validate completeness. AI may not fill human attestation fields on behalf of the human.

## Completion criteria

Do not claim completion until:
- every relevant agent surface is updated;
- the machine-readable policy and canonical doc agree;
- the validator exits 0 and reports `HumanSkillRetentionPolicyScore=1.0`;
- existing governance tests still pass;
- the PR is created with exact changed files and any remaining blockers documented.
