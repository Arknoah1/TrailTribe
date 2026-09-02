import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, "auth-redirect.ts"), "utf8");
const app = await readFile(resolve(here, "../App.tsx"), "utf8");

test("auth return destinations are allowlisted", () => {
  assert.match(source, /events/);
  assert.match(source, /messages/);
  assert.match(source, /family-invite/);
  assert.match(source, /return isSafeRedirectPath\(route\) \? route : null/);
  assert.match(source, /new Set\(\[currentOrigin\]\)/);
});

test("sign-in and sign-up pages pass the email destination to Clerk", () => {
  assert.match(app, /getRedirectUrlFromSearch/);
  assert.match(app, /forceRedirectUrl=\{redirectUrl \?\? undefined\}/);
  assert.match(app, /fallbackRedirectUrl=\{`\$\{basePath\}\/dashboard`\}/);
});