---
name: Email sender override
description: Deployment-level EMAIL_FROM can take precedence over the code fallback when email branding changes.
---

The shared EMAIL_FROM setting takes precedence over the code fallback, while
EMAIL_APPROVED_SENDER_MAILBOXES controls the deployment allowlist. Sender-brand
changes must keep the display name code-owned and update both deployment values
when rotating the authenticated mailbox.

**Why:** A deployment override can otherwise make a correct code change
invisible to recipients, while deriving approval from EMAIL_FROM alone would
turn a typo into an accepted sender identity.

**How to apply:** Before changing the visible email sender, verify the new
mailbox with the SMTP provider, then set EMAIL_APPROVED_SENDER_MAILBOXES and
EMAIL_FROM together and restart the API so startup and per-send validation use
the same approved identity.