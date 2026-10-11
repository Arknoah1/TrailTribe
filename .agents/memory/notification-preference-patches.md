---
name: Notification preference patches
description: Concurrency-safe updates and test behavior for member notification preferences stored as JSONB
---

Notification preference writes should send only changed topic fields and merge them into the current JSONB value within the database update. Server-side read/modify/write snapshots can discard another overlapping change. Board mute IDs remain server-managed and must be preserved.

**Why:** Separate preference toggles can save concurrently; a full stale snapshot can revert another setting even when each user action succeeded.

**How to apply:** Keep notification profile requests partial, merge JSONB with an atomic database expression, and make stateful route-test mocks apply that merge instead of assigning the SQL expression as a plain object.
