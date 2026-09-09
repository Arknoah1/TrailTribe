---
name: Discussion image lifecycle lock
description: Concurrency rule for claiming and cleaning up staged discussion images.
---

Cleanup and attachment claiming must use the same Postgres transaction advisory lock. The lock must cover both validation and the board attachment insert, not just the object-store delete.

**Why:** A staged object can be validated for attachment while a cleanup worker deletes it. A shared transaction lock makes the two lifecycle transitions mutually exclusive across API instances.

**How to apply:** Any new route or job that claims, deletes, or changes the attachment status of a discussion-image object must use the existing lifecycle lock before checking or changing its ACL/attachment rows.