> KIRO-AUTHORED SPEC (spec-author subagent) — HUMAN ADOPTION/MERGE PENDING. Not an owner approval. Drafted 2026-11-27; model ID not exposed. Issue: KyPython/ai-governance#238. Source: KyLamportLogic/buildlogic-governance@893aba5.

# Marketing-governance TypeScript alignment and governance test failures — Design

Implements `requirements.md`. Completion contract: no completion contract; not gate-verified.

## Why CI is red (evidence, not guesses)
1. Dependabot #19 changed one manifest line, `packages/marketing-governance/package.json` `typescript` 5.9.3 → 7.0.2, and not `pnpm-lock.yaml` (MGT O1, O2, O8). Frozen install fails, so every later job stops.
2. Install is the first failure, so any later failure was invisible (inference I1). Governance tests fail once install works (O10).

## Approach

### T1 design: align one package to the repo's pattern
- Edit only `packages/marketing-governance/package.json`, `packages/marketing-governance/tsconfig.json`, `pnpm-lock.yaml` (MGT-1.3, 1.4).
- Copy the devDependency pair from `packages/governance/package.json` exactly. Do not pick a new version.
- Regenerate the lockfile with the repo's pinned pnpm (`packageManager: pnpm@10.30.3`) and review that the diff is limited to the marketing-governance importer and packages it adds or drops.
- tsconfig: the failing line is `"moduleResolution": "Node"` (O4, O9). `packages/governance/tsconfig.json` omits it with `module: commonjs`. Candidate A: remove the option as governance does. Candidate B: set a value valid for the resolved compiler. The coder SHALL first determine which compiler `tsc` resolves in this package (U3, I3), then choose the smallest change, and verify MGT-2.3 (CommonJS output, declarations, `exports` targets, `pack:check`). Do not add `ignoreDeprecations` unless the evidence requires it, and record why.
- ts-jest: marketing-governance is on 29.4.6; others on 29.4.12 (O3). Moving it is OD-3. PR #24 may already do this (OD-2); do not duplicate.

### T2 design: classification (read-only)
Per failing test, produce one record. Table columns: file, full test name, assertion + message, authoritative source for the expected value, reproduction result, toolchain comparison (U4), classification, reviewer.

Classification rules:
| Class | Meaning | Required evidence | Next step |
|---|---|---|---|
| CODE-WRONG | Test matches the authoritative source; code deviates | source citation + failing reproduction | fix code (T3) |
| TEST-WRONG | Code matches the authoritative source; test is stale or incorrect | source citation; for security-relevant tests also Ky's confirmation (MGT-4.4) | correct test with equal or greater strictness (T4) |
| TOOLCHAIN | Result depends on compiler/jest/ts-jest/Node version, not behavior | same test passing under another toolchain, or a trace to the toolchain | resolve in T5; owner decision if it needs a version change |
| UNDETERMINED | No authoritative source or reproduction unclear | what was tried | stop, ask Ky one question (MGT-4.6) |

Suggested method (the coder may adapt it, but must record what was run):
1. `pnpm install --frozen-lockfile` on the T1 branch, then run `pnpm --filter @kypython/buildlogic-governance test` and save the full output outside the repo.
2. For each failure, read the test, the code under test, `git log`/`git blame` for both, and any doc, spec, or AGENTS.md rule the assertion encodes.
3. Check whether the failure follows from toolchain version by running the same test under the toolchain used before #19 (do not commit any version change).
4. Do not edit files under test. Scratch work goes outside the repo tree.

The failures cluster into 7 test files (O10); groups for T3–T5 should follow root cause, not file, since several files may share one cause. Do not assume a shared cause (U1).

### T3–T5 design: fixes
- One PR per classification group and root cause; coder and reviewer are different agents (MGT-4.7).
- Each PR cites MGT IDs in test names (MGT-4.9) and adds no unrelated change (minimal diff).
- Test-count check: record the governance jest test count before and after; count must not fall (MGT-4.8, 4.10).
- Never touch the gate, workflows, or specs (MGT-5.1).

### T6 design: bump PR #36
After T1–T5 are on main, #36 is updated from main by the mechanism OD-7 selects. Evidence: head SHA and the conclusions of `validate` and `ai-governance / verdict`. The gate reads Ky's merge, not the agent's (MGT-5.2).

## Merge-order problem (flagged)
T1 fixes install but leaves `validate` red until the MGT-4 failures are fixed (inference from O10). VERIFIED (2026-11-27, `gh api repos/KyLamportLogic/buildlogic-governance/rules/branches/main`): `main` has no required status checks and no classic branch protection, so a red `validate` does not block a T1 merge mechanically; merging with `validate` red is an owner decision, not a gate outcome. This is OD-5. This spec does not choose; it lists options and leaves it to Ky.

## Out of scope
- Any TypeScript major upgrade beyond the existing pattern (MGT-1.4).
- Dependabot configuration, unless Ky decides (MGT-5.3).
- Changing CI, gate, or branch protection.
- Suggested improvements to the governance package behavior beyond what T3 requires.

## Risks
- A "fix" that weakens a security test passes CI and looks good. Controlled by MGT-4.4, 4.5, 4.8.
- Lockfile regeneration may move unrelated packages. Controlled by diff review in MGT-1.2.
- tsconfig change may alter emitted output of a published package. Controlled by MGT-2.3.
- PR #24 conflicts with T1 (OD-2).
- Spec-gate behavior for a tsconfig-only code change is unverified (U7); the PR may fail the gate for lacking a test citing MGT IDs. If so, route back to Ky; do not edit the gate.

## Structural contract
`packages/` is a structural path (AGENTS.md rule 6). If `.systems-thinking/contracts/` exists (U6), each code PR adds a `SYSTEMS_THINKING_CONTRACT` JSON whose scope covers the touched paths. T1 must check this.
