---
name: Carpool capacity semantics
description: Product rules for counting and resolving carpool seat and bike-tray capacity.
---

Every claim consumes the offer's advertised seat and bike-tray capacity, including claims created when a driver accepts a ride request. The driver is not counted as a passenger. Existing over-capacity offers remain visible but cannot accept additional capacity-consuming claims.

If a rider needs a bike tray and only a seat remains, require explicit confirmation before converting the match or claim to rider-only. Never increase a driver's configured tray capacity automatically.

**Why:** Driver-initiated matches were historically excluded from capacity, which allowed a later stale claim to overbook a bike tray. Automatically inventing tray capacity would hide the same conflict rather than resolving it.

**How to apply:** Use these rules for direct claims, driver matches, claim edits, offer edits, multi-rider selection, and any future bulk or administrative carpool action.