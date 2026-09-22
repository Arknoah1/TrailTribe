---
name: Publish derived-column backfills
description: How to add a required column derived from an existing production column without failing Publish validation.
---

When a new required column is logically derived from an existing column, assume Publish will emit only schema DDL. It will apply the declared default to existing production rows but will not infer an `UPDATE` backfill from development data or runtime migrations.

**Why:** A required roles array was added with an empty-array default while its check required every array to contain the existing primary role. Development had already been backfilled separately, but Publish correctly failed when validating the generated DDL against mixed-role production rows.

**How to apply:** Inspect both schemas and production value distributions, then recompute the Publish diff. Make the first schema state valid for the declared default as a documented legacy representation, and ensure direct SQL consumers honor the same fallback. Keep strict validation for populated values. Do not add production DDL or rely on force-push behavior.