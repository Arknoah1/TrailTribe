---
name: Publish schema baseline mismatch
description: What to do when Replit Publish reports a removed/renamed column that still exists in the live development schema.
---

**Rule:** If Publish offers to map a legacy text column to a new integer foreign-key column even though the live development schema retains both columns, cancel the Publish attempt. Do not choose either mapping or keep retrying.

**Why:** The Publish schema baseline can misclassify a staged additive migration as a remove-and-rename operation. "Create new column" deletes the legacy values needed for backfill, while "Rename column" applies the wrong text-to-integer semantics. Reordering source fields, rebuilding the development table, and refreshing the Publish flow do not necessarily reset this baseline.

**How to apply:** Compare development and production through `information_schema.columns`. When the dialog contradicts those schemas, preserve production unchanged and ask Replit Support to reset or rebuild the Publish database-schema baseline. Drizzle's checked-in migration snapshot is not used by `drizzle-kit push`; do not hand-edit or regenerate broad metadata merely to influence Publish.