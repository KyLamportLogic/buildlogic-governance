# Claude Repository Instructions

This repository follows the nearest project governance and human-agency rules.

## Human Skill Retention Gate (mandatory)

**HUMAN_SKILL_RETENTION_GATE** — Read `HUMAN_SKILL_RETENTION_GATE.md` and `config/human-skill-retention.json`.

When work materially exercises a protected human capability, AI may do mechanical support, evidence retrieval, calculation, candidate second-pass analysis, tests, formatting, and verification, but it may not be the sole/final authority for that capability. KyJahn supplies the first substantive human pass and the final judgment/grade/reconciliation/approval, with an evidence reference. AI must not author the human attestation on his behalf.

`TaskGate = 1 if C = ∅ else min_{c∈C}(H_c * J_c * E_c * (1 - A_c))`

PASS only at exactly `1`. If a protected rep is missing, return `BLOCKED — HUMAN SKILL REP REQUIRED`. Sub-agents inherit the gate and may not weaken or self-attest it.

