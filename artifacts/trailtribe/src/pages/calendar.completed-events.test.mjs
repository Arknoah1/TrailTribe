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

test("List view requests upcoming events by default and bounded history on demand", () => {
  assert.match(calendarSource, /completionStatus: "upcoming" as const/);
  assert.match(calendarSource, /limit: COMPLETED_EVENT_PAGE_SIZE \+ 1/);
  assert.match(calendarSource, /offset: completedEventPage \* COMPLETED_EVENT_PAGE_SIZE/);
  assert.match(calendarSource, /\.\.\.\(podFilter !== "all" \? \{ podId: podFilter \} : \{\}\)/);
  assert.match(calendarSource, /enabled: view === "list" && showCompleted/);
  assert.match(calendarSource, /const COMPLETED_EVENT_PAGE_SIZE = 50/);
  assert.match(calendarSource, /Older completed events/);
  assert.match(calendarSource, /Newer completed events/);
});

test("list filtering can reveal completed events without changing Month view data", () => {
  assert.match(calendarSource, /const podFilteredEvents = useMemo/);
  assert.match(calendarSource, /view === "month" \? \(/);
  assert.match(calendarSource, /events=\{events \?\? \[\]\}/);
  assert.match(calendarSource, /id="calendar-show-completed"/);
  assert.match(calendarSource, /Show completed events/);
});

test("empty state can load completed events when upcoming results are empty", () => {
  assert.match(calendarSource, /\{!showCompleted && \(/);
  assert.match(calendarSource, /onClick=\{\(\) => toggleShowCompleted\(true\)\}/);
});

test("calendar header controls stay contained on narrow screens", () => {
  assert.match(calendarSource, /max-w-6xl min-w-0 mx-auto/);
  assert.match(calendarSource, /flex w-full min-w-0 flex-wrap/);
  assert.match(calendarSource, /basis-full items-center justify-center/);
  assert.match(calendarSource, /min-w-0 max-w-full w-full overflow-x-auto/);
  assert.match(calendarSource, /flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap/);
});