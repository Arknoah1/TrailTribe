import { Router } from "express";
import { db } from "@workspace/db";
import { broadcastsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

router.get("/messages", requireAuth, async (req, res) => {
  const broadcasts = await db.select().from(broadcastsTable).orderBy(broadcastsTable.createdAt);
  const result = await Promise.all(
    broadcasts.map(async (b) => {
      const sender = b.senderUserId
        ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, b.senderUserId) })
        : null;
      return { ...b, sender: sender ?? null };
    })
  );
  res.json(result);
});

router.post("/messages", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const { subject, body, channel, targetPodIds, isAllTeam } = req.body;

  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
  let recipients = allUsers;
  if (!isAllTeam && targetPodIds?.length) {
    recipients = allUsers.filter((u) => u.podId && targetPodIds.includes(u.podId));
  }

  const emailRecipients = recipients.filter(
    (u) =>
      u.emailNotifications &&
      u.notificationsEnabled &&
      (u.notificationPreferences?.coachMessages !== false)
  );
  const uniqueEmails = new Set(recipients.map((u) => u.email));

  const [broadcast] = await db.insert(broadcastsTable).values({
    senderUserId: me?.id ?? null,
    subject: subject ?? null,
    body,
    channel: channel ?? "email",
    targetPodIds: targetPodIds ?? null,
    isAllTeam: isAllTeam ?? false,
    recipientCount: uniqueEmails.size,
    sentAt: new Date(),
  }).returning();

  const senderName = me ? `${me.firstName} ${me.lastName}` : "Your Coach";
  const emailSubject = subject ? subject : `Message from ${senderName}`;

  (async () => {
    let sent = 0;
    for (const user of emailRecipients) {
      await sendEmail({
        to: user.email,
        subject: emailSubject,
        text: [
          `Message from ${senderName}:`,
          ``,
          body,
          ``,
          `— TrailTribe`,
        ].join("\n"),
        replyTo: me?.email,
      });
      sent++;
    }
    logger.info({ broadcastId: broadcast.id, sent }, "[messages] broadcast emails sent");
  })().catch((err) => logger.error({ err }, "[messages] broadcast email error"));

  res.status(201).json(broadcast);
});

router.post("/messages/contact-coach", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const { subject, body, coachUserId } = req.body;

  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
  const allCoaches = allUsers.filter(
    (u) => (u.role === "coach" || u.role === "admin") && u.emailNotifications,
  );

  let coaches;
  if (coachUserId != null) {
    const target = allCoaches.find((u) => u.id === coachUserId);
    coaches = target ? [target] : [];
  } else {
    const senderPodId = me?.podId ?? null;
    const podCoaches = senderPodId
      ? allCoaches.filter((u) => u.podId === senderPodId)
      : [];
    coaches = podCoaches.length > 0 ? podCoaches : allCoaches;
  }

  const senderName = me ? `${me.firstName} ${me.lastName}` : "A team family";
  const emailSubject = subject ?? `Message from ${senderName}`;

  (async () => {
    let sent = 0;
    for (const coach of coaches) {
      await sendEmail({
        to: coach.email,
        subject: emailSubject,
        text: [
          `${senderName} sent you a message via TrailTribe:`,
          ``,
          body,
          ``,
          `Reply directly to this email to respond.`,
          `— TrailTribe`,
        ].join("\n"),
        replyTo: me?.email,
      });
      sent++;
    }
    logger.info({ sent }, "[messages] contact-coach emails sent");
  })().catch((err) => logger.error({ err }, "[messages] contact-coach email error"));

  res.json({ success: true, message: "Message sent to coach" });
});

export default router;
