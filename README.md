# BuildLogic Governance Toolkit

Public, host-neutral TypeScript packages for deterministic AI side-effect governance, distributed security controls, and structured logging.

## Packages

- `@kypython/buildlogic-governance`: fail-close preflight, hash binding, kill switch, egress validation, trace controls, and the internal hardware/software kill bus.
- `@kypython/buildlogic-security`: validation, secret redaction, security headers, and Redis-compatible distributed rate limiting.
- `@kypython/buildlogic-logger`: structured Sentry-aware logging.
- `@kypython/buildlogic-governance-cli`: local governance validation commands.

All packages are Apache-2.0. Releases use npm trusted publishing and provenance. This repository has clean public history and contains no private LamportLogic history or application code.


## Engineering doctor

This repository also ships a read-only `engineering-doctor` command for repository ergonomics. It consolidates path hazards, accidental literal-glob files, requirement-shape checks, formal-model/manifest trace checks, and purpose-inventory gaps into one report. It never rewrites learner evidence or silently fixes files.

Install directly from this repository:

```sh
npm install -g https://github.com/KyLamportLogic/buildlogic-governance/archive/main.tar.gz
engineering-doctor
```

Each repository opts in with a checked-in `.engineering-doctor.json`. CI should pin an immutable commit tarball rather than a moving branch. The command exits nonzero on every detected blocker and `--json` returns a machine-readable report for CI or coding agents.

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

The doctor is intentionally diagnostic. Any command that writes requirements, tests, formal artifacts, inventories, or learner solutions remains a separate explicit human-authorized action.
