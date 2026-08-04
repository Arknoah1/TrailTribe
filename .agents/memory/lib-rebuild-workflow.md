---
name: lib/db rebuild workflow
description: How to rebuild the lib/db TypeScript composite project after schema changes, and how to apply schema changes when drizzle-kit push is interactive.
---

After adding new tables or schema files to `lib/db/src/schema/`, two steps are required before typechecking leaf packages (api-server, trailtribe):

1. **Rebuild lib/db declarations**: `cd lib/db && npx tsc -p tsconfig.json`
   - lib/db is a TypeScript composite project (`composite: true`, `emitDeclarationOnly: true`, outDir `dist`)
   - Leaf packages import from `lib/db/dist` for type resolution, not the source
   - Without this rebuild, tsc will report "has no exported member 'newTable'" even though the source exports it

2. **Apply DB schema changes**: drizzle-kit push is interactive and gets stuck waiting for TTY input; use psql directly instead:
   ```bash
   psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS ..."
   psql "$DATABASE_URL" -c "ALTER TABLE x ADD COLUMN IF NOT EXISTS ..."
   ```
   Or write the SQL to a heredoc and pipe to psql.

**Why:** The build step and psql bypass are the only reliable ways to add schema in this environment. drizzle-kit push prompts about unique constraints even with `--force`.

**How to apply:** Any time you add a new `lib/db/src/schema/*.ts` file or modify existing schema: run the psql migration first, then rebuild lib/db, then typecheck.
