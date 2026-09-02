import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, "native-app.ts"), "utf8");

test("native deep links only claim TrailTeam routes", () => {
  assert.match(source, /url\.origin !== "https:\/\/trailteam\.app"/);
  assert.match(source, /events/);
  assert.match(source, /focus=volunteer/);
  assert.match(source, /messages/);
  assert.match(source, /volunteer/);
  assert.match(source, /admin/);
});

test("pending links survive signed-out native launches until sign-in", () => {
  assert.match(source, /if \(isActive && isSignedIn\)/);
  assert.match(source, /if \(!Capacitor\.isNativePlatform\(\) \|\| !isSignedIn\) return;/);
  assert.match(source, /takePendingLink\(\)\.then\(\(route\) => route && setLocation\(route\)\)/);
});