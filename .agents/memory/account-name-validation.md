---
name: Required account names
description: Account names must be collected before an adult can use the app.
---

Empty names and the legacy `New User` placeholder are incomplete account data. Adult accounts must be routed through name setup before they can proceed; name inputs and API updates must reject blank or whitespace-only values.

**Why:** Clerk may create a session without first and last names, and direct household invites can otherwise bypass the normal onboarding step.

**How to apply:** Preserve real names from the identity provider, never create `New User` as a fallback, and keep the onboarding/profile guard plus server validation aligned.