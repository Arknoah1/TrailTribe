import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const candidate = {
    id: 1,
    eventId: 42,
    recipientUserId: 7,
    dueAt: new Date("2030-09-01T12:00:00.000Z"),
    status: "pending",
    attempts: 0,
    lockedAt: null,
    sentAt: null,
    lastError: null,
    createdAt: new Date("2030-09-01T11:59:00.000Z"),
    updatedAt: new Date("2030-09-01T11:59:00.000Z"),
  };
  return {
    candidate,
    transactionCalls: 0,
    selectResults: [] as unknown[][],
    finishUpdates: [] as Record<string, unknown>[],
    sendEmail: vi.fn(),
    getShortNamePrefix: vi.fn(),
    db: {
      transaction: vi.fn(),
      query: {
        usersTable: { findFirst: vi.fn() },
        eventsTable: { findFirst: vi.fn() },
        trailheadsTable: { findFirst: vi.fn() },
      },
      select: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => [left, right],
  inArray: (left: unknown, right: unknown) => [left, right],
  lte: (left: unknown, right: unknown) => [left, right],
  or: (...args: unknown[]) => args,
  sql: () => "attempts + 1",
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  eventRsvpsTable: { eventId: "rsvp_event_id", status: "rsvp_status", userId: "rsvp_user_id" },
  eventsTable: { id: "event_id" },
  rsvpEmailBatchesTable: {
    id: "batch_id",
    eventId: "batch_event_id",
    recipientUserId: "batch_recipient_user_id",
    dueAt: "batch_due_at",
    status: "batch_status",
    lockedAt: "batch_locked_at",
    attempts: "batch_attempts",
  },
  trailheadsTable: { id: "trailhead_id" },
  usersTable: { id: "user_id", householdId: "household_id" },
}));

vi.mock("./email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("../routes/settings", () => ({ getShortNamePrefix: mocks.getShortNamePrefix }));

const { processDueRsvpEmailBatches } = await import("./rsvpEmailBatches");

function setupDatabase() {
  mocks.transactionCalls = 0;
  mocks.selectResults = [];
  mocks.finishUpdates = [];
  mocks.candidate.status = "pending";
  mocks.candidate.attempts = 0;

  mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    mocks.transactionCalls += 1;
    const candidate = mocks.transactionCalls === 1 ? mocks.candidate : null;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                for: vi.fn().mockResolvedValue(candidate ? [candidate] : []),
              })),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue(candidate ? [{ ...candidate, status: "processing", attempts: 1 }] : []),
          })),
        })),
      })),
    };
    return callback(tx);
  });

  mocks.db.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(mocks.selectResults.shift() ?? [])),
    })),
  }));
  mocks.db.update.mockImplementation(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      mocks.finishUpdates.push(values);
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    }),
  }));
  mocks.db.query.usersTable.findFirst.mockResolvedValue({
    id: 7,
    firstName: "Noah",
    lastName: "Smith",
    email: "noah@example.test",
    emailNotifications: true,
    householdId: 10,
  });
  mocks.db.query.eventsTable.findFirst.mockResolvedValue({
    id: 42,
    title: "Evergreen Dig Day",
    startTime: new Date("2030-09-05T16:00:00.000Z"),
    trailheadId: null,
    locationOverride: "Loop Loop Trails",
  });
  mocks.db.query.trailheadsTable.findFirst.mockResolvedValue(null);
  mocks.getShortNamePrefix.mockResolvedValue("");
  mocks.sendEmail.mockResolvedValue({ status: "sent" });
}

describe("RSVP email batch processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDatabase();
  });

  it("claims one batch and sends one email containing all attending family members", async () => {
    mocks.selectResults = [
      [{ id: 7 }, { id: 8 }],
      [{ userId: 7 }, { userId: 8 }],
      [
        { id: 7, firstName: "Noah", lastName: "Smith" },
        { id: 8, firstName: "Riley", lastName: "Smith" },
      ],
    ];

    await processDueRsvpEmailBatches();

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      to: "noah@example.test",
      subject: "You're set for Evergreen Dig Day",
    });
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain("  Noah Smith");
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain("  Riley Smith");
    expect(mocks.finishUpdates).toContainEqual(expect.objectContaining({ status: "sent" }));
  });

  it("skips delivery when the latest household snapshot has no attending RSVPs", async () => {
    mocks.selectResults = [
      [{ id: 7 }, { id: 8 }],
      [],
    ];

    await processDueRsvpEmailBatches();

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.finishUpdates).toContainEqual(expect.objectContaining({ status: "skipped" }));
  });

  it("returns failed sends to the durable queue for retry", async () => {
    mocks.selectResults = [
      [{ id: 7 }],
      [{ userId: 7 }],
      [{ id: 7, firstName: "Noah", lastName: "Smith" }],
    ];
    mocks.sendEmail.mockResolvedValue({ status: "failed", error: new Error("SMTP unavailable") });

    await processDueRsvpEmailBatches();

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.finishUpdates).toContainEqual(expect.objectContaining({
      status: "pending",
      lastError: "SMTP unavailable",
    }));
    expect(mocks.db.update).toHaveBeenCalledWith(expect.anything());
  });
});