import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesDir = dirname(fileURLToPath(import.meta.url));
const supportSource = await readFile(resolve(pagesDir, "support.tsx"), "utf8");

test("support page has direct contact and accessible account/report guidance", () => {
  assert.match(supportSource, /admin@methowcyclingteam\.com/);
  assert.match(supportSource, /While signed in, open a discussion or reply, choose Report from its actions menu/);
  assert.match(supportSource, /Coaches and admins can review reports/);
  assert.match(supportSource, /do not promise a response time/i);
  assert.match(supportSource, /hide or unhide other Board members/i);
  assert.match(supportSource, /Profile settings/);
  assert.match(supportSource, /data-testid="page-support"/);
  assert.match(supportSource, /data-testid="link-support-email"/);
});

test("support navigation connects public policy and sign-in routes", () => {
  for (const route of ["/privacy", "/terms", "/sign-in"]) {
    assert.ok(supportSource.includes(`href="${route}"`), `expected support navigation for ${route}`);
  }
  assert.match(supportSource, /testId="link-support-read-terms"/);
  assert.match(supportSource, /data-testid="link-support-read-privacy"/);
});
