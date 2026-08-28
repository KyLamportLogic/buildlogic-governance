# EffectProof Apollo account batch v1

Status: **SCREENED RESEARCH ONLY — DO NOT CONTACT**

The authorized Apollo search consumed one credit and returned 20 candidate accounts. This file records every result so weak matches cannot disappear from the audit trail or be silently promoted.

## Qualification rule

`Qualified = ICP × WriteCapableAgentEvidence × CurrentTriggerEvidence × FirstPartyEvidence`

Every term is binary. Missing or ambiguous evidence is zero. An account must satisfy all four terms before it can enter the final audience review.

## Result

- 20 accounts screened
- 1 qualified: Zapier
- 11 held for verification
- 8 rejected
- 0 outreach-ready because final audience confirmation remains locked

## Sender resolved from Apollo

Apollo has one active default sending account: **Kyjahn Smith** via `kypython@lamportlogic.com`. The user directed that the sender configuration be taken from Apollo, so the sender lock is satisfied. Apollo contained no existing EffectProof sequence, and the available connector did not expose a saved meeting link.

Zapier passed the account-level gate because its first-party documentation says AI by Zapier can select app actions, including actions that create, update, or delete data, and can run without per-action approval when that optional control is disabled. This establishes the campaign's write-capable-agent trigger; it does not establish that a particular employee is the correct recipient.

Heron remains held: its first-party documentation establishes executable workflows, but not an AI-controlled external mutation. Every other held account similarly lacks one or more required proofs. Keyword matches are not trigger evidence.

## Release boundary

No contacts were created or enriched. No sequence was created, nobody was enrolled, no message was sent, and no social draft was published. Before any distribution, the user must still confirm:

1. The exact qualified account and person list.
2. The selected copy variant and tracked discovery link.
3. That the stated trigger remains current at send time.

Machine-readable evidence and all 20 dispositions are in `effectproof-apollo-account-batch-v1.json`.
