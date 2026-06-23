---
name: API server restart requirement
description: New route files added to routes/index.ts only take effect after a full server workflow restart (rebuild + start).
---

**Rule:** After adding a new route file and registering it in `routes/index.ts`, always restart the API server workflow. The dev command runs `build` then `start`, so a workflow restart automatically rebuilds and picks up new files.

**Why:** The API server runs compiled JS from `dist/`. `curl` probing routes before a restart will return "Cannot GET" even if the TypeScript source is correct and registered. Always confirm a new route works by restarting first, then testing.

**How to apply:** `restart_workflow "artifacts/api-server: API Server"`, then `curl -s localhost:80/api/<new-path>` — expect `{"error":"Unauthorized"}` for auth-protected routes (confirms route found), not an HTML "Cannot GET" page.
