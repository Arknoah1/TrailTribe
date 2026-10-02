import { Router } from "express";
import { db } from "@workspace/db";
import {
  broadcastImagesTable,
  broadcastRecipientsTable,
  broadcastsTable,
  isOperationalStaffRole,
  hasUserRole,
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
  sql,
} from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { isDeliverableEmailAddress, sendEmail, emailHealthy } from "../lib/email";
import { logger } from "../lib/logger";
import { getShortNamePrefix } from "./settings";
import { addNotificationEmailLinks, buildAppUrl, createEmailLink } from "../lib/emailLinks";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  DISCUSSION_IMAGE_LIFECYCLE_LOCK,
  getDbObjectAclPolicy,
  storePendingObjectAcl,
  type ObjectAclPolicy,
} from "../lib/objectAcl";
import {
  MAX_PRIVATE_IMAGE_BYTES,
  MAX_PRIVATE_IMAGE_COUNT,
  PRIVATE_IMAGE_TYPES,
  loadVerifiedPrivateImage,
  validatePrivateImageTotal,
} from "../lib/privateImages";
import { getBodyFormat, hasInlineMarkdownImages, renderEmailContent } from "../lib/richContent";
import {
  RequestBroadcastImageUploadUrlBody,
  RequestBroadcastImageUploadUrlResponse,
} from "@workspace/api-zod";
import type { PrivateImageRecord, VerifiedPrivateImage } from "../lib/privateImages";
import { Readable } from "stream";

const router = Router();
const objectStorageService = new ObjectStorageService();
const BROADCAST_IMAGE_PATH = /^\/objects\/broadcast-images\/[A-Za-z0-9._-]+$/;
const BROADCAST_EMAIL_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;

class BroadcastImageValidationError extends Error {}

async function validateOwnedBroadcastImages(
  clerkUserId: string,
  value: unknown,
): Promise<{ records: PrivateImageRecord[]; verified: VerifiedPrivateImage[] }> {
  if (value == null) return { records: [], verified: [] };
  if (!Array.isArray(value) || value.length > MAX_PRIVATE_IMAGE_COUNT) {
    throw new BroadcastImageValidationError(`Attach no more than ${MAX_PRIVATE_IMAGE_COUNT} images`);
  }
  if (new Set(value).size !== value.length || value.some((path) =>
    typeof path !== "string" || !BROADCAST_IMAGE_PATH.test(path),
  )) {
    throw new BroadcastImageValidationError("Invalid broadcast image");
  }

  const records: PrivateImageRecord[] = [];
  for (const objectPath of value as string[]) {
    try {
      const [alreadyAttached, file, policy] = await Promise.all([
        db.query.broadcastImagesTable.findFirst({
          where: eq(broadcastImagesTable.objectPath, objectPath),
        }),
        objectStorageService.getObjectEntityFile(objectPath),
        getDbObjectAclPolicy(objectPath),
      ]);
      if (alreadyAttached) throw new BroadcastImageValidationError("This image is already attached to a broadcast");
      if (!policy || policy.owner !== clerkUserId) {
        throw new BroadcastImageValidationError("You can only attach images you uploaded");
      }
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? 0);
      const contentType = metadata.contentType ?? "";
      if (!PRIVATE_IMAGE_TYPES.has(contentType) || !Number.isFinite(size) || size <= 0 || size > MAX_PRIVATE_IMAGE_BYTES) {
        throw new BroadcastImageValidationError("Attachment must be a supported image under 10 MB");
      }
      if (!metadata.generation) throw new BroadcastImageValidationError("Could not verify image upload");
      records.push({
        objectPath,
        contentType,
        size,
        generation: String(metadata.generation),
      });
    } catch (error) {
      if (error instanceof BroadcastImageValidationError) throw error;
      throw new BroadcastImageValidationError("Invalid broadcast image");
    }
  }
  const totalBytes = records.reduce((total, image) => total + image.size, 0);
  if (totalBytes > BROADCAST_EMAIL_TOTAL_IMAGE_BYTES) {
    throw new BroadcastImageValidationError(
      "Images exceed the 15 MB total email attachment limit. Attach up to four images, each no larger than 10 MB.",
    );
  }
  try {
    validatePrivateImageTotal(records);
  } catch (error) {
    throw new BroadcastImageValidationError(error instanceof Error ? error.message : "Invalid broadcast images");
  }
  const verified = await Promise.all(records.map((record) => loadVerifiedPrivateImage(record)));
  return { records, verified };
}

async function getBroadcastImagePaths(broadcastId: number): Promise<string[]> {
  const rows = await db.select({ objectPath: broadcastImagesTable.objectPath })
    .from(broadcastImagesTable)
    .where(eq(broadcastImagesTable.broadcastId, broadcastId));
  return rows.map((row) => row.objectPath);
}

function isEligibleBroadcastViewer(viewer: typeof usersTable.$inferSelect): boolean {
  return viewer.isActive
    && !(viewer.role === "student" && viewer.seasonParticipationStatus !== "active")
    && (isOperationalStaffRole(viewer) || hasUserRole(viewer, "parent") || hasUserRole(viewer, "student"));
}

async function canViewBroadcastImages(
  viewer: typeof usersTable.$inferSelect,
  broadcast: typeof broadcastsTable.$inferSelect,
): Promise<boolean> {
  if (!isEligibleBroadcastViewer(viewer)) return false;
  if (isOperationalStaffRole(viewer)) return true;
  if (broadcast.audienceCapturedAt) {
    const captured = await db.query.broadcastRecipientsTable.findFirst({
      where: and(
        eq(broadcastRecipientsTable.broadcastId, broadcast.id),
        eq(broadcastRecipientsTable.userId, viewer.id),
      ),
    });
    return Boolean(captured);
  }
  return broadcast.isAllTeam || Boolean(
    viewer.podId && broadcast.targetPodIds?.includes(viewer.podId),
  );
}

router.post("/messages/attachments/request-url", requireCoachOrAdmin, async (req, res) => {
  const parsed = RequestBroadcastImageUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported image under 10 MB" });
    return;
  }
  try {
    const clerkUserId = (req as any).clerkUserId as string;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL("broadcast-images");
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const policy: ObjectAclPolicy = { owner: clerkUserId, visibility: "private", aclRules: [] };
    await storePendingObjectAcl(objectPath, policy);
    res.json(RequestBroadcastImageUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Error generating broadcast image upload URL");
    res.status(500).json({ error: "Failed to prepare image upload" });
  }
});

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
  if (!isEligibleBroadcastViewer(viewer)) {
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

  const rows = isOperationalStaffRole(viewer)
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

  res.json(await Promise.all(rows.map(async ({ broadcast, sender }) => ({
    ...broadcast,
    imageObjectPaths: await getBroadcastImagePaths(broadcast.id),
    emailConfigured,
    sender: sender ?? null,
  }))));
});

router.post("/messages", requireCoachOrAdmin, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const { subject, body, channel, targetPodIds, isAllTeam } = req.body;
  const bodyFormat = req.body.bodyFormat ?? "plain";
  const deliveryChannel = channel ?? "email";

  if (deliveryChannel !== "email") {
    res.status(400).json({
      error: `Broadcast channel "${String(deliveryChannel)}" is not supported`,
    });
    return;
  }
  if (typeof body !== "string" || body.length === 0) {
    res.status(400).json({ error: "body required" });
    return;
  }
  if (bodyFormat !== "plain" && bodyFormat !== "markdown") {
    res.status(400).json({ error: "bodyFormat must be plain or markdown" });
    return;
  }
  if (bodyFormat === "markdown" && hasInlineMarkdownImages(body)) {
    res.status(400).json({ error: "Inline Markdown images are not supported. Upload pictures as attachments instead." });
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

  const createBroadcast = async (
    executor: Pick<typeof db, "insert">,
    records: PrivateImageRecord[],
  ) => {
    const [created] = await executor.insert(broadcastsTable).values({
      senderUserId: me?.id ?? null,
      subject: subject ?? null,
      body,
      bodyFormat,
      channel: deliveryChannel,
      targetPodIds: targetPodIds ?? null,
      isAllTeam: isAllTeam ?? false,
      recipientCount: uniqueEmails.size,
      sentAt: new Date(),
      audienceCapturedAt: new Date(),
    }).returning();
    if (recipients.length > 0) {
      await executor.insert(broadcastRecipientsTable).values(
        recipients.map((recipient) => ({
          broadcastId: created.id,
          userId: recipient.id,
        })),
      );
    }
    if (records.length > 0) {
      await executor.insert(broadcastImagesTable).values(
        records.map((record) => ({ ...record, broadcastId: created.id })),
      );
    }
    return created;
  };
  let broadcast: typeof broadcastsTable.$inferSelect;
  let verifiedBroadcastImages: VerifiedPrivateImage[] = [];
  try {
    if (req.body.imageObjectPaths == null) {
      broadcast = await createBroadcast(db, []);
    } else {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${DISCUSSION_IMAGE_LIFECYCLE_LOCK}))`);
        const validated = await validateOwnedBroadcastImages(clerkUserId, req.body.imageObjectPaths);
        return { broadcast: await createBroadcast(tx, validated.records), verified: validated.verified };
      });
      broadcast = result.broadcast;
      verifiedBroadcastImages = result.verified;
    }
  } catch (error) {
    if (error instanceof BroadcastImageValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const senderName = me ? `${me.firstName} ${me.lastName}` : "Your Coach";
  const orgPrefix = await getShortNamePrefix();
  const emailSubject = `${orgPrefix}${subject ? subject : `Message from ${senderName}`}`;

  const emailNotConfigured = !emailHealthy;

  (async () => {
    let delivered = 0;
    let failed = 0;
    for (const user of emailRecipients) {
      const cidImages = verifiedBroadcastImages.map((_image, index) => ({
        cid: `broadcast-${broadcast.id}-${index}@trailteam`,
        filename: `broadcast-image-${index + 1}.${verifiedBroadcastImages[index].contentType.split("/")[1]}`,
      }));
      const richContent = renderEmailContent(body, bodyFormat, cidImages);
      const links = [createEmailLink("/messages", "Open messages in TrailTeam")];
      const message = addNotificationEmailLinks(
        [
          `Message from ${senderName}:`,
          ``,
          richContent.text,
          ``,
          `— TrailTeam`,
        ].join("\n"),
        links,
      );
      const safeMessagesUrl = buildAppUrl("/messages")?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const safeSettingsUrl = buildAppUrl("/profile?tab=notifications")?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const result = await sendEmail({
        to: user.email,
        subject: emailSubject,
        ...message,
        html: `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#0a0c10"><main style="max-width:640px;margin:0 auto;padding:24px"><p>Message from ${senderName.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)}</p>${richContent.html}<p>— TrailTeam</p>${safeMessagesUrl ? `<p><a href="${safeMessagesUrl}">Open messages in TrailTeam</a></p>` : ""}<p style="font-size:12px;color:#59636e">To update notification preferences, update your notification settings in TrailTeam${safeSettingsUrl ? `: <a href="${safeSettingsUrl}">notification settings</a>` : ""}.</p></main></body></html>`,
        attachments: verifiedBroadcastImages.map((image, index) => ({
          filename: cidImages[index].filename,
          content: image.bytes,
          contentType: image.contentType,
          cid: cidImages[index].cid,
        })),
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

  res.status(201).json({
    ...broadcast,
    imageObjectPaths: await getBroadcastImagePaths(broadcast.id),
    emailConfigured: !emailNotConfigured,
  });
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
  res.json({ ...updated, imageObjectPaths: await getBroadcastImagePaths(updated.id) });
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
  res.json({ ...updated, imageObjectPaths: await getBroadcastImagePaths(updated.id) });
});

router.get("/messages/attachments/*path", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  const viewer = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = req.params.path;
  const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
  if (!BROADCAST_IMAGE_PATH.test(objectPath)) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  const attachment = await db.query.broadcastImagesTable.findFirst({
    where: eq(broadcastImagesTable.objectPath, objectPath),
  });
  if (!attachment) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  const broadcast = await db.query.broadcastsTable.findFirst({
    where: eq(broadcastsTable.id, attachment.broadcastId),
  });
  if (!broadcast || !(await canViewBroadcastImages(viewer, broadcast))) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  try {
    const image = await loadVerifiedPrivateImage(attachment);
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.size));
    res.setHeader("Cache-Control", "private, no-store");
    res.end(image.bytes);
  } catch (error) {
    req.log.warn({ err: error }, "Unable to serve verified broadcast image");
    res.status(404).json({ error: "Image not found" });
  }
});

router.post("/messages/contact-coach", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  const { subject, body, coachUserId } = req.body;

  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
  const allCoaches = allUsers.filter(
    (u) => isOperationalStaffRole(u) && u.emailNotifications,
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