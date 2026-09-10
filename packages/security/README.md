# @kypython/buildlogic-security

Security utilities for validation, secret-safe values, response headers, and distributed user or tenant rate limiting. Production multi-replica rate limits require Redis-compatible storage and fail closed when configured as required.

The package root is host-neutral and does not load Next.js:

```ts
import { checkUserRateLimit, redactSecretsDeep } from '@kypython/buildlogic-security';

const quota = await checkUserRateLimit('tenant-123', { max: 20, windowMs: 60_000 });
if (!quota.allowed) throw new Error('rate limit exceeded');
```

Next.js-only middleware is isolated behind an optional subpath:

```ts
import { rateLimit, securityMiddleware } from '@kypython/buildlogic-security/next';
```

Configure Redis or Upstash for multi-replica production. The process-memory fallback is for local or explicitly documented single-instance deployments only.

An adapter for `express-rate-limit` is available without taking a hard dependency on Express:

```ts
import { createExpressRateLimitStore } from '@kypython/buildlogic-security/express-rate-limit-store';

const store = createExpressRateLimitStore({ prefix: 'api', windowMs: 60_000 });
```
