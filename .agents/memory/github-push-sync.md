---
name: GitHub push sync
description: Safe fallback for pushing local work when direct Git authentication fails in Replit.
---

If a direct Git push fails because Replit's askpass cannot provide authentication and a GitHub integration is already connected, use that integration for the GitHub API write rather than inspecting or exposing stored Git credentials.

**Why:** A successful API-created commit changes GitHub but does not automatically update the workspace's local branch refs. Leaving the refs divergent makes later pushes confusing even when both trees contain identical files.

**How to apply:** Confirm the live branch head and push permission first; write only fast-forward commits based on that exact head, then verify the remote ref and tree. If the repository is public, fetch its branch without credentials and align the local tracking and branch refs only after confirming the fetched tree matches the clean worktree. For private repositories, do not use an unauthenticated fetch or force-update local refs.