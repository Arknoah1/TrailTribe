import { db } from "@workspace/db";
import { eventsTable, eventRsvpsTable, usersTable, trailheadsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { sendEmail } from "./email";
import { logger } from "./logger";

function formatEventTime(start: Date): string {
  return start.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const sentReminders = new Set<string>();
let sentRemindersDate = new Date().toISOString().slice(0, 10);

function reminderKey(eventId: number, userId: number): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== sentRemindersDate) {
    sentReminders.clear();
    sentRemindersDate = today;
  }
  return `${eventId}:${userId}:${today}`;
}

async function sendEventReminders(): Promise<void> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

    const upcoming = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          gte(eventsTable.startTime, windowStart),
          lte(eventsTable.startTime, windowEnd),
          eq(eventsTable.isArchived, false),
        )
      );

    if (upcoming.length === 0) return;

    logger.info({ count: upcoming.length }, "[email-reminders] found events in 24h window");

    for (const event of upcoming) {
      const rsvps = await db
        .select()
        .from(eventRsvpsTable)
        .where(
          and(
            eq(eventRsvpsTable.eventId, event.id),
            eq(eventRsvpsTable.status, "attending"),
          )
        );

      if (rsvps.length === 0) continue;

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

      const timeStr = formatEventTime(event.startTime);

      for (const rsvp of rsvps) {
        const key = reminderKey(event.id, rsvp.userId);
        if (sentReminders.has(key)) {
          continue;
        }

        const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, rsvp.userId) });
        if (!user) continue;
        if (!user.emailNotifications) continue;
        if (user.notificationPreferences && user.notificationPreferences.eventReminders === false) continue;

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
          `— TrailTribe`,
        ];

        await sendEmail({
          to: user.email,
          subject: `Reminder: ${event.title} is tomorrow`,
          text: lines.join("\n"),
        });

        sentReminders.add(key);
      }
    }
  } catch (err) {
    logger.error({ err }, "[email-reminders] error sending reminders");
  }
}

const INTERVAL_MS = 60 * 60 * 1000;

export function startEmailReminderJob(): void {
  logger.info("[email-reminders] reminder job started (runs hourly, deduplicates per user per event per day)");
  sendEventReminders().catch(() => {});
  setInterval(() => {
    sendEventReminders().catch(() => {});
  }, INTERVAL_MS);
}
