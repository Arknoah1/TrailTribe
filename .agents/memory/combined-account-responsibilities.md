---
name: Combined account responsibilities
description: How to preserve legacy role behavior while authorizing accounts with multiple responsibilities.
---

Use the multi-value responsibility set for authorization and feature visibility. Keep the single primary role only for backward compatibility, display, and older integrations.

**Why:** A person may be a parent, coach, and super admin simultaneously. Replacing one role with another silently removes household or staff capabilities, while treating staff status as globally household-scoped can expose another family's private actions.

**How to apply:** Add or remove responsibilities without replacing unrelated ones. Use shared capability predicates in backend and frontend checks, and keep household-bound actions dependent on matching household membership even when the account also has staff capabilities.