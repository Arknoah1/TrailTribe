import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(resolve(here, relativePath), "utf8");

const [profile, volunteer, carpools, dashboard, calendar, eventDetail] = await Promise.all([
  readSource("profile.tsx"),
  readSource("volunteer.tsx"),
  readSource("carpools.tsx"),
  readSource("dashboard.tsx"),
  readSource("calendar.tsx"),
  readSource("event-detail.tsx"),
]);

test("students retain profile access without household-management controls", () => {
  assert.match(profile, /const isStudent = user\?\.role === "student"/);
  assert.match(profile, /<MyFamilyTab[\s\S]*?householdId=\{user\.householdId\}[\s\S]*?currentUserId=\{user\.id\}[\s\S]*?readOnly=\{isStudent\}/);
  assert.match(profile, /canInviteCoParent=\{user\.role === "parent" \|\| user\.role === "coach"\}/);
  assert.match(profile, /Family information is view-only/);
  assert.match(profile, /disabled=\{readOnly\}/);
  assert.match(profile, /!readOnly && \(\s*<Dialog open=\{riderDialogOpen/);
  assert.match(profile, /Ask a parent or guardian to invite you to their TrailTeam household/);
});

test("student carpool actions stay scoped to their own transportation", () => {
  assert.match(carpools, /const requestableRiders = isStudent/);
  assert.match(carpools, /riders\.filter\(rider => rider\.id === me\?\.id\)/);
  assert.match(carpools, /!isStudent && <Dialog open=\{isOfferOpen\}/);
  assert.match(carpools, /const canMatch = isOpen && !mine && !isStudent/);
  assert.match(carpools, /Request or claim a ride for yourself/);
});

test("student-facing mobile surfaces describe when coaches control availability", () => {
  assert.match(volunteer, /Your coach can open volunteer tasks for an upcoming event/);
  assert.match(eventDetail, /These opportunities apply to this event only/);
  assert.match(dashboard, /No upcoming events are assigned to your pod yet/);
  assert.match(calendar, /Your coach will post them here/);
});

test("profile tabs remain accessible touch targets on narrow mobile screens", () => {
  assert.match(profile, /aria-label="Profile sections"/);
  assert.match(profile, /min-h-11 flex items-center/);
});