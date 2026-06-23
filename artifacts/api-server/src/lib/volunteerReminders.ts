import { db } from "@workspace/db";
import { eventsTable, eventTasksTable, eventTaskSignupsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";

async function sendVolunteerReminders(): Promise<void> {
  try {
    const now = new Date();
    // 3-day window: 72–96 hours from now (catches an entire day of run windows)
    const windowStart = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 96 * 60 * 60 * 1000);

    const upcoming = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          gte(eventsTable.startTime, windowStart),
          lte(eventsTable.startTime, windowEnd),
          eq(eventsTable.isArchived, false),
          eq(eventsTable.volunteerTasksEnabled, true),
        )
      );

    if (upcoming.length === 0) return;

    logger.info({ count: upcoming.length }, "[volunteer-reminders] found events in 72-96h window");

    const today = now.toISOString().slice(0, 10);

    for (const event of upcoming) {
      const tasks = await db
        .select()
        .from(eventTasksTable)
        .where(eq(eventTasksTable.eventId, event.id));

      if (tasks.length === 0) continue;

      const taskIds = tasks.map((t) => t.id);
      const signups = await db
        .select()
        .from(eventTaskSignupsTable)
        .where(inArray(eventTaskSignupsTable.eventTaskId, taskIds));

      const uniqueUserIds = [...new Set(signups.map((s) => s.userId))];

      for (const userId of uniqueUserIds) {
        // Durable dedup: check if a volunteer_reminder notification was already
        // sent for this user + event today (using the notifications table as log)
        const alreadySent = await db.query.notificationsTable.findFirst({
          where: and(
            eq(notificationsTable.recipientUserId, userId),
            eq(notificationsTable.type, "volunteer_reminder"),
            eq(notificationsTable.link, `/events/${event.id}`),
            gte(notificationsTable.createdAt, new Date(`${today}T00:00:00Z`)),
          ),
        });

        if (alreadySent) continue;

        const userTasks = signups.filter((s) => s.userId === userId);
        const userTaskDetails = tasks.filter((t) => userTasks.some((s) => s.eventTaskId === t.id));
        const taskTitles = userTaskDetails.map((t) => t.title).join(", ");

        try {
          await db.insert(notificationsTable).values({
            recipientUserId: userId,
            type: "volunteer_reminder",
            title: `Volunteer reminder: ${event.title}`,
            body: `You're volunteering in 3 days for "${event.title}": ${taskTitles}.`,
            link: `/events/${event.id}`,
          });
        } catch (err) {
          logger.warn({ err, userId, eventId: event.id }, "[volunteer-reminders] failed to insert notification");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "[volunteer-reminders] error sending reminders");
  }
}

export function startVolunteerReminderJob(): void {
  logger.info("[volunteer-reminders] starting 3-day volunteer reminder job");
  // Run every hour
  setInterval(() => {
    sendVolunteerReminders().catch((err) =>
      logger.error({ err }, "[volunteer-reminders] unhandled error")
    );
  }, 60 * 60 * 1000);
  // Run immediately on startup
  sendVolunteerReminders().catch((err) =>
    logger.error({ err }, "[volunteer-reminders] startup run error")
  );
}
