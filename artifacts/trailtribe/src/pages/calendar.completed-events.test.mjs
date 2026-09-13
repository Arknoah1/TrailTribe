import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isCalendarEventCompleted } from "../lib/calendar-events.ts";

const here = dirname(fileURLToPath(import.meta.url));
const calendarSource = await readFile(resolve(here, "calendar.tsx"), "utf8");

test("calendar completion uses the end time when present", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");

  assert.equal(isCalendarEventCompleted({
    startTime: "2026-09-12T10:00:00.000Z",
    endTime: "2026-09-12T13:00:00.000Z",
  }, now), false);
  assert.equal(isCalendarEventCompleted({
    startTime: "2026-09-12T09:00:00.000Z",
    endTime: "2026-09-12T11:00:00.000Z",
  }, now), true);
});

test("calendar completion falls back to the start time and includes the boundary", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");

  assert.equal(isCalendarEventCompleted({ startTime: "2026-09-12T11:59:59.000Z" }, now), true);
  assert.equal(isCalendarEventCompleted({ startTime: "2026-09-12T12:00:00.000Z" }, now), true);
  assert.equal(isCalendarEventCompleted({ startTime: "2026-09-12T12:00:01.000Z" }, now), false);
});

test("completed events are hidden by default and the preference is persisted", () => {
  assert.match(calendarSource, /const SHOW_COMPLETED_STORAGE_KEY = "tt-calendar-show-completed"/);
  assert.match(calendarSource, /localStorage\.getItem\(SHOW_COMPLETED_STORAGE_KEY\) === "true"/);
  assert.match(calendarSource, /const \[showCompleted, setShowCompleted\] = useState<boolean>\(getStoredShowCompleted\)/);
  assert.match(calendarSource, /localStorage\.setItem\(SHOW_COMPLETED_STORAGE_KEY, String\(checked\)\)/);
});

test("list filtering can reveal completed events without changing Month view data", () => {
  assert.match(calendarSource, /const podFilteredEvents = useMemo/);
  assert.match(calendarSource, /if \(showCompleted\) return podFilteredEvents/);
  assert.match(calendarSource, /view === "month" \? \(/);
  assert.match(calendarSource, /events=\{events \?\? \[\]\}/);
  assert.match(calendarSource, /id="calendar-show-completed"/);
  assert.match(calendarSource, /Show completed events/);
});

test("empty state explains when completed events are hidden", () => {
  assert.match(calendarSource, /const hasHiddenCompletedEvents = !showCompleted/);
  assert.match(calendarSource, /No upcoming events\. Completed events are hidden\./);
  assert.match(calendarSource, /onClick=\{\(\) => toggleShowCompleted\(true\)\}/);
});