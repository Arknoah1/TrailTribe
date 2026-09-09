import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const adminSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "admin.tsx"),
  "utf8",
);
const actionSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "../components/family-link-action.tsx"),
  "utf8",
);

test("active household cards let staff share the existing family join link", () => {
  assert.match(adminSource, /\/api\/households\/\$\{household\.id\}\/family-link/);
  assert.match(adminSource, /<FamilyLinkAction/);
  assert.match(actionSource, /\/join\/\$\{encodeURIComponent\(inviteCode\)\}/);
  assert.match(actionSource, /Share family link/);
  assert.match(actionSource, /navigator\.share/);
  assert.match(actionSource, /navigator\.clipboard\?\.writeText/);
});

test("sharing handles cancellation and has a selectable manual fallback", () => {
  assert.match(actionSource, /error instanceof DOMException && error\.name === "AbortError"/);
  assert.match(actionSource, /setManualUrl\(url\)/);
  assert.match(actionSource, /aria-label="Family invite link"/);
  assert.match(actionSource, /event\.currentTarget\.select\(\)/);
});

test("staff must confirm before replacing a family link and then share the replacement", () => {
  assert.match(adminSource, /Replace family link/);
  assert.match(adminSource, /Replace this family link\?/);
  assert.match(adminSource, /The current link for .* will stop working immediately/);
  assert.match(adminSource, /body: JSON\.stringify\(\{ confirmation: true \}\)/);
  assert.match(adminSource, /Family link replaced/);
  assert.match(
    adminSource,
    /const handleRotateFamilyLink = async \(\) => \{[\s\S]*?await shareFamilyLinkUrl\(household, url, true\);[\s\S]*?\n  \};/,
  );
  assert.match(adminSource, /The previous link no longer works\. Copy the replacement when you're ready\./);
});