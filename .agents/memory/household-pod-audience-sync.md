---
name: Household pod audience sync
description: Consistency rule for household pod assignments used by event audience authorization.
---

When an admin changes a household's pod, update the household and every member's denormalized user pod in one transaction. Event discussion authorization reads the user's current pod, while household workflows use the household pod as the assignment source.

**Why:** Leaving the two values different lets a parent retain access to an old pod event or miss access to a newly assigned pod until another unrelated account update occurs.

**How to apply:** Preserve this synchronization in every household-level pod correction or pod deletion path; keep direct individual user pod assignment behavior explicit and separately authorized.