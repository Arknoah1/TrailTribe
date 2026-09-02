---
name: Authenticated Vite browser fixtures
description: How to isolate authenticated page fixtures when the project Vite config already owns path aliases.
---

For middleware-mode browser fixtures, replace an authentication-dependent module in a fixture-only Vite plugin's `load` hook after it has resolved to its absolute path. Return the replacement source text directly.

**Why:** The project config's existing alias plugin resolves `@/...` imports before an inline fixture plugin's `resolveId` hook can intercept them. Returning a nested `this.load()` result also violates the Vite load contract.

**How to apply:** Use this only for isolated browser fixtures that need authenticated page data without starting the external auth client. Keep the production module unchanged, serve authenticated API fixture responses, and serialize fixture test files if their Vite servers share an HMR port.