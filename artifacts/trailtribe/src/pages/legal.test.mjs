import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesDir = dirname(fileURLToPath(import.meta.url));
const legalSource = await readFile(resolve(pagesDir, "legal.tsx"), "utf8");
const appSource = await readFile(resolve(pagesDir, "../App.tsx"), "utf8");

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