# BuildLogic Governance Toolkit

Public, host neutral TypeScript packages for deterministic AI side effect governance, distributed security controls and structured logging.

## Packages

- @kypython/buildlogic-governance: fail-close preflight, hash binding, kill switch, egress validation, trace controls and the internal hardware/software kill bus.
- @kypython/buildlogic-security: validation, secret redaction, security headers and Redis compatible distributed rate limiting.
- @kypython/buildlogic-logger: structured Sentry-aware logging.
- @kypython/buildlogic-governance-cli: local governance validation commands.

All packages are Apache-2.0. Releases are via npm trusted publishing and provenance. The repo has a clean public history and contains no private LamportLogic history or app code.


## Engineering doctor

This repo also comes with a read only 'engineering-doctor' command for repository ergonomics. It pulls together path hazards, accidental literal-glob files, requirement shape checks, formal model/manifest trace checks and purpose inventory gaps into a single report. It will never rewrite learner evidence or silently fix any files.

Install directly from this repository:

```sh
npm install -g https://github.com/KyLamportLogic/buildlogic-governance/archive/main.tar.gz
engineering-doctor
```

Each repo opts in via a checked in .engineering-doctor.json. CI should pin an immutable commit tarball rather than a moving branch. The command exits non-zero on every detected blocker and --json outputs a machine readable report for CI or coding agents.

Example:

```json
{
  "version": 1,
  "literalGlobFilenames": true,
  "temporaryFiles": ["apply-formal-precision-fixes.sh"],
  "formal": {
    "manifest": "scenario/formal/manifest.json",
    "model": "scenario/formal/EffectDispatch.tla",
    "requiredStates": ["APPROVED", "DISPATCHED", "CONFIRMED"],
    "traceBindings": [
      {
        "file": "scenario/tests/effect-dispatch.invariant.test.mjs",
        "requirements": ["FR-12", "FR-16"]
      }
    ]
  }
}
```

The doctor is deliberately diagnostic. Any command which writes out requirements, tests, formal artefacts, inventories or learner solutions is a separate, explicit human authorised action.

## Human Skill Retention Gate

The repo has a portable HUMAN_SKILL_RETENTION_GATE policy for the situation where a human wants some AI assistance but doesn't want to hand over the final responsibility to the AI. It's a binary gate and it's fail closed: TaskGate = 1 if C is empty else min_{c in C}(H_c * J_c * E_c * (1 - A_c)). See HUMAN_SKILL_RETENTION_GATE.md
