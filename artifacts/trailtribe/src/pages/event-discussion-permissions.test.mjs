import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const eventDetail = await readFile(resolve(here, "event-detail.tsx"), "utf8");

test("event discussion empty state follows the event audience", () => {
  assert.match(eventDetail, /function canDiscussEvent\(/);
  assert.match(eventDetail, /user\.role === "coach" \|\| user\.role === "super_admin"/);
  assert.match(eventDetail, /audience\.podIds\.includes\(user\.podId\)/);
  assert.match(eventDetail, /Discussion not available/);
  assert.match(eventDetail, /This event discussion is limited to families invited to the event\./);
});

test("audience parents retain the event discussion actions", () => {
  assert.match(eventDetail, /Start the Discussion/);
  assert.match(eventDetail, /Join the Discussion/);
  assert.match(eventDetail, /canDiscuss=\{canDiscussEvent\(event, me\)\}/);
});