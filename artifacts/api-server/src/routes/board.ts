import { Router } from "express";
import { db } from "@workspace/db";
import {
  boardThreadsTable,
  boardPostsTable,
  usersTable,
  eventsTable,
  boardReactionsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, or, inArray, gt, gte, sql } from "drizzle-orm";
import { requireAuth, requireApproved, requireCoachOrAdmin } from "../middlewares/requireAuth";
import { createNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import { promises as dnsPromises } from "dns";
import * as http from "http";
import * as https from "https";

const router = Router();
const str = (p: string | string[]): string => Array.isArray(p) ? p[0] : p;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichThread(thread: typeof boardThreadsTable.$inferSelect) {
  const author = thread.authorUserId
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, thread.authorUserId) })
    : null;
  const event = thread.eventId
    ? await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, thread.eventId) })
    : null;
  return {
    ...thread,
    // Event discussion titles are derived from the current event name so a
    // renamed event cannot leave its linked discussion showing stale context.
    title: event ? `Discussion: ${event.title}` : thread.title,
    author: author ? { id: author.id, firstName: author.firstName, lastName: author.lastName, avatarUrl: author.avatarUrl ?? null } : null,
    event: event ? { id: event.id, title: event.title, startTime: event.startTime } : null,
  };
}

const ALLOWED_REACTIONS = ["helpful", "like", "celebrate"] as const;
type ReactionType = typeof ALLOWED_REACTIONS[number];
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

async function enrichPost(post: typeof boardPostsTable.$inferSelect, userId?: number) {
  const author = post.authorUserId
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, post.authorUserId) })
    : null;
  return {
    ...post,
    // Redact body for soft-deleted posts so raw API consumers cannot read deleted content
    body: post.isDeleted ? "" : post.body,
    author: author ? { id: author.id, firstName: author.firstName, lastName: author.lastName, avatarUrl: author.avatarUrl ?? null } : null,
    reactions: userId ? await getReactionSummary("post", post.id, userId) : {},
  };
}

async function notifyThreadParticipants(threadId: number, actorUserId: number, threadTitle: string) {
  // Collect all unique user IDs who posted or authored the thread (excluding actor)
  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
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

  for (const user of participants) {
    if (user.notificationPreferences?.boardReplies === false) continue;
    await createNotification(
      user.id,
      "boardReplies",
      "New reply on the board",
      `Someone replied to "${threadTitle}"`,
      `/messages/thread/${threadId}`
    );
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// ─── Authorization helpers ─────────────────────────────────────────────────────

async function getMe(clerkUserId: string) {
  return db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
}

function canAccessPodThread(me: typeof usersTable.$inferSelect, threadPodId: string | null): boolean {
  if (!threadPodId) return true; // general or event threads — open to all
  if (me.role === "coach" || me.role === "admin") return true;
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
  if (me.role === "coach" || me.role === "admin") return true;
  const event = await db.query.eventsTable.findFirst({ where: eq(eventsTable.id, eventId) });
  if (!event) return false;
  // No pod restriction: open to all team members
  if (!event.podIds || event.podIds.length === 0) return true;
  return me.podId != null && event.podIds.includes(me.podId);
}

/**
 * Centralized access check for a board thread.
 * - Pod-scoped threads: user must be in that pod (or coach/admin).
 * - Event-linked threads: user must be in the event audience (or coach/admin).
 * - General threads: open to all authenticated users.
 */
async function canAccessThread(
  me: typeof usersTable.$inferSelect,
  thread: typeof boardThreadsTable.$inferSelect
): Promise<boolean> {
  if (thread.podId) {
    return canAccessPodThread(me, thread.podId);
  }
  if (thread.eventId) {
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
    const isCoachOrAdmin = me.role === "coach" || me.role === "admin";
    if (!isCoachOrAdmin && me.podId !== podId) {
      res.status(403).json({ error: "Not a member of this pod" }); return;
    }
  }

  const isCoachOrAdmin = me.role === "coach" || me.role === "admin";

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

  const result = await Promise.all(threads.map((thread) => enrichThread(thread)));
  res.json(result);
});

// POST /board/threads
router.post("/board/threads", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const { title, body, podId, eventId } = req.body;
  if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }

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

  const [thread] = await db.insert(boardThreadsTable).values({
    title,
    body,
    authorUserId: me.id,
    podId: podId ?? null,
    eventId: eventId ?? null,
    isPinned: false,
    isLocked: false,
    replyCount: 0,
  }).returning();

  const result = { ...await enrichThread(thread), reactions: await getReactionSummary("thread", thread.id, me.id) };
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
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const result = { ...await enrichThread(thread), reactions: await getReactionSummary("thread", thread.id, me.id) };
  res.json(result);
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
  const result = await Promise.all(posts.map((post) => enrichPost(post, me.id)));
  res.json(result);
});

