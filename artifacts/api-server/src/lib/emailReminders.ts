import { db } from "@workspace/db";
import { eventsTable, usersTable, trailheadsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { isDeliverableEmailAddress, sendEmail } from "./email";
import { logger } from "./logger";
import { getShortNamePrefix } from "../routes/settings";
import { formatEventDateTime } from "./eventTime";
import { addEmailLinks, createEmailLink } from "./emailLinks";

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

type ReminderEvent = Pick<typeof eventsTable.$inferSelect, "podIds">;
type ReminderUser = Pick<
  typeof usersTable.$inferSelect,
  "role" | "podId" | "seasonParticipationStatus"
>;

export function isEventReminderRecipient(
  event: ReminderEvent,
  user: ReminderUser,
): boolean {
  if (user.role === "student" && user.seasonParticipationStatus !== "active") return false;
  if (user.role === "coach" || user.role === "super_admin") return true;
  if (!event.podIds || event.podIds.length === 0) return true;
  return user.podId != null && event.podIds.includes(user.podId);
}

export async function sendEventReminders(): Promise<void> {
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
        const key = reminderKey(event.id, user.id);
        if (sentReminders.has(key)) {
          continue;
        }

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
        const message = addEmailLinks(lines.join("\n"), [
          createEmailLink(`/events/${event.id}`, "View event in TrailTeam"),
        ]);

        const orgPrefix = await getShortNamePrefix();
        await sendEmail({
          to: user.email,
          subject: `${orgPrefix}Reminder: ${event.title} is tomorrow`,
          ...message,
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
