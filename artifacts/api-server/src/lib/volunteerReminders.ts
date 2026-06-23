import { db } from "@workspace/db";
import { eventsTable, eventTasksTable, eventTaskSignupsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { logger } from "./logger";

const sentVolunteerReminders = new Set<string>();
let sentRemindersDate = new Date().toISOString().slice(0, 10);

function reminderKey(eventId: number, userId: number): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== sentRemindersDate) {
    sentVolunteerReminders.clear();
    sentRemindersDate = today;
  }
  return `vol:${eventId}:${userId}:${today}`;
}

async function sendVolunteerReminders(): Promise<void> {
  try {
    const now = new Date();
    // 3-day window: 71-73 hours from now
    const windowStart = new Date(now.getTime() + 71 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 73 * 60 * 60 * 1000);

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

    logger.info({ count: upcoming.length }, "[volunteer-reminders] found events in 3-day window");

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
        const key = reminderKey(event.id, userId);
        if (sentVolunteerReminders.has(key)) continue;

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
          sentVolunteerReminders.add(key);
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
