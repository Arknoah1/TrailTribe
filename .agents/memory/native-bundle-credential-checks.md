---
name: Native bundle credential checks
description: Reliable CI checks for preventing development authentication configuration from shipping in native bundles.
---

Match a complete encoded development publishable-key pattern, not only a short
prefix such as `pk_test_`. Authentication SDK code may contain the prefix in its
own validation messages even when the configured build key is production-only.
When scanning APK or AAB contents under shell `pipefail`, extract the archive
stream to a temporary file before running `grep`.

**Why:** Prefix-only checks falsely rejected a valid production-key validation
build. Streaming `unzip` directly into an early-exiting `grep -q` can also make
the archive process receive SIGPIPE, causing the pipeline result to be
misleading.

**How to apply:** For native release gates, search the extracted archive bytes
for a sufficiently long full key pattern and enforce the current allowed or
forbidden endpoint policy. Keep these assertions aligned whenever build-time
authentication configuration changes. Avoid `unzip -p ... | grep -q ...` when
`pipefail` is active.