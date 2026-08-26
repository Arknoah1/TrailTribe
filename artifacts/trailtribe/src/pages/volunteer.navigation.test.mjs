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
const onboardingSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "onboarding.tsx"),
  "utf8",
);
const eventDetailSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "event-detail.tsx"),
  "utf8",
);
const taskStatusSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "../lib/volunteer-task-status.ts"),
  "utf8",
);

test("Volunteer is a dedicated protected route", () => {
  assert.match(appSource, /const Volunteer = lazy\(\(\) => import\("\.\/pages\/volunteer"\)\)/);
  assert.match(appSource, /<Route path="\/volunteer" component=\{\(\) => <ProtectedRoute component=\{Volunteer\} \/>\} \/>/);
});

test("the cross-event shortcut leads the Volunteer page", () => {
  assert.match(source, /<CrossEventSignupPanel events=\{upcomingVolunteerEvents\} \/>/);
  assert.match(source, /function VolunteerSignupChoices\(/);
  assert.ok(
    source.indexOf("<CrossEventSignupPanel events={upcomingVolunteerEvents} />")
      < source.indexOf("<Commitments signups={signups ?? []} />"),
  );
  assert.match(source, /<CardTitle id="multiple-events-heading"/);
});

test("Volunteer actions keep accessible labels and feedback", () => {
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /htmlFor=\{inputId\}/);
  assert.match(source, /<label[\s\S]*?<input[\s\S]*?type="checkbox"/);
  assert.match(source, /aria-label=\{`View details for \$\{group\.eventTitle\}`\}/);
  assert.match(source, /That task is no longer available/);
});

test("Volunteer keeps claimed and full tasks visible with clear disabled states", () => {
  assert.match(taskStatusSource, /if \(task\.mySignup\) return "claimed";/);
  assert.match(taskStatusSource, /return filled >= \(task\.slotsNeeded \?\? 0\) \? "full" : "available";/);
  assert.match(source, /const allTasks = event\.tasks \?\? fetchedTasks \?\? \[\];/);
  assert.doesNotMatch(source, /const openTasks =/);
  assert.match(source, /disabled=\{!isAvailable\}/);
  assert.match(source, /You’re on it/);
  assert.match(source, /Full/);
  assert.match(source, /volunteerTaskUnavailableButtonClassName/);
});

test("event detail uses the same green, claimed, and full task states", () => {
  assert.match(eventDetailSource, /getVolunteerTaskState/);
  assert.match(eventDetailSource, /You’re on it/);
  assert.match(eventDetailSource, /aria-label=\{isFull \? `Full: \$\{task\.title\}` : `Sign up for \$\{task\.title\}`\}/);
  assert.match(eventDetailSource, /className=\{isFull \? volunteerTaskUnavailableButtonClassName : volunteerTaskAvailableButtonClassName\}/);
});

test("commitments are grouped by event for easier scanning", () => {
  assert.match(source, /function groupCommitmentsByEvent\(signups: any\[\]\)/);
  assert.match(source, /function CommitmentGroups\(/);
  assert.match(source, /sectionLabel=\{`Upcoming \(\$\{upcoming\.length\}\)`\}/);
  assert.match(source, /sectionLabel="Past events"/);
  assert.match(source, /aria-labelledby=\{eventHeadingId\}/);
  assert.match(source, /aria-label=\{`View details for \$\{group\.eventTitle\}`\}/);
  assert.doesNotMatch(source, /\{eventTitle\}\{eventStart &&/);
});

test("onboarding shows optional multi-event volunteer signup after documents", () => {
  assert.match(onboardingSource, /\{ label: "Volunteer", Icon: Users \}/);
  assert.match(onboardingSource, /function StepVolunteer\(/);
  assert.match(onboardingSource, /useListOnboardingVolunteerOpportunities/);
  assert.match(onboardingSource, /<VolunteerSignupChoices events=\{events\}/);
  assert.match(onboardingSource, /Skip for now/);
  assert.match(onboardingSource, /Continue to finish/);
  assert.match(onboardingSource, /<StepCompliance householdId=\{householdId\} onNext=\{\(\) => setStep\(4\)\} \/>/);
  assert.match(onboardingSource, /<StepVolunteer onNext=\{\(\) => setStep\(5\)\} \/>/);
  assert.doesNotMatch(onboardingSource, /useListEvents/);
});

test("legacy Profile Volunteer links are sent to the dedicated page", () => {
  assert.match(profileSource, /requestedTab === "volunteer"/);
  assert.match(profileSource, /navigate\("\/volunteer"\)/);
  assert.doesNotMatch(profileSource, /<TabsTrigger value="volunteer"/);
});