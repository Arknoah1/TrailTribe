import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, "native-app.ts"), "utf8");
const appleAssociation = JSON.parse(
  await readFile(resolve(here, "../../public/.well-known/apple-app-site-association"), "utf8"),
);
const androidAssociation = JSON.parse(
  await readFile(resolve(here, "../../public/.well-known/assetlinks.json"), "utf8"),
);

test("native deep links only claim TrailTeam routes", () => {
  assert.match(source, /url\.origin !== "https:\/\/trailteam\.app"/);
  assert.match(source, /events/);
  assert.match(source, /focus=volunteer/);
  assert.match(source, /messages/);
  assert.match(source, /volunteer/);
  assert.match(source, /admin/);
  assert.match(source, /profile\(\?:\\\?tab=\(\?:family\|notifications\)\)\?/);
  assert.match(source, /sign-in\|sign-up/);
});

test("iOS app links include the sign-in callback routes", () => {
  const components = appleAssociation.applinks.details.flatMap(
    (detail) => detail.components,
  );
  assert.ok(components.some((component) => component["/"] === "/sign-in"));
  assert.ok(components.some((component) => component["/"] === "/sign-in/*"));
});

test("Android app links use TrailTeam's package and a real signing fingerprint", () => {
  const statement = androidAssociation.find(
    (item) => item.target.namespace === "android_app",
  );
  assert.equal(statement?.target.package_name, "app.trailteam.trailteam");
  assert.match(
    statement?.target.sha256_cert_fingerprints?.[0] ?? "",
    /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/,
  );
});

test("pending links survive signed-out native launches until sign-in", () => {
  assert.match(source, /if \(isActive && isSignedIn\)/);
  assert.match(source, /if \(!Capacitor\.isNativePlatform\(\) \|\| !isSignedIn\) return;/);
  assert.match(source, /takePendingLink\(\)\.then\(\(route\) => route && setLocation\(route\)\)/);
});