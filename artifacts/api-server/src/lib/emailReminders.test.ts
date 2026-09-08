import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  sendEmail: vi.fn(),
  getShortNamePrefix: vi.fn(),
  db: {
    select: vi.fn(),
    query: {
      trailheadsTable: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => [left, right],
  gte: (left: unknown, right: unknown) => [left, right],
  lte: (left: unknown, right: unknown) => [left, right],
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  eventsTable: {
    startTime: "event_start_time",
    isArchived: "event_is_archived",
  },
  usersTable: {
    isActive: "user_is_active",
    approved: "user_approved",
  },
  trailheadsTable: { id: "trailhead_id" },
}));

vi.mock("./email", () => ({
  sendEmail: mocks.sendEmail,
  isDeliverableEmailAddress: (email: string | null | undefined) =>
    Boolean(
      email
      && !email.endsWith("@trailteam.internal")
      && !email.endsWith("@pending.trailteam.app"),
    ),
}));
vi.mock("../routes/settings", () => ({ getShortNamePrefix: mocks.getShortNamePrefix }));

const { sendEventReminders } = await import("./emailReminders");

function user(overrides: Record<string, unknown>) {
  return {
    id: 1,
    firstName: "Avery",
    email: "avery@example.test",
    role: "parent",
    podId: "pod-a",
    isActive: true,
    approved: true,
    emailNotifications: true,
    notificationPreferences: { eventReminders: true },
    ...overrides,
  };
}

function event(overrides: Record<string, unknown>) {
  return {
    id: 1001,
    title: "Team Practice",
    startTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
    isArchived: false,
    podIds: [] as string[],
    trailheadId: null,
    locationOverride: "Central Park",
    googleMapsUrlOverride: null,
    ...overrides,
  };
}

function setupSelects(results: unknown[][]) {
  mocks.selectResults = [...results];
  mocks.db.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(mocks.selectResults.shift() ?? [])),
    })),
  }));
}

describe("event reminder recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getShortNamePrefix.mockResolvedValue("");
    mocks.sendEmail.mockResolvedValue({ status: "sent" });
    mocks.db.query.trailheadsTable.findFirst.mockResolvedValue(null);
  });

  it("reminds active team members for team-wide events even without an RSVP", async () => {
    setupSelects([
      [event({ id: 1001 })],
      [
        user({ id: 101, email: "avery@example.test" }),
        user({ id: 102, podId: "pod-b", email: "blake@example.test" }),
      ],
    ]);

    await sendEventReminders();

    expect(mocks.sendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "avery@example.test",
      "blake@example.test",
    ]);
  });

  it("includes eligible pod members and staff regardless of RSVP status", async () => {
    setupSelects([
      [event({ id: 1002, title: "Pod Ride", podIds: ["pod-a"], locationOverride: null })],
      [
        user({ id: 201, email: "no-rsvp@example.test", rsvpStatus: null }),
        user({ id: 202, email: "maybe@example.test", rsvpStatus: "maybe" }),
        user({ id: 203, email: "declined@example.test", rsvpStatus: "not_attending" }),
        user({ id: 204, email: "attending@example.test", rsvpStatus: "attending" }),
        user({ id: 205, role: "coach", podId: "pod-b", email: "coach@example.test" }),
        user({ id: 206, podId: "pod-b", email: "stale-rsvp@example.test", rsvpStatus: "attending" }),
        user({ id: 207, role: "student", seasonParticipationStatus: "active", email: "active-rider@example.test" }),
      ],
    ]);

    await sendEventReminders();

    expect(mocks.sendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "no-rsvp@example.test",
      "maybe@example.test",
      "declined@example.test",
      "attending@example.test",
      "coach@example.test",
      "active-rider@example.test",
    ]);
  });

  it("excludes inactive, unapproved, season-off or pending riders, opt-outs, and placeholder emails", async () => {
    setupSelects([
      [event({ id: 1003 })],
      [
        user({ id: 301, email: "inactive@example.test", isActive: false }),
        user({ id: 302, email: "unapproved@example.test", approved: false }),
        user({ id: 303, email: "global-opt-out@example.test", emailNotifications: false }),
        user({ id: 304, email: "reminder-opt-out@example.test", notificationPreferences: { eventReminders: false } }),
        user({ id: 305, email: "rider-305@trailteam.internal" }),
        user({ id: 306, email: "new-user@pending.trailteam.app" }),
        user({ id: 307, role: "student", seasonParticipationStatus: "season_off", email: "season-off@example.test" }),
        user({ id: 308, role: "student", seasonParticipationStatus: "pending", email: "pending-rider@example.test" }),
      ],
    ]);

    await sendEventReminders();

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});