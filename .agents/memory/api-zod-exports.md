---
name: API Zod exports
description: Public export policy for the generated Zod validation package.
---

The API Zod package should export its generated operation validators, not the generated component-type barrel.

**Why:** Operations and OpenAPI components can legitimately share names such as `CreateHouseholdBody`. Exporting both barrels produces duplicate named exports and breaks the shared-library build after regeneration.

**How to apply:** Import request/response validators from `@workspace/api-zod`. Use `@workspace/api-client-react` for client TypeScript models. If the generator output changes, rebuild the shared libraries immediately after code generation.