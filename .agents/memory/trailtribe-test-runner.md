---
name: TrailTribe test runner
description: Keep frontend regression checks dependency-light when package-local browser tooling is unavailable
---

TrailTribe frontend regression checks should use the repository's already-available runtime unless a package-local test dependency can be installed cleanly.

**Why:** The app package does not currently expose the workspace's API-package Vitest installation, and package installation may be unavailable in the environment.

**How to apply:** Prefer Node's built-in test runner for source-level contracts; add a browser runner only when its dependency and workflow are explicitly available.