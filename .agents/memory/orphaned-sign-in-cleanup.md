---
name: Orphaned sign-in cleanup
description: Safety boundary for removing placeholder accounts created before an invited parent joins a household.
---

An unapproved parent account with no household is an unfinished sign-in, not an active family member, and may be removed during account cleanup. Any account linked to a household, any approved account, and any coach, admin, or student account must remain protected from cleanup.

**Why:** A person can sign in before finishing an invite flow. Removing the invite does not remove the authentication account or its placeholder user row, which would otherwise leave the email unavailable with no family record to archive.

**How to apply:** When changing account cleanup or invite-revocation behavior, keep the eligibility check constrained to `parent` + unapproved + no household, remove the placeholder app record before the authentication record, and preserve the existing block for all other account states.