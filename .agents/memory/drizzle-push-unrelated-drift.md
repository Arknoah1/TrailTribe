---
name: Drizzle push unrelated drift
description: Development schema pushes can stop on unrelated unique-constraint drift before showing the intended table change.
---

**Rule:** Do not use a force-push just to bypass an unrelated Drizzle prompt; preserve existing rows and apply only the requested development schema change.

**Why:** Non-interactive workspace shells cannot reliably answer Drizzle's truncate confirmation, and force mode can destroy unrelated development data.

**How to apply:** Inspect the prompt's table and row count first, choose the non-truncating path when interactive, and use a scoped development DDL transaction only when the requested rows are already verified and the push cannot be completed safely.