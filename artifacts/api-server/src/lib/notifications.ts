import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
