import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pageDir = dirname(fileURLToPath(import.meta.url));
const [eventDetail, roster, householdDetail] = await Promise.all([
  readFile(resolve(pageDir, "event-detail.tsx"), "utf8"),
  readFile(resolve(pageDir, "roster.tsx"), "utf8"),
  readFile(resolve(pageDir, "household-detail.tsx"), "utf8"),
]);

test("primary-coach accounts with parent responsibility keep family RSVP controls", () => {
  assert.match(eventDetail, /const isParent = hasUserRole\(me, "parent"\)/);
  assert.doesNotMatch(eventDetail, /const isParent = me\?\.role === "parent"/);
});

test("combined parents remain visible in family directories", () => {
  assert.match(roster, /members\.filter\(m => hasUserRole\(m, "parent"\)\)/);
  assert.match(householdDetail, /members\.filter\(m => hasUserRole\(m, "parent"\)\)/);
});