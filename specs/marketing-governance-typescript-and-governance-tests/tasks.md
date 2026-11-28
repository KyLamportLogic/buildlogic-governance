> KIRO-AUTHORED SPEC (spec-author subagent) — HUMAN ADOPTION/MERGE PENDING. Not an owner approval. Drafted 2026-11-27; model ID not exposed. Issue: KyPython/ai-governance#238. Source: KyLamportLogic/buildlogic-governance@893aba5.

# Marketing-governance TypeScript alignment and governance test failures — Tasks

Implements `requirements.md` and `design.md`. Completion contract: no completion contract; not gate-verified.

**Status of every task: UNAUTHORIZED.** No task may start until Ky merges this spec and grants that exact task on KyPython/ai-governance#238. Each task is one PR by one coder; a different agent reviews. Coders and reviewers are capability classes, not vendors. No task merges, deploys, publishes, or spends. Each PR body carries `Spec: specs/marketing-governance-typescript-and-governance-tests` on its own line and `Relates to KyPython/ai-governance#238`.

Owner decisions that gate tasks: see `requirements.md` OD-1 to OD-7.

---

## T1 — Align marketing-governance dependency, lockfile, tsconfig
- **Traces:** MGT-1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 6.3.
- **Depends on:** spec merged; T1 granted; OD-1, OD-2, OD-3 answered (OD-5 before merge).
- **Capability:** coder with TypeScript/pnpm tooling experience. Reviewer: different agent with the same.
- **Files:** `packages/marketing-governance/package.json`, `packages/marketing-governance/tsconfig.json`, `pnpm-lock.yaml` only. Check U6 (`.systems-thinking/contracts/`) first.
- **Do:** follow design "T1 design". Determine which compiler `tsc` resolves before choosing the tsconfig change (U3).
- **Evidence:** quoted output of `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm type-check`, `pnpm pack:check`, and the marketing-governance jest summary (11 passed, no test file changed); lockfile diff reviewed.
- **Expected:** `validate` may still fail on governance tests (OD-5). Report that plainly; do not hide it.

## T2 — Classify the 20 governance failures (read-only)
- **Traces:** MGT-4.1, 4.2, 4.3, 4.5, 4.6.
- **Depends on:** T1 branch or merge (needs a working install); T2 granted; OD-6 answered.
- **Capability:** analyst/coder able to read code and history. Reviewer: a different agent; Ky confirms security-relevant TEST-WRONG calls (MGT-4.4).
- **Files:** none in the repo. Output is the per-test record at the OD-6 location.
- **Evidence:** inventory reconciled to 20 (or the real count stated, with the discrepancy named); each record has class, authoritative source, reproduction, toolchain comparison, reviewer. Empty repo diff.
- **Stop:** any UNDETERMINED test → one question to Ky on #238; no change for it.

## T3 — Fix CODE-WRONG failures (one PR per root cause)
- **Traces:** MGT-4.7, 4.8, 4.9, 4.10, 5.1, 5.2.
- **Depends on:** T2 reviewed; T3 granted per root cause. Created only if T2 finds CODE-WRONG items.
- **Capability:** coder with security-sensitive TypeScript experience; reviewer: a different agent.
- **Files:** determined by T2. Source files under `packages/governance/src/` plus tests that cite MGT IDs.
- **Evidence:** failing test reproduced first, then passing; no assertion changed; test count not lower.

## T4 — Correct TEST-WRONG failures (one PR per root cause)
- **Traces:** MGT-4.4, 4.7, 4.8, 4.9, 4.10.
- **Depends on:** T2 reviewed; Ky's confirmation recorded for each security-relevant test; T4 granted. Created only if T2 finds TEST-WRONG items.
- **Capability:** coder; reviewer: a different agent comparing assertion strength before and after.
- **Files:** determined by T2 (`packages/governance/__tests__/*`).
- **Evidence:** cited authoritative source per test; strictness at least equal; no skip/delete/xfail/exclusion.

## T5 — Resolve TOOLCHAIN failures
- **Traces:** MGT-1.4, 4.7, 4.8, 4.10.
- **Depends on:** T2 reviewed; any version change needs an owner decision on #238 (MGT-1.4); T5 granted. Created only if T2 finds TOOLCHAIN items.
- **Capability:** coder with build-tooling experience; reviewer: a different agent.
- **Files:** determined by T2.
- **Evidence:** the test passes on the repo's pattern toolchain with unchanged assertions.

