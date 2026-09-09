---
name: Private image regression fixtures
description: Testing principle for private discussion-image access boundaries.
---

Security regression tests for private discussion images should exercise the board attachment endpoint and the generic storage route with fixtures for parent visibility, deleted replies, and multiple object generations.

**Why:** ACL ownership alone does not prove that a picture is safe to serve; visibility, deletion state, namespace routing, and the recorded immutable generation are separate boundaries.

**How to apply:** Keep at least one test that proves an allowed viewer receives the recorded generation while an out-of-audience viewer and the generic object route receive 404.