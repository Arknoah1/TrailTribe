---
name: Clerk SDK version alignment
description: Updating Clerk packages can require the workspace's pinned shared package to move with them.
---

When updating Clerk React or Express SDKs, check the root `@clerk/shared` override against the new SDK requirements. A stale shared package can leave a missing export in the client bundle even when TypeScript resolves the new SDK.

**Why:** The Clerk React update built against an older locked shared package and Vite failed on an SDK import that the package did not export. Bumping the shared package to a compatible release restored the build.

**How to apply:** After any Clerk SDK update, verify package compatibility and run the production Vite build before restarting workflows.
