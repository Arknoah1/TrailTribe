import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, onConflictDoUpdate };
});

vi.mock("@workspace/db", () => ({
  db: { insert: mocks.insert },
  eventRsvpsTable: {},
  eventsTable: {},
  rsvpEmailBatchesTable: {
    eventId: "event_id",
    recipientUserId: "recipient_user_id",
  },
  trailheadsTable: {},
  usersTable: {},
}));

vi.mock("./email", () => ({ sendEmail: vi.fn() }));
vi.mock("../routes/settings", () => ({ getShortNamePrefix: vi.fn() }));

const { queueRsvpConfirmationBatch, RSVP_EMAIL_BATCH_DELAY_MS } =
  await import("./rsvpEmailBatches");

describe("RSVP email batch queue", () => {
  beforeEach(() => {
    mocks.insert.mockClear();
    mocks.values.mockClear();
    mocks.onConflictDoUpdate.mockClear();
  });

  it("upserts one event-recipient batch and waits 30 seconds after the latest RSVP", async () => {
    const now = new Date("2030-09-01T12:00:00.000Z");

    await queueRsvpConfirmationBatch(42, 7, now);

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 42,
      recipientUserId: 7,
      dueAt: new Date(now.getTime() + RSVP_EMAIL_BATCH_DELAY_MS),
      status: "pending",
    }));
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: ["event_id", "recipient_user_id"],
      set: expect.objectContaining({
        dueAt: new Date(now.getTime() + RSVP_EMAIL_BATCH_DELAY_MS),
        status: "pending",
        attempts: 0,
      }),
    }));
  });
});