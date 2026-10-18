---
status: accepted
---

<!--
Contributor: @ron (AI-assisted); implementation review pending.
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Recorded the already-approved cost-evidence trade-off in infrastructure/SPEC.md
sections 17 and 24 for GitHub issue #52; no new architecture decision or AWS mutation.
Design approval: @ron approved this decision on 2026-10-18.
Implementation and final wording review: PENDING.
-->

# Use reproducible repository pricing evidence

Use the repository's deterministic estimator with a committed AWS public-pricing snapshot
instead of requiring a duplicate shared AWS Pricing Calculator link. Its owner-only
evidence records line items, the exact configuration fingerprint, pricing-snapshot
SHA-256, budget comparison, and named approval with timestamp; the deployment gate
recalculates the estimate and rejects stale, changed, over-budget, or unapproved evidence.

This makes the approved inputs and rates reproducible in review, at the cost of deliberately
refreshing the snapshot and approval when prices or deployment inputs change. It is not
a spending cap: the team leader still checks the NUS tracking portal. This ADR records the
design already approved by @ron on 2026-10-18; implementation review remains pending.
