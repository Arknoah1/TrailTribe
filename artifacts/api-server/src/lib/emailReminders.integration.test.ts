import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
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

  it("allows exactly one fresh claim after the event is rescheduled", async () => {
    const originalOccurrenceStart = occurrenceStart;
    const originalClaimedAt = new Date();
    const originalSentAt = new Date(originalClaimedAt.getTime() + 1_000);

    await db
      .update(eventReminderDeliveriesTable)
      .set({
        status: "sent",
        sentAt: originalSentAt,
      })
      .where(and(
        eq(eventReminderDeliveriesTable.eventId, eventId),
        eq(eventReminderDeliveriesTable.userId, userId),
        eq(eventReminderDeliveriesTable.occurrenceStart, originalOccurrenceStart),
      ));

    const rescheduledOccurrenceStart = new Date(originalOccurrenceStart.getTime() + 60 * 60 * 1000);
    await db
      .update(eventsTable)
      .set({ startTime: rescheduledOccurrenceStart })
      .where(eq(eventsTable.id, eventId));

    const rescheduledClaimedAt = new Date(originalClaimedAt.getTime() + 2_000);
    const claims = await Promise.all([
      claimEventReminderDelivery(eventId, userId, rescheduledOccurrenceStart, rescheduledClaimedAt, true),
      claimEventReminderDelivery(eventId, userId, rescheduledOccurrenceStart, rescheduledClaimedAt, true),
    ]);

    expect(claims.filter((attemptCount) => attemptCount !== null)).toEqual([1]);

    const rows = await db
      .select()
      .from(eventReminderDeliveriesTable)
      .where(and(
        eq(eventReminderDeliveriesTable.eventId, eventId),
        eq(eventReminderDeliveriesTable.userId, userId),
      ))
      .orderBy(asc(eventReminderDeliveriesTable.occurrenceStart));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      eventId,
      userId,
      occurrenceStart: originalOccurrenceStart,
      status: "sent",
      attemptCount: 1,
      sentAt: originalSentAt,
    });
    expect(rows[1]).toMatchObject({
      eventId,
      userId,
      occurrenceStart: rescheduledOccurrenceStart,
      status: "processing",
      attemptCount: 1,
      sentAt: null,
    });
  });
});
