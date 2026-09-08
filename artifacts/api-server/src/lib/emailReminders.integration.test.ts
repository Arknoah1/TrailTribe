import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  eventReminderDeliveriesTable,
  eventsTable,
  usersTable,
} from "@workspace/db";
import { claimEventReminderDelivery } from "./emailReminders";

describe("event reminder delivery claims with PostgreSQL uniqueness", () => {
  let eventId: number;
  let userId: number;
  let occurrenceStart: Date;

  beforeAll(async () => {
    const uniqueSuffix = `${process.pid}-${Date.now()}`;
    const [user] = await db.insert(usersTable).values({
      firstName: "Reminder",
      lastName: "Race Test",
      email: `reminder-race-${uniqueSuffix}@example.test`,
      clerkUserId: `reminder-race-${uniqueSuffix}`,
      approved: true,
    }).returning();
    userId = user.id;

    // Keep this fixture outside the live reminder job's scan window. The test
    // exercises the claim directly and must never trigger a real email.
    occurrenceStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const [event] = await db.insert(eventsTable).values({
      title: "Concurrent reminder claim test",
      eventType: "practice",
      startTime: occurrenceStart,
      iCalUid: `reminder-race-${uniqueSuffix}`,
      createdByUserId: userId,
      isAllTeam: true,
    }).returning();
    eventId = event.id;
  });

  afterAll(async () => {
    if (eventId) {
      await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
    }
    if (userId) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("allows exactly one simultaneous worker to claim the recipient", async () => {
    const now = new Date();
    const claims = await Promise.all([
      claimEventReminderDelivery(eventId, userId, occurrenceStart, now, true),
      claimEventReminderDelivery(eventId, userId, occurrenceStart, now, true),
    ]);

    const workersAllowedToSend = claims.filter((attemptCount) => attemptCount !== null);
    expect(workersAllowedToSend).toEqual([1]);

    const rows = await db
      .select()
      .from(eventReminderDeliveriesTable)
      .where(eq(eventReminderDeliveriesTable.eventId, eventId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventId,
      userId,
      status: "processing",
      attemptCount: 1,
    });
  });
});