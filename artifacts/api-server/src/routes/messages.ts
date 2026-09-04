import { Router } from "express";
import { db } from "@workspace/db";
import { broadcastsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { sendEmail, emailHealthy } from "../lib/email";
import { logger } from "../lib/logger";
import { getShortNamePrefix } from "./settings";
import { addEmailLinks, createEmailLink } from "../lib/emailLinks";

const router = Router();

router.get("/messages", requireApproved, async (req, res) => {
  const emailConfigured = emailHealthy;
  const broadcasts = await db.select().from(broadcastsTable).orderBy(broadcastsTable.createdAt);
  const result = await Promise.all(
    broadcasts.map(async (b) => {
      const sender = b.senderUserId
        ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, b.senderUserId) })
        : null;
      return { ...b, emailConfigured, sender: sender ?? null };
    })
  );
  res.json(result);
});

router.post("/messages", requireCoachOrAdmin, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const { subject, body, channel, targetPodIds, isAllTeam } = req.body;

  const allUsers = (await db.select().from(usersTable).where(eq(usersTable.isActive, true)))
    .filter((user) =>
      user.role !== "student" ||
      (user.seasonParticipationStatus !== "season_off" && user.seasonParticipationStatus !== "pending")
    );
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
  const uniqueEmails = new Set(emailRecipients.map((u) => u.email));

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
  const orgPrefix = await getShortNamePrefix();
  const emailSubject = `${orgPrefix}${subject ? subject : `Message from ${senderName}`}`;

  const emailNotConfigured = !emailHealthy;

  (async () => {
    let delivered = 0;
    let failed = 0;
    for (const user of emailRecipients) {
      const message = addEmailLinks(
        [
          `Message from ${senderName}:`,
          ``,
          body,
          ``,
          `— TrailTeam`,
        ].join("\n"),
        [createEmailLink("/messages", "Open messages in TrailTeam")],
      );
      const result = await sendEmail({
        to: user.email,
        subject: emailSubject,
        ...message,
        replyTo: me?.email,
      });
      if (result.status === "sent") {
        delivered++;
      } else if (result.status === "failed") {
        failed++;
      }
    }
    await db
      .update(broadcastsTable)
      .set({ deliveredCount: delivered, failedCount: failed })
      .where(eq(broadcastsTable.id, broadcast.id));
    logger.info({ broadcastId: broadcast.id, delivered, failed }, "[messages] broadcast emails sent");
  })().catch((err) => logger.error({ err }, "[messages] broadcast email error"));

  res.status(201).json({ ...broadcast, emailConfigured: !emailNotConfigured });
});

// POST /messages/:id/archive
router.post("/messages/:id/archive", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [updated] = await db
    .update(broadcastsTable)
    .set({ archivedAt: new Date() })
    .where(eq(broadcastsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Broadcast not found" }); return; }
  res.json(updated);
});

// POST /messages/:id/unarchive
router.post("/messages/:id/unarchive", requireCoachOrAdmin, async (req, res) => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [updated] = await db
    .update(broadcastsTable)
    .set({ archivedAt: null })
    .where(eq(broadcastsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Broadcast not found" }); return; }
  res.json(updated);
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
  const orgPrefix = await getShortNamePrefix();
  const emailSubject = `${orgPrefix}${subject ?? `Message from ${senderName}`}`;

  (async () => {
    let sent = 0;
    for (const coach of coaches) {
      const message = addEmailLinks(
        [
          `${senderName} sent you a message via TrailTeam:`,
          ``,
          body,
          ``,
          `Reply directly to this email to respond.`,
          `— TrailTeam`,
        ].join("\n"),
        [createEmailLink("/messages", "Open messages in TrailTeam")],
      );
      await sendEmail({
        to: coach.email,
        subject: emailSubject,
        ...message,
        replyTo: me?.email,
      });
      sent++;
    }
    logger.info({ sent }, "[messages] contact-coach emails sent");
  })().catch((err) => logger.error({ err }, "[messages] contact-coach email error"));

  res.json({ success: true, message: "Message sent to coach" });
});

export default router;