// POST /board/threads/:id/posts
router.post("/board/threads/:id/posts", requireApproved, async (req, res) => {
  const clerkUserId = (req as any).clerkUserId;
  const threadId = parseInt(str(req.params.id));
  const me = await getMe(clerkUserId);
  if (!me) { res.status(401).json({ error: "User not found" }); return; }

  const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, threadId) });
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  if (!(await canAccessThread(me, thread))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (thread.isLocked && me.role !== "coach" && me.role !== "admin") {
    res.status(403).json({ error: "Thread is locked" }); return;
  }

  const { body } = req.body;
  if (!body) { res.status(400).json({ error: "body required" }); return; }

  const [post] = await db.insert(boardPostsTable).values({
    threadId,
    authorUserId: me.id,
    body,
    isDeleted: false,
  }).returning();

  // Update thread reply count and lastReplyAt
  await db.update(boardThreadsTable).set({
    replyCount: thread.replyCount + 1,
    lastReplyAt: new Date(),
  }).where(eq(boardThreadsTable.id, threadId));

  // Notify participants (non-blocking)
  notifyThreadParticipants(threadId, me.id, thread.title)
    .catch((err) => logger.error({ err }, "[board] notify participants error"));

  const result = await enrichPost(post, me.id);
  res.status(201).json(result);
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

  if (targetType === "thread") {
    const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, safeTargetId) });
    if (!thread) { res.status(404).json({ error: "Target not found" }); return; }
    if (!(await canAccessThread(me, thread))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  } else {
    const post = await db.query.boardPostsTable.findFirst({ where: eq(boardPostsTable.id, safeTargetId) });
    if (!post) { res.status(404).json({ error: "Target not found" }); return; }
    const thread = await db.query.boardThreadsTable.findFirst({ where: eq(boardThreadsTable.id, post.threadId) });
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

  const isCoachOrAdmin = me.role === "coach" || me.role === "admin";
  if (!isCoachOrAdmin && thread.authorUserId !== me.id) {
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

  const isCoachOrAdmin = me.role === "coach" || me.role === "admin";
  if (!isCoachOrAdmin && post.authorUserId !== me.id) {
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
  if (!me) { res.status(401).json({ count: 0 }); return; }

  const isCoachOrAdmin = me.role === "coach" || me.role === "admin";

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
  const accessibleIds = candidates
    .filter((_, i) => accessResults[i])
    .map((t) => t.id);

  if (accessibleIds.length === 0) {
    res.json({ count: 0 }); return;
  }

  if (!me.boardLastSeenAt) {
    // First visit — count all accessible threads (new threads without replies count too)
    res.json({ count: accessibleIds.length });
    return;
  }

  // Returning visit: count threads with new activity since last visit.
  // New activity = thread created after boardLastSeenAt OR a reply posted after boardLastSeenAt.
  const seenAt = me.boardLastSeenAt;
  const threads = await db.select().from(boardThreadsTable)
    .where(
      and(
        inArray(boardThreadsTable.id, accessibleIds),
        or(
          gt(boardThreadsTable.createdAt, seenAt),
          gt(boardThreadsTable.lastReplyAt, seenAt)
        )
      )
    );
  res.json({ count: threads.length });
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

/** Returns true if the address is a private/loopback/link-local IP. */
function isPrivateIP(addr: string): boolean {
  // IPv6 loopback / link-local / ULA
  if (/^::1$/.test(addr)) return true;
  if (/^fe80:/i.test(addr)) return true;
  if (/^fc[0-9a-f]{2}:/i.test(addr) || /^fd[0-9a-f]{2}:/i.test(addr)) return true;
  // IPv4
  const parts = addr.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  if (a === 127) return true;           // loopback
  if (a === 10) return true;            // RFC1918 class A
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 class B
  if (a === 192 && b === 168) return true;           // RFC1918 class C
  if (a === 169 && b === 254) return true;           // link-local
  if (a === 0) return true;             // 0.0.0.0
  if (addr === "255.255.255.255") return true;
  return false;
}

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
    if (!all.every((ip) => !isPrivateIP(ip))) return null; // any private IP → block
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
  timeoutMs: number
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
      const MAX_BYTES = 256 * 1024;
      let totalBytes = 0;

      response.on("data", (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        chunks.push(chunk);
        if (totalBytes >= MAX_BYTES) {
          response.destroy(); // Stop reading — we have enough
        }
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
      res.json({ url, title: parsed.hostname, description: null, hostname: parsed.hostname }); return;
    }

    // Enforce content-type — only parse HTML
    const ct = (response.headers["content-type"] as string | undefined) ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) {
      res.json({ url, title: parsed.hostname, description: null, hostname: parsed.hostname }); return;
    }

    const html = response.body.toString("utf8");

    const getTag = (property: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"));
      return match?.[1]?.trim() ?? null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const title = getTag("og:title") ?? titleMatch?.[1]?.trim() ?? parsed.hostname;
    const description = getTag("og:description") ?? getTag("description") ?? null;

    res.json({ url, title, description, hostname: parsed.hostname });
  } catch (err) {
    logger.warn({ url, err }, "[board] link preview fetch error");
    res.json({ url, title: parsed.hostname, description: null, hostname: parsed.hostname });
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
