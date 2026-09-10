# @kypython/buildlogic-governance

Deterministic governance preflight, hash binding, kill switches, egress validation, trace controls, and an internal Redis/state-file kill bus. Importing the package performs no side effect; call the gate before the mutation.

```ts
import { gateAiSideEffect } from '@kypython/buildlogic-governance';

const decision = await gateAiSideEffect({
  actionName: 'ticket/create',
  params: { title: 'Customer request' },
  context: { userId: 'operator-123' },
  intent: 'Create one requested support ticket',
});

if (!decision.allowed) throw new Error(decision.reason);
```

The package does not automatically wrap network, database, or filesystem calls. Put the gate immediately before each AI-triggered side effect and call `validateEgressUrl` before outbound requests.
