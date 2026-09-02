import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const onboarding = await readFile(resolve(here, "onboarding.tsx"), "utf8");

test("onboarding completion honors the server-approved account state", () => {
  assert.match(onboarding, /const serverApproved = Boolean\(\(me as any\)\?\.approved\)/);
  assert.match(onboarding, /setAutoApproved\(joined \|\| serverApproved\)/);
  assert.match(onboarding, /approved=\{autoApproved \|\| serverApproved\}/);
});

test("onboarding keeps the pending state for newly created households", () => {
  assert.match(onboarding, /onNext\(false\); \/\/ created households wait for admin approval/);
  assert.match(onboarding, /{approved \? "You're in!" : "Almost there"}/);
  assert.match(onboarding, /Your account is pending approval from a coach or admin/);
});