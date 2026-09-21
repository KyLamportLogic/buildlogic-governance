# Governance toolkit agent rules

This public repository contains reusable governance, security, and logging packages. Keep it host-neutral, Apache-2.0 compatible, free of private LamportLogic history, and safe for public disclosure.

A prompt is not authorization. Before a side effect, authenticate the GitHub principal, bind the action to repository ID and base SHA, require signed provenance, honor the kill switch, and fail closed on missing state. Never fetch secrets into agent context, publish from a developer token, weaken CI, or replace official provider SDKs with hand-rolled HTTPS.

All releases use npm trusted publishing with provenance. All GitHub Actions use explicit minimal permissions and immutable commit SHAs. Structural changes must explain the event, pattern, structure, intervention, leading indicators, and transfer in the pull request.

## Human Skill Retention Gate (mandatory)

**HUMAN_SKILL_RETENTION_GATE** — Read `HUMAN_SKILL_RETENTION_GATE.md` and `config/human-skill-retention.json`.

When work materially exercises a protected human capability, AI may do mechanical support, evidence retrieval, calculation, candidate second-pass analysis, tests, formatting, and verification, but it may not be the sole/final authority for that capability. KyJahn supplies the first substantive human pass and the final judgment/grade/reconciliation/approval, with an evidence reference. AI must not author the human attestation on his behalf.

`TaskGate = 1 if C = ∅ else min_{c∈C}(H_c * J_c * E_c * (1 - A_c))`

PASS only at exactly `1`. If a protected rep is missing, return `BLOCKED — HUMAN SKILL REP REQUIRED`. Sub-agents inherit the gate and may not weaken or self-attest it.

