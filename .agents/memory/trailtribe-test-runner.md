---
name: TrailTribe test runner
description: Keep frontend regression checks dependency-light when package-local browser tooling is unavailable
---

TrailTribe frontend regression checks should use the repository's already-available runtime unless a package-local test dependency can be installed cleanly. The current Node runtime can import pure `.ts` helpers from `.mjs` tests using built-in type stripping.

**Why:** The app package does not currently expose the workspace's API-package Vitest installation, and package installation may be unavailable in the environment.

**How to apply:** Prefer Node's built-in test runner. Extract deterministic behavior into pure `.ts` helpers and import those helpers from `.mjs` tests; reserve source matching for JSX wiring contracts. Add a browser runner only when its dependency and workflow are explicitly available.