import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "volunteer.tsx"),
  "utf8",
);
const appSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
  "utf8",
);
const profileSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "profile.tsx"),
  "utf8",
);

test("Volunteer is a dedicated protected route", () => {
  assert.match(appSource, /const Volunteer = lazy\(\(\) => import\("\.\/pages\/volunteer"\)\)/);
  assert.match(appSource, /<Route path="\/volunteer" component=\{\(\) => <ProtectedRoute component=\{Volunteer\} \/>\} \/>/);
});

test("the cross-event shortcut leads the Volunteer page", () => {
  assert.match(source, /<CrossEventSignupPanel events=\{upcomingVolunteerEvents\} \/>/);
  assert.ok(
    source.indexOf("<CrossEventSignupPanel events={upcomingVolunteerEvents} />")
      < source.indexOf('<section className="space-y-4" aria-labelledby="opportunities-heading">'),
  );
  assert.match(source, /<CardTitle id="multiple-events-heading"/);
});

test("Volunteer actions keep accessible labels and feedback", () => {
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /htmlFor=\{inputId\}/);
  assert.match(source, /<label[\s\S]*?<input[\s\S]*?type="checkbox"/);
  assert.match(source, /aria-label=\{`View details for \$\{eventTitle\}`\}/);
  assert.match(source, /That task is no longer available/);
});

test("legacy Profile Volunteer links are sent to the dedicated page", () => {
  assert.match(profileSource, /requestedTab === "volunteer"/);
  assert.match(profileSource, /navigate\("\/volunteer"\)/);
  assert.doesNotMatch(profileSource, /<TabsTrigger value="volunteer"/);
});