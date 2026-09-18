import { db } from "@workspace/db";
import { eventsTable, eventReminderDeliveriesTable, usersTable, trailheadsTable, isEventAudienceMember } from "@workspace/db";
import { eq, and, gt, lte, or, sql } from "drizzle-orm";
import { isDeliverableEmailAddress, sendEmail } from "./email";
import { logger } from "./logger";
import { getShortNamePrefix } from "../routes/settings";
import { formatEventDateTime } from "./eventTime";
import { addNotificationEmailLinks, createEmailLink } from "./emailLinks";

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
const OUTAGE_RECOVERY_MS = 6 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 30 * 60 * 1000;
const RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function claimEventReminderDelivery(
  eventId: number,
  userId: number,
  occurrenceStart: Date,
  now: Date,
  allowNewClaim: boolean,
): Promise<number | null> {
  if (allowNewClaim) {
    const inserted = await db
      .insert(eventReminderDeliveriesTable)
      .values({ eventId, userId, occurrenceStart, claimedAt: now })
      .onConflictDoNothing()
      .returning({ attemptCount: eventReminderDeliveriesTable.attemptCount });
    if (inserted[0]) return inserted[0].attemptCount;
  }

  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const claimed = await db
    .update(eventReminderDeliveriesTable)
    .set({
      status: "processing",
      claimedAt: now,
      attemptCount: sql`${eventReminderDeliveriesTable.attemptCount} + 1`,
      nextAttemptAt: null,
      lastError: null,
    })
    .where(and(
      eq(eventReminderDeliveriesTable.eventId, eventId),
      eq(eventReminderDeliveriesTable.userId, userId),
      eq(eventReminderDeliveriesTable.occurrenceStart, occurrenceStart),
      or(
        and(
          eq(eventReminderDeliveriesTable.status, "failed"),
          lte(eventReminderDeliveriesTable.nextAttemptAt, now),
        ),
        and(
          eq(eventReminderDeliveriesTable.status, "processing"),
          lte(eventReminderDeliveriesTable.claimedAt, staleBefore),
        ),
      ),
    ))
    .returning({ attemptCount: eventReminderDeliveriesTable.attemptCount });
  return claimed[0]?.attemptCount ?? null;
}

type ReminderEvent = Pick<typeof eventsTable.$inferSelect, "podIds" | "isAllTeam">;
type ReminderUser = Pick<
  typeof usersTable.$inferSelect,
  "role" | "podId" | "seasonParticipationStatus"
>;

export function isEventReminderRecipient(
  event: ReminderEvent,
  user: ReminderUser,
): boolean {
  if (user.role === "student" && user.seasonParticipationStatus !== "active") return false;
  return isEventAudienceMember(event, user);
}

export async function sendEventReminders(): Promise<void> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + REMINDER_LEAD_MS - OUTAGE_RECOVERY_MS);
    const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MS);

    const upcoming = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          gt(eventsTable.startTime, now),
          lte(eventsTable.startTime, windowEnd),
          eq(eventsTable.isArchived, false),
        )
      );

    if (upcoming.length === 0) return;

    logger.info({ count: upcoming.length }, "[email-reminders] found events due within 24h");

    for (const event of upcoming) {
      const allowNewClaims = event.startTime >= windowStart;
      const activeUsers = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.isActive, true),
            eq(usersTable.approved, true),
          ),
        );
      const recipients = activeUsers.filter((user) =>
        user.isActive
        && user.approved
        && isEventReminderRecipient(event, user)
        && user.emailNotifications
        && user.notificationPreferences?.eventReminders !== false
        && isDeliverableEmailAddress(user.email)
      );

      const trailhead = event.trailheadId
        ? await db.query.trailheadsTable.findFirst({ where: eq(trailheadsTable.id, event.trailheadId) })
        : null;

      const locationLine = event.locationOverride
        ? event.locationOverride
        : trailhead
          ? trailhead.name
          : "Location TBD";

      const mapsUrl = event.googleMapsUrlOverride
        ?? trailhead?.googleMapsUrl
        ?? null;

      const timeStr = formatEventDateTime(event.startTime);

      for (const user of recipients) {
        const attemptCount = await claimEventReminderDelivery(event.id, user.id, event.startTime, now, allowNewClaims);
        if (attemptCount === null) continue;

        const lines = [
          `Hi ${user.firstName},`,
          ``,
          `Just a reminder — you have an upcoming event tomorrow:`,
          ``,
          `  ${event.title}`,
          `  ${timeStr}`,
          `  ${locationLine}`,
          ...(mapsUrl ? [`  Map: ${mapsUrl}`] : []),
          ``,
          `See you on the trail!`,
          `— TrailTeam`,
        ];
        const message = addNotificationEmailLinks(lines.join("\n"), [
          createEmailLink(`/events/${event.id}`, "View event in TrailTeam"),
        ]);

        const orgPrefix = await getShortNamePrefix();
        const result = await sendEmail({
          to: user.email,
          subject: `${orgPrefix}Reminder: ${event.title} is tomorrow`,
          ...message,
        });

        if (result.status === "sent") {
          await db.update(eventReminderDeliveriesTable)
            .set({ status: "sent", sentAt: new Date(), nextAttemptAt: null, lastError: null })
            .where(and(
              eq(eventReminderDeliveriesTable.eventId, event.id),
              eq(eventReminderDeliveriesTable.userId, user.id),
              eq(eventReminderDeliveriesTable.occurrenceStart, event.startTime),
              eq(eventReminderDeliveriesTable.status, "processing"),
            ));
        } else {
          const retryDelay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
          const detail = result.status === "failed" ? errorMessage(result.error) : result.reason;
          await db.update(eventReminderDeliveriesTable)
            .set({
              status: "failed",
              nextAttemptAt: new Date(Date.now() + retryDelay),
              lastError: detail.slice(0, 1000),
            })
            .where(and(
              eq(eventReminderDeliveriesTable.eventId, event.id),
              eq(eventReminderDeliveriesTable.userId, user.id),
              eq(eventReminderDeliveriesTable.occurrenceStart, event.startTime),
              eq(eventReminderDeliveriesTable.status, "processing"),
            ));
          logger.warn({ eventId: event.id, userId: user.id, attemptCount, detail }, "[email-reminders] delivery failed; retry scheduled");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "[email-reminders] error sending reminders");
  }
}

const INTERVAL_MS = 60 * 60 * 1000;

export function startEmailReminderJob(): void {
  logger.info("[email-reminders] reminder job started (runs hourly with durable delivery tracking)");
  sendEventReminders().catch(() => {});
  setInterval(() => {
    sendEventReminders().catch(() => {});
  }, INTERVAL_MS);
}
