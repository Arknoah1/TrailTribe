import { describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  usersTable: {},
  eventsTable: {},
  trailheadsTable: {},
}));

vi.mock("../middlewares/requireAuth", () => ({
  hasStudentAccess: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("../middlewares/rateLimiter", () => ({
  publicLookupLimiter: vi.fn(),
}));

const { buildTeamCalendarIcs } = await import("./calendar");

const feedDate = new Date("2026-06-01T00:00:00.000Z");
const updatedAt = new Date("2026-05-01T00:00:00.000Z");

function event(overrides: Partial<{
  iCalUid: string;
  startTime: Date;
  endTime: Date | null;
  title: string;
}> = {}) {
  return {
    iCalUid: "event-id",
    startTime: new Date("2026-07-01T16:00:00.000Z"), // 9:00 AM Pacific daylight time
    endTime: new Date("2026-07-01T17:30:00.000Z"),
    updatedAt,
    title: "Morning practice",
    eventType: "practice",
    description: null,
    trailheadId: null,
    locationOverride: null,
    ...overrides,
  };
}

describe("team calendar iCal feed", () => {
  it("keeps both morning and afternoon event instants explicit", () => {
    const ics = buildTeamCalendarIcs([
      event(),
      event({
        iCalUid: "afternoon-event",
        startTime: new Date("2026-07-02T00:30:00.000Z"), // 5:30 PM Pacific daylight time
        endTime: new Date("2026-07-02T02:00:00.000Z"),
        title: "Evening ride",
      }),
    ], {}, feedDate);

    expect(ics).toContain("DTSTART:20260701T160000Z");
    expect(ics).toContain("DTEND:20260701T173000Z");
    expect(ics).toContain("DTSTART:20260702T003000Z");
    expect(ics).toContain("DTEND:20260702T020000Z");
    expect(ics).not.toContain("X-WR-TIMEZONE:UTC");
  });

  it("preserves the correct UTC offset on both sides of daylight saving time", () => {
    const ics = buildTeamCalendarIcs([
      event({
        iCalUid: "winter-event",
        startTime: new Date("2026-01-10T17:00:00.000Z"), // 9:00 AM Pacific standard time
        endTime: new Date("2026-01-10T18:00:00.000Z"),
      }),
      event({
        iCalUid: "summer-event",
        startTime: new Date("2026-07-10T16:00:00.000Z"), // 9:00 AM Pacific daylight time
        endTime: new Date("2026-07-10T17:00:00.000Z"),
      }),
    ], {}, feedDate);

    expect(ics).toContain("DTSTART:20260110T170000Z");
    expect(ics).toContain("DTSTART:20260710T160000Z");
    expect(ics).toContain("DTSTAMP:20260601T000000Z");
  });

  it("converts Markdown descriptions to readable calendar text with usable links", () => {
    const ics = buildTeamCalendarIcs([
      event({
        description: [
          "# Race day",
          "",
          "| Staging Time | Race Start |",
          "| --- | :---: |",
          "| **8:00 AM** | `9:00 AM` |",
          "",
          "[Schedule PDF](https://example.com/my_route/file_name.pdf)",
        ].join("\n"),
      }),
    ], {}, feedDate);
    const unfolded = ics.replace(/\r\n /g, "");

    expect(unfolded).toContain(
      "DESCRIPTION:Type: practice\\nRace day\\nStaging Time Race Start\\n8:00 AM 9:00 AM",
    );
    expect(unfolded).toContain("Schedule PDF (https://example.com/my_route/file_name.pdf)");
    expect(unfolded).not.toContain("practice\\\\nRace day");
    expect(unfolded).not.toContain("| --- |");
    expect(unfolded).not.toContain("**8:00 AM**");
    expect(unfolded).not.toContain("[Schedule PDF]");
  });

  it("keeps iCalendar escaping and line folding valid after Markdown conversion", () => {
    const ics = buildTeamCalendarIcs([
      event({
        description:
          "Bring **water**, snacks; and a very long checklist with [details](https://example.com/calendar/checklist).",
      }),
    ], {}, feedDate);
    const unfolded = ics.replace(/\r\n /g, "");
    const descriptionLines = ics
      .split("\r\n")
      .filter((line, index, lines) =>
        line.startsWith("DESCRIPTION:") ||
        (line.startsWith(" ") && lines[index - 1]?.startsWith("DESCRIPTION:")),
      );

    expect(unfolded).toContain("Bring water\\, snacks\\;");
    expect(unfolded).toContain("details (https://example.com/calendar/checklist)");
    expect(descriptionLines.length).toBeGreaterThan(1);
    expect(descriptionLines.every(line => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
  });
});