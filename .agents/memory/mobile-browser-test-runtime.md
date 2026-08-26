---
name: Mobile browser test runtime
description: Replit workspace prerequisites for running Playwright Chromium checks
---

Playwright browser tests require both the downloaded Chromium runtime and the shared Linux libraries declared by the workspace environment.

**Why:** A browser test can fail before opening a page when Chromium starts without libraries such as GLib or GBM, which obscures whether the application test itself works.

**How to apply:** Keep the browser test opt-in, install the matching Playwright browser, and ensure the workspace environment declares its required shared libraries before diagnosing application-level failures.