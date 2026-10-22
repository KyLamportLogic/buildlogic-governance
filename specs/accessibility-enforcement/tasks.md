<!--
Home repo: KyLamportLogic/buildlogic-governance. Authored spec artifact; human approves before implementation.
Each task is TDD-first (fixtures/assertions before wiring), produces a working increment, ends with per-repo verification.
Rollout order: web-frontend repos first, then backend/infra. All Actions pinned to immutable SHAs; minimal permissions.
-->

# Accessibility Enforcement System — Tasks

Implements `requirements.md` and `design.md`. Each task lists the files it will touch (minimal-diff discipline, REQ-H6), states its tests, and ends with a **Demo** line proving the increment.

---

## Phase 0 — Shared tooling (buildlogic-governance)

### Task 1 — Author the shared reusable accessibility workflow + fixtures
Files touched: `.github/workflows/accessibility.reusable.yml`, `specs/accessibility-enforcement/fixtures/**`.
Build config parsing, axe-core (`wcag2a`,`wcag22a`), Lighthouse CI (≥0.95), exemption validation, and `ui:false` handling. Pin all Actions to immutable SHAs; declare minimal permissions.
Tests (fixture repos): (a) clean UI passes; (b) injected `serious` violation fails (REQ-B1); (c) Lighthouse 0.94 fails (REQ-B3); (d) `ui:false` passes trivially (REQ-F1); (e) undeclared fails (REQ-F2); (f) expired exemption fails (REQ-E2).
**Demo:** Run the workflow against the six fixtures; each behaves exactly as specified; run summary shows the "manual checklist REQUIRED" notice (REQ-B4).

### Task 2 — Author the shared diff-hygiene reusable workflow + fixtures
Files touched: `.github/workflows/diff-hygiene.reusable.yml`, `specs/accessibility-enforcement/fixtures/diff-hygiene/**`.
Implement deterministic gates (lint/format on changed files, new-dependency guard, stray-file guard, scope-manifest guard) and advisory heuristic flags, with output clearly labeling block vs. advisory (REQ-K5).
Tests: (a) clean minimal diff passes; (b) stray `debug.log` fails (REQ-K2); (c) undeclared new runtime dependency fails (REQ-K2); (d) file modified outside `.pr-scope` manifest fails (REQ-K3); (e) large unexplained hunk produces an advisory flag but does NOT block (REQ-K4).
**Demo:** Fixtures show deterministic failures block and advisory flags are comment-only, each labeled.

---

## Phase 1 — Web-frontend repos (highest priority)

### Task 3 — Pilot end-to-end on `KyLamportLogic/LamportLogic` (grace mode)
Files touched (in LamportLogic): `.github/workflows/accessibility.yml`, `.a11y.yml`.
Add thin caller (both reusable workflows) + `.a11y.yml` with build/preview/urls for lamportlogic.com. Run in grace mode; capture the real violation baseline.
Tests: workflow runs on a PR; summary shows axe counts + Lighthouse score + active exemptions + manual-checklist notice; does not block.
**Demo:** A PR on LamportLogic shows the accessibility and diff-hygiene summaries; current issue count recorded as the baseline.

### Task 4 — Remediate LamportLogic `main` to green, flip to enforce
Files touched (in LamportLogic): UI source files as needed to clear critical/serious axe violations and reach Lighthouse ≥0.95; branch-protection settings (via GitHub settings/API, not a repo file).
Register the check names (REQ-D4), then require `accessibility/level-a` and `diff-hygiene` on `main`.
Tests: `main` green; a deliberately-broken PR is blocked from merge; a clean PR merges.
**Demo:** Merge blocked on red, allowed on green — enforcement proven on the highest-value repo.

### Task 5 — Roll to remaining frontend repos (grace → enforce each)
Repos: `KyPython/visit-taniti`, `KyLamportLogic/human-rebuild-bootcamp`, `AAH20/aegis-effectproof`.
Files touched (per repo): `.github/workflows/accessibility.yml`, `.a11y.yml` (+ UI fixes to green `main`).
Tests (per repo): summary renders; baseline captured; `main` greened; branch protection enabled requiring both checks.
**Demo:** Each frontend repo blocks red PRs and allows green ones.

---

## Phase 2 — Backend/infra repos (self-declaration)

### Task 6 — Backend/infra repos declare UI status
Repos: `KyPython/ai-governance`, `KyLamportLogic/ky-cloud-control-plane`, `KyLamportLogic/buildlogic-governance`, `KyLamportLogic/aws-career-sandbox`, `KyPython/KyPython`.
Files touched (per repo): `.github/workflows/accessibility.yml`, `.a11y.yml` (`ui:true`+config OR `ui:false`+rationale).
Tests: `ui:false` repos pass trivially (REQ-F1); any repo that actually serves a UI gets full config; a repo left undeclared fails (REQ-F2). `KyPython/KyPython` expected `ui:false` (UNVERIFIED-5).
**Demo:** Every listed repo has an explicit, non-silent accessibility posture.

### Task 7 — Enable required status checks + branch protection fleet-wide
Scope: every UI repo (after each is green).
Files touched: branch-protection settings per repo (GitHub settings/API).
Tests: attempted merge of a red PR is blocked in each repo; required checks are `accessibility/level-a` and `diff-hygiene`.
**Demo:** No merge is possible anywhere without green accessibility and green diff-hygiene.

---

## Phase 3 — Process integration

### Task 8 — Wire spec-first + agent instructions into the authoring workflow
Files touched: governance spec template (location per `specs/codebase-snapshot-sync` precedent — UNVERIFIED-1), spec-validator config.
Add the §Spec Template Block and §Agent Instruction Block (incl. minimal-diff discipline) so every future UI spec carries accessibility acceptance criteria before implementation; the validator flags any UI spec lacking the block.
Tests: a new sample UI spec includes the block; a spec lacking it is flagged.
**Demo:** Creating a new UI spec surfaces accessibility acceptance criteria + minimal-diff discipline by default.

### Task 9 — Adopt the manual verification checklist in PR process
Files touched (per UI repo): `.github/PULL_REQUEST_TEMPLATE.md`.
Add the keyboard-only + screen-reader checklist; require it recorded for UI-changing PRs.
Tests: a UI PR without a recorded checklist is visibly incomplete; the automated pass is explicitly labeled "manual checklist REQUIRED" (REQ-I3).
**Demo:** Green automated check + recorded manual checklist = fully verified; green alone is labeled partial.

---

## Verification matrix (per repo)
| Repo | `.a11y.yml` | caller workflow | main green | enforce mode | manual checklist in PR template |
|---|---|---|---|---|---|
| LamportLogic | ✅ | ✅ | ✅ | ✅ | ✅ |
| visit-taniti | ✅ | ✅ | ✅ | ✅ | ✅ |
| human-rebuild-bootcamp | ✅ | ✅ | ✅ | ✅ | ✅ |
| aegis-effectproof | ✅ | ✅ | ✅ | ✅ | ✅ |
| ai-governance | ui:? | ✅ | n/a if ui:false | ✅ | if UI |
| ky-cloud-control-plane | ui:? | ✅ | n/a if ui:false | ✅ | if UI |
| buildlogic-governance | ui:? | ✅ | n/a if ui:false | ✅ | if UI |
| aws-career-sandbox | ui:? | ✅ | n/a if ui:false | ✅ | if UI |
| KyPython/KyPython | ui:false (expected) | ✅ | n/a | ✅ | n/a |

## Changelog
- 2026-10-14 — Initial tasks authored. Added Task 2 (diff-hygiene reusable workflow) and diff-hygiene wiring into per-repo callers and enforcement.
