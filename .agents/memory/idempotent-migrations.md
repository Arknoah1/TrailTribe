---
name: Idempotent startup migrations
description: Startup migrations are replayed, so seed and conversion SQL must remain valid after the first successful run.
---

**Rule:** Treat every API startup migration as replayable: guard legacy-column references and make seed inserts safe after schema conversion.

**Why:** The API executes its migration list on every startup rather than tracking one-time migration state; an old seed statement can crash a later restart after a column has been renamed or dropped.

**How to apply:** When changing a table shape, update all later migration and seed statements in the same migration pass, and restart the API at least twice to verify both fresh and already-converted states. If a compatibility stage reintroduces a legacy column as nullable, filter null legacy rows inside the backfill query's source scope rather than treating them as new categories.