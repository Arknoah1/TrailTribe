---
name: Lib rebuild workflow
description: After adding new exports to lib/* packages, declarations must be rebuilt before leaf packages can typecheck or Vite can serve them.
---

When new tables, types, or hooks are added to a lib package (`lib/db`, `lib/api-client-react`, etc.), the TypeScript declarations are stale until explicitly rebuilt.

**Rule:** After any change to a `lib/*` package, run `cd lib/<name> && npx tsc --build` before running leaf-package typechecks.

**Why:** `pnpm run typecheck:libs` fails on pre-existing `api-zod` duplicate export errors — use per-lib `tsc --build` instead. The root `typecheck:libs` command errors out on `lib/api-zod` duplicate exports (pre-existing, not our bug), which blocks all other libs from rebuilding in that command.

**How to apply:**
- After modifying `lib/db/src/schema/`: `cd lib/db && npx tsc --build`
- After running codegen (`pnpm --filter @workspace/api-spec run codegen`): `cd lib/api-client-react && npx tsc --build`
- Then run `pnpm --filter @workspace/<artifact> run typecheck` on the leaf package
