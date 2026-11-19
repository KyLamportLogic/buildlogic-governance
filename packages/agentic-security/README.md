# @kypython/buildlogic-agentic-security

Official-SDK adapters that compose local fail-close governance with optional CrowdStrike Falcon AIDR inspection, AWS S3 Object Lock audit retention, GuardDuty posture checks, and Infisical secret resolution.

```sh
npm install @kypython/buildlogic-agentic-security @kypython/buildlogic-governance
```

```ts
import { gateAgenticSideEffect } from '@kypython/buildlogic-agentic-security';

const result = await gateAgenticSideEffect({
  actionName: 'agent/create-ticket',
  params: { queue: 'support' },
  context: { userId: 'user-123' },
  intent: 'Create one support ticket',
  promptMessages: [{ role: 'user', content: 'Create a ticket' }],
});

if (!result.allowed) throw new Error(result.reason);
```

The package uses `@crowdstrike/aidr` directly. AWS and Infisical SDKs are optional peers and are loaded only when their adapters are configured. It does not provision vendor accounts, GuardDuty detectors, or S3 Object Lock for you.
