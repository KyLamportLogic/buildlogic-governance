# BuildLogic Governance Toolkit

Stop AI actions before they mutate state, record why they were allowed or denied, and carry the same boundary across custom providers and MCP clients.

This toolkit is for teams giving agents real write access to support, operations, finance, deployment, or other consequential systems. It is host-neutral TypeScript, not a hosted control plane or a compliance certification.

## Packages

- `@kypython/buildlogic-governance`: fail-close preflight, hash binding, kill switch, egress validation, trace controls, and a process-level hardware/software kill bus.
- `@kypython/buildlogic-agent-harness`: model-neutral provider wrapper that gates invocation before contacting the model.
- `@kypython/buildlogic-agentic-security`: official-SDK adapters for AIDR, WORM audit retention, GuardDuty posture, and just-in-time secrets.
- `@kypython/buildlogic-mcp-governance`: stdio MCP tools for preflight, status, kill, and revive controls.
- `@kypython/buildlogic-security`: validation, secret redaction, security headers, and Redis-compatible distributed rate limiting.
- `@kypython/buildlogic-logger`: structured Sentry-aware logging.
- `@kypython/buildlogic-governance-cli`: local governance validation commands.

## Start with the action gate

```sh
npm install @kypython/buildlogic-governance
```

```ts
import { gateAiSideEffect } from '@kypython/buildlogic-governance';

const decision = await gateAiSideEffect({
  actionName: 'crm/create-contact',
  params: { email: 'buyer@example.com' },
  context: { userId: 'operator-123' },
  intent: 'Create one requested CRM contact',
});

if (!decision.allowed) throw new Error(decision.reason);
await crm.contacts.create(decision.paramsWithContract);
```

Importing a package does nothing by itself. The application must put the gate immediately before every side effect.

## Reference product

EffectProof is the private reference product: a local fault-injection product that checks whether one agent intent produces exactly one intended external effect after retries and lost acknowledgements. It currently retains audited local copies until these packages are published; adopting registry releases requires its separately authorized security-owner review.

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
