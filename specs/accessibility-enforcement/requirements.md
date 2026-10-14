<!--
Home repo: KyLamportLogic/buildlogic-governance (source of truth).
This spec is an authored, reviewable artifact. Spec-first: human approves before any implementation.
Governance (this repo's AGENTS.md/CONTRIBUTING.md): minimal explicit CI permissions,
third-party Actions pinned to immutable commit SHAs, fail-closed, additive-only CI, never weaken CI.
-->

# Accessibility Enforcement System — Requirements

## Overview
- **Purpose:** A reusable, cross-repo system that enforces **WCAG 2.2 Level A** (minimum) as a non-bypassable merge gate on every active GitHub repository, using open-source tooling only.
- **Owner / authority:** Ky (human). Implementing agent: Cursor/Codex, only after this spec is approved.
- **Source of truth:** This spec and the shared reusable workflow live in `KyLamportLogic/buildlogic-governance`. All other repos consume them per-repo.
- **Precedent:** Follows the reusable-workflow shape of `specs/codebase-snapshot-sync` (one shared `workflow_call` workflow, consumed per-repo). See UNVERIFIED-1.

## Gate Philosophy (binding design constraint)
AI makes generation cheap; the scarce skill is **verification**. Therefore:
1. Every automated check is **deterministic pass/fail**. No subjective "looks fine" in the gate.
2. What automation **can** prove (alt attribute presence, labeled inputs, `lang` declaration, color-contrast math, ARIA validity, document title, landmarks) is enforced by machine.
3. What automation **cannot** prove (meaningful alt text, sensible focus order, screen-reader comprehension) is covered by a **defined, mandatory manual checklist** — never skipped, never implied by the automated pass.
4. The gate is **never presented as complete** when only the automated portion ran. Reports must state coverage explicitly: *"Automated Level A checks passed; manual checklist REQUIRED and not yet recorded."*

## Scope
- **In scope:** The 9 active repos in the inventory (archived repos excluded).
- **Automated gate target:** WCAG 2.2 **Level A**. Level AA criteria that axe-core evaluates for free (notably contrast) are **reported but non-blocking** at this phase.

## Repo Inventory (verified 2026-10-14; archived EXCLUDED)
Web-frontend (highest priority — serve actual UIs):
- `KyPython/visit-taniti` (HTML)
- `KyLamportLogic/LamportLogic` (JavaScript — serves lamportlogic.com) — **pilot repo**
- `KyLamportLogic/human-rebuild-bootcamp` (JavaScript)
- `AAH20/aegis-effectproof` (JavaScript)

Backend/infra (gate applies to any web UI they serve; must self-declare exempt vs. non-compliant):
- `KyPython/ai-governance` (Shell)
- `KyLamportLogic/ky-cloud-control-plane` (Python)
- `KyLamportLogic/buildlogic-governance` (TypeScript)
- `KyLamportLogic/aws-career-sandbox` (TypeScript)
- `KyPython/KyPython` (profile README)

## Terminology
- **UI repo:** a repo that builds or serves any HTML/web interface.
- **No-UI repo:** a repo that serves no web interface. Must self-declare; silence is **non-compliant, not exempt**.
- **Grace mode:** workflow runs and reports but does not block merge.
- **Enforce mode:** workflow is a required status check; red blocks merge.

## Requirements (EARS format — WHEN / THE SYSTEM SHALL)

### A. Reusable Workflow
- **REQ-A1:** WHEN a pull request is opened or synchronized against a protected branch of any listed repo, THE SYSTEM SHALL invoke the shared reusable accessibility workflow via a per-repo caller workflow.
- **REQ-A2:** THE SYSTEM SHALL expose exactly one shared reusable workflow (`workflow_call`) at `buildlogic-governance/.github/workflows/accessibility.reusable.yml`, consumed by a thin caller at each repo's `.github/workflows/accessibility.yml`.
- **REQ-A3:** WHEN invoked for a UI repo, THE SYSTEM SHALL build or start a preview of the repo's site using a repo-declared command, THEN run axe-core and Lighthouse CI against the declared URL(s).
- **REQ-A4:** THE SYSTEM SHALL read per-repo configuration (build command, preview command/port, URL list) from a committed `.a11y.yml`, and SHALL fail with an actionable error WHEN a UI repo lacks that file.
- **REQ-A5:** THE SYSTEM SHALL use only open-source tooling (`@axe-core/cli`, Lighthouse CI, optionally pa11y). THE SYSTEM SHALL NOT introduce any paid service.
- **REQ-A6:** THE SYSTEM SHALL pin every third-party GitHub Action to an immutable commit SHA and declare minimal explicit `permissions` (repo governance requirement).

### B. Thresholds
- **REQ-B1:** THE SYSTEM SHALL fail the check WHEN axe-core reports one or more violations of impact `critical` or `serious`, evaluated at tags `wcag2a` and `wcag22a`.
- **REQ-B2:** THE SYSTEM SHALL treat axe-core `moderate`/`minor` violations as reported-but-non-blocking at this phase, recorded in the run summary.
- **REQ-B3:** THE SYSTEM SHALL fail the check WHEN the Lighthouse CI accessibility category score for any tested URL is below **0.95**.
- **REQ-B4:** THE SYSTEM SHALL publish a run summary stating, per URL: axe critical/serious count (must be 0), axe moderate/minor count, Lighthouse accessibility score, active exemptions, and an explicit "manual checklist REQUIRED" notice.
- **REQ-B5:** THE SYSTEM SHALL be deterministic: identical commit + identical rendered output SHALL produce identical pass/fail. WHEN flakiness arises (dynamic content), THE SYSTEM SHALL support a committed, reviewed axe rule-pin per URL rather than silently retrying to green.

### C. WCAG 2.2 Level A Automation Coverage
- **REQ-C1:** THE SYSTEM SHALL document, in `design.md`, every WCAG 2.2 Level A success criterion classified as `automated`, `partial`, or `manual-only`.
- **REQ-C2:** THE SYSTEM SHALL NOT claim conformance for `partial` or `manual-only` criteria based on automated results alone.
- **REQ-C3:** THE SYSTEM SHALL route all `partial` and `manual-only` criteria to the manual checklist (group I).

### D. Merge Enforcement
- **REQ-D1:** FOR each listed UI repo, THE SYSTEM SHALL configure branch protection on `main` requiring the accessibility status check (`accessibility/level-a`) to pass before merge.
- **REQ-D2:** THE SYSTEM SHALL NOT allow administrators to merge a red accessibility check once a repo is in enforce mode, except via the explicit exemption mechanism (group E).
- **REQ-D3:** WHEN enforcement is first enabled on a repo, THE SYSTEM SHALL run in grace mode for a defined window so in-flight PRs are not retroactively broken, THEN flip to enforce mode only after the repo's `main` is green.
- **REQ-D4:** THE SYSTEM SHALL require the check to be registered (reported at least once by name) before it is marked required, to avoid the "required check never reports → PR stuck forever" failure.

### E. Exemption Mechanism
- **REQ-E1:** THE SYSTEM SHALL support exemptions only via a committed `.a11y-exempt.yml` containing, per entry: `scope` (repo or URL/path glob), `reason`, `approver` (human), `created`, and `expires` (ISO date).
- **REQ-E2:** THE SYSTEM SHALL fail the check WHEN an exemption entry is missing any required field OR `expires` is in the past. Expired exemptions SHALL NOT silently lapse into "pass."
- **REQ-E3:** THE SYSTEM SHALL surface all active exemptions in the run summary so no exemption is silent.
- **REQ-E4:** THE SYSTEM SHALL treat exemptions as scoped waivers of specific criteria/URLs, never a blanket disable of the workflow.

### F. No-UI Self-Declaration
- **REQ-F1:** THE SYSTEM SHALL recognize a committed `.a11y.yml` with `ui: false` and a `rationale` string as a valid no-UI declaration, causing the check to pass trivially with a summary stating "declared no-UI."
- **REQ-F2:** WHEN a repo has neither a UI configuration nor a `ui: false` declaration, THE SYSTEM SHALL fail with "undeclared: a repo must declare UI config or ui:false" — distinguishing non-compliant from exempt.
- **REQ-F3:** WHEN a `ui: false` repo later adds web-serving files (heuristically detected), THE SYSTEM SHALL emit a warning (reported, not enforced) prompting re-declaration.

### G. Spec-First Integration
- **REQ-G1:** THE SYSTEM SHALL provide a reusable "Accessibility Acceptance Criteria" markdown block (defined in `design.md`) that MUST be pasted into any future spec involving UI work before implementation begins.
- **REQ-G2:** The block SHALL include the group-B automated thresholds PLUS keyboard-reachability of every interactive element as an explicit acceptance criterion.

### H. Agent Implementation Requirements
#### H.1 Accessible-code requirements
- **REQ-H1:** The implementing agent SHALL use semantic HTML (`<button>`, `<a href>`, `<nav>`, `<main>`, headings in order) and SHALL NOT use clickable `<div>`/`<span>` where a native interactive element exists.
- **REQ-H2:** The agent SHALL label every form input (`<label for>`, `aria-label`, or `aria-labelledby`).
- **REQ-H3:** The agent SHALL add ARIA only where native semantics are insufficient; redundant/invalid ARIA is a defect.
- **REQ-H4:** The agent SHALL ensure visible focus indicators and logical focus management for dynamic UI (modals, menus): trap focus while open, restore focus on close.
- **REQ-H5:** The agent SHALL declare document language (`<html lang>`) and provide text alternatives for non-text content (empty `alt=""` only for decorative images).

#### H.2 Minimal-diff discipline (non-negotiable)
- **REQ-H6:** BEFORE writing code, the agent SHALL list the exact set of files it will create or modify. The agent SHALL modify ONLY files on that list; touching an unlisted file requires updating the list with justification first.
- **REQ-H7:** THE SYSTEM SHALL require every diff hunk to be justifiable against this spec. The agent SHALL NOT introduce new abstractions, dependencies, or unrelated refactors unless the spec explicitly asks for them.
- **REQ-H8:** THE SYSTEM SHALL require the diff to contain no stray files (debug scripts, scratch notes, commented-out code, `.log` output, editor artifacts).
- **REQ-H9:** A pull request that adds unrequested scope SHALL fail review EVEN IF all tests pass. Tests prove behavior, not cleanliness; both are required.

### I. Manual Verification Checklist
- **REQ-I1:** THE SYSTEM SHALL define a keyboard-only pass procedure and an NVDA/VoiceOver spot-check procedure (`design.md`).
- **REQ-I2:** THE SYSTEM SHALL require the manual checklist to be recorded (checked boxes in the PR body or a linked artifact) for any PR that changes UI, as a human step distinct from the automated gate.
- **REQ-I3:** THE SYSTEM SHALL NOT represent a PR as fully accessibility-verified until BOTH the automated check is green AND the manual checklist is recorded.

### J. Constraints
- **REQ-J1:** THE SYSTEM SHALL request least-privilege `GITHUB_TOKEN` permissions (`contents: read`, `checks: write`, `pull-requests: write` for the summary comment only) and SHALL NOT require any new secret beyond what each repo already uses.
- **REQ-J2:** THE SYSTEM SHALL be additive to existing CI: it SHALL run as its own workflow file and status check and SHALL NOT modify or depend on existing jobs. WHEN a repo already has an accessibility job, the `design.md` conflict-resolution rule applies. THE SYSTEM SHALL NOT weaken existing CI.
- **REQ-J3:** THE SYSTEM SHALL pin tool versions (action SHAs, npm versions) for reproducibility.

### K. Diff-Hygiene Gate (enforces group H.2)
- **REQ-K1:** THE SYSTEM SHALL provide a diff-aware review CI step on every PR that inspects only changed lines/hunks.
- **REQ-K2 (deterministic — block merge):** THE SYSTEM SHALL fail the check WHEN deterministic lint/format gates fail (e.g., ESLint incl. `eslint-plugin-jsx-a11y` for UI repos, Prettier/format check), OR WHEN a new runtime dependency is added without a corresponding declared entry in the PR's file list / spec reference, OR WHEN stray-file patterns are present (`*.log`, `*.tmp`, `debug*`, `scratch*`, editor swap files, committed `node_modules`).
- **REQ-K3 (deterministic — block merge):** THE SYSTEM SHALL fail the check WHEN the PR modifies files outside a declared "files touched" manifest (PR body section or `.pr-scope` file), making REQ-H6 machine-checkable.
- **REQ-K4 (advisory — reviewer judgment):** THE SYSTEM SHALL post, but NOT auto-block on, heuristic flags for likely-unrequested abstractions, large unexplained hunks, or hunks lacking an obvious spec mapping. These require a human reviewer's decision (REQ-H7/REQ-H9 are enforced by the human reviewer using these advisory signals).
- **REQ-K5:** THE SYSTEM SHALL clearly label, in its output, which findings are deterministic (block) and which are advisory (reviewer judgment), so a partial gate is never presented as complete (consistent with the Gate Philosophy).

## Unverified Items (reconcile at implementation; do not assume)
- **UNVERIFIED-1:** The `specs/codebase-snapshot-sync` precedent spec is not present in the `buildlogic-governance` checkout at authoring time. This spec follows the standard GitHub `workflow_call` pattern; the implementer MUST reconcile naming/structure with that existing spec once located.
- **UNVERIFIED-2:** Build/preview commands, ports, and served URLs for all 9 repos are unknown from this checkout. Captured via per-repo `.a11y.yml` (REQ-A4).
- **UNVERIFIED-3:** Whether each backend/infra repo serves a UI is unconfirmed; resolved by self-declaration (group F).
- **UNVERIFIED-4:** Existing CI workflows in the 9 repos are not all visible here; conflict resolution (REQ-J2) is designed defensively, additive-only.
- **UNVERIFIED-5:** `KyPython/KyPython` is a profile README; expected to declare `ui: false`, but its contents are not in this checkout.
- **UNVERIFIED-6:** Whether a diff-hygiene/lint baseline already exists in each repo (for REQ-K2) is unknown; the gate must run additively and not assume a prior ESLint/Prettier config.

## Changelog
- 2026-10-14 — Initial requirements authored. Added group H.2 (minimal-diff discipline) and group K (diff-hygiene gate) per owner's revised scope.
