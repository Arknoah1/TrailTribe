---
name: Drizzle PostgreSQL errors
description: How to classify PostgreSQL constraint errors that pass through Drizzle transactions.
---

PostgreSQL error codes may be on a wrapped error's `cause`, not the top-level error returned by a Drizzle transaction. Conflict detection must safely inspect the cause chain.

**Why:** Real database execution wrapped a unique-constraint violation that test mocks exposed directly, causing an intended HTTP conflict to become a 500 even though rollback succeeded.

**How to apply:** When mapping PostgreSQL codes such as `23505` to application responses, support nested causes and guard against malformed or cyclic error objects. Keep direct-code support for mocks and other drivers.