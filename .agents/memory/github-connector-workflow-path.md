---
name: GitHub connector workflow-path limitation
description: The attached GitHub connector may block .github paths and Git database mutations even when ordinary repository file updates work.
---

The GitHub connector can update existing repository files while returning Cloudflare 403 responses for `.github/*` paths and 404 responses for Git tree creation; GraphQL commit mutations may also be unavailable.

**Why:** This prevents an agent from mistaking a connector-layer failure for a missing repository or invalid workflow, and avoids repeatedly retrying writes that cannot succeed through the same route.

**How to apply:** Verify the repository and branch first, keep successful ordinary file updates, and hand off `.github/workflows` publication to a direct authenticated GitHub push or a connection with the required repository mutation permissions.