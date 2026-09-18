import { Router } from "express";
import { db } from "@workspace/db";
import {
  broadcastRecipientsTable,
  broadcastsTable,
  isOperationalStaffRole,
  usersTable,
} from "@workspace/db";
import {
  and,
  arrayContains,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { isDeliverableEmailAddress, sendEmail, emailHealthy } from "../lib/email";
import { logger } from "../lib/logger";
import { getShortNamePrefix } from "./settings";
import { addNotificationEmailLinks, createEmailLink } from "../lib/emailLinks";

const router = Router();

router.get("/messages", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const viewer = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const emailConfigured = emailHealthy;
  if (
    !viewer.isActive
    || (viewer.role === "student" && viewer.seasonParticipationStatus !== "active")
    || (!isOperationalStaffRole(viewer.role) && viewer.role !== "parent" && viewer.role !== "student")
  ) {
    res.json([]);
    return;
  }

  const baseQuery = db
    .select({
      broadcast: broadcastsTable,
      sender: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        avatarUrl: usersTable.avatarUrl,
        role: usersTable.role,
      },
    })
    .from(broadcastsTable)
    .leftJoin(usersTable, eq(usersTable.id, broadcastsTable.senderUserId));

  const rows = isOperationalStaffRole(viewer.role)
    ? await baseQuery.orderBy(broadcastsTable.createdAt)
    : await (async () => {
        const capturedBroadcastIds = (await db
          .select({ broadcastId: broadcastRecipientsTable.broadcastId })
          .from(broadcastRecipientsTable)
          .where(eq(broadcastRecipientsTable.userId, viewer.id)))
          .map(({ broadcastId }) => broadcastId);
        const legacyPodAudience = viewer.podId
          ? or(
              eq(broadcastsTable.isAllTeam, true),
              arrayContains(broadcastsTable.targetPodIds, [viewer.podId]),
            )
          : eq(broadcastsTable.isAllTeam, true);
        const visibilityConditions = [
          and(isNull(broadcastsTable.audienceCapturedAt), legacyPodAudience),
        ];
        if (capturedBroadcastIds.length > 0) {
          visibilityConditions.push(
            and(
              isNotNull(broadcastsTable.audienceCapturedAt),
              inArray(broadcastsTable.id, capturedBroadcastIds),
            ),
          );
        }
        return baseQuery
          .where(or(...visibilityConditions))
          .orderBy(broadcastsTable.createdAt);
      })();

  res.json(rows.map(({ broadcast, sender }) => ({
    ...broadcast,
    emailConfigured,
    sender: sender ?? null,
  })));
});

router.post("/messages", requireCoachOrAdmin, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const { subject, body, channel, targetPodIds, isAllTeam } = req.body;
  const deliveryChannel = channel ?? "email";

  if (deliveryChannel !== "email") {
    res.status(400).json({
      error: `Broadcast channel "${String(deliveryChannel)}" is not supported`,
    });
    return;
  }

  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });

  const allUsers = (await db.select().from(usersTable).where(and(
    eq(usersTable.isActive, true),
    eq(usersTable.approved, true),
  )))
    .filter((user) =>
      user.isActive &&
      user.approved &&
      (
        user.role !== "student" ||
        (user.seasonParticipationStatus !== "season_off" && user.seasonParticipationStatus !== "pending")
      )
    );
  let recipients = allUsers;
  if (!isAllTeam && targetPodIds?.length) {
    recipients = allUsers.filter((u) => u.podId && targetPodIds.includes(u.podId));
  }

  const eligibleEmailRecipients = recipients.filter(
    (u) =>
      u.emailNotifications &&
      u.notificationsEnabled &&
      (u.notificationPreferences?.coachMessages !== false) &&
      isDeliverableEmailAddress(u.email)
  );
  const emailRecipients = eligibleEmailRecipients.filter(
    (user, index, users) =>
      users.findIndex((candidate) => candidate.email.toLowerCase() === user.email.toLowerCase()) === index,
  );
  const uniqueEmails = new Set(emailRecipients.map((u) => u.email.toLowerCase()));

  const [broadcast] = await db.insert(broadcastsTable).values({
    senderUserId: me?.id ?? null,
    subject: subject ?? null,
    body,
    channel: deliveryChannel,
    targetPodIds: targetPodIds ?? null,
    isAllTeam: isAllTeam ?? false,
    recipientCount: uniqueEmails.size,
    sentAt: new Date(),
    audienceCapturedAt: new Date(),
  }).returning();

  if (recipients.length > 0) {
    await db.insert(broadcastRecipientsTable).values(
      recipients.map((recipient) => ({
        broadcastId: broadcast.id,
        userId: recipient.id,
      })),
    );
  }

  const senderName = me ? `${me.firstName} ${me.lastName}` : "Your Coach";
  const orgPrefix = await getShortNamePrefix();
  const emailSubject = `${orgPrefix}${subject ? subject : `Message from ${senderName}`}`;

  const emailNotConfigured = !emailHealthy;

  (async () => {
    let delivered = 0;
    let failed = 0;
    for (const user of emailRecipients) {
      const message = addNotificationEmailLinks(
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
    (u) => (u.role === "coach" || u.role === "super_admin") && u.emailNotifications,
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
      const message = addNotificationEmailLinks(
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