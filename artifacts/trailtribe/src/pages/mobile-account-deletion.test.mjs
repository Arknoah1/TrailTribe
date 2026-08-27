import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const profile = readFileSync(new URL("./profile.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const nativeBridge = readFileSync(new URL("../lib/native-app.ts", import.meta.url), "utf8");
const capacitorConfig = readFileSync(new URL("../../capacitor.config.ts", import.meta.url), "utf8");
const releaseGuide = readFileSync(new URL("../../MOBILE_RELEASE.md", import.meta.url), "utf8");

test("account deletion is reachable in the shared mobile Profile experience", () => {
  assert.match(app, /path="\/profile"/);
  assert.match(app, /<NativeAppBridge \/>/);
  assert.match(nativeBridge, /profile/);
  assert.match(profile, /data-testid="account-deletion"/);
  assert.match(profile, /Permanently delete my account/);
  assert.match(profile, /min-h-11 w-full/);
});

test("mobile account deletion keeps confirmation and recovery inside the app", () => {
  assert.match(profile, /DELETE MY ACCOUNT/);
  assert.match(profile, /max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
  assert.match(profile, /pb-\[calc\(1\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(profile, /data-testid="account-deletion-confirmation"/);
  assert.match(profile, /data-testid="account-deletion-submit"/);
  assert.match(profile, /redirectUrl: `\$\{BASE_URL\}\/sign-in`/);
  assert.match(profile, /window\.location\.replace\(`\$\{BASE_URL\}\/sign-in`\)/);
  assert.match(profile, /Could not delete account\. Please try again\./);
  assert.match(profile, /no email or support request is needed/);
});

test("the Capacitor release instructions give both stores an in-app review path", () => {
  assert.match(capacitorConfig, /appId: "app\.trailteam\.trailteam"/);
  assert.match(releaseGuide, /## In-app account deletion review path/);
  assert.match(releaseGuide, /This is the same flow on iOS and Android/);
  assert.match(releaseGuide, /does not require email,\s*an external browser, or contacting support/);
});