---
name: Household correction safety
description: Safety boundaries for correcting household membership, roles, and duplicates.
---

Household structure corrections must use explicit admin-only actions. Do not expose role or household reassignment through a generic user editor, infer login ownership from email, or auto-merge records with linked access or history.

**Why:** Family records connect authentication, permissions, compliance, messaging, RSVP, and other historical data. A convenient generic edit can silently orphan riders, transfer access, or erase history.

**How to apply:** Keep ordinary profile edits separate from reclassification, household moves, and duplicate cleanup. Confirm and audit structural changes, preserve the same user row when moving, protect the last responsible adult, and block deletion whenever login linkage or activity exists.