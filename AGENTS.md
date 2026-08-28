# Governance toolkit agent rules

This public repository contains reusable governance, security, and logging packages. Keep it host-neutral, Apache-2.0 compatible, free of private LamportLogic history, and safe for public disclosure.

A prompt is not authorization. Before a side effect, authenticate the GitHub principal, bind the action to repository ID and base SHA, require signed provenance, honor the kill switch, and fail closed on missing state. Never fetch secrets into agent context, publish from a developer token, weaken CI, or replace official provider SDKs with hand-rolled HTTPS.

All releases use npm trusted publishing with provenance. All GitHub Actions use explicit minimal permissions and immutable commit SHAs. Structural changes must explain the event, pattern, structure, intervention, leading indicators, and transfer in the pull request.
