import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "admin.tsx"),
  "utf8",
);

test("active household cards let staff share the existing family join link", () => {
  assert.match(source, /\/api\/households\/\$\{household\.id\}\/family-link/);
  assert.match(source, /\/join\/\$\{encodeURIComponent\(data\.inviteCode\)\}/);
  assert.match(source, /Share family link/);
  assert.match(source, /navigator\.share/);
  assert.match(source, /navigator\.clipboard\?\.writeText/);
});

test("sharing handles cancellation and has a selectable manual fallback", () => {
  assert.match(source, /error instanceof DOMException && error\.name === "AbortError"/);
  assert.match(source, /setManualFamilyLink\(\{ householdName: household\.name, url \}\)/);
  assert.match(source, /aria-label="Family invite link"/);
  assert.match(source, /event\.currentTarget\.select\(\)/);
});

test("staff must confirm before replacing a family link and then share the replacement", () => {
  assert.match(source, /Replace family link/);
  assert.match(source, /Replace this family link\?/);
  assert.match(source, /The current link for .* will stop working immediately/);
  assert.match(source, /body: JSON\.stringify\(\{ confirmation: true \}\)/);
  assert.match(source, /Family link replaced/);
  assert.match(
    source,
    /const handleRotateFamilyLink = async \(\) => \{[\s\S]*?await shareFamilyLinkUrl\(household, url, true\);[\s\S]*?\n  \};/,
  );
  assert.match(source, /The previous link no longer works\. Copy the replacement when you're ready\./);
});