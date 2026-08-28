# BuildLogic Marketing Governance

Fail-close validation for marketing artifacts. `MarketingIntegrityScore` is either `0` or `100`:

`100 × I × A × C × E × W × X × H`

Publication is allowed only at 100. The terms require a current policy, one ICP, one action/message/emotion, verified and limited claims, customer-safe choice architecture, an attributed single-variable test without stage skipping, and explicit human approval of claims, offer, pricing, and commitments.

The rule interface was derived from the owner's canonical Notion Marketing Funnel, Branding, Copywriting, Advertising Preflight, and Ventures frameworks observed on 2026-08-28. Google Drive research is supporting evidence and cannot override those rules.

```ts
import { evaluateMarketingArtifact } from '@kypython/buildlogic-marketing-governance';

const decision = evaluateMarketingArtifact(artifact);
if (!decision.allowed) throw new Error(JSON.stringify(decision.violations));
```

Agents cannot set human approval on a person's behalf. Applications should obtain that approval through an authenticated workflow and bind it to the artifact hash before distribution.
