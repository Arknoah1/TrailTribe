import { Router } from "express";
import { Readable } from "stream";
import { db } from "@workspace/db";
import {
  boardThreadsTable,
  boardThreadReportsTable,
  boardHiddenMembersTable,
  boardPostsTable,
  boardAttachmentsTable,
  usersTable,
  eventsTable,
  boardReactionsTable,
  notificationsTable,
  isEventAudienceMember,
  isOperationalStaffRole,
} from "@workspace/db";
import { eq, and, desc, isNull, or, inArray, gt, gte, sql, arrayContains } from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin, hasStudentAccess } from "../middlewares/requireAuth";
import { createNotification } from "../lib/notifications";
import { findObjectionableTerms } from "../lib/board-safety";
import { logger } from "../lib/logger";
import { sendEmail, isDeliverableEmailAddress } from "../lib/email";
import { getShortNamePrefix } from "./settings";
import { buildAppUrl, createEmailLink, addNotificationEmailLinks } from "../lib/emailLinks";
import { hasInlineMarkdownImages, renderEmailContent } from "../lib/richContent";
import {
  MAX_PRIVATE_IMAGE_BYTES,
  MAX_PRIVATE_IMAGE_COUNT,
  PRIVATE_IMAGE_TYPES,
  loadVerifiedPrivateImage,
  validatePrivateImageTotal,
} from "../lib/privateImages";
import { promises as dnsPromises } from "dns";
import * as http from "http";
import * as https from "https";
import {
  fallbackLinkPreview,
  isPrivatePreviewAddress,
  parseLinkPreviewHtml,
  safeImageDataUri,
  type LinkPreviewMetadata,
} from "../lib/linkPreview";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  getDbObjectAclPolicy,
  storePendingObjectAcl,
  DISCUSSION_IMAGE_LIFECYCLE_LOCK,
  type ObjectAclPolicy,
} from "../lib/objectAcl";
import {
  RequestBoardImageUploadUrlBody,
  RequestBoardImageUploadUrlResponse,
  SetBoardThreadMuteBody,
  SetBoardThreadMuteParams,
  SetBoardThreadMuteResponse,
  CreateBoardThreadReportBody,
  CreateBoardThreadReportParams,
  CreateBoardPostReportParams,
  CreateBoardPostReportBody,
  ListBoardReportsResponse,
  ResolveBoardReportParams,
  ResolveBoardReportBody,
  SetHiddenBoardMemberParams,
  SetHiddenBoardMemberBody,
  SetHiddenBoardMemberResponse,
  ListHiddenBoardMembersResponse,
  ListBoardPostingRestrictionsResponse,
  SetBoardPostingRestrictionParams,
  SetBoardPostingRestrictionBody,
  SetBoardPostingRestrictionResponse,
} from "@workspace/api-zod";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;
const objectStorageService = new ObjectStorageService();
const DISCUSSION_IMAGE_PATH = /^\/objects\/discussion-images\/[A-Za-z0-9._-]+$/;

class DiscussionImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscussionImageValidationError";
  }
}

async function validateOwnedDiscussionImages(
  clerkUserId: string,
  value: unknown,
): Promise<Array<{ objectPath: string; contentType: string; size: number; generation: string }>> {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_PRIVATE_IMAGE_COUNT) {
    throw new DiscussionImageValidationError(`Attach no more than ${MAX_PRIVATE_IMAGE_COUNT} images`);
  }
  const paths = [...new Set(value)];
  if (paths.length !== value.length || paths.some((path) => typeof path !== "string" || !DISCUSSION_IMAGE_PATH.test(path))) {
    throw new DiscussionImageValidationError("Invalid discussion image");
  }
  const attachments: Array<{ objectPath: string; contentType: string; size: number; generation: string }> = [];
  for (const path of paths) {
    const existing = await db.query.boardAttachmentsTable.findFirst({
      where: eq(boardAttachmentsTable.objectPath, path),
    });
    if (existing) throw new DiscussionImageValidationError("This image is already attached to a discussion");
    try {
      const file = await objectStorageService.getObjectEntityFile(path);
      const policy = await getDbObjectAclPolicy(path);
      if (!policy || policy.owner !== clerkUserId) {
        throw new DiscussionImageValidationError("You can only attach images you uploaded");
      }
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? 0);
      if (!PRIVATE_IMAGE_TYPES.has(metadata.contentType ?? "") || !Number.isFinite(size) || size <= 0 || size > MAX_PRIVATE_IMAGE_BYTES) {
        throw new DiscussionImageValidationError("Attachment must be a supported image under 10 MB");
      }
      if (!metadata.generation) throw new DiscussionImageValidationError("Could not verify image upload");
      attachments.push({
        objectPath: path,
        contentType: metadata.contentType!,
        size,
        generation: String(metadata.generation),
      });
    } catch (error) {
      if (error instanceof DiscussionImageValidationError) throw error;
      throw new DiscussionImageValidationError("Invalid discussion image");
    }
  }
  try {
    validatePrivateImageTotal(attachments);
  } catch (error) {
    throw new DiscussionImageValidationError(error instanceof Error ? error.message : "Images exceed the 15 MB total email attachment limit");
  }
  return attachments;
}

// POST /board/attachments/request-url — reserve a discussion-only private image.
router.post("/board/attachments/request-url", requireApproved, async (req, res) => {
  const parsed = RequestBoardImageUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported image under 10 MB" });
    return;
  }

  try {
    const clerkUserId = (req as any).clerkUserId as string;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL("discussion-images");
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const ownerOnlyPolicy: ObjectAclPolicy = {
      owner: clerkUserId,
      visibility: "private",
      aclRules: [],
    };
    await storePendingObjectAcl(objectPath, ownerOnlyPolicy);
    res.json(RequestBoardImageUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Error generating discussion image upload URL");
    res.status(500).json({ error: "Failed to prepare image upload" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichThread(
  thread: typeof boardThreadsTable.$inferSelect,
  me: typeof usersTable.$inferSelect,
) {
  const author = thread.authorUserId
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, thread.authorUserId) })
    : null;
  const event = thread.eventId
    ? await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, thread.eventId) })
    : null;
  const attachments = await db.select({ objectPath: boardAttachmentsTable.objectPath })
    .from(boardAttachmentsTable)
    .where(eq(boardAttachmentsTable.threadId, thread.id));
  const hiddenByMe = thread.authorUserId
    ? Boolean(await db.query.boardHiddenMembersTable.findFirst({
        where: and(
          eq(boardHiddenMembersTable.hiderUserId, me.id),
          eq(boardHiddenMembersTable.hiddenUserId, thread.authorUserId),
        ),
      }))
    : false;
  return {
    ...thread,
    imageObjectPaths: attachments.map(({ objectPath }) => objectPath),
    // Event discussion titles are derived from the current event name so a
    // renamed event cannot leave its linked discussion showing stale context.
    title: event ? `Discussion: ${event.title}` : thread.title,
    author: author ? { id: author.id, firstName: author.firstName, lastName: author.lastName, avatarUrl: author.avatarUrl ?? null } : null,
    event: event ? { id: event.id, title: event.title, startTime: event.startTime } : null,
    hiddenByMe,
    permissions: getThreadPermissions(me, thread),
  };
}

const ALLOWED_REACTIONS = ["helpful", "like", "celebrate"] as const;
type ReactionType = typeof ALLOWED_REACTIONS[number];
const REACTION_LABELS: Record<ReactionType, string> = {
  helpful: "Helpful",
  like: "Like",
  celebrate: "Celebrate",
};
type ReactionTarget = "thread" | "post";

async function getReactionSummary(
  targetType: ReactionTarget,
  targetId: number,
  userId: number,
) {
  const rows = await db.select({
    reaction: boardReactionsTable.reaction,
    count: sql<number>`count(*)::int`,
    reacted: sql<boolean>`bool_or(${boardReactionsTable.userId} = ${userId})`,
  }).from(boardReactionsTable).where(
    targetType === "thread"
      ? eq(boardReactionsTable.threadId, targetId)
      : eq(boardReactionsTable.postId, targetId)
  ).groupBy(boardReactionsTable.reaction);

  return Object.fromEntries(ALLOWED_REACTIONS.map((reaction) => {
    const row = rows.find((candidate) => candidate.reaction === reaction);
    return [reaction, { count: row?.count ?? 0, reacted: row?.reacted ?? false }];
  }));
}

// GET /board/reactions/:targetType/:targetId — list visible members for one reaction
router.get("/board/reactions/:targetType/:targetId", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const targetType = str(req.params.targetType);
  const targetId = parseInt(str(req.params.targetId), 10);
  const reaction = typeof req.query.reaction === "string" ? req.query.reaction : "";
  if ((targetType !== "thread" && targetType !== "post") || !Number.isInteger(targetId) ||
      !ALLOWED_REACTIONS.includes(reaction as ReactionType)) {
    res.status(400).json({ error: "A valid target and reaction are required" }); return;
  }

  if (targetType === "thread") {
    const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, targetId) });
    if (!thread) { res.status(404).json({ error: "Target not found" }); return; }
    if (!(await canAccessThread(me, thread))) { res.status(403).json({ error: "Forbidden" }); return; }
  } else {
    const post = await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, targetId) });
    if (!post || post.isDeleted) { res.status(404).json({ error: "Post not found" }); return; }
    const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, post.threadId) });
    if (!thread || !(await canAccessThread(me, thread))) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const rows = await db.select({
    id: usersTable.id,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    avatarUrl: usersTable.avatarUrl,
  }).from(boardReactionsTable)
    .innerJoin(usersTable, eq(boardReactionsTable.userId, usersTable.id))
    .where(and(
      eq(boardReactionsTable.reaction, reaction),
      targetType === "thread"
        ? eq(boardReactionsTable.threadId, targetId)
        : eq(boardReactionsTable.postId, targetId),
      eq(usersTable.isActive, true),
    ))
    .orderBy(usersTable.firstName, usersTable.lastName);

  res.json({ targetType, targetId, reaction, members: rows });
});

async function enrichPost(
  post: typeof boardPostsTable.$inferSelect,
  me: typeof usersTable.$inferSelect,
) {
  const author = post.authorUserId
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, post.authorUserId) })
    : null;
  const attachments = post.isDeleted ? [] : await db.select({ objectPath: boardAttachmentsTable.objectPath })
    .from(boardAttachmentsTable)
    .where(eq(boardAttachmentsTable.postId, post.id));
  const hiddenByMe = post.authorUserId
    ? Boolean(await db.query.boardHiddenMembersTable.findFirst({
        where: and(
          eq(boardHiddenMembersTable.hiderUserId, me.id),
          eq(boardHiddenMembersTable.hiddenUserId, post.authorUserId),
        ),
      }))
    : false;
  return {
    ...post,
    // Redact body for soft-deleted posts so raw API consumers cannot read deleted content
    body: post.isDeleted ? "" : post.body,
    imageObjectPaths: attachments.map(({ objectPath }) => objectPath),
    author: author ? { id: author.id, firstName: author.firstName, lastName: author.lastName, avatarUrl: author.avatarUrl ?? null } : null,
    hiddenByMe,
    reactions: await getReactionSummary("post", post.id, me.id),
    permissions: getPostPermissions(me, post),
  };
}

async function notifyThreadParticipants(
  threadId: number,
  actorUserId: number,
  notificationPost: typeof boardPostsTable.$inferSelect,
) {
  // Collect all unique user IDs who posted or authored the thread (excluding actor)
  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) return;
  const event = thread?.eventId
    ? await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, thread.eventId) })
    : null;
  const notificationThreadTitle = event
    ? `Discussion: ${event.title}`
    : thread?.title ?? "this discussion";
  const posts = await db.select({ authorUserId: boardPostsTable.authorUserId })
    .from(boardPostsTable)
    .where(and(eq(boardPostsTable.threadId, threadId), eq(boardPostsTable.isDeleted, false)));

  const participantIds = new Set<number>();
  if (thread?.authorUserId) participantIds.add(thread.authorUserId);
  for (const p of posts) {
    if (p.authorUserId) participantIds.add(p.authorUserId);
  }
  participantIds.delete(actorUserId);

  if (participantIds.size === 0) return;

  const participants = await db.select().from(usersTable).where(inArray(usersTable.id, Array.from(participantIds)));
  const hiddenRows = await db.select({ hiderUserId: boardHiddenMembersTable.hiderUserId })
    .from(boardHiddenMembersTable)
    .where(eq(boardHiddenMembersTable.hiddenUserId, actorUserId));
  const hiddenRecipientIds = new Set(hiddenRows.map(({ hiderUserId }) => hiderUserId));

  const postImages = await db.select().from(boardAttachmentsTable)
    .where(eq(boardAttachmentsTable.postId, notificationPost.id));

  // Images only enrich the email. If one can't be loaded, still notify everyone
  // (in-app, push, and a text-only email) instead of dropping the whole fan-out.
  let verifiedImages: Awaited<ReturnType<typeof loadVerifiedPrivateImage>>[] = [];
  try {
    verifiedImages = await Promise.all(postImages.map((image) => loadVerifiedPrivateImage(image)));
  } catch (err) {
    logger.warn({ err, postId: notificationPost.id }, "[board] reply images unavailable; notifying without them");
  }
  const inlineImageDescriptors = verifiedImages.map((image, index) => ({
    cid: `board-reply-${notificationPost?.id}-${index}@trailteam`,
    filename: `discussion-image-${index + 1}.${image.contentType.split("/")[1]}`,
  }));
  const richContent = renderEmailContent(
    notificationPost.body,
    notificationPost.bodyFormat,
    inlineImageDescriptors,
  );
  const orgPrefix = await getShortNamePrefix();
  const threadUrl = `/messages/thread/${threadId}?reply=${notificationPost.id}`;
  const threadHref = buildAppUrl(threadUrl);
  const settingsHref = buildAppUrl("/profile?tab=notifications");
  const threadLink = createEmailLink(threadUrl, "Open reply in TrailTeam");

  for (const user of participants) {
    if (hiddenRecipientIds.has(user.id)) continue;
    if (
      user.notificationPreferences?.boardReplies === false
      || user.notificationPreferences?.mutedBoardDiscussionIds?.includes(threadId)
    ) continue;
    await createNotification(
      user.id,
      "boardReplies",
      "New reply on the board",
      `Someone replied to "${notificationThreadTitle}"`,
      threadUrl
    );
    // Email eligibility and visibility are independently checked; the current
    // thread audience remains authoritative if a member changed pods after posting.
    if (
      !user.notificationsEnabled
      || !user.emailNotifications
      || !isDeliverableEmailAddress(user.email)
      || !(await canAccessThread(user, thread))
    ) continue;
    const messageText = addNotificationEmailLinks(
      [
        `Someone replied to "${notificationThreadTitle}":`,
        "",
        richContent.text,
        "",
        "— TrailTeam",
      ].join("\n"),
      [threadLink],
    );
    const safeHref = threadHref?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const safeSettingsHref = settingsHref?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const inlineHtml = [
      `<p>Someone replied to <strong>${notificationThreadTitle.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)}</strong>:</p>`,
      richContent.html,
      safeHref ? `<p><a href="${safeHref}">Open reply in TrailTeam</a></p>` : "",
      `<p style="font-size:12px;color:#59636e">To update notification preferences, update your notification settings in TrailTeam${safeSettingsHref ? `: <a href="${safeSettingsHref}">notification settings</a>` : ""}.</p>`,
    ].join("");
    await sendEmail({
      to: user.email,
      subject: `${orgPrefix}New reply on the board`,
      text: messageText.text,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#0a0c10"><main style="max-width:640px;margin:0 auto;padding:24px">${inlineHtml}</main></body></html>`,
      attachments: verifiedImages.map((image, index) => ({
        filename: inlineImageDescriptors[index].filename,
        content: image.bytes,
        contentType: image.contentType,
        cid: inlineImageDescriptors[index].cid,
      })),
      replyTo: undefined,
    });
  }
}

type BoardActivity =
  | { kind: "new-thread" }
  | {
      kind: "reaction";
      memberName: string;
      reaction: ReactionType;
      targetType: ReactionTarget;
      targetId: number;
    };

async function notifyBoardActivity(
  thread: typeof boardThreadsTable.$inferSelect,
  actorUserId: number,
  activity: BoardActivity,
) {
  const event = thread.eventId
    ? (await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, thread.eventId) })) ?? null
    : null;
  const threadTitle = event ? `Discussion: ${event.title}` : thread.title;
  const threadUrl = `/messages/thread/${thread.id}`;
  const activityUrl = activity.kind !== "reaction"
    ? threadUrl
    : activity.targetType === "post"
      ? `${threadUrl}?reply=${activity.targetId}`
      : `${threadUrl}?target=starter`;
  const activityLinkLabel = activity.kind === "reaction" && activity.targetType === "post"
    ? "Open reply in TrailTeam"
    : "Open discussion in TrailTeam";

  const participantIds = activity.kind === "reaction"
    ? new Set<number>([
        ...(thread.authorUserId ? [thread.authorUserId] : []),
        ...(await db.select({ authorUserId: boardPostsTable.authorUserId })
          .from(boardPostsTable)
          .where(and(eq(boardPostsTable.threadId, thread.id), eq(boardPostsTable.isDeleted, false))))
          .map((post) => post.authorUserId)
          .filter((userId): userId is number => userId != null),
      ])
    : null;

  // A newly created thread goes to its entire current audience. Reactions use
  // the same thread author/reply author participant set as reply notifications.
  const candidates = await db.select().from(usersTable);
  const hiddenRows = await db.select({ hiderUserId: boardHiddenMembersTable.hiderUserId })
    .from(boardHiddenMembersTable)
    .where(eq(boardHiddenMembersTable.hiddenUserId, actorUserId));
  const hiddenRecipientIds = new Set(hiddenRows.map(({ hiderUserId }) => hiderUserId));
  const recipients = await Promise.all(candidates
    .filter((user) => participantIds === null || participantIds.has(user.id))
    .filter((user) => user.id !== actorUserId)
    .filter((user) => !hiddenRecipientIds.has(user.id))
    .map(async (user) => {
      if (
        !user.clerkUserId
        || (!user.approved && !hasStudentAccess(user))
      ) return null;

      return await canAccessThread(user, thread, { event }) ? user : null;
    }));
  const accessibleRecipients = recipients.filter(
    (user): user is NonNullable<typeof user> => user !== null,
  );
  if (accessibleRecipients.length === 0) return;

  const notificationTitle = activity.kind === "new-thread"
    ? "New discussion on the board"
    : "New reaction on the board";
  const notificationBody = activity.kind === "new-thread"
    ? `A new discussion was started: "${threadTitle}"`
    : `${activity.memberName} reacted with ${REACTION_LABELS[activity.reaction]} to ${activity.targetType === "post" ? "a reply" : "the discussion"} in "${threadTitle}"`;
  const settingsUrl = "/profile?tab=notifications";
  const threadHref = buildAppUrl(activityUrl);
  const settingsHref = buildAppUrl(settingsUrl);
  const threadLink = createEmailLink(activityUrl, activityLinkLabel);
  const emailMessage = addNotificationEmailLinks(
    [`Hi,`, ``, notificationBody, ``, `— TrailTeam`].join("\n"),
    [threadLink],
  );
  const safeHref = threadHref?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const safeSettingsHref = settingsHref?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
  const inlineHtml = [
    `<p>${escapeHtml(notificationBody)}</p>`,
    safeHref ? `<p><a href="${safeHref}">${escapeHtml(activityLinkLabel)}</a></p>` : "",
    `<p style="font-size:12px;color:#59636e">To update notification preferences, update your notification settings in TrailTeam${safeSettingsHref ? `: <a href="${safeSettingsHref}">notification settings</a>` : ""}.</p>`,
  ].join("");
  const emailUsers = accessibleRecipients.filter((user) =>
    user.notificationPreferences?.boardReplies !== false
    && !user.notificationPreferences?.mutedBoardDiscussionIds?.includes(thread.id)
    && user.notificationsEnabled
    && user.emailNotifications
    && isDeliverableEmailAddress(user.email)
  );
  const orgPrefix = emailUsers.length > 0 ? await getShortNamePrefix() : "";

  await Promise.all(accessibleRecipients.map(async (user) => {
    if (
      user.notificationPreferences?.boardReplies === false
      || user.notificationPreferences?.mutedBoardDiscussionIds?.includes(thread.id)
    ) return;
    // Reactions can be toggled on and off repeatedly; don't re-notify (or re-email)
    // the same person about the same reaction within a day.
    if (activity.kind === "reaction") {
      const alreadyNotified = await db.query.notificationsTable.findFirst({
        where: and(
          eq(notificationsTable.recipientUserId, user.id),
          eq(notificationsTable.body, notificationBody),
          eq(notificationsTable.link, activityUrl),
          gt(notificationsTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ),
      });
      if (alreadyNotified) return;
    }
    await createNotification(
      user.id,
      "boardReplies",
      notificationTitle,
      notificationBody,
      activityUrl,
    );
    if (!emailUsers.includes(user)) return;

    try {
      await sendEmail({
        to: user.email,
        subject: `${orgPrefix}${notificationTitle}`,
        text: emailMessage.text,
        html: `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#0a0c10"><main style="max-width:640px;margin:0 auto;padding:24px">${inlineHtml}</main></body></html>`,
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, "[board] activity notification email failed");
    }
  }));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// ─── Authorization helpers ─────────────────────────────────────────────────────

async function getMe(clerkUserId: string) {
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

function isCommunityBoardPostingBlocked(user: typeof usersTable.$inferSelect): boolean {
  return user.boardPostingBlocked;
}

const REPORTS_PER_USER_PER_HOUR = 5;
const REPORT_REASON_LABELS = {
  inappropriate_content: "Inappropriate content",
  harassment: "Bullying or harassment",
  spam: "Spam",
  other: "Other",
} as const;

async function createBoardContentReport(input: {
  thread: typeof boardThreadsTable.$inferSelect;
  post?: typeof boardPostsTable.$inferSelect | null;
  reporterUserId: number | null;
  reporterName: string;
  reason: "inappropriate_content" | "harassment" | "spam" | "other";
  details?: string | null;
  isAutomatic?: boolean;
}): Promise<{ reportId: number; existing: boolean; rateLimited: boolean }> {
  const targetType = input.post ? "reply" : "thread";
  const now = new Date();
  const excerpt = (input.post?.body ?? input.thread.body).slice(0, 200);
  const details = input.details?.trim() || null;

  const outcome = await db.transaction(async (tx) => {
    // Serializes duplicate and rate-limit checks across all API server instances.
    const lockKey = input.reporterUserId ?? -(input.post?.id ?? input.thread.id);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('trailteam-board-report'), ${lockKey})`);

    const duplicateWhere = and(
      eq(boardThreadReportsTable.targetType, targetType),
      eq(boardThreadReportsTable.status, "open"),
      input.post
        ? eq(boardThreadReportsTable.postId, input.post.id)
        : eq(boardThreadReportsTable.threadId, input.thread.id),
      input.reporterUserId === null
        ? and(isNull(boardThreadReportsTable.reporterUserId), eq(boardThreadReportsTable.isAutomatic, true))
        : eq(boardThreadReportsTable.reporterUserId, input.reporterUserId),
    );
    const existing = await tx.query.boardThreadReportsTable.findFirst({ where: duplicateWhere });
    if (existing) return { report: existing, existing: true, rateLimited: false };

    if (input.reporterUserId !== null && !input.isAutomatic) {
      const recentReports = await tx.select({ count: sql<number>`count(*)::int` })
        .from(boardThreadReportsTable)
        .where(and(
          eq(boardThreadReportsTable.reporterUserId, input.reporterUserId),
          gte(boardThreadReportsTable.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
        ));
      if (Number(recentReports[0]?.count ?? 0) >= REPORTS_PER_USER_PER_HOUR) {
        return { report: null, existing: false, rateLimited: true };
      }
    }

    const [report] = await tx.insert(boardThreadReportsTable).values({
      threadId: input.thread.id,
      postId: input.post?.id ?? null,
      targetType,
      threadTitle: input.thread.title,
      reporterUserId: input.reporterUserId,
      reporterName: input.reporterName,
      reason: input.reason,
      details,
      contentExcerpt: excerpt,
      isAutomatic: input.isAutomatic ?? false,
      status: "open",
      createdAt: now,
    }).returning();
    return { report, existing: false, rateLimited: false };
  });

  if (outcome.rateLimited) return { reportId: 0, existing: false, rateLimited: true };
  const report = outcome.report;
  if (!report) throw new Error("Could not create Board report");

  if (!outcome.existing) {
    const event = input.thread.eventId
      ? await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, input.thread.eventId) })
      : null;
    const threadTitle = event ? `Discussion: ${event.title}` : input.thread.title;
    const link = input.post
      ? `/messages/thread/${input.thread.id}?reply=${input.post.id}`
      : `/messages/thread/${input.thread.id}?target=starter`;
    const notificationBody = [
      `${input.reporterName} reported “${threadTitle}”.`,
      input.post ? `Reply: “${excerpt}”` : null,
      `Reason: ${REPORT_REASON_LABELS[input.reason]}.`,
      details ? `Details: ${details}` : null,
    ].filter(Boolean).join(" ");
    const staff = await db.query.usersTable.findMany();
    await Promise.all(staff
      .filter((user) =>
        user.id !== input.reporterUserId
        && user.isActive
        && user.approved
        && isOperationalStaffRole(user))
      .map((user) => createNotification(
        user.id,
        "board_thread_reported",
        "Community Board report",
        notificationBody,
        link,
      )));
  }

  return { reportId: report.id, existing: outcome.existing, rateLimited: false };
}

async function createAutomaticBoardReport(
  thread: typeof boardThreadsTable.$inferSelect,
  content: string,
  post?: typeof boardPostsTable.$inferSelect,
): Promise<void> {
  const matchedTerms = findObjectionableTerms(content);
  if (!matchedTerms.length) return;
  await createBoardContentReport({
    thread,
    post,
    reporterUserId: null,
    reporterName: "Automatic flag",
    reason: "inappropriate_content",
    details: `Automatic word filter matched: ${matchedTerms.join(", ")}`,
    isAutomatic: true,
  });
}

function getThreadPermissions(
  me: typeof usersTable.$inferSelect,
  thread: typeof boardThreadsTable.$inferSelect,
) {
  const isCoachOrAdmin = isOperationalStaffRole(me);
  return {
    canPin: isCoachOrAdmin,
    canDelete: isCoachOrAdmin || thread.authorUserId === me.id,
  };
}

function getPostPermissions(
  me: typeof usersTable.$inferSelect,
  post: typeof boardPostsTable.$inferSelect,
) {
  const isCoachOrAdmin = isOperationalStaffRole(me);
  return {
    canDelete: isCoachOrAdmin || post.authorUserId === me.id,
  };
}

function canAccessPodThread(me: typeof usersTable.$inferSelect, threadPodId: string | null): boolean {
  if (!threadPodId) return true; // general or event threads — open to all
  if (isOperationalStaffRole(me)) return true;
  return me.podId === threadPodId;
}

/**
 * Returns true if the user can access an event-linked thread.
 * Events have a `podIds` array; if it is empty/null the event is team-wide.
 * Coaches/admins always have access.
 */
async function canAccessEventThread(
  me: typeof usersTable.$inferSelect,
  eventId: number
): Promise<boolean> {
  const event = await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, eventId) });
  if (!event) return false;
  return isEventAudienceMember(event, me);
}

/**
 * Centralized access check for a board thread.
 * - Pod-scoped threads: user must be in that pod (or coach/admin).
 * - Event-linked threads: user must be in the event audience (or coach/admin).
 * - General threads: open to all authenticated users.
 */
async function canAccessThread(
  me: typeof usersTable.$inferSelect,
  thread: typeof boardThreadsTable.$inferSelect,
  eventContext?: { event: typeof eventsTable.$inferSelect | null },
): Promise<boolean> {
  if (thread.podId) {
    return canAccessPodThread(me, thread.podId);
  }
  if (thread.eventId) {
    if (eventContext) {
      return eventContext.event ? isEventAudienceMember(eventContext.event, me) : false;
    }
    return canAccessEventThread(me, thread.eventId);
  }
  return true; // general thread
}

// GET /board/threads?scope=general|pod|event&podId=&eventId=
router.get("/board/threads", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const { scope, podId, eventId } = req.query as Record<string, string>;

  // Pod-scoped list: enforce pod membership
  if (scope === "pod" && podId) {
    const isCoachOrAdmin = isOperationalStaffRole(me);
    if (!isCoachOrAdmin && me.podId !== podId) {
      res.status(403).json({ error: "Not a member of this pod" }); return;
    }
  }

  const isCoachOrAdmin = isOperationalStaffRole(me);

  // Pod-access filter applied to every query: only show pod-scoped threads the user
  // belongs to. Event threads with no pod_id are always visible to all users.
  const podVisibilityFilter = isCoachOrAdmin
    ? undefined
    : me.podId
      ? or(isNull(boardThreadsTable.podId), eq(boardThreadsTable.podId, me.podId))
      : isNull(boardThreadsTable.podId);

  let threads: (typeof boardThreadsTable.$inferSelect)[];

  if (scope === "event") {
    // Fetch candidate event threads, then post-filter by event pod assignments
    let candidates: (typeof boardThreadsTable.$inferSelect)[];
    if (eventId) {
      candidates = await db.select().from(boardThreadsTable)
        .where(eq(boardThreadsTable.eventId, parseInt(eventId)))
        .orderBy(desc(boardThreadsTable.isPinned), desc(boardThreadsTable.lastReplyAt), desc(boardThreadsTable.createdAt));
    } else {
      candidates = await db.select().from(boardThreadsTable)
        .where(gt(boardThreadsTable.eventId, 0))
        .orderBy(desc(boardThreadsTable.isPinned), desc(boardThreadsTable.lastReplyAt), desc(boardThreadsTable.createdAt));
    }

    // The board-wide Events list keeps discussions visible through the event
    // and for a 36-hour grace period after it ends. Direct event lookups are
    // intentionally not filtered so calendar event details retain access.
    const eventIds = candidates.map((thread) => thread.eventId!).filter((id, index, ids) => ids.indexOf(id) === index);
    const eventRows = eventIds.length > 0
      ? await db.query.eventsTable.findMany({ where: inArray(eventsTable.id, eventIds) })
      : [];
    const eventById = new Map(eventRows.map((event) => [event.id, event]));

    if (!eventId) {
      const gracePeriodMs = 36 * 60 * 60 * 1000;
      const now = Date.now();
      candidates = candidates.filter((thread) => {
        const event = eventById.get(thread.eventId!);
        if (!event) return false;
        const eventEnd = event.endTime ?? event.startTime;
        return now <= eventEnd.getTime() + gracePeriodMs;
      });

      candidates.sort((a, b) => {
        const aEvent = eventById.get(a.eventId!);
        const bEvent = eventById.get(b.eventId!);
        const eventDateDifference = (aEvent?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER)
          - (bEvent?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER);
        if (eventDateDifference !== 0) return eventDateDifference;

        const aActivity = (a.lastReplyAt ?? a.createdAt).getTime();
        const bActivity = (b.lastReplyAt ?? b.createdAt).getTime();
        return bActivity - aActivity;
      });
    }

    // Enforce event audience: filter out events the user's pod isn't invited to
    const accessResults = await Promise.all(
      candidates.map((t) => canAccessEventThread(me, t.eventId!))
    );
    threads = candidates.filter((_, i) => accessResults[i]);
  } else if (scope === "pod" && podId) {
    threads = await db.select().from(boardThreadsTable)
      .where(and(eq(boardThreadsTable.podId, podId), isNull(boardThreadsTable.eventId)))
      .orderBy(desc(boardThreadsTable.isPinned), desc(boardThreadsTable.lastReplyAt), desc(boardThreadsTable.createdAt));
  } else {
    // general: no podId, no eventId
    threads = await db.select().from(boardThreadsTable)
      .where(and(isNull(boardThreadsTable.podId), isNull(boardThreadsTable.eventId)))
      .orderBy(desc(boardThreadsTable.isPinned), desc(boardThreadsTable.lastReplyAt), desc(boardThreadsTable.createdAt));
  }

  const result = await Promise.all(threads.map((thread) => enrichThread(thread, me)));
  res.json(result);
});

// POST /board/threads
router.post("/board/threads", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  if (isCommunityBoardPostingBlocked(me)) {
    res.status(403).json({ error: "Your Community Board posting is restricted. You can still read the Board and use other parts of the app. Contact a coach if you think this is a mistake." });
    return;
  }

  const { title, body, podId, eventId } = req.body;
  const bodyFormat = req.body.bodyFormat ?? "plain";
  if (typeof title !== "string" || title.length === 0 || typeof body !== "string" || body.length === 0) {
    res.status(400).json({ error: "title and body required" }); return;
  }
  if (bodyFormat !== "plain" && bodyFormat !== "markdown") {
    res.status(400).json({ error: "bodyFormat must be plain or markdown" }); return;
  }
  if (bodyFormat === "markdown" && hasInlineMarkdownImages(body)) {
    res.status(400).json({ error: "Inline Markdown images are not supported. Upload pictures as attachments instead." }); return;
  }
  // Disallow ambiguous scope: a thread must be general, pod-scoped, OR event-linked — not a mix
  if (podId && eventId) {
    res.status(400).json({ error: "A thread cannot have both podId and eventId" }); return;
  }

  // Pod threads: creator must be a member of that pod (or coach/admin)
  if (podId && !canAccessPodThread(me, podId)) {
    res.status(403).json({ error: "Not a member of this pod" }); return;
  }

  // Event threads: creator must be in the event's audience (or coach/admin)
  if (eventId && !(await canAccessEventThread(me, parseInt(eventId)))) {
    res.status(403).json({ error: "Not in this event's audience" }); return;
  }

  const createThread = async (
    executor: Pick<typeof db, "insert">,
    attachments: Awaited<ReturnType<typeof validateOwnedDiscussionImages>>,
  ) => {
    const [created] = await executor.insert(boardThreadsTable).values({
      title,
      body,
      bodyFormat,
      authorUserId: me.id,
      podId: podId ?? null,
      eventId: eventId ?? null,
      isPinned: false,
      isLocked: false,
      replyCount: 0,
    }).returning();
    if (attachments.length) {
      await executor.insert(boardAttachmentsTable).values(
        attachments.map((attachment) => ({ ...attachment, threadId: created.id })),
      );
    }
    return created;
  };
  let thread;
  try {
    if (req.body.imageObjectPaths == null) {
      thread = await createThread(db, []);
    } else {
      thread = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${DISCUSSION_IMAGE_LIFECYCLE_LOCK}))`);
        const attachments = await validateOwnedDiscussionImages(clerkUserId, req.body.imageObjectPaths);
        return createThread(tx, attachments);
      });
    }
  } catch (error) {
    if (error instanceof DiscussionImageValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  await createAutomaticBoardReport(thread, `${title}\n${body}`);
  // A successful thread creation notifies its current audience, but merely
  // requesting an attachment upload URL does not.
  void notifyBoardActivity(thread, me.id, { kind: "new-thread" })
    .catch((err) => logger.error({ err }, "[board] notify new thread audience error"));

  const result = { ...await enrichThread(thread, me), reactions: await getReactionSummary("thread", thread.id, me.id) };
  res.status(201).json(result);
});

// GET /board/threads/:id
router.get("/board/threads/:id", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const id = parseInt(str(req.params.id));
  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, id) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    // Keep the denial in place, but let a saved event-thread link explain why
    // it stopped working without returning any event or discussion details.
    res.status(403).json(thread.eventId
      ? { error: "Forbidden", code: "EVENT_DISCUSSION_ACCESS_REVOKED" }
      : { error: "Forbidden" });
    return;
  }
  const result = { ...await enrichThread(thread, me), reactions: await getReactionSummary("thread", thread.id, me.id) };
  res.json(result);
});

// PUT /board/threads/:id/mute — mute or unmute this discussion for the current member.
router.post("/board/threads/:id/reports", requireApproved, async (req, res) => {
  const params = CreateBoardThreadReportParams.safeParse(req.params);
  const body = CreateBoardThreadReportBody.safeParse(req.body);
  if (!params.success || !Number.isInteger(params.data?.id) || params.data.id <= 0) {
    res.status(400).json({ error: "Invalid thread ID" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid reason and keep details under 1000 characters." });
    return;
  }

  const me = await getMe((req as any).clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  const thread = await db.query.boardThreadsTable.findFirst({
    where: eq(boardThreadsTable.id, params.data.id),
  });
  if (!thread) { res.status(404).json({ error: "Discussion not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const reporterName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim() || "A member";
  const result = await createBoardContentReport({
    thread,
    reporterUserId: me.id,
    reporterName,
    reason: body.data.reason,
    details: body.data.details,
  });
  if (result.rateLimited) {
    res.status(429).json({ error: "You have sent several reports recently. Please try again later." });
    return;
  }
  res.status(result.existing ? 200 : 201).json({ reportId: result.reportId });
});

router.post("/board/posts/:id/reports", requireApproved, async (req, res) => {
  const params = CreateBoardPostReportParams.safeParse(req.params);
  const body = CreateBoardPostReportBody.safeParse(req.body);
  if (!params.success || !Number.isInteger(params.data?.id) || params.data.id <= 0) {
    res.status(400).json({ error: "Invalid reply ID" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid reason and keep details under 1000 characters." });
    return;
  }
  const me = await getMe((req as any).clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  const post = await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, params.data.id) });
  if (!post || post.isDeleted) { res.status(404).json({ error: "Reply not found" }); return; }
  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, post.threadId) });
  if (!thread) { res.status(404).json({ error: "Discussion not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (post.authorUserId === me.id) {
    res.status(400).json({ error: "You cannot report your own reply." });
    return;
  }
  const reporterName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim() || "A member";
  const result = await createBoardContentReport({
    thread,
    post,
    reporterUserId: me.id,
    reporterName,
    reason: body.data.reason,
    details: body.data.details,
  });
  if (result.rateLimited) {
    res.status(429).json({ error: "You have sent several reports recently. Please try again later." });
    return;
  }
  res.status(result.existing ? 200 : 201).json({ reportId: result.reportId });
});

async function serializeBoardReport(report: typeof boardThreadReportsTable.$inferSelect) {
  const post = report.postId
    ? await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, report.postId) })
    : null;
  const thread = report.threadId
    ? await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, report.threadId) })
    : null;
  const reportedUserId = post?.authorUserId ?? thread?.authorUserId ?? null;
  const link = report.threadId
    ? report.targetType === "reply" && report.postId
      ? `/messages/thread/${report.threadId}?reply=${report.postId}`
      : `/messages/thread/${report.threadId}?target=starter`
    : "/messages";
  return {
    id: report.id,
    threadId: report.threadId,
    postId: report.postId,
    targetType: report.targetType,
    threadTitle: report.threadTitle,
    reporterUserId: report.reporterUserId,
    reporterName: report.reporterName,
    reportedUserId,
    reason: report.reason,
    details: report.details,
    contentExcerpt: report.contentExcerpt,
    isAutomatic: report.isAutomatic,
    createdAt: report.createdAt.toISOString(),
    status: report.status,
    resolutionNote: report.resolutionNote ?? null,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    link,
  };
}

router.get("/board/reports", requireCoachOrAdmin, async (req, res) => {
  const me = await getMe((req as any).clerkUserId);
  if (!me || !me.isActive || !me.approved || !isOperationalStaffRole(me)) {
    res.status(403).json({ error: "Active, approved coach or super admin access required" });
    return;
  }
  const reports = await db.query.boardThreadReportsTable.findMany({
    where: eq(boardThreadReportsTable.status, "open"),
    orderBy: [desc(boardThreadReportsTable.createdAt)],
  });
  res.json(ListBoardReportsResponse.parse(await Promise.all(reports.map(serializeBoardReport))));
});

router.patch("/board/reports/:id/resolve", requireCoachOrAdmin, async (req, res) => {
  const params = ResolveBoardReportParams.safeParse(req.params);
  const body = ResolveBoardReportBody.safeParse(req.body ?? {});
  if (!params.success || params.data.id <= 0 || !body.success) {
    res.status(400).json({ error: "Invalid report or resolution note" });
    return;
  }
  const me = await getMe((req as any).clerkUserId);
  if (!me || !me.isActive || !me.approved || !isOperationalStaffRole(me)) {
    res.status(403).json({ error: "Active, approved coach or super admin access required" });
    return;
  }
  const report = await db.query.boardThreadReportsTable.findFirst({
    where: eq(boardThreadReportsTable.id, params.data.id),
  });
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  const [updated] = await db.update(boardThreadReportsTable).set({
    status: "resolved",
    resolutionNote: body.data.note?.trim() || null,
    resolvedByUserId: me.id,
    resolvedAt: new Date(),
  }).where(eq(boardThreadReportsTable.id, report.id)).returning();
  res.json(ListBoardReportsResponse.parse([await serializeBoardReport(updated)])[0]);
});

