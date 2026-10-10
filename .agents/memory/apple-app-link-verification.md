---
name: Apple app-link verification
description: Verify that iOS Universal Link metadata is current at both the published domain and Apple's association cache.
---

After changing an Apple App Site Association file, checking that the app deploy is healthy is not enough. Verify the exact callback paths at the published `/.well-known/apple-app-site-association` URL and through Apple's AASA CDN; both must contain the latest routes before treating the iOS callback as ready.

**Why:** A published TrailTeam build reported healthy while the live origin and Apple's CDN still returned an older AASA document without the sign-in callback paths.

**How to apply:** For any iOS OAuth or deep-link change, inspect both responses and test on an installed app. Do not infer iOS Universal Link readiness from a successful web sign-in or a successful deployment.
