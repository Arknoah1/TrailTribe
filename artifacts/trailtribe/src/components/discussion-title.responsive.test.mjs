import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "discussion-title.tsx"),
  "utf8",
);
const titleClass = source.match(/className="([^"]+)"/)?.[1] ?? "";

test("long multi-word titles wrap to at most two lines on narrow screens", () => {
  const title = "Saturday morning mountain bike skills clinic and picnic";

  assert.ok(title.split(/\s+/).length > 2);
  assert.match(titleClass, /\bline-clamp-2\b/);
  assert.match(titleClass, /\bbreak-words\b/);
  assert.match(titleClass, /\[overflow-wrap:anywhere\]/);
});

test("wider screens retain the compact one-line title treatment", () => {
  assert.match(titleClass, /\bsm:block\b/);
  assert.match(titleClass, /\bsm:truncate\b/);
});

test("unbroken titles can wrap without creating horizontal overflow", () => {
  const unbrokenTitle = "TrailTeam".repeat(80);

  assert.doesNotMatch(unbrokenTitle, /\s/);
  assert.match(titleClass, /\[overflow-wrap:anywhere\]/);
  assert.match(titleClass, /\bmin-w-0\b/);
});