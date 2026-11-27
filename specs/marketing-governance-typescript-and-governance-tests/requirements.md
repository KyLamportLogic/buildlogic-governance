> KIRO-AUTHORED SPEC (spec-author subagent) — HUMAN ADOPTION/MERGE PENDING. Not an owner approval. Drafted 2026-11-27; model ID not exposed. Issue: KyPython/ai-governance#238. Source: KyLamportLogic/buildlogic-governance@893aba5.

# Marketing-governance TypeScript alignment and governance test failures — Requirements

**Spec ID:** `marketing-governance-typescript-and-governance-tests` (requirement prefix `MGT-`)
**Issue:** KyPython/ai-governance#238 (existing; no new issue created)
**Completion contract:** no completion contract; not gate-verified.
**Authority:** Ky (@KyPython) owns adoption, merge, and every decision listed under "Owner decisions". Agents never merge (AGENTS.md, Merge and deploy gate).

## Overview
Main (893aba5) is red for every PR since at least #30, including bump PR #36. Install fails first, so test failures behind it were never visible. This spec covers only: (1) restoring a passing frozen install and build, and (2) classifying and fixing the governance test failures that install exposes. It does not authorize code changes until Ky merges this spec and grants each task.

**Duplicate check (Agent Conduct Rules could not be loaded; this is the substitute):** open PR #24 bumps `ts-jest` and may touch the same manifest and lockfile lines as MGT-1. Its contents were not re-read here (UNKNOWN). No existing spec in `specs/` covers this scope: only `specs/accessibility-enforcement/` was read.

## Evidence states

### VERIFIED CURRENT OBSERVATION (re-checked in the repo at 893aba5 unless marked "parent session")
- O1. `packages/marketing-governance/package.json` devDependency is `"typescript": "7.0.2"`.
- O2. `pnpm-lock.yaml` importer `packages/marketing-governance` records `typescript` specifier `5.9.3` and `ts-jest` 29.4.6 resolved against `typescript@5.9.3`. Manifest and lockfile disagree.
- O3. `packages/governance`, `governance-cli`, `logger`, `security` use `"typescript": "npm:@typescript/typescript6@6.0.2"` plus `"@typescript/native": "npm:typescript@7.0.2"` (package.json files and `pnpm-lock.yaml` importers). Except `governance-cli`, they use `ts-jest` 29.4.12; marketing-governance uses 29.4.6.
- O4. `packages/marketing-governance/tsconfig.json` sets `"moduleResolution": "Node"` (line 5). `packages/governance/tsconfig.json` sets no `moduleResolution`.
- O5. Root `package.json` scripts: `build` and `test` run `pnpm -r`; `type-check` builds governance first; `verify` also runs `doctor`, `test:doctor`, `pack:check`.
- O6. `.github/dependabot.yml` has one npm updater at `/`, weekly, limit 5, with a `production-dependencies` group, and a github-actions updater.
- O7. AGENTS.md forbids editing workflows, CODEOWNERS, the governance section, or branch protection, and forbids deleting, skipping, or loosening tests to get green (rules 4, 7).
- O8 (parent session). Commit 893aba5 is Dependabot PR #19; CI `pnpm install --frozen-lockfile` fails with "specifiers in the lockfile don't match specifiers in package.json: typescript (lockfile: 5.9.3, manifest: 7.0.2)".
- O9 (parent session). With marketing-governance aligned to the O3 pattern and the lockfile synced, install passes and marketing-governance `tsc` fails with `tsconfig.json(5,25): error TS5108: Option 'moduleResolution=node10' has been removed.` ts-jest 29.4.6 warns of unmet peer `typescript >=4.3 <6`. Marketing-governance tests: 11 passed.
- O10 (parent session). After install works, `packages/governance` has 20 failing jest tests (assertion failures: toBe/toMatch/toContain) in `__tests__/redteam.test.ts`, `prompt-injection-r1-r3.test.ts`, `integration.test.ts`, `gdm-orchestrator.test.ts`, `gdm-control-tiers.test.ts`, `gateSideEffect.test.ts`, `alignment.test.ts`. Examples: "R3 — Risk Ceilings › blocks unauthorized tool calls", "blocks .git/logs/ file access", "runGovernancePreflight — GDM stack (mandatory law) › …".

### INFERENCE (not verified; do not rely on it)
- I1. The 20 failures predate #19 and were hidden by the install failure, because CI stops at install.
- I2. Tests in `redteam`, `prompt-injection`, `gateSideEffect`, and risk-ceiling files encode security behavior, so a wrong change to them could weaken a control.
- I3. TS5108 may come from running a TypeScript 7 compiler on the tsconfig. Whether marketing-governance's `tsc` resolves 6.0.2 or 7.0.2 under the O3 pattern was not re-verified.

### UNKNOWN
- U1. Cause of each of the 20 governance failures (test wrong, code wrong, toolchain, or other).
- U2. Exact test IDs of all 20; only examples are known (O10).
- U3. Which compiler binary produced TS5108 (see I3), and which tsconfig change clears it without changing emitted output.
- U4. Whether `packages/governance` failures also occur under the previous TypeScript, i.e. toolchain-induced.
- U5. Contents and mergeability of PR #24 and bump PR #36; whether #36 needs more than main updates.
- U6. Whether `.systems-thinking/contracts/` exists here (AGENTS.md rule 6 applies to `packages/` changes if it does).
- U7. How the spec gate treats a `tsconfig.json` change without a test citing an MGT ID (AGENTS.md rule 2 items 1–3; exemption covers lockfiles and dependency-only manifest changes).
- U8. Whether `HUMAN_SKILL_RETENTION_GATE` protects the security-test classification work; not evaluated here.

## User stories
- As Ky, I want main's install, build, and tests to pass so that required checks mean something and bump PRs can merge.
- As Ky, I want every red governance test explained before it is touched, so that no security assertion is weakened to get green.
- As a reviewer, I want each fix traced to a requirement ID and a recorded classification.

## Requirements (EARS)

### MGT-1 Install and dependency alignment
- **MGT-1.1** WHEN `pnpm install --frozen-lockfile` runs on the T1 branch THEN the system SHALL exit 0.
  Source: O8. Evidence: command output quoted in the PR. Depends on: spec merged, T1 granted.
- **MGT-1.2** THE manifests and `pnpm-lock.yaml` SHALL agree for every workspace importer, including `packages/marketing-governance` `typescript`.
  Source: O2. Evidence: MGT-1.1 passing; lockfile diff limited to the importer and resolved-package entries that change.
- **MGT-1.3** THE `packages/marketing-governance` devDependencies SHALL use the repo's existing pattern (`typescript: npm:@typescript/typescript6@6.0.2`, `@typescript/native: npm:typescript@7.0.2`), unless Ky decides otherwise (OD-1).
  Source: O3. Evidence: package.json diff.
- **MGT-1.4** THE change SHALL NOT introduce a TypeScript major version or compiler package beyond the pattern in MGT-1.3 without an owner decision recorded on #238.
  Source: owner instruction; O3. Evidence: diff shows no other TypeScript specifier.
- **MGT-1.5** WHERE PR #24 changes the same manifest or lockfile lines, THE T1 change SHALL be reconciled with it and SHALL NOT duplicate its edit (OD-2).
  Source: duplicate-check rule. Evidence: PR #24 state and diff noted in the T1 PR.

### MGT-2 Build and type-check
- **MGT-2.1** WHEN `pnpm build` runs from the repo root THEN every workspace package SHALL build with exit 0.
  Source: O5, O9. Evidence: command output. Depends on: MGT-1.1.
- **MGT-2.2** WHEN `pnpm type-check` runs from the repo root THEN it SHALL exit 0.
  Source: O5. Evidence: command output. Depends on: MGT-2.1.
- **MGT-2.3** THE `packages/marketing-governance/tsconfig.json` change SHALL remove the TS5108 error and SHALL NOT change the emitted module format (CommonJS), declaration output, or the package `exports` targets.
  Source: O4, O9, U3. Evidence: TS5108 absent; `dist/index.js` and `dist/index.d.ts` present; `pnpm pack:check` exit 0.
- **MGT-2.4** WHEN `pnpm pack:check` runs THEN it SHALL exit 0.
  Source: O5. Evidence: command output.

### MGT-3 Marketing-governance tests
- **MGT-3.1** WHEN `pnpm --filter @kypython/buildlogic-marketing-governance test` runs after T1 THEN all 11 existing tests SHALL pass with no test file changed.
  Source: O9. Evidence: jest summary.
- **MGT-3.2** THE ts-jest peer warning for marketing-governance SHALL be resolved or recorded as accepted by Ky. Source: O9. Evidence: install log, or the recorded decision (OD-3).

### MGT-4 Governance test failures
- **MGT-4.1** THE classification task SHALL record, at base SHA after T1, the full set of failing `packages/governance` tests (file, full test name, assertion type, message) and reconcile its count with 20.
  Source: O10, U2. Evidence: inventory table. Depends on: MGT-1.1.
- **MGT-4.2** THE classification task SHALL assign each failing test exactly one of TEST-WRONG, CODE-WRONG, TOOLCHAIN, or UNDETERMINED, with evidence: reproduction, the authoritative source the assertion encodes (spec, AGENTS.md, docs, or git history), and a toolchain comparison for U4.
  Source: owner instruction; U1. Evidence: per-test record.
- **MGT-4.3** THE classification task SHALL NOT edit, skip, or delete any test or source file; reproduction scripts SHALL stay outside the repo tree or uncommitted.
  Source: AGENTS.md rule 4. Evidence: empty diff for the task.
- **MGT-4.4** A TEST-WRONG classification for any security-relevant test (redteam, prompt-injection, risk ceilings, side-effect gate, `.git/logs/` access) SHALL cite a written authoritative source and SHALL be confirmed by Ky before any fix.
  Source: I2; AGENTS.md rule 11. Evidence: citation plus Ky's recorded confirmation.
- **MGT-4.5** A reviewer other than the classifier SHALL review the classification before any fix task is authorized.
  Source: AGENTS.md rule 2. Evidence: reviewer sign-off on the record.
- **MGT-4.6** WHEN a test is classified UNDETERMINED THEN the system SHALL make no change for it and SHALL ask Ky one question on #238.
  Source: stop-at-boundaries rule. Evidence: question posted; no diff.
- **MGT-4.7** EACH fix SHALL be a separate PR from T1 and T2, scoped to one classification group, with a different agent reviewing it.
  Source: AGENTS.md rule 2. Evidence: PR list.
- **MGT-4.8** THE fix SHALL NOT skip, delete, xfail, rename-away, exclude from the jest config, or weaken any assertion (looser matcher, removed `expect`, lowered threshold) to get green. A TEST-WRONG correction SHALL assert the authoritative behavior with at least the original strictness.
  Source: AGENTS.md rule 4; owner instruction. Evidence: reviewer compares assertion strength; jest test count in `packages/governance` is not lower than at classification.
- **MGT-4.9** WHEN a fix changes behavior THEN a test whose name or comment cites the relevant MGT ID SHALL ship with it.
  Source: AGENTS.md rule 2 item 3, rule 4. Evidence: test names.
- **MGT-4.10** WHEN all fix tasks are merged THEN `pnpm --filter @kypython/buildlogic-governance test` SHALL report 0 failed and the same or greater number of tests than at classification.
  Source: O10. Evidence: jest summary.

### MGT-5 Governance integrity and scope
- **MGT-5.1** THE work SHALL NOT edit workflows, CODEOWNERS, AGENTS.md, branch protection, `.husky/`, `.claude/`, `.cursor/rules/`, or any file under `specs/` in a code PR.
  Source: O7. Evidence: diff path check.
- **MGT-5.2** THE work SHALL NOT deploy, publish, merge, approve, or spend money.
  Source: AGENTS.md; owner instruction. Evidence: none required beyond absence.
- **MGT-5.3** THE Dependabot configuration SHALL change only if Ky decides it (OD-4). If Ky declines, `.github/dependabot.yml` stays as in O6.
  Source: owner instruction. Evidence: recorded decision on #238.

### MGT-6 Completion
- **MGT-6.1** WHEN T1–T5 are merged THEN PR #36 SHALL be updated from main and `validate` plus `ai-governance / verdict` SHALL be green on it.
  Source: owner goal. Evidence: check names, conclusions, head SHA quoted. Depends on: MGT-1, MGT-2, MGT-4.10.
- **MGT-6.2** THE completion message SHALL state "no completion contract; not gate-verified" and SHALL NOT claim gate verification.
  Source: completion-gate rule. Evidence: message text.
- **MGT-6.3** EACH PR for this spec SHALL carry `Spec: specs/marketing-governance-typescript-and-governance-tests` on its own line and a link to #238 (Relates to).
  Source: AGENTS.md rule 2. Evidence: PR body.

## Owner decisions
- **OD-1** Confirm the "existing pattern" for marketing-governance (MGT-1.3), or choose another TypeScript setup.
- **OD-2** Order of PR #24 relative to T1 (merge first, rebase T1 onto it, or close one).
- **OD-3** Accept or fix the ts-jest peer warning (MGT-3.2); whether marketing-governance moves to ts-jest 29.4.12 to match the other packages.
- **OD-4** Whether to change `.github/dependabot.yml` (for example, ignore TypeScript major bumps). Optional; this spec does not recommend a change.
- **OD-5** Merge ordering: T1 alone leaves `validate` red because of MGT-4 failures (inference from O10). `main` requires no status checks (verified 2026-11-27), so this is Ky's choice, not a gate block. Choose: stack the PRs and merge only when the last is green; or Ky merges T1 while knowingly red. Gate rules say both checks must be green before merge.
- **OD-6** Where the T2 classification record lives (comment on #238, or a PR description). It must not go under `specs/`.
- **OD-7** Who updates PR #36 (its author or a granted task), since agents may not alter it without a grant.

## Changelog
- 2026-11-27 — Initial draft.