router.get("/board/hidden-members", requireApproved, async (req, res) => {
  const me = await getMe((req as any).clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  const hidden = await db.query.boardHiddenMembersTable.findMany({
    where: eq(boardHiddenMembersTable.hiderUserId, me.id),
  });
  const members = await Promise.all(hidden.map(async ({ hiddenUserId }) => {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, hiddenUserId) });
    return user ? { userId: user.id, firstName: user.firstName, lastName: user.lastName } : null;
  }));
  res.json(ListHiddenBoardMembersResponse.parse(members.filter((member) => member !== null)));
});

router.put("/board/hidden-members/:userId", requireApproved, async (req, res) => {
  const params = SetHiddenBoardMemberParams.safeParse(req.params);
  const body = SetHiddenBoardMemberBody.safeParse(req.body);
  if (!params.success || params.data.userId <= 0 || !body.success) {
    res.status(400).json({ error: "Invalid hidden-member preference" });
    return;
  }
  const me = await getMe((req as any).clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  if (params.data.userId === me.id) {
    res.status(400).json({ error: "You cannot hide yourself." });
    return;
  }
  const member = await db.query.usersTable.findFirst({ where: eq(usersTable.id, params.data.userId) });
  if (!member || !member.isActive) { res.status(404).json({ error: "Member not found" }); return; }
  const existing = await db.query.boardHiddenMembersTable.findFirst({
    where: and(
      eq(boardHiddenMembersTable.hiderUserId, me.id),
      eq(boardHiddenMembersTable.hiddenUserId, member.id),
    ),
  });
  if (body.data.hidden && !existing) {
    await db.insert(boardHiddenMembersTable).values({ hiderUserId: me.id, hiddenUserId: member.id });
  } else if (!body.data.hidden && existing) {
    await db.delete(boardHiddenMembersTable).where(and(
      eq(boardHiddenMembersTable.hiderUserId, me.id),
      eq(boardHiddenMembersTable.hiddenUserId, member.id),
    ));
  }
  res.json(SetHiddenBoardMemberResponse.parse({ hidden: body.data.hidden }));
});

router.get("/board/posting-restrictions", requireCoachOrAdmin, async (req, res) => {
  const me = await getMe((req as any).clerkUserId);
  if (!me || !me.isActive || !me.approved || !isOperationalStaffRole(me)) {
    res.status(403).json({ error: "Active, approved coach or super admin access required" });
    return;
  }
  const blockedUsers = await db.query.usersTable.findMany({
    where: eq(usersTable.boardPostingBlocked, true),
  });
  const restrictions = await Promise.all(blockedUsers.filter((user) => user.boardPostingBlocked).map(async (user) => {
    const blocker = user.boardPostingBlockedByUserId
      ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, user.boardPostingBlockedByUserId) })
      : null;
    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      blockedAt: user.boardPostingBlockedAt?.toISOString() ?? null,
      blockedByName: blocker ? `${blocker.firstName} ${blocker.lastName}`.trim() : null,
    };
  }));
  res.json(ListBoardPostingRestrictionsResponse.parse(restrictions));
});

router.put("/board/users/:id/posting-restriction", requireCoachOrAdmin, async (req, res) => {
  const params = SetBoardPostingRestrictionParams.safeParse(req.params);
  const body = SetBoardPostingRestrictionBody.safeParse(req.body);
  if (!params.success || params.data.id <= 0 || !body.success) {
    res.status(400).json({ error: "Invalid posting restriction" });
    return;
  }
  const me = await getMe((req as any).clerkUserId);
  if (!me || !me.isActive || !me.approved || !isOperationalStaffRole(me)) {
    res.status(403).json({ error: "Active, approved coach or super admin access required" });
    return;
  }
  const member = await db.query.usersTable.findFirst({ where: eq(usersTable.id, params.data.id) });
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }
  const [updated] = await db.update(usersTable).set({
    boardPostingBlocked: body.data.blocked,
    boardPostingBlockedAt: body.data.blocked ? new Date() : null,
    boardPostingBlockedByUserId: body.data.blocked ? me.id : null,
  }).where(eq(usersTable.id, member.id)).returning();
  const result = {
    userId: updated.id,
    firstName: updated.firstName,
    lastName: updated.lastName,
    blockedAt: updated.boardPostingBlockedAt?.toISOString() ?? null,
    blockedByName: body.data.blocked ? `${me.firstName} ${me.lastName}`.trim() : null,
  };
  res.json(SetBoardPostingRestrictionResponse.parse(result));
});

router.put("/board/threads/:id/mute", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const params = SetBoardThreadMuteParams.safeParse(req.params);
  const body = SetBoardThreadMuteBody.safeParse(req.body);
  if (!params.success || !Number.isInteger(params.data?.id) || params.data.id <= 0) {
    res.status(400).json({ error: "Invalid thread ID" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "muted must be a boolean" });
    return;
  }
  const { id: threadId } = params.data;
  const { muted } = body.data;

  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  if (me.role === "student" && me.notificationPreferencesLocked) {
    res.status(403).json({ error: "Your notification preferences are managed by your parent." });
    return;
  }

  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Read-modify-write under a row lock so two quick mute toggles (or a mute racing
  // PATCH /users/me) can't overwrite each other's change to the preferences JSON.
  await db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(usersTable).where(eq(usersTable.id, me.id)).for("update");
    const current = fresh ?? me;
    const mutedIds = current.notificationPreferences?.mutedBoardDiscussionIds ?? [];
    if (mutedIds.includes(threadId) === muted) return;
    const nextMutedIds = muted
      ? [...mutedIds, threadId]
      : mutedIds.filter((id) => id !== threadId);
    await tx.update(usersTable)
      .set({
        notificationPreferences: {
          ...(current.notificationPreferences ?? {
            practiceReminders: true,
            coachMessages: true,
            carpoolUpdates: true,
            eventReminders: true,
            rosterUpdates: true,
            boardReplies: true,
          }),
          mutedBoardDiscussionIds: nextMutedIds,
        },
      })
      .where(eq(usersTable.id, me.id));
  });

  res.json(SetBoardThreadMuteResponse.parse({ muted }));
});

// GET /board/threads/:id/posts
router.get("/board/threads/:id/posts", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const threadId = parseInt(str(req.params.id));
  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const posts = await db.select().from(boardPostsTable)
    .where(eq(boardPostsTable.threadId, threadId))
    .orderBy(boardPostsTable.createdAt);
  const result = await Promise.all(posts.map((post) => enrichPost(post, me)));
  res.json(result);
});

// POST /board/threads/:id/posts
router.post("/board/threads/:id/posts", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const threadId = parseInt(str(req.params.id));
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }
  if (isCommunityBoardPostingBlocked(me)) {
    res.status(403).json({ error: "Your Community Board posting is restricted. You can still read the Board and use other parts of the app. Contact a coach if you think this is a mistake." });
    return;
  }

  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (thread.isLocked && !isOperationalStaffRole(me)) {
    res.status(403).json({ error: "Thread is locked" }); return;
  }

  const { body } = req.body;
  const bodyFormat = req.body.bodyFormat ?? "plain";
  if (typeof body !== "string" || body.length === 0) { res.status(400).json({ error: "body required" }); return; }
  if (bodyFormat !== "plain" && bodyFormat !== "markdown") {
    res.status(400).json({ error: "bodyFormat must be plain or markdown" }); return;
  }
  if (bodyFormat === "markdown" && hasInlineMarkdownImages(body)) {
    res.status(400).json({ error: "Inline Markdown images are not supported. Upload pictures as attachments instead." }); return;
  }
  const createPost = async (
    executor: Pick<typeof db, "insert" | "update">,
    attachments: Awaited<ReturnType<typeof validateOwnedDiscussionImages>>,
  ) => {
    const [created] = await executor.insert(boardPostsTable).values({
      threadId,
      authorUserId: me.id,
      body,
      bodyFormat,
      isDeleted: false,
    }).returning();
    if (attachments.length) {
      await executor.insert(boardAttachmentsTable).values(
        attachments.map((attachment) => ({ ...attachment, postId: created.id })),
      );
    }
    await executor.update(boardThreadsTable).set({
      replyCount: thread.replyCount + 1,
      lastReplyAt: new Date(),
    }).where(eq(boardThreadsTable.id, threadId));
    return created;
  };
  let post;
  try {
    if (req.body.imageObjectPaths == null) {
      post = await createPost(db, []);
    } else {
      post = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${DISCUSSION_IMAGE_LIFECYCLE_LOCK}))`);
        const attachments = await validateOwnedDiscussionImages(clerkUserId, req.body.imageObjectPaths);
        return createPost(tx, attachments);
      });
    }
  } catch (error) {
    if (error instanceof DiscussionImageValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  await createAutomaticBoardReport(thread, body, post);
  // Notify participants (non-blocking)
    notifyThreadParticipants(threadId, me.id, post)
    .catch((err) => logger.error({ err }, "[board] notify participants error"));

  const result = await enrichPost(post, me);
  res.status(201).json(result);
});

// GET /board/attachments/*path — serve an image only to viewers of its discussion.
router.get("/board/attachments/*path", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const rawPath = req.params.path;
  const wildcardPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  const objectPath = `/objects/${wildcardPath}`;
  if (!DISCUSSION_IMAGE_PATH.test(objectPath)) {
    res.status(400).json({ error: "Invalid discussion image" });
    return;
  }

  const attachment = await db.query.boardAttachmentsTable.findFirst({
    where: eq(boardAttachmentsTable.objectPath, objectPath),
  });
  if (!attachment) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  const post = attachment.postId
    ? await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, attachment.postId) })
    : null;
  if (attachment.postId && (!post || post.isDeleted)) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  const threadId = attachment.threadId ?? post?.threadId;
  const thread = threadId
    ? await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) })
    : null;
  if (!thread || !(await canAccessThread(me, thread))) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  try {
    // Read the exact immutable generation that was validated when attached.
    // If it was overwritten and bucket versioning is unavailable, fail closed.
    const file = await objectStorageService.getObjectEntityFile(objectPath, attachment.generation);
    const [metadata] = await file.getMetadata();
    if (
      String(metadata.generation ?? "") !== attachment.generation
      || metadata.contentType !== attachment.contentType
      || Number(metadata.size ?? 0) !== attachment.size
    ) {
      req.log.warn({ objectPath }, "Discussion image changed after attachment; refusing to serve");
      res.status(404).json({ error: "Image not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (!response.body) { res.end(); return; }
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving discussion image");
    res.status(500).json({ error: "Failed to serve discussion image" });
  }
});

// POST /board/reactions — toggle a reaction on a visible thread starter or reply
router.post("/board/reactions", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const { targetType, targetId, reaction } = req.body as {
    targetType?: ReactionTarget;
    targetId?: number;
    reaction?: ReactionType;
  };
  if (!targetType || !Number.isInteger(targetId) || !reaction ||
      !["thread", "post"].includes(targetType) ||
      !ALLOWED_REACTIONS.includes(reaction)) {
    res.status(400).json({ error: "targetType, targetId, and a valid reaction are required" }); return;
  }
  const safeTargetId = targetId as number;
  let thread: typeof boardThreadsTable.$inferSelect | null = null;

  if (targetType === "thread") {
    thread = (await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, safeTargetId) })) ?? null;
    if (!thread) { res.status(404).json({ error: "Target not found" }); return; }
    if (!(await canAccessThread(me, thread))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  } else {
    const post = await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, safeTargetId) });
    if (!post) { res.status(404).json({ error: "Target not found" }); return; }
    thread = (await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, post.threadId) })) ?? null;
    if (!thread || !(await canAccessThread(me, thread))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    if (post.isDeleted) {
      res.status(404).json({ error: "Post not found" }); return;
    }
  }

  const existing = await db.query.boardReactionsTable.findFirst({
    where: and(
      eq(boardReactionsTable.userId, me.id),
      targetType === "thread" ? eq(boardReactionsTable.threadId, safeTargetId) : eq(boardReactionsTable.postId, safeTargetId),
      eq(boardReactionsTable.reaction, reaction),
    ),
  });
  if (existing) {
    await db.delete(boardReactionsTable).where(eq(boardReactionsTable.id, existing.id));
  } else {
    await db.insert(boardReactionsTable).values({
      userId: me.id,
      reaction,
      ...(targetType === "thread" ? { threadId: safeTargetId } : { postId: safeTargetId }),
    });
    if (thread) {
      const memberName = [me.firstName, me.lastName].filter(Boolean).join(" ").trim() || "A member";
      void notifyBoardActivity(thread, me.id, {
        kind: "reaction",
        memberName,
        reaction,
        targetType,
        targetId: safeTargetId,
      })
        .catch((err) => logger.error({ err }, "[board] notify reaction participants error"));
    }
  }
  res.json({ targetType, targetId: safeTargetId, reactions: await getReactionSummary(targetType, safeTargetId, me.id) });
});

// DELETE /board/threads/:id — coach/admin or thread author
router.delete("/board/threads/:id", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const threadId = parseInt(str(req.params.id));
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!getThreadPermissions(me, thread).canDelete) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(boardThreadsTable).where(eq(boardThreadsTable.id, threadId));
  res.status(204).send();
});

// DELETE /board/posts/:id — coach/admin or post author
router.delete("/board/posts/:id", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const postId = parseInt(str(req.params.id));
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const post = await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, postId) });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, post.threadId) });
  if (!thread || !(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!getPostPermissions(me, post).canDelete) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Soft-delete: mark isDeleted so thread keeps reply count integrity
  await db.update(boardPostsTable).set({ isDeleted: true }).where(eq(boardPostsTable.id, postId));
  res.status(204).send();
});

// PATCH /board/threads/:id/pin — toggle isPinned (coach/admin only)
router.patch("/board/threads/:id/pin", requireCoachOrAdmin, async (req, res) => {
  const threadId = parseInt(str(req.params.id));
  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  const [updated] = await db.update(boardThreadsTable)
    .set({ isPinned: !thread.isPinned })
    .where(eq(boardThreadsTable.id, threadId))
    .returning();
  res.json(updated);
});

// GET /board/unread-count — threads with new activity since boardLastSeenAt, respecting pod/event access
router.get("/board/unread-count", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ count: 0, threadIds: [] }); return; }

  const isCoachOrAdmin = isOperationalStaffRole(me);

  // Step 1: Fetch all candidate threads respecting pod-level visibility.
  // Event threads (podId IS NULL + eventId set) pass this filter and are further
  // filtered below by event audience. General threads always pass.
  const candidates = await db.select().from(boardThreadsTable)
    .where(
      isCoachOrAdmin
        ? undefined
        : me.podId
          ? or(isNull(boardThreadsTable.podId), eq(boardThreadsTable.podId, me.podId))
          : isNull(boardThreadsTable.podId)
    );

  // Step 2: Apply event-audience filter for event-linked threads.
  const accessResults = await Promise.all(
    candidates.map((t) =>
      t.eventId ? canAccessEventThread(me, t.eventId) : Promise.resolve(true)
    )
  );
  const accessibleThreads = candidates
    .filter((_, i) => accessResults[i]);

  if (accessibleThreads.length === 0) {
    res.json({ count: 0, threadIds: [] }); return;
  }

  // First visit — every accessible thread is unread. Otherwise compare activity
  // in memory so the same privacy-filtered candidates power both the count and IDs.
  const seenAt = me.boardLastSeenAt;
  const unreadThreads = seenAt
    ? accessibleThreads.filter((thread) =>
        thread.createdAt > seenAt || Boolean(thread.lastReplyAt && thread.lastReplyAt > seenAt))
    : accessibleThreads;
  res.json({ count: unreadThreads.length, threadIds: unreadThreads.map((thread) => thread.id) });
});

// Self-only preference update; pending users need this to keep their own state coherent.
// PATCH /board/seen — update boardLastSeenAt to now
router.patch("/board/seen", requireAuth, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  await db.update(usersTable).set({ boardLastSeenAt: new Date() }).where(eq(usersTable.id, me.id));
  res.json({ success: true });
});

// ─── SSRF protection helpers ───────────────────────────────────────────────────

/**
 * Resolves the hostname via DNS and returns the list of IPs if ALL of them are
 * safe (public, non-loopback, non-private). Returns null if the host is unsafe
 * or unresolvable. The caller MUST use one of the returned IPs for the actual
 * connection instead of re-resolving — this eliminates the DNS-rebinding window.
 */
async function resolveAndValidateHost(hostname: string): Promise<string[] | null> {
  // Block bare hostnames (no dot) — internal service names like "postgres"
  if (!hostname.includes(".")) return null;
  try {
    const v4 = await dnsPromises.resolve4(hostname).catch(() => [] as string[]);
    const v6 = await dnsPromises.resolve6(hostname).catch(() => [] as string[]);
    const all = [...v4, ...v6];
    if (all.length === 0) return null; // DNS failed — block
    if (!all.every((ip) => !isPrivatePreviewAddress(ip))) return null; // any private IP → block
    return all;
  } catch {
    return null;
  }
}

/**
 * Fetches a URL using a pre-resolved IP address to prevent DNS rebinding.
 * The TCP connection goes directly to `resolvedIp`; the `Host` header is set
 * to the original hostname so TLS SNI and virtual hosting work correctly.
 * Redirects are never followed (manual redirect mode).
 */
function fetchWithPinnedIP(
  parsedUrl: URL,
  resolvedIp: string,
  timeoutMs: number,
  maxBytes = 256 * 1024,
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === "https:";
    const port = parsedUrl.port
      ? parseInt(parsedUrl.port, 10)
      : isHttps ? 443 : 80;

    const options: http.RequestOptions = {
      hostname: resolvedIp,
      port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "Host": parsedUrl.hostname,
        "User-Agent": "TrailTeamBot/1.0 (link preview)",
      },
      // For HTTPS, SNI must use the original hostname, not the IP
      ...(isHttps ? { servername: parsedUrl.hostname } : {}),
    };

    const timer = setTimeout(() => {
      req.destroy(new Error("Request timed out"));
    }, timeoutMs);

    const req = (isHttps ? https : http).request(options, (response) => {
      clearTimeout(timer);
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      response.on("data", (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          req.destroy(new Error("Response too large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks),
        });
      });

      response.on("error", reject);
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

async function inlineSafePreviewImage(metadata: LinkPreviewMetadata): Promise<LinkPreviewMetadata> {
  if (!metadata.imageUrl) return metadata;
  let imageUrl: URL;
  try {
    imageUrl = new URL(metadata.imageUrl);
  } catch {
    return { ...metadata, imageUrl: null };
  }
  if (!["http:", "https:"].includes(imageUrl.protocol)) {
    return { ...metadata, imageUrl: null };
  }

  const resolvedIPs = await resolveAndValidateHost(imageUrl.hostname);
  if (!resolvedIPs) return { ...metadata, imageUrl: null };

  try {
    const response = await fetchWithPinnedIP(imageUrl, resolvedIPs[0], 5000, 512 * 1024);
    const contentType = String(response.headers["content-type"] ?? "");
    return {
      ...metadata,
      imageUrl: safeImageDataUri(response.statusCode, contentType, response.body),
    };
  } catch {
    return { ...metadata, imageUrl: null };
  }
}

// Authenticated-only utility with no team data; it supports composing an onboarding contact message.
// GET /board/link-preview?url= — fetch og: tags for a URL
router.get("/board/link-preview", requireAuth, async (req, res) => {
  const { url } = req.query as { url: string };
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" }); return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    res.status(400).json({ error: "Invalid URL" }); return;
  }

  // SSRF protection: resolve DNS once, validate all IPs, then pin the connection
  // to a returned IP. This eliminates the DNS-rebinding window that exists when
  // the safety check and the fetch() call resolve DNS independently.
  const resolvedIPs = await resolveAndValidateHost(parsed.hostname);
  if (!resolvedIPs) {
    res.status(400).json({ error: "URL not allowed" }); return;
  }

  // Use the first resolved IP for the pinned connection
  const pinnedIp = resolvedIPs[0];

  try {
    const response = await fetchWithPinnedIP(parsed, pinnedIp, 5000);

    // Block redirect responses; any 3xx is treated as a failed fetch
    if (response.statusCode >= 300 && response.statusCode < 400) {
      res.json(await inlineSafePreviewImage(fallbackLinkPreview(parsed))); return;
    }

    // Enforce content-type — only parse HTML
    const ct = (response.headers["content-type"] as string | undefined) ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) {
      res.json(await inlineSafePreviewImage(fallbackLinkPreview(parsed))); return;
    }

    res.json(await inlineSafePreviewImage(parseLinkPreviewHtml(parsed, response.body.toString("utf8"))));
  } catch (err) {
    logger.warn({ url, err }, "[board] link preview fetch error");
    res.json(await inlineSafePreviewImage(fallbackLinkPreview(parsed)));
  }
});

export default router;

// ─── Utility for event auto-thread creation ───────────────────────────────────

export async function createEventThread(eventId: number, eventTitle: string, authorUserId?: number | null): Promise<void> {
  try {
    // Check if a thread already exists for this event
    const existing = await db.query.boardThreadsTable.findFirst({
      where: eq(boardThreadsTable.eventId, eventId),
    });
    if (existing) return;

    await db.insert(boardThreadsTable).values({
      title: `Discussion: ${eventTitle}`,
      body: `Use this thread to coordinate for ${eventTitle} — meet-up spots, ride shares, questions, or anything else.`,
      authorUserId: authorUserId ?? null,
      podId: null,
      eventId,
      isPinned: false,
      isLocked: false,
      replyCount: 0,
    });
  } catch (err) {
    logger.error({ err, eventId }, "[board] failed to create event thread");
  }
}
