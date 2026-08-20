---
name: Board reaction test mocks
description: Drizzle route tests need request-scoped target context when matching mocked SQL conditions.
---

Drizzle query condition objects are opaque in lightweight Vitest database mocks, so reaction tests should track the request target explicitly while preserving realistic API assertions.

**Why:** Matching mock conditions by guessed properties caused false 404s and could hide authorization behavior.

**How to apply:** Keep the mock’s target context set by the HTTP helper, and use GET requests for non-mutating state checks instead of toggling twice.