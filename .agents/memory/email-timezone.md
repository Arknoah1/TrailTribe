---
name: TrailTeam outbound email timezone
description: Timezone convention for event times rendered in outbound emails
---

Outbound TrailTeam event emails use the America/Los_Angeles timezone and include
the daylight/standard abbreviation (PDT or PST) until the product stores an
explicit event or recipient timezone.

**Why:** Event creation and the primary web UI currently treat the team's
Pacific-local schedule as the user-facing source of truth, while the API
process itself runs in UTC.

**How to apply:** Use the shared event-time formatter for RSVP confirmations,
reminders, and any future outbound email that includes an event time. Do not
fall back to the server's local timezone.