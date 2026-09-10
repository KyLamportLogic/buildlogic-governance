# @kypython/buildlogic-agent-harness

Wrap an LLM provider with a deterministic, fail-close governance check before the provider is called. A denied invocation never reaches the provider.

```sh
npm install @kypython/buildlogic-agent-harness @kypython/buildlogic-governance
```

```ts
import { createHarness } from '@kypython/buildlogic-agent-harness';
import { createGenericProvider } from '@kypython/buildlogic-agent-harness/providers';

const harness = createHarness({
  provider: createGenericProvider({
    name: 'internal-model',
    invoke: async (input) => callYourProvider(input),
  }),
});

const result = await harness.invoke(
  { prompt: 'Draft a reply' },
  { userId: 'user-123' },
  { actionName: 'support/draft-reply' }
);

if (!result.allowed) throw new Error(result.blocked.reason);
```

Optional OpenAI and Anthropic adapters are available from the `./providers` export. Install only the provider SDK you use. Falcon AIDR inspection is skipped when it is not configured and fails closed when `CS_AIDR_REQUIRED=true`.

This package governs provider invocation. It is not a sandbox, a policy authoring UI, or proof that downstream side effects are idempotent.
