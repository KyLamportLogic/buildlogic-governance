# EffectProof customer-discovery campaign v1

Status: **COMMERCIAL TERMS APPROVED — distribution remains prohibited pending final audience-and-sender confirmation**

## One prospect

VP or Director of Engineering at a B2B SaaS company whose production AI agent can create or update external business records. The qualifying trigger is recent evidence that the agent gained write access to CRM, ticketing, email, billing, or deployment tools.

## Problem and category

When a write commits but the response is lost, the caller cannot infer from the timeout whether the effect happened. Retrying may duplicate the effect unless the provider contract and reconciliation path are correct. AWS describes this lost-response and duplicate-side-effect dilemma in its guidance on safe retries; Stripe documents idempotency keys as one provider-level mechanism for preventing duplicate operations.

EffectProof's narrow category is **pre-production ambiguous-side-effect verification**. It does not replace provider idempotency, production observability, a penetration test, or compliance certification.

## Offer hypothesis

- First action: $0, 30-minute problem interview.
- Paid-pilot hypothesis: $2,500 fixed fee.
- Pilot scope: one sanitized workflow, one custom simulated failure scenario, and one evidence review.
- No credentials or production-system access.

Pricing is an approved customer-discovery hypothesis, not evidence of willingness to pay or authorization to scale.

## Primary CTA

Book a 30-minute qualified discovery call.

## Problem-led email draft

Subject: What happens if your agent's write succeeds but its response never arrives?

Hi {{first_name}},

I saw {{verified_trigger}} and that your team is giving an AI workflow the ability to update external systems.

I am testing a local validation tool for one narrow failure: the write commits, the acknowledgement is lost, and the agent retries. The tool inspects simulated authoritative state to show whether the original effect was recovered or duplicated.

It does not require production credentials, and it is not a certification or a substitute for your provider's idempotency controls. I am speaking with engineering leaders to learn whether this failure is current and consequential enough to justify a focused pilot.

Would a 30-minute technical conversation be useful? If this is already covered by your workflow engine, provider contract, and reconciliation tests, that is useful evidence too.

KyJahn

## Qualification

A reply is qualified only when the respondent owns or materially influences the write-capable agent path and can discuss at least one current mutation, retry ambiguity, business consequence, or existing control. Opens and clicks do not qualify.

## Experiment

- Batch ceiling: 20 independently triggered accounts.
- Change only: the problem-led opening.
- Success evidence: at least 3 qualified replies identifying the problem as current and consequential.
- Stop rule: fewer than 3 qualified replies after 20 verified accounts means revise the ICP/problem/message; do not increase volume.
- Attribution: `utm_source=founder_outbound&utm_medium=email&utm_campaign=effectproof_discovery_v1`.
- Guardrails: complaints, regret, trust concerns, bounces, replies, and unsubscribes override proxy engagement metrics.

## Sources

- [AWS Builders' Library — Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- EffectProof implementation evidence listed in `effectproof-discovery-v1.json`.

## Approval boundary

On 2026-08-28 the human product owner approved the claims, offer, $2,500 pilot pricing hypothesis, and listed commitments. That approval authorizes prospect research and draft preparation only. It does not authorize contact creation, enrichment, enrollment, sending, publishing, or spending beyond a separately confirmed research-search credit.