## T6 — Update PR #36 from main and confirm green
- **Traces:** MGT-6.1, 6.2, 5.2.
- **Depends on:** T1, T3–T5 (those that exist) merged to main by Ky; OD-7 answered; T6 granted.
- **Capability:** coder/operator with GitHub access; no merge rights.
- **Files:** none beyond what #36 already changes.
- **Evidence:** head SHA of #36 and the conclusion of `validate` and `ai-governance / verdict`, quoted. If red for a cause outside this spec, report it with the check name and error line; do not widen scope.
- **Report:** "no completion contract; not gate-verified".

## T7 (optional) — Dependabot configuration
- **Traces:** MGT-5.3.
- **Depends on:** OD-4 decided in favor of a change by Ky. Without that decision this task does not exist.
- **Files:** `.github/dependabot.yml` only (repo-metadata path; confirm the gate treats it as exempt, U7).
- **Evidence:** diff matches Ky's decision; no other lines change.

---

## Dependency order
spec merged → OD-1/2/3 → T1 → T2 → T3 / T4 / T5 (as classification dictates, in parallel by root cause) → T6. T7 independent, only if decided.

## Traceability
| Requirement | Task |
|---|---|
| MGT-1.x | T1 (T5 for 1.4) |
| MGT-2.x, 3.x | T1 |
| MGT-4.1–4.6 | T2 |
| MGT-4.7–4.10 | T3, T4, T5 |
| MGT-5.1, 5.2 | every task |
| MGT-5.3 | T7 |
| MGT-6.1, 6.2 | T6 |
| MGT-6.3 | every PR |

## Changelog
- 2026-11-27 — Initial draft.

---

## Amendment R1 — T2 result and disposition of T3–T5 (2026-11-28)

> KIRO-AUTHORED SPEC AMENDMENT — HUMAN ADOPTION/MERGE PENDING. Not an owner approval. Drafted 2026-11-28; model ID not exposed. Issue: KyPython/ai-governance#238. Source: KyLamportLogic/buildlogic-governance@d547f24. No completion contract; not gate-verified.

**T2 result (read-only, observed):** all 20 `packages/governance` failures are **environmental**, class TOOLCHAIN under MGT-4.2 (the local developer environment, not the code or the tests).

| Condition (`packages/governance`, 178 tests) | Result |
| --- | --- |
| Developer shell on macOS, with `~/.buildlogic/governance-state.json` present | 20 failed, 158 passed |
| `env -i HOME PATH` (no other variables), and with `CI=true` | 20 failed, 158 passed |
| `BUILDLOGIC_GOVERNANCE_STATE_PATH=/tmp/blg-nonexistent.json` | 178 passed |
| `HOME` set to an empty directory | 178 passed |
| CI (ubuntu), PR #38 and main `d547f24` | 178 passed |

**Mechanism (file evidence):** `src/hardware/state-file.ts:14-19` defaults the state path to `join(homedir(), ".buildlogic")/governance-state.json` unless `BUILDLOGIC_GOVERNANCE_STATE_PATH` is set. `syncGovernanceKillToEnv` (same file, about lines 96–137) sets `AI_ACTION_KILL_SWITCH="true"` when that file has `aiActionKillSwitch: true`. `src/killSwitch.ts:22-24` calls it, and `src/policyEngine.ts:35` then blocks every preflight. The developer machine had such a file (`aiActionKillSwitch: true`, `reason: "emergency"`, `updatedAt: 2026-09-22`). CI has no such file.

**Disposition:**
- **T2:** complete with this record (MGT-4.1, MGT-4.2). The inventory reconciles to 20; every item has the same class and the same cause. No test was changed (MGT-4.3, MGT-4.8).
- **T3, T4, T5:** **not needed.** No failure is CODE-WRONG or TEST-WRONG, so MGT-4.4–4.7 and 4.9 have nothing to act on. MGT-4.10 is met in CI (178/178 on main `d547f24`).
- **Residual risk:** the tests read the developer's real home directory, so a live kill switch on a developer machine makes them fail and could hide real failures. Optional task T8 below addresses it.
- **Not changed:** the kill-switch file on the developer machine. Clearing it is Ky's decision; it may also block other local BuildLogic tools.

- [ ] **T8 (optional; owner decides). Make the governance tests independent of the developer's home directory.** (MGT-4.8, MGT-4.10)
  Set `BUILDLOGIC_GOVERNANCE_STATE_PATH` to a per-run temporary path in the `packages/governance` jest setup, so tests never read `~/.buildlogic`. Keep every existing assertion. Add one test that fails if the default home path is read during tests.
  Coder: capability `test-synthesis and coding` · Reviewer: capability `independent-verification`, a distinct principal. UNAUTHORIZED until Ky grants it.
  Evidence: with a kill-switch file present in `HOME`, `pnpm test` in `packages/governance` passes 178 plus the new test; CI unchanged.
