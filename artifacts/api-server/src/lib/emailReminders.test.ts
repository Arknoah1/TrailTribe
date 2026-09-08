import { beforeEach, describe, expect, it, vi } from "vitest";
import { isEventAudienceMember as sharedIsEventAudienceMember } from "@workspace/db/event-audience";

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  sendEmail: vi.fn(),
  getShortNamePrefix: vi.fn(),
  insertClaims: [] as unknown[][],
  retryClaims: [] as unknown[][],
  deliveryUpdates: [] as Record<string, unknown>[],
  insertedDeliveries: [] as Record<string, unknown>[],
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      trailheadsTable: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (left: unknown, right: unknown) => [left, right],
  gt: (left: unknown, right: unknown) => [left, right],
  lte: (left: unknown, right: unknown) => [left, right],
  or: (...args: unknown[]) => args,
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  eventsTable: {
    startTime: "event_start_time",
    isArchived: "event_is_archived",
  },
  eventReminderDeliveriesTable: {
    eventId: "delivery_event_id",
    userId: "delivery_user_id",
    occurrenceStart: "delivery_occurrence_start",
    status: "delivery_status",
    attemptCount: "delivery_attempt_count",
    claimedAt: "delivery_claimed_at",
    nextAttemptAt: "delivery_next_attempt_at",
  },
  usersTable: {
    isActive: "user_is_active",
    approved: "user_approved",
  },
  trailheadsTable: { id: "trailhead_id" },
  isEventAudienceMember: sharedIsEventAudienceMember,
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
    isAllTeam: true,
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

function setupDeliveryClaims(insertClaims: unknown[][] = []) {
  mocks.insertClaims = [...insertClaims];
  mocks.retryClaims = [];
  mocks.deliveryUpdates = [];
  mocks.insertedDeliveries = [];
  mocks.db.insert.mockImplementation(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      mocks.insertedDeliveries.push(values);
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(
            mocks.insertClaims.length > 0
              ? mocks.insertClaims.shift()
              : [{ attemptCount: 1 }],
          )),
        })),
      };
    }),
  }));
  mocks.db.update.mockImplementation(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      mocks.deliveryUpdates.push(values);
      return {
        where: vi.fn(() => {
          if (values.status === "processing") {
            return {
              returning: vi.fn(() => Promise.resolve(mocks.retryClaims.shift() ?? [])),
            };
          }
          return Promise.resolve();
        }),
      };
    }),
  }));
}

describe("event reminder recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getShortNamePrefix.mockResolvedValue("");
    mocks.sendEmail.mockResolvedValue({ status: "sent" });
    mocks.db.query.trailheadsTable.findFirst.mockResolvedValue(null);
    setupDeliveryClaims();
  });

  it("does not send again when a durable delivery row already exists", async () => {
    setupSelects([[event({ id: 1010 })], [user({ id: 510 })]]);
    setupDeliveryClaims([[]]);

    await sendEventReminders();

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("records success and schedules a controlled retry after failure", async () => {
    setupSelects([
      [event({ id: 1011 }), event({ id: 1012 })],
      [user({ id: 511, email: "success@example.test" })],
      [user({ id: 512, email: "retry@example.test" })],
    ]);
    mocks.sendEmail
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "failed", error: new Error("temporary SMTP failure") });

    await sendEventReminders();

    expect(mocks.deliveryUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "sent", nextAttemptAt: null }),
      expect.objectContaining({ status: "failed", lastError: "temporary SMTP failure" }),
    ]));
    const failed = mocks.deliveryUpdates.find((update) => update.status === "failed");
    expect(failed?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("retries a due failed delivery after the event leaves the new-reminder window", async () => {
    setupSelects([
      [event({ id: 1013, startTime: new Date(Date.now() + 17 * 60 * 60 * 1000) })],
      [user({ id: 513, email: "failed-retry@example.test" })],
    ]);
    setupDeliveryClaims();
    mocks.retryClaims = [[{ attemptCount: 2 }]];

    await sendEventReminders();

    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "failed-retry@example.test",
    }));
  });

  it("reclaims a stale in-progress delivery after the event leaves the new-reminder window", async () => {
    setupSelects([
      [event({ id: 1014, startTime: new Date(Date.now() + 17 * 60 * 60 * 1000) })],
      [user({ id: 514, email: "stale-claim@example.test" })],
    ]);
    setupDeliveryClaims();
    mocks.retryClaims = [[{ attemptCount: 2 }]];

    await sendEventReminders();

    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "stale-claim@example.test",
    }));
  });

  it("does not create a late reminder for an event below the new-reminder window", async () => {
    setupSelects([
      [event({ id: 1015, startTime: new Date(Date.now() + 17 * 60 * 60 * 1000) })],
      [user({ id: 515, email: "too-late@example.test" })],
    ]);
    setupDeliveryClaims();

    await sendEventReminders();

    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("creates a new durable reminder occurrence when an event is rescheduled", async () => {
    const firstStart = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const rescheduledStart = new Date(Date.now() + 22 * 60 * 60 * 1000);
    setupSelects([
      [event({ id: 1016, startTime: firstStart })],
      [user({ id: 516, email: "rescheduled@example.test" })],
      [event({ id: 1016, startTime: rescheduledStart })],
      [user({ id: 516, email: "rescheduled@example.test" })],
    ]);

    await sendEventReminders();
    await sendEventReminders();

    expect(mocks.insertedDeliveries.map((delivery) => delivery.occurrenceStart)).toEqual([
      firstStart,
      rescheduledStart,
    ]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
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
      [event({ id: 1002, title: "Pod Ride", podIds: ["pod-a"], isAllTeam: false, locationOverride: null })],
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

  it("uses the shared audience rule when isAllTeam overrides a populated pod list", async () => {
    setupSelects([
      [event({ id: 1004, podIds: ["pod-a"], isAllTeam: true })],
      [user({ id: 401, podId: "pod-b", email: "other-pod@example.test" })],
    ]);

    await sendEventReminders();

    expect(mocks.sendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "other-pod@example.test",
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