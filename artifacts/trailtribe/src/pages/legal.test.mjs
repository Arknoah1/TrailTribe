import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesDir = dirname(fileURLToPath(import.meta.url));
const legalSource = await readFile(resolve(pagesDir, "legal.tsx"), "utf8");
const appSource = await readFile(resolve(pagesDir, "../App.tsx"), "utf8");
const nativeSource = await readFile(resolve(pagesDir, "../lib/native-app.ts"), "utf8");

test("privacy policy accurately discloses the sensitive data TrailTeam collects", () => {
  for (const phrase of [
    "email addresses, phone numbers, and home addresses",
    "Emergency contacts",
    "date of birth",
    "allergies, medications, and medical notes",
    "Clerk-managed user IDs",
    "authorized coaches and administrators",
  ]) {
    assert.match(legalSource, new RegExp(phrase.replaceAll(" ", "\\s+")));
  }
});

test("privacy policy does not claim unavailable device permissions", () => {
  assert.match(
    legalSource,
    /does not currently request or use access to your camera, photo library,\s*precise location, or coarse location/,
  );
  assert.match(legalSource, /does not include camera, photo-library,\s*or geolocation features/);
});

test("legal pages have public routes and policy links on signed-out entry points", () => {
  assert.match(
    appSource,
    /<Route path="\/privacy" component=\{\(\) => <LegalPage page="privacy" \/>\} \/>/,
  );
  assert.match(
    appSource,
    /<Route path="\/terms" component=\{\(\) => <LegalPage page="terms" \/>\} \/>/,
  );
  assert.match(appSource, /function PolicyLinks\(\)/);
  assert.match(appSource, /href=\{`\$\{basePath\}\/privacy`\}/);
  assert.match(appSource, /href=\{`\$\{basePath\}\/terms`\}/);
  assert.match(appSource, /<Route path="\/support" component=\{SupportPage\} \/>/);
  assert.match(appSource, /href=\{`\$\{basePath\}\/support`\}/);
  assert.match(legalSource, /<InlineLink href="\/support">Support<\/InlineLink>/);
  assert.match(nativeSource, /\|support\|privacy\|terms/);
});

test("public support route does not wait for Clerk startup", () => {
  assert.match(appSource, /const isSupportRoute = routePath === "\/support" \|\| routePath\.endsWith\("\/support"\)/);
  assert.match(appSource, /if \(!isLoaded && !isSupportRoute\)/);
});

test("legal content includes terms needed for team participation without old branding", () => {
  for (const phrase of [
    "Accounts and roles",
    "Team communication and participation",
    "Health and safety information",
    "Respectful and permitted use",
    "Service availability and account changes",
    "admin@methowcyclingteam.com",
  ]) {
    assert.match(legalSource, new RegExp(phrase));
  }

  assert.doesNotMatch(legalSource, /TrailTribe|trailtribemtb\.com/);
  assert.match(legalSource, /https:\/\/trailteam\.app/);
});

test("privacy describes stored reports and hide preferences and actual account deletion", () => {
  assert.match(legalSource, /app database stores each report’s reported Board item and title,\s+reporter name, selected reason, optional details, a short content excerpt, review status,\s+and any resolution note/);
  assert.match(legalSource, /preferences about which\s+Board members a user has\s+chosen to hide/);
  assert.match(legalSource, /self-service account deletion option under Profile\s+settings/);
  assert.match(legalSource, /Shared events and discussions remain available to the\s+team without your account attached/);
  assert.match(legalSource, /If you are the final member of your household,\s+household-only information is also removed/);
  assert.match(legalSource, /does not state a separate\s+numeric minimum age/);
});

test("terms describe community rules, reporting, hiding, and the posting-only restriction", () => {
  assert.match(legalSource, /Any approved member can report a Board discussion or reply/);
  assert.match(legalSource, /Coaches and administrators review reports as soon as they can and handle harassment and\s+safety concerns first, but we cannot guarantee a specific response or resolution time\./);
  assert.match(legalSource, /Members can hide\s+or unhide Board members/);
  assert.match(legalSource, /Coaches and administrators may remove Board\s+content or restrict a member’s ability to post on the Board/);
  assert.match(legalSource, /applies only to creating Board\s+threads and replies/);
  assert.match(legalSource, /Do not post harassment, threats/);
  assert.match(legalSource, /does not\s+enforce a separate numeric minimum age/);
});