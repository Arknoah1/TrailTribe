---
name: Vite HMR new imports
description: Adding new named imports from workspace libs to a component requires a Vite workflow restart, not just HMR save.
---

**Rule:** When you add new named imports from `@workspace/*` packages to a frontend file, the Vite dev server must be restarted (via `restart_workflow`) for those imports to resolve correctly in the browser.

**Why:** Vite's HMR only hot-patches existing module graph edges. New imports from workspace packages require Vite to re-crawl and re-optimize the dependency graph, which only happens on a fresh server start. Until then, the browser logs "Failed to reload — this could be due to syntax errors or importing non-existent modules."

**How to apply:** After adding new imports from `@workspace/api-client-react` or other workspace libs, always `restart_workflow "artifacts/trailtribe: web"` rather than waiting for HMR to resolve it.
