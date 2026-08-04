import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { sendEmail } from "./email";

export async function createNotification(
  recipientUserId: number,
  type: string,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  try {
    const recipient = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, recipientUserId),
    });
    if (!recipient || !recipient.notificationsEnabled) return;
    await db.insert(notificationsTable).values({
      recipientUserId,
      type,
      title,
      body,
      link: link ?? null,
      isRead: false,
    });
  } catch (err) {
    console.error("[notifications] Failed to create notification:", err);
  }
}

/**
 * Notify all coaches and admins that a new family is waiting for approval.
 * Sends both an in-app notification and an optional email (best-effort, non-blocking).
 */
export async function notifyCoachesOfNewFamily(newUser: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<void> {
  try {
    const coaches = await db.query.usersTable.findMany({
      where: or(eq(usersTable.role, "coach"), eq(usersTable.role, "admin")),
    });

    if (coaches.length === 0) return;

    const fullName = `${newUser.firstName} ${newUser.lastName}`.trim();

    // In-app notifications for all coaches/admins
    await Promise.all(
      coaches.map((coach) =>
        createNotification(
          coach.id,
          "new_family_pending",
          "New family waiting for approval",
          `${fullName} has registered and is waiting for approval.`,
          "/admin"
        )
      )
    );

    // Email notifications (best-effort) for coaches/admins with email enabled
    const emailRecipients = coaches
      .filter((c) => c.emailNotifications && c.email)
      .map((c) => c.email);

    if (emailRecipients.length > 0) {
      await sendEmail({
        to: emailRecipients,
        subject: "New family waiting for approval — TrailTribe",
        text: [
          `Hi,`,
          ``,
          `A new family has registered on TrailTribe and is waiting for your approval.`,
          ``,
          `Name:  ${fullName}`,
          `Email: ${newUser.email}`,
          ``,
          `Visit the Admin page to approve or review their account.`,
          ``,
          `— TrailTribe`,
        ].join("\n"),
      });
    }
  } catch (err) {
    console.error("[notifications] Failed to notify coaches of new family:", err);
  }
}
