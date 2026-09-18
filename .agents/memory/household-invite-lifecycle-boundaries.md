---
name: Household invite lifecycle boundaries
description: Security and concurrency rules for household-bound invitations stored beside broader team invitations.
---

Household-bound invitation records must be excluded from broader team-level invite administration. Every list, resend, cancel, purge, and acceptance path touching shared invite storage must preserve the household authorization boundary and keep private tokens out of collection responses.

**Why:** Adding a secure household-specific route is insufficient when older global routes still query the same table. Those routes can otherwise disclose or mutate household invitations outside the intended household.

**How to apply:** Treat acceptance and cancellation as competing state transitions, and keep account assignment in the same transaction as the successful invite claim. Serialize send/resend per household and normalized email, backed by a database uniqueness rule.