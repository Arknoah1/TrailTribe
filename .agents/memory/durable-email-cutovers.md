---
name: Durable email cutovers
description: Prevent duplicate sends when replacing in-memory email suppression with durable delivery records.
---

When introducing durable email-delivery records, treat the first production startup as a data migration, not an ordinary restart. Preserve or backfill knowledge of recently sent messages before the new worker is allowed to create fresh claims.

**Why:** The legacy worker can successfully send shortly before deployment, but the new delivery table has no record of that send. An immediate startup scan then treats the same recipient and occurrence as unsent and delivers it again.

**How to apply:** For future notification systems, define an explicit cutover watermark or safe backfill before enabling startup recovery. A uniqueness constraint only prevents duplicates recorded by the new system; it cannot infer sends performed by the system it replaces.