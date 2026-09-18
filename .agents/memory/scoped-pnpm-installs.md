---
name: Scoped pnpm installs
description: How to add a dependency to one package when the generic installer targets the monorepo root.
---

When a JavaScript dependency belongs to one workspace package, install it with that package's pnpm filter rather than adding it at the repository root.

**Why:** The generic language-package installer invokes `pnpm add` at the workspace root and fails the root-add safety check because it cannot accept a package filter or working directory.

**How to apply:** Try the managed installer first. If it fails specifically with `ERR_PNPM_ADDING_TO_ROOT`, use `pnpm --filter <workspace-package> add <packages>` so the dependency and lockfile entry are scoped correctly.