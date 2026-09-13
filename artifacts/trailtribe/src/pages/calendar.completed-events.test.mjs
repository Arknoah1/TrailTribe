import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const calendarSource = await readFile(resolve(here, "calendar.tsx"), "utf8");

test("calendar completion uses the end time and falls back to the start time", () => {
  assert.match(calendarSource, /const completionTime = event\.endTime \?\? event\.startTime/);
  assert.match(calendarSource, /new Date\(completionTime\)\.getTime\(\) <= now\.getTime\(\)/);
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