# BuildLogic Governance Toolkit

Public, host-neutral TypeScript packages for deterministic AI side-effect governance, distributed security controls, and structured logging.

## Packages

- `@kypython/buildlogic-governance`: fail-close preflight, hash binding, kill switch, egress validation, trace controls, and the internal hardware/software kill bus.
- `@kypython/buildlogic-security`: validation, secret redaction, security headers, and Redis-compatible distributed rate limiting.
- `@kypython/buildlogic-logger`: structured Sentry-aware logging.
- `@kypython/buildlogic-governance-cli`: local governance validation commands.

All packages are Apache-2.0. Releases use npm trusted publishing and provenance. This repository has clean public history and contains no private LamportLogic history or application code.


## Human Skill Retention Gate

The repository includes a portable **HUMAN_SKILL_RETENTION_GATE** policy for cases where a human wants AI assistance without surrendering the final judgment-bearing rep. The gate is binary and fail-closed: `TaskGate = 1 if C = ∅ else min_{c∈C}(H_c * J_c * E_c * (1 - A_c))`. See `HUMAN_SKILL_RETENTION_GATE.md`.
