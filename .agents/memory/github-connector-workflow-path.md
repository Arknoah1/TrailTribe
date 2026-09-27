---
name: GitHub connector workflow-path limitation
description: The attached GitHub connector may block .github paths and Git database mutations even when ordinary repository file updates work.
---

The GitHub connector can update existing repository files while returning Cloudflare 403 responses for `.github/*` paths and 404 responses for Git tree creation; GraphQL commit mutations can explicitly reject workflow-file writes. A healthy OAuth connection that advertises `repo` but not `workflow` does not gain the missing workflow permission by reconnecting to the same configured scope set.

**Why:** This prevents an agent from mistaking a connector-layer failure for a missing repository or invalid workflow, and avoids repeatedly retrying writes that cannot succeed through the same route.

**How to apply:** Verify the repository and branch first, keep successful ordinary file updates, and hand off `.github/workflows` publication to a direct authenticated GitHub push or a connection with workflow-file write permission. Do not offer reauthorization if the connection's available OAuth scope set cannot grant that permission.