---
name: Event-change audience privacy
description: Privacy rules for notifying users when an event's audience changes.
---

When an event audience changes, resolve recipients from the union of the old and new audiences, but tailor content to each transition. Removed users may receive a generic removal notice using only pre-change details; newly added users may receive current details; retained users may receive the full change summary. Series summaries must be built per recipient from only the occurrences that recipient can access.

**Why:** A single save can rename an event while narrowing its audience, and a recurring series can contain mixed audiences. Reusing one post-change message or one global series summary would expose private event details across groups.

**How to apply:** Use this rule for every event update, cancellation, reschedule, or bulk-series notification path. Test simultaneous title-and-audience changes plus mixed-audience series.