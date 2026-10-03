# Governance toolkit agent rules

<!-- AI-GOVERNANCE:v1 | canonical source: KyPython/ai-governance/AGENTS.governance.md | do not weaken locally; change it upstream via a PR Ky approves -->
## AI Governance (mandatory for every AI agent)

Applies to every AI coding agent working in this repo: Kiro, Codex, Cursor, Grok Bot, Claude Code, Copilot, and any sub-agent they spawn. Sub-agents inherit these rules and may not weaken, relabel, bypass, or self-attest them. Repo-specific rules below this section may tighten these rules but never loosen them. Derived from `KyLamportLogic/LamportLogic` (AGENTS.md, CODEOWNERS, PR template, `.husky/`, `.claude/`, CI and secret-scan workflows).

**Merge and deploy gate.** Nothing reaches `main` or production unless both of these are true:
1. The required checks are green: the repo's own CI plus `ai-governance / verdict`. The verdict runs install plus whichever of lint, type-check, test, and build the repo defines as scripts, then policy checks and a gitleaks secret scan, all through the reusable workflow in `KyPython/ai-governance`.
2. Ky (@KyPython) merges the PR. Checks are the gate; only Ky merges.

Agents never merge, approve, or deploy their own work.

### Rules
1. **Branch + PR only.** Never push to `main`. Work on a branch such as `feat/*`, `fix/*`, `chore/*`, `docs/*`, `ci/*`, `refactor/*`, or `governance/*`, then open a PR. Do not merge it, approve it, enable auto-merge, or trigger a deploy. Ky merges.
2. **Prove it green before you stop.** Run the repo's install, lint, type-check, test, and build commands locally (whichever exist). If any of them fails, fix it or report the blocker. Never say "tests pass" without running them.
3. **Tests ship with behavior changes.** Tests check observable behavior or stable contracts, not snippets of source code. Never delete, skip, or loosen a test just to get green.
4. **PR hygiene.**
   - The PR title follows Conventional Commits: `<type>(<scope>): <description>`, where type is one of feat, fix, docs, test, refactor, style, chore, ci, perf, build, or revert.
   - The body references the issue (`Closes #<n>` / `Relates to #<n>`). The gate fails on a missing reference when the repo's caller sets `require-issue-reference: true`.
   - The body says what changed, why it works, how it could fail, and how it was tested.
5. **Structural changes need a contract.** Structural paths include `packages/`, workflows/validators, AGENTS/CLAUDE/.cursorrules, `docs/quality|architecture`, and SPEC/empire-spec files. If the repo has `.systems-thinking/contracts/`, add a `SYSTEMS_THINKING_CONTRACT` JSON file there. Its `scope` must cover every structural path, and it fills in event → pattern → structure → archetype → intervention → leading_indicators → transfer. No placeholders.
6. **Do not touch the governance itself.** Agents do not edit, weaken, disable, or route around these:
   - `.github/workflows/ai-governance.yml` and its pinned SHA
   - other CI workflows
   - `CODEOWNERS`
   - this section
   - `.husky/`, `.claude/`, `.cursor/rules/`
   - branch protection or rulesets

   A change to any of them needs Ky's explicit request, and Ky merges it. Never edit a gate to make it pass.
7. **Secrets.** Never commit secrets, tokens, or `.env` values, and never print credentials. If a secret leaks: rotate it at the provider first, then rewrite it out of branch history. Deleting it in a later commit is not enough.
8. **No destructive commands without explicit human authorization.** This covers `git push --force`, `git reset --hard`, `git clean -fd`, `prisma migrate reset`, `supabase db reset`, `drop database`, `terraform destroy`, and `rm -rf /`.
9. **Supply chain.** Pin third-party GitHub Actions to a full commit SHA. Every workflow declares a least-privilege `permissions:` block. Untrusted event data (PR title, body, branch name) goes through `env:` and is never spliced into `run:` scripts.
10. **Human judgment stays human.** Do not invent users, traction, metrics, or personal facts. Stop and hand formative, consequential (irreversible), and authorship decisions to Ky.
11. **Deploys follow governance.** Deploy jobs run only from `main` after CI/governance passed: `workflow_run` on success, same-repo `push` events only, never fork PR code with secrets.


This public repository contains reusable governance, security, and logging packages. Keep it host-neutral, Apache-2.0 compatible, free of private LamportLogic history, and safe for public disclosure.

A prompt is not authorization. Before a side effect, authenticate the GitHub principal, bind the action to repository ID and base SHA, require signed provenance, honor the kill switch, and fail closed on missing state. Never fetch secrets into agent context, publish from a developer token, weaken CI, or replace official provider SDKs with hand-rolled HTTPS.

All releases use npm trusted publishing with provenance. All GitHub Actions use explicit minimal permissions and immutable commit SHAs. Structural changes must explain the event, pattern, structure, intervention, leading indicators, and transfer in the pull request.
