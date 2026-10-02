---
name: Private discussion attachments
description: Security rules for serving user-uploaded files whose visibility comes from a discussion or other parent record.
---

Private discussion files must use a namespace that generic object routes refuse, and every attachment must have one authoritative parent record.

**Why:** Upload-time object ACLs can be broader than the eventual discussion audience. Presigned PUT URLs also remain reusable until expiry, so checking metadata and then reading the unqualified object leaves an overwrite race.

**How to apply:** Validate ownership and stored MIME/size when attaching, record the exact object generation, and always stream that generation after checking current parent visibility. Fail closed if the recorded generation no longer exists.

Parent visibility includes present-day account eligibility, not just membership in a captured audience.

**Why:** A captured recipient or staff account can remain associated with a message after becoming inactive or season-ineligible. Audience checks alone can therefore allow files that the parent archive no longer permits the account to see.

**How to apply:** Apply the parent's full viewer-eligibility rule before staff shortcuts or captured-audience membership checks. Approval alone is not proof of continued eligibility.