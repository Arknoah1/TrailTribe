---
name: Email sender override
description: Deployment-level EMAIL_FROM can take precedence over the code fallback when email branding changes.
---

The shared EMAIL_FROM setting takes precedence over the code fallback, so sender-brand changes must update both the fallback identity and any configured shared override while preserving the authenticated mailbox address.

**Why:** A deployment override can otherwise make a correct code change invisible to recipients.

**How to apply:** Before changing the visible email sender, inspect the configured EMAIL_FROM setting without exposing secrets, then update its display name and restart the API so the process reloads it.