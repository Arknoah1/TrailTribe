import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { isEventAudienceMember as sharedIsEventAudienceMember } from "@workspace/db/event-audience";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const COACH = {
  id: 1,
  clerkUserId: "clerk_test_coach",
  role: "coach",
  podId: null,
  firstName: "Coach",
  lastName: "Trail",
  avatarUrl: null,
  isActive: true,
  approved: true,
  email: "coach@example.test",
  emailNotifications: true,
  notificationsEnabled: true,
  notificationPreferences: { boardReplies: true },
};
const RIDER = {
  id: 2,
  clerkUserId: "clerk_test_rider",
  role: "member",
  podId: "pod-a",
  firstName: "Rider",
  lastName: "Trail",
  avatarUrl: null,
  isActive: true,
  approved: true,
};
const OTHER_RIDER = {
  id: 3,
  clerkUserId: "clerk_test_other_rider",
  role: "member",
  podId: "pod-b",
  firstName: "Other",
  lastName: "Rider",
  avatarUrl: null,
  isActive: true,
  approved: true,
};
const PARENT = {
  id: 4,
  clerkUserId: "clerk_test_parent",
  role: "parent",
  podId: "pod-a",
  firstName: "Parent",
  lastName: "Trail",
  avatarUrl: null,
  isActive: true,
  approved: true,
};
const OTHER_PARENT = {
  id: 5,
  clerkUserId: "clerk_test_other_parent",
  role: "parent",
  podId: "pod-b",
  firstName: "Other Parent",
  lastName: "Trail",
  avatarUrl: null,
  isActive: true,
  approved: true,
};
const notificationMock = vi.hoisted(() => ({
  createNotification: vi.fn(),
}));
// What the reaction-notification dedupe lookup should find in the notifications
// table. null = this recipient wasn't recently told about this reaction.
const recentNotificationMock = vi.hoisted(() => ({ existing: null as { id: number } | null }));
const emailMock = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ status: "sent" as const })),
  getShortNamePrefix: vi.fn(async () => "TrailTeam: "),
}));

type EventFixture = {
  id: number;
  title: string;
  startTime: Date;
  endTime: Date;
  podIds: string[];
  isAllTeam: boolean;
};

type ThreadFixture = {
  id: number;
  title: string;
  body: string;
  bodyFormat?: "plain" | "markdown";
  authorUserId: number;
  eventId: number;
  podId: null;
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  lastReplyAt: Date | null;
  createdAt: Date;
};
type PostFixture = {
  id: number;
  threadId: number;
  authorUserId: number;
  body: string;
  bodyFormat?: "plain" | "markdown";
  isDeleted: boolean;
  createdAt: Date;
};
type ReactionFixture = {
  id: number;
  threadId: number | null;
  postId: number | null;
  userId: number;
  reaction: string;
};
type AttachmentFixture = {
  id: number;
  objectPath: string;
  threadId: number | null;
  postId: number | null;
  contentType: string;
  size: number;
  generation: string;
};

type DiscussionObjectFixture = {
  generation: string;
  contentType: string;
  size: number;
  body: string;
};

const discussionStorageMock = vi.hoisted(() => {
  class MockObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }

  const objects = new Map<string, DiscussionObjectFixture[]>();
  const getObjectEntityFile = vi.fn(async (objectPath: string, generation?: string) => {
    const versions = objects.get(objectPath) ?? [];
    const object = generation
      ? versions.find((version) => version.generation === generation)
      : versions.at(-1);
    if (!object) throw new MockObjectNotFoundError();
    return {
      objectPath,
      generation: object.generation,
      getMetadata: vi.fn(async () => [{
        generation: object.generation,
        contentType: object.contentType,
        size: String(object.size),
      }]),
    };
  });

  class MockObjectStorageService {
    getObjectEntityFile = getObjectEntityFile;
    getObjectEntityUploadURL = vi.fn(async () => "https://storage.example/upload");
    normalizeObjectEntityPath = vi.fn(() => "/objects/discussion-images/new-upload");
    downloadObject = vi.fn(async (file: { objectPath: string; generation: string }) => {
      const object = (objects.get(file.objectPath) ?? [])
        .find((version) => version.generation === file.generation);
      return new Response(object?.body ?? "", {
        status: 200,
        headers: {
          "content-type": object?.contentType ?? "application/octet-stream",
          ...(object ? { "content-length": String(object.size) } : {}),
        },
      });
    });
  }

  return {
    objects,
    getObjectEntityFile,
    ObjectNotFoundError: MockObjectNotFoundError,
    ObjectStorageService: MockObjectStorageService,
  };
});

const discussionAclMock = vi.hoisted(() => {
  const policies = new Map<string, { owner: string; visibility: "private"; aclRules: [] }>();
  return {
    policies,
    getDbObjectAclPolicy: vi.fn(async (objectPath: string) => policies.get(objectPath) ?? null),
    getObjectAclPolicy: vi.fn(async () => null),
    storePendingObjectAcl: vi.fn(async (objectPath: string, policy: { owner: string; visibility: "private"; aclRules: [] }) => {
      policies.set(objectPath, policy);
    }),
    canAccessObject: vi.fn(async () => true),
    ObjectPermission: { READ: "read", WRITE: "write" },
    ObjectAccessGroupType: { AUTHENTICATED_USER: "AUTHENTICATED_USER", HOUSEHOLD_MEMBER: "HOUSEHOLD_MEMBER" },
    DISCUSSION_IMAGE_LIFECYCLE_LOCK: "trailteam-discussion-image-lifecycle",
  };
});

const events: EventFixture[] = [];
const threads: ThreadFixture[] = [];
const posts: PostFixture[] = [];
const reactions: ReactionFixture[] = [];
const attachments: AttachmentFixture[] = [];
const reports: Array<Record<string, unknown>> = [];
const reportNotifications: Array<Record<string, unknown>> = [];
const hiddenMembers: Array<{ id: number; hiderUserId: number; hiddenUserId: number }> = [];
const users = [COACH, RIDER, OTHER_RIDER, PARENT, OTHER_PARENT];
let selectCallIndex = 0;
let nextReactionId = 1;
let nextThreadId = 10000;
let nextPostId = 1000;
let nextAttachmentId = 1;

function chain<T>(result: T | (() => T)) {
  const query: any = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    groupBy: vi.fn(),
    innerJoin: vi.fn(),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) => {
      const value = typeof result === "function" ? (result as () => T)() : result;
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  query.from.mockImplementation(() => query);
  query.where.mockReturnValue(query);
  query.orderBy.mockImplementation(() => {
    const value = typeof result === "function" ? (result as () => T)() : result;
    return Promise.resolve(value);
  });
  query.groupBy.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  return query;
}

vi.mock("@workspace/db", () => {
  const tables = new Map<string, object>();
  const table = (name: string) => {
    const value = new Proxy({ __name: name }, { get: (target, key) => key === "__name" ? target.__name : { __name: `${name}.${String(key)}` } });
    tables.set(name, value);
    return value;
  };
  const boardThreadsTable = table("threads");
  const boardThreadReportsTable = table("reports");
  const boardHiddenMembersTable = table("hiddenMembers");
  const boardPostsTable = table("posts");
  const boardAttachmentsTable = table("attachments");
  const boardReactionsTable = table("reactions");
  const usersTable = table("users");
  const eventsTable = table("events");
  const notificationsTable = table("notifications");
  const conditionValues = (condition: any, collected: unknown[] = [], seen = new Set<object>()) => {
    if (condition == null) return collected;
    if (typeof condition === "string" || typeof condition === "number") {
      collected.push(condition);
      return collected;
    }
    if (typeof condition !== "object" || seen.has(condition)) return collected;
    seen.add(condition);
    if (Array.isArray(condition)) {
      condition.forEach((part) => conditionValues(part, collected, seen));
      return collected;
    }
    if (condition.value != null && (typeof condition.value === "string" || typeof condition.value === "number")) {
      collected.push(condition.value);
    }
    for (const key of ["queryChunks", "left", "right"]) {
      if (condition[key] != null) conditionValues(condition[key], collected, seen);
    }
    return collected;
  };
  const targetIdFrom = (condition: any) =>
    currentTargetId ?? conditionValues(condition).filter((value) => typeof value === "number").at(-1);
  const targetPathFrom = (condition: any) =>
    condition?.right ?? condition?.queryChunks?.at?.(-1)?.value;
  const dbMock: any = {
    select: vi.fn((selection?: Record<string, unknown>) => {
      selectCallIndex += 1;
      if (!selection) {
        const query = chain(() => {
          const source = (query as any)._source;
          if (source === boardPostsTable) return posts;
          if (source === boardAttachmentsTable) return attachments;
          if (source === boardHiddenMembersTable) {
            return hiddenMembers
              .filter((row) => row.hiddenUserId === currentUser().id)
              .map(({ hiderUserId }) => ({ hiderUserId }));
          }
          if (source === usersTable) return users;
          const eventId = currentEventId ?? (query as any)._where?.right;
          return eventId != null
            ? threads.filter((thread) => thread.eventId === eventId)
            : threads;
        });
        query.from.mockImplementation((source: object) => {
          query._source = source;
          return query;
        });
        query.where.mockImplementation((condition: unknown) => {
          query._where = condition;
          return query;
        });
        return query;
      }
      if ("objectPath" in selection) {
        const query = chain(() => {
          const targetId = targetIdFrom(query._where);
          return attachments
            .filter((attachment) =>
              attachment.threadId === targetId || attachment.postId === targetId)
            .map(({ objectPath }) => ({ objectPath }));
        });
        query.from.mockImplementation((source: object) => { query._source = source; return query; });
        query.where.mockImplementation((condition: unknown) => { query._where = condition; return query; });
        return query;
      }
      if ("authorUserId" in selection) {
        const query = chain(() => {
          return posts
            .filter((post) => post.threadId === query._targetThreadId && !post.isDeleted)
            .map(({ authorUserId }) => ({ authorUserId }));
        });
        query.from.mockImplementation((source: object) => { query._source = source; return query; });
        query.where.mockImplementation((condition: unknown) => {
          query._where = condition;
          query._targetThreadId = posts.find((post) => post.id === currentTargetId)?.threadId ?? currentTargetId;
          return query;
        });
        return query;
      }
      if ("count" in selection && "reacted" in selection) {
        const query = chain(() => {
          const targetId = targetIdFrom(query._where);
          const targetRows = reactions.filter((reaction) =>
            (targetId != null && (reaction.threadId === targetId || reaction.postId === targetId)));
          return ["helpful", "like", "celebrate"]
            .filter((kind) => targetRows.some((reaction) => reaction.reaction === kind))
            .map((kind) => ({
              reaction: kind,
              count: targetRows.filter((reaction) => reaction.reaction === kind).length,
              reacted: targetRows.some((reaction) => reaction.reaction === kind && reaction.userId === currentUser().id),
            }));
        });
        query.from.mockImplementation((source: object) => { query._source = source; return query; });
        query.where.mockImplementation((condition: unknown) => { query._where = condition; return query; });
        return query;
      }
      if ("hiderUserId" in selection) {
        const query = chain(() => hiddenMembers
          .filter((row) => row.hiddenUserId === currentUser().id)
          .map(({ hiderUserId }) => ({ hiderUserId })));
        query.from.mockImplementation((source: object) => { query._source = source; return query; });
        query.where.mockImplementation((condition: unknown) => { query._where = condition; return query; });
        return query;
      }
      if ("firstName" in selection && "lastName" in selection) {
        const query = chain(() => {
          const targetId = targetIdFrom(query._where);
          const reaction = reactions.filter((row) =>
            row.reaction === currentReaction && (row.threadId === targetId || row.postId === targetId));
          return reaction
            .map((row) => users.find((user) => user.id === row.userId))
            .filter(Boolean)
            .map((user) => ({ id: user!.id, firstName: user!.firstName, lastName: user!.lastName, avatarUrl: user!.avatarUrl }));
        });
        query.from.mockImplementation((source: object) => { query._source = source; return query; });
        query.where.mockImplementation((condition: unknown) => { query._where = condition; return query; });
        return query;
      }
      return chain([]);
    }),
    insert: vi.fn((source: object) => ({
      values: vi.fn((value: any) => {
        const values = Array.isArray(value) ? value : [value];
        if (source === boardReactionsTable) {
          reactions.push({ id: nextReactionId++, ...values[0] });
        }
        if (source === boardPostsTable) {
          posts.push({ id: nextPostId++, ...values[0] });
        }
        if (source === boardThreadsTable) {
          threads.push({ id: nextThreadId++, ...values[0], createdAt: NOW, lastReplyAt: null });
        }
        if (source === boardThreadReportsTable) {
          reports.push({ id: reports.length + 1, ...values[0] });
        }
        if (source === boardHiddenMembersTable) {
          for (const row of values) {
            if (!hiddenMembers.some((existing) => existing.hiderUserId === row.hiderUserId && existing.hiddenUserId === row.hiddenUserId)) {
              hiddenMembers.push({ id: hiddenMembers.length + 1, ...row });
            }
          }
        }
        if (source === notificationsTable) {
          reportNotifications.push(...values);
          return Promise.resolve();
        }
        if (source === boardAttachmentsTable) {
          attachments.push(...values.map((attachment) => ({ id: nextAttachmentId++, ...attachment })));
        }
        return {
          returning: vi.fn(async () => {
            if (source === boardReactionsTable) return [reactions.at(-1)];
            if (source === boardPostsTable) return [posts.at(-1)];
            if (source === boardThreadsTable) return [threads.at(-1)];
            if (source === boardThreadReportsTable) return [reports.at(-1)];
            if (source === boardHiddenMembersTable) return [hiddenMembers.at(-1)];
            return [];
          }),
        };
      }),
    })),
    delete: vi.fn((source: object) => ({
      where: vi.fn(async (condition: any) => {
        if (source === boardReactionsTable) {
          const index = reactions.findIndex((reaction) =>
            reaction.userId === currentUser().id &&
            reaction.reaction === currentReaction &&
            (reaction.threadId === currentTargetId || reaction.postId === currentTargetId));
          if (index >= 0) reactions.splice(index, 1);
        }
        if (source === boardHiddenMembersTable) {
          const index = hiddenMembers.findIndex((row) =>
            row.hiderUserId === currentUser().id && row.hiddenUserId === currentTargetId);
          if (index >= 0) hiddenMembers.splice(index, 1);
        }
        if (source === boardThreadsTable) {
          const threadId = targetIdFrom(condition);
          const threadIndex = threads.findIndex((thread) => thread.id === threadId);
          if (threadIndex >= 0) threads.splice(threadIndex, 1);

          // Mirror the database-level cascades from board.ts: deleting a
          // thread removes its posts and all reactions on the thread/posts.
          const postIds = posts
            .filter((post) => post.threadId === threadId)
            .map((post) => post.id);
          for (let index = posts.length - 1; index >= 0; index -= 1) {
            if (posts[index].threadId === threadId) posts.splice(index, 1);
          }
          for (let index = reactions.length - 1; index >= 0; index -= 1) {
            if (reactions[index].threadId === threadId || (reactions[index].postId != null && postIds.includes(reactions[index].postId))) {
              reactions.splice(index, 1);
            }
          }
        }
      }),
    })),
    update: vi.fn((source: object) => ({
      set: vi.fn((value: any) => ({
        where: vi.fn((condition: any) => {
          if (source === usersTable) {
            const target = users.find((user) => user.id === targetIdFrom(condition)) ?? currentUser();
            Object.assign(target, value);
          }
          if (source === boardPostsTable) {
            const post = posts.find((candidate) => candidate.id === targetIdFrom(condition));
            if (post) Object.assign(post, value);
          }
          if (source === boardThreadsTable) {
            const thread = threads.find((candidate) => candidate.id === targetIdFrom(condition));
            if (thread) Object.assign(thread, value);
          }
          if (source === boardThreadReportsTable) {
            const report = reports.find((candidate) => candidate.id === targetIdFrom(condition));
            if (report) Object.assign(report, value);
          }
          return Object.assign(Promise.resolve(undefined), {
            returning: vi.fn(async () => {
              if (source === boardThreadsTable) {
                const thread = threads.find((candidate) => candidate.id === targetIdFrom(condition));
                return thread ? [thread] : [];
              }
              if (source === boardThreadReportsTable) {
                const report = reports.find((candidate) => candidate.id === targetIdFrom(condition));
                return report ? [report] : [];
              }
              if (source === usersTable) {
                const user = users.find((candidate) => candidate.id === targetIdFrom(condition)) ?? currentUser();
                return [user];
              }
              return [];
            }),
          });
        }),
      })),
    })),
    query: {
        usersTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            const values = conditionValues(where);
            return Promise.resolve(users.find((user) => values.includes(user.id) || values.includes(user.clerkUserId)) ?? currentUser());
          }),
          findMany: vi.fn().mockImplementation(() => Promise.resolve(users)),
        },
        eventsTable: {
          findMany: vi.fn().mockImplementation(() => Promise.resolve(events)),
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            // The route's equality expressions are opaque in this mock; there is
            // only one event in direct-lookup enrichment at a time in practice.
            return Promise.resolve(
              events.find((event) => event.id === where?.right)
              ?? events.find((event) => event.id === currentEventId)
              ?? events[0]
              ?? null,
            );
          }),
        },
        boardThreadsTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            if (currentAttachmentPath) {
              const attachment = attachments.find((candidate) => candidate.objectPath === currentAttachmentPath);
              const attachedPost = attachment?.postId
                ? posts.find((post) => post.id === attachment.postId)
                : null;
              const threadId = attachment?.threadId ?? attachedPost?.threadId;
              return Promise.resolve(threads.find((thread) => thread.id === threadId) ?? null);
            }
            const requestedId = targetIdFrom(where);
            const threadId = threads.some((thread) => thread.id === requestedId)
              ? requestedId
              : posts.find((post) => post.id === currentTargetId)?.threadId;
            return Promise.resolve(threads.find((thread) => thread.id === threadId) ?? null);
          }),
        },
        boardPostsTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            if (currentAttachmentPath) {
              const attachment = attachments.find((candidate) => candidate.objectPath === currentAttachmentPath);
              return Promise.resolve(posts.find((post) => post.id === attachment?.postId) ?? null);
            }
            return Promise.resolve(posts.find((post) => post.id === targetIdFrom(where)) ?? null);
          }),
        },
        boardThreadReportsTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            if (reporterForCurrentRequest == null) {
              return Promise.resolve(reports.find((report) => report.id === targetIdFrom(where)) ?? null);
            }
            const isReply = currentReportTargetType === "reply";
            return Promise.resolve(reports.find((report) =>
              report.status === "open"
              && report.targetType === currentReportTargetType
              && (isReply ? report.postId === currentTargetId : report.threadId === currentTargetId)
              && report.reporterUserId === reporterForCurrentRequest,
            ) ?? null);
          }),
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const requestedStatus = conditionValues(where).includes("resolved") ? "resolved" : "open";
            return Promise.resolve(reports.filter((report) => report.status === requestedStatus));
          }),
        },
        boardHiddenMembersTable: {
          findFirst: vi.fn().mockImplementation(() => Promise.resolve(hiddenMembers.find((row) =>
            row.hiderUserId === currentUser().id && row.hiddenUserId === currentTargetId) ?? null)),
          findMany: vi.fn().mockImplementation(() => Promise.resolve(hiddenMembers.filter((row) => row.hiderUserId === currentUser().id))),
        },
        boardAttachmentsTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(attachments.find((attachment) =>
              attachment.objectPath === (currentAttachmentPath ?? targetPathFrom(where))) ?? null)),
        },
        notificationsTable: {
          findFirst: vi.fn().mockImplementation(() => Promise.resolve(recentNotificationMock.existing)),
        },
        boardReactionsTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            const userId = currentUser().id;
            const targetId = targetIdFrom(where);
            return Promise.resolve(reactions.find((reaction) =>
              reaction.userId === userId &&
              reaction.reaction === currentReaction &&
              (reaction.threadId === targetId || reaction.postId === targetId)) ?? null);
          }),
        },
      },
  };
  dbMock.transaction = vi.fn(async (callback: (tx: any) => unknown) => callback({
    execute: vi.fn(async () => undefined),
    query: dbMock.query,
    select: vi.fn((selection?: any) => ({
      from: (source: object) => ({
        where: (condition: any) => {
          if (source === boardThreadReportsTable && selection?.count) {
            return Promise.resolve([{
              count: reports.filter((report) =>
                report.reporterUserId === currentUser().id
                && new Date(report.createdAt ?? NOW).getTime() > NOW.getTime() - 60 * 60 * 1000,
              ).length,
            }]);
          }
          return { for: async () => [currentUser()] };
        },
      }),
    })),
    insert: dbMock.insert,
    update: dbMock.update,
  }));
  return {
    isEventAudienceMember: sharedIsEventAudienceMember,
    isOperationalStaffRole: (user: any) => ["coach", "super_admin"].some((role) => user?.role === role || user?.roles?.includes(role)),
    hasUserRole: (user: any, role: string) => user?.role === role || user?.roles?.includes(role),
    getUserRoles: (user: any) => user?.roles ?? (user?.role ? [user.role] : []),
    db: dbMock,
    boardThreadsTable,
    boardThreadReportsTable,
    boardHiddenMembersTable,
    boardPostsTable,
    boardAttachmentsTable,
    usersTable,
    eventsTable,
    notificationsTable,
    boardReactionsTable,
  };
});

let currentClerkUserId = COACH.clerkUserId;
let currentTargetId: number | null = null;
let currentEventId: number | null = null;
let currentAttachmentPath: string | null = null;
let currentReaction = "helpful";
let currentReportTargetType: "thread" | "reply" = "thread";
let reporterForCurrentRequest: number | null = null;
function currentUser() {
  return users.find((user) => user.clerkUserId === currentClerkUserId) ?? COACH;
}

vi.mock("../middlewares/requireAuth", () => ({
  hasStudentAccess: (user: any) => user.role === "student" && user.householdId != null,
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-user") || COACH.clerkUserId;
    next();
  },
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-user") || COACH.clerkUserId;
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-user") || "clerk_test_coach";
    next();
  },
  requireSuperAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
}));

vi.mock("../lib/notifications", () => notificationMock);
vi.mock("../lib/email", () => ({
  sendEmail: emailMock.sendEmail,
  isDeliverableEmailAddress: (email: string | null | undefined) => Boolean(email),
}));
vi.mock("./settings", () => ({ getShortNamePrefix: emailMock.getShortNamePrefix }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/objectStorage", () => discussionStorageMock);
vi.mock("../lib/objectAcl", () => discussionAclMock);

const { default: boardRouter } = await import("./board");
const { default: usersRouter } = await import("./users");
const { default: storageRouter } = await import("./storage");

const app = express();
app.use(express.json());
app.use(boardRouter);
app.use(usersRouter);
app.use(storageRouter);
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  vi.setSystemTime(NOW);
  events.length = 0;
  threads.length = 0;
  posts.length = 0;
  reactions.length = 0;
  attachments.length = 0;
  reports.length = 0;
  reportNotifications.length = 0;
  hiddenMembers.length = 0;
  discussionStorageMock.objects.clear();
  discussionAclMock.policies.clear();
  nextReactionId = 1;
  nextThreadId = 10000;
  nextAttachmentId = 1;
  currentClerkUserId = COACH.clerkUserId;
  currentTargetId = null;
  currentEventId = null;
  currentAttachmentPath = null;
  currentReaction = "helpful";
  currentReportTargetType = "thread";
  reporterForCurrentRequest = null;
  nextPostId = 1000;
  notificationMock.createNotification.mockClear();
  emailMock.sendEmail.mockClear();
  recentNotificationMock.existing = null;
  selectCallIndex = 0;
  PARENT.podId = "pod-a";
  for (const user of users) {
    Object.assign(user, {
      approved: true,
      boardPostingBlocked: false,
      boardPostingBlockedAt: null,
      boardPostingBlockedByUserId: null,
      isActive: true,
      notificationsEnabled: true,
      emailNotifications: true,
      pushNotifications: true,
      notificationPreferences: { boardReplies: true, mutedBoardDiscussionIds: [] },
      email: user.id === COACH.id ? "coach@example.test" : "",
    });
  }
  Object.assign(PARENT, { role: "parent", notificationPreferencesLocked: false });
});

function addEvent(id: number, startTime: Date, endTime: Date) {
  const event = { id, title: `Event ${id}`, startTime, endTime, podIds: [], isAllTeam: true };
  events.push(event);
  return event;
}

function addThread(id: number, eventId: number, activity: Date) {
  threads.push({
    id,
    title: `Thread ${id}`,
    body: "Discussion",
    authorUserId: COACH.id,
    eventId,
    podId: null,
    isPinned: false,
    isLocked: false,
    replyCount: 0,
    lastReplyAt: activity,
    createdAt: new Date(activity.getTime() - 60_000),
  });
}

function addPost(id: number, threadId: number, authorUserId = RIDER.id, isDeleted = false) {
  posts.push({
    id,
    threadId,
    authorUserId,
    body: `Reply ${id}`,
    isDeleted,
    createdAt: NOW,
  });
}

function addDiscussionObject(
  objectPath: string,
  owner: DiscussionUser,
  versions: DiscussionObjectFixture[] = [{
    generation: "generation-1",
    contentType: "image/jpeg",
    size: 5,
    body: "image",
  }],
) {
  discussionStorageMock.objects.set(objectPath, versions);
  discussionAclMock.policies.set(objectPath, {
    owner: owner.clerkUserId,
    visibility: "private",
    aclRules: [],
  });
}

function addAttachment(
  objectPath: string,
  target: { threadId?: number; postId?: number },
  generation = "generation-1",
  contentType = "image/jpeg",
  size = 5,
) {
  attachments.push({
    id: nextAttachmentId++,
    objectPath,
    threadId: target.threadId ?? null,
    postId: target.postId ?? null,
    contentType,
    size,
    generation,
  });
}

type DiscussionUser = typeof COACH | typeof RIDER | typeof OTHER_RIDER | typeof PARENT | typeof OTHER_PARENT;

async function getThreads(path: string, user: DiscussionUser = COACH) {
  currentClerkUserId = user.clerkUserId;
  const threadId = path.match(/\/board\/threads\/(\d+)/)?.[1];
  currentTargetId = threadId ? Number(threadId) : null;
  const eventId = path.match(/[?&]eventId=(\d+)/)?.[1];
  currentEventId = eventId
    ? Number(eventId)
    : threadId
      ? threads.find((thread) => thread.id === Number(threadId))?.eventId ?? null
      : null;
  currentAttachmentPath = null;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function createReply(
  user: DiscussionUser,
  threadId: number,
  body = "A reply",
  options: { bodyFormat?: "plain" | "markdown"; imageObjectPaths?: unknown } = {},
) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = threadId;
  currentEventId = threads.find((thread) => thread.id === threadId)?.eventId ?? null;
  currentAttachmentPath = null;
  const response = await fetch(`${baseUrl}/board/threads/${threadId}/posts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user": user.clerkUserId,
    },
    body: JSON.stringify({ body, ...options }),
  });
  return { status: response.status, body: await response.json() };
}

async function setThreadMute(user: DiscussionUser, threadId: number, muted: boolean) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = threadId;
  currentEventId = threads.find((thread) => thread.id === threadId)?.eventId ?? null;
  const response = await fetch(`${baseUrl}/board/threads/${threadId}/mute`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify({ muted }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function getMemberProfile(user: DiscussionUser) {
  currentClerkUserId = user.clerkUserId;
  const response = await fetch(`${baseUrl}/users/me`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function patchMemberProfile(user: DiscussionUser, patch: Record<string, unknown>) {
  currentClerkUserId = user.clerkUserId;
  const response = await fetch(`${baseUrl}/users/me`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-test-user": user.clerkUserId,
    },
    body: JSON.stringify(patch),
  });
  return { status: response.status, body: await response.json() };
}

async function submitThreadReport(
  user: DiscussionUser,
  threadId: number,
  data: { reason: string; details?: string },
) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = threadId;
  currentReportTargetType = "thread";
  reporterForCurrentRequest = user.id;
  currentEventId = threads.find((thread) => thread.id === threadId)?.eventId ?? null;
  const response = await fetch(`${baseUrl}/board/threads/${threadId}/reports`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify(data),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function submitPostReport(
  user: DiscussionUser,
  postId: number,
  data: { reason: string; details?: string },
) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = postId;
  currentReportTargetType = "reply";
  reporterForCurrentRequest = user.id;
  const response = await fetch(`${baseUrl}/board/posts/${postId}/reports`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify(data),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function setPostingRestriction(userId: number, blocked: boolean) {
  currentClerkUserId = COACH.clerkUserId;
  currentTargetId = userId;
  const response = await fetch(`${baseUrl}/board/users/${userId}/posting-restriction`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-test-user": COACH.clerkUserId },
    body: JSON.stringify({ blocked }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function setMemberHidden(user: DiscussionUser, userId: number, hidden: boolean) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = userId;
  const response = await fetch(`${baseUrl}/board/hidden-members/${userId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify({ hidden }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function listBoardReports() {
  currentClerkUserId = COACH.clerkUserId;
  currentTargetId = null;
  const response = await fetch(`${baseUrl}/board/reports`, {
    headers: { "x-test-user": COACH.clerkUserId },
  });
  const text = await response.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, body };
}

async function listResolvedBoardReports(user: DiscussionUser = COACH) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = null;
  const response = await fetch(`${baseUrl}/board/reports/resolved`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  const text = await response.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, body };
}

async function resolveBoardReport(reportId: number, note?: string) {
  currentClerkUserId = COACH.clerkUserId;
  currentTargetId = reportId;
  reporterForCurrentRequest = null;
  const response = await fetch(`${baseUrl}/board/reports/${reportId}/resolve`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user": COACH.clerkUserId },
    body: JSON.stringify({ note }),
  });
  const text = await response.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, body };
}

async function createThreadWithImages(
  user: DiscussionUser,
  imageObjectPaths: unknown,
  options: { podId?: string; eventId?: number; bodyFormat?: "plain" | "markdown"; body?: string } = {},
) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = null;
  currentEventId = options.eventId ?? null;
  currentAttachmentPath = Array.isArray(imageObjectPaths) && imageObjectPaths.length === 1
    && typeof imageObjectPaths[0] === "string"
    ? imageObjectPaths[0]
    : null;
  const response = await fetch(`${baseUrl}/board/threads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user": user.clerkUserId,
    },
    body: JSON.stringify({
      title: "Picture planning",
      body: "Attached pictures",
      ...options,
      imageObjectPaths,
    }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function getDiscussionAttachment(user: DiscussionUser, objectPath: string) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = null;
  currentAttachmentPath = objectPath;
  const response = await fetch(`${baseUrl}/board/attachments${objectPath.replace("/objects", "")}`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  const body = await response.text();
  return { status: response.status, body };
}

async function toggleReaction(user: DiscussionUser, targetType: "thread" | "post", targetId: number, reaction = "helpful") {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = targetId;
  currentEventId = targetType === "thread"
    ? threads.find((thread) => thread.id === targetId)?.eventId ?? null
    : threads.find((thread) => thread.id === posts.find((post) => post.id === targetId)?.threadId)?.eventId ?? null;
  currentReaction = reaction;
  currentAttachmentPath = null;
  const response = await fetch(`${baseUrl}/board/reactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify({ targetType, targetId, reaction }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function getReactionView(user: DiscussionUser, targetType: "thread" | "post", targetId: number) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = targetId;
  currentAttachmentPath = null;
  const path = targetType === "thread"
    ? `/board/threads/${targetId}`
    : `/board/threads/${posts.find((post) => post.id === targetId)?.threadId}/posts`;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function getReactionMembers(user: DiscussionUser, targetType: "thread" | "post", targetId: number, reaction = "helpful") {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = targetId;
  currentReaction = reaction;
  currentAttachmentPath = null;
  const response = await fetch(`${baseUrl}/board/reactions/${targetType}/${targetId}?reaction=${reaction}`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function deleteThread(user: typeof COACH, threadId: number) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = threadId;
  const response = await fetch(`${baseUrl}/board/threads/${threadId}`, {
    method: "DELETE",
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status };
}

async function deletePost(user: typeof COACH, postId: number) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = postId;
  const response = await fetch(`${baseUrl}/board/posts/${postId}`, {
    method: "DELETE",
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status };
}

async function pinThread(threadId: number) {
  currentClerkUserId = COACH.clerkUserId;
  currentTargetId = threadId;
  const response = await fetch(`${baseUrl}/board/threads/${threadId}/pin`, {
    method: "PATCH",
    headers: { "x-test-user": COACH.clerkUserId },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function markBoardSeen(user: DiscussionUser) {
  currentClerkUserId = user.clerkUserId;
  const response = await fetch(`${baseUrl}/board/seen`, {
    method: "PATCH",
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function requestDiscussionUpload(user: DiscussionUser) {
  currentClerkUserId = user.clerkUserId;
  const response = await fetch(`${baseUrl}/board/attachments/request-url`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify({ name: "photo.jpg", size: 1024, contentType: "image/jpeg" }),
  });
  return { status: response.status, body: await response.json() };
}

function notifiedUserIds() {
  return notificationMock.createNotification.mock.calls.map((call) => call[0] as number);
}

async function waitForNotifiedUsers(userIds: number[]) {
  await vi.waitFor(() => {
    expect(new Set(notifiedUserIds())).toEqual(new Set(userIds));
  });
}

describe("discussion image security boundaries", () => {
  it("stores Markdown formats, keeps omitted formats plain, rejects inline images, and sends private CID reply pictures", async () => {
    const markdownThread = await createThreadWithImages(RIDER, [], {
      bodyFormat: "markdown",
      body: "**Rich** discussion",
    });
    expect(markdownThread.status).toBe(201);
    expect(markdownThread.body.bodyFormat).toBe("markdown");

    const legacyThread = await createThreadWithImages(RIDER, []);
    expect(legacyThread.status).toBe(201);
    expect(legacyThread.body.bodyFormat).toBe("plain");

    const inlineImageThread = await createThreadWithImages(RIDER, [], {
      bodyFormat: "markdown",
      body: "![remote](https://example.test/image.png)",
    });
    expect(inlineImageThread.status).toBe(400);
    expect(inlineImageThread.body.error).toContain("Upload pictures as attachments");
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(2));
    emailMock.sendEmail.mockClear();

    const threadId = 701;
    addThread(threadId, 0, NOW);
    const replyImagePath = "/objects/discussion-images/rich-reply";
    addDiscussionObject(replyImagePath, RIDER);
    const reply = await createReply(RIDER, threadId, "| Pace |\n| --- |\n| **steady** |", {
      bodyFormat: "markdown",
      imageObjectPaths: [replyImagePath],
    });
    expect(reply.status).toBe(201);
    expect(reply.body.bodyFormat).toBe("markdown");
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalled());
    const email = emailMock.sendEmail.mock.calls[0][0];
    expect(email.html).toContain("<table");
    expect(email.html).toContain("cid:board-reply-");
    expect(email.attachments[0].contentType).toBe("image/jpeg");
    expect(email.text).toContain("steady");
  });

  it("rejects images owned by another user, malformed paths, and paths already attached elsewhere", async () => {
    const ownedByRider = "/objects/discussion-images/rider-photo";
    addDiscussionObject(ownedByRider, RIDER);

    const ownerMismatch = await createThreadWithImages(OTHER_RIDER, [ownedByRider]);
    expect(ownerMismatch.status).toBe(400);
    expect(ownerMismatch.body).toEqual({ error: "You can only attach images you uploaded" });

    const malformed = await createThreadWithImages(RIDER, [
      "/objects/uploads/not-a-discussion-image",
    ]);
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: "Invalid discussion image" });

    addThread(500, 0, NOW);
    addAttachment(ownedByRider, { threadId: 500 });
    const reused = await createThreadWithImages(RIDER, [ownedByRider]);
    expect(reused.status).toBe(400);
    expect(reused.body).toEqual({ error: "This image is already attached to a discussion" });
  });

  it("enforces the four-image limit before accepting a discussion", async () => {
    const paths = Array.from({ length: 5 }, (_, index) => `/objects/discussion-images/photo-${index}`);
    for (const path of paths) addDiscussionObject(path, RIDER);

    const response = await createThreadWithImages(RIDER, paths);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Attach no more than 4 images" });
    expect(threads).toHaveLength(0);
    expect(attachments).toHaveLength(0);
  });

  it("returns 404 for pod and event pictures outside the discussion audience", async () => {
    const podPath = "/objects/discussion-images/pod-photo";
    addDiscussionObject(podPath, RIDER);
    addThread(600, 0, NOW);
    threads[0].podId = "pod-a";
    addAttachment(podPath, { threadId: 600 });

    expect((await getDiscussionAttachment(RIDER, podPath)).status).toBe(200);
    expect((await getDiscussionAttachment(OTHER_RIDER, podPath)).status).toBe(404);

    const eventPath = "/objects/discussion-images/event-photo";
    addDiscussionObject(eventPath, RIDER);
    const event = addEvent(601, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;
    addThread(601, event.id, NOW);
    addAttachment(eventPath, { threadId: 601 });

    expect((await getDiscussionAttachment(RIDER, eventPath)).status).toBe(200);
    expect((await getDiscussionAttachment(OTHER_RIDER, eventPath)).status).toBe(404);
  });

  it("stops serving pictures attached to deleted replies", async () => {
    const objectPath = "/objects/discussion-images/deleted-reply";
    addDiscussionObject(objectPath, RIDER);
    addThread(700, 0, NOW);
    addPost(701, 700);
    addAttachment(objectPath, { postId: 701 });

    expect((await getDiscussionAttachment(RIDER, objectPath)).status).toBe(200);
    posts[0].isDeleted = true;
    expect((await getDiscussionAttachment(RIDER, objectPath)).status).toBe(404);
  });

  it("serves the recorded immutable generation after an object is overwritten", async () => {
    const objectPath = "/objects/discussion-images/versioned";
    addDiscussionObject(objectPath, RIDER, [
      { generation: "generation-1", contentType: "image/jpeg", size: 8, body: "original" },
      { generation: "generation-2", contentType: "image/jpeg", size: 9, body: "overwrite" },
    ]);
    addThread(800, 0, NOW);
    addAttachment(objectPath, { threadId: 800 }, "generation-1", "image/jpeg", 8);

    const response = await getDiscussionAttachment(RIDER, objectPath);
    expect(response.status).toBe(200);
    expect(response.body).toBe("original");
    expect(discussionStorageMock.getObjectEntityFile).toHaveBeenLastCalledWith(objectPath, "generation-1");
  });

  it("refuses discussion-image paths through the generic storage route", async () => {
    const response = await fetch(`${baseUrl}/storage/objects/discussion-images/private-photo`, {
      headers: { "x-test-user": RIDER.clerkUserId },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Object not found" });
  });
});

describe("Community Board activity notifications", () => {
  it("notifies everyone with current access to general, pod, and event discussions", async () => {
    // Board authorization does not separately filter isActive; visibility must
    // follow the actual board access rules rather than add a new audience gate.
    OTHER_RIDER.isActive = false;
    const general = await createThreadWithImages(RIDER, undefined);
    expect(general.status).toBe(201);
    await waitForNotifiedUsers([COACH.id, OTHER_RIDER.id, PARENT.id, OTHER_PARENT.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));
    expect(emailMock.sendEmail.mock.calls[0][0].to).toBe(COACH.email);
    expect(notificationMock.createNotification.mock.calls.every((call) => call[1] === "boardReplies")).toBe(true);

    notificationMock.createNotification.mockClear();
    emailMock.sendEmail.mockClear();
    const pod = await createThreadWithImages(RIDER, undefined, { podId: "pod-a" });
    expect(pod.status).toBe(201);
    await waitForNotifiedUsers([COACH.id, PARENT.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));

    notificationMock.createNotification.mockClear();
    emailMock.sendEmail.mockClear();
    const event = addEvent(501, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;
    const eventThread = await createThreadWithImages(RIDER, undefined, { eventId: event.id });
    expect(eventThread.status).toBe(201);
    await waitForNotifiedUsers([COACH.id, PARENT.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));
  });

  it("notifies current discussion participants for reactions on thread starters and replies, but not removals", async () => {
    addThread(100, 0, NOW);
    addPost(200, 100, RIDER.id);

    const threadReaction = await toggleReaction(RIDER, "thread", 100);
    expect(threadReaction.status).toBe(200);
    await waitForNotifiedUsers([COACH.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));
    const helpfulBody = 'Rider Trail reacted with Helpful to the discussion in "Thread 100"';
    expect(notificationMock.createNotification.mock.calls.map((call) => call[3]))
      .toEqual([helpfulBody]);
    expect(notificationMock.createNotification.mock.calls.map((call) => call[4]))
      .toEqual(["/messages/thread/100?target=starter"]);
    expect(emailMock.sendEmail.mock.calls[0][0].text).toContain(helpfulBody);
    expect(emailMock.sendEmail.mock.calls[0][0].html)
      .toContain('Rider Trail reacted with Helpful to the discussion in &quot;Thread 100&quot;');

    notificationMock.createNotification.mockClear();
    emailMock.sendEmail.mockClear();
    const replyReaction = await toggleReaction(OTHER_PARENT, "post", 200, "celebrate");
    expect(replyReaction.status).toBe(200);
    await waitForNotifiedUsers([COACH.id, RIDER.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));
    const celebrateBody = 'Other Parent Trail reacted with Celebrate to a reply in "Thread 100"';
    expect(notificationMock.createNotification.mock.calls.map((call) => call[3]))
      .toEqual([celebrateBody, celebrateBody]);
    expect(notificationMock.createNotification.mock.calls.map((call) => call[4]))
      .toEqual(["/messages/thread/100?reply=200", "/messages/thread/100?reply=200"]);
    expect(emailMock.sendEmail.mock.calls[0][0].text).toContain(celebrateBody);
    expect(emailMock.sendEmail.mock.calls[0][0].html)
      .toContain('Other Parent Trail reacted with Celebrate to a reply in &quot;Thread 100&quot;');
    expect(emailMock.sendEmail.mock.calls[0][0].html)
      .toContain('href="https://trailteam.app/messages/thread/100?reply=200">Open reply in TrailTeam</a>');

    notificationMock.createNotification.mockClear();
    emailMock.sendEmail.mockClear();
    const likeReaction = await toggleReaction(OTHER_PARENT, "thread", 100, "like");
    expect(likeReaction.status).toBe(200);
    await waitForNotifiedUsers([COACH.id, RIDER.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));
    const likeBody = 'Other Parent Trail reacted with Like to the discussion in "Thread 100"';
    expect(notificationMock.createNotification.mock.calls.map((call) => call[3]))
      .toEqual([likeBody, likeBody]);
    expect(notificationMock.createNotification.mock.calls.map((call) => call[4]))
      .toEqual(["/messages/thread/100?target=starter", "/messages/thread/100?target=starter"]);
    expect(emailMock.sendEmail.mock.calls[0][0].text).toContain(likeBody);

    notificationMock.createNotification.mockClear();
    emailMock.sendEmail.mockClear();
    const removedReaction = await toggleReaction(OTHER_PARENT, "post", 200, "celebrate");
    expect(removedReaction.status).toBe(200);
    expect(notificationMock.createNotification).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("links new-reply alerts and emails to the created reply", async () => {
    addThread(103, 0, NOW);
    threads[0].authorUserId = PARENT.id;
    Object.assign(PARENT, { email: "parent@example.test" });

    const reply = await createReply(RIDER, 103, "The updated pickup time is 4 PM.");
    expect(reply.status).toBe(201);

    const expectedLink = `/messages/thread/103?reply=${reply.body.id}`;
    await vi.waitFor(() => expect(
      notificationMock.createNotification.mock.calls.some(
        (call) => call[0] === PARENT.id && call[4] === expectedLink,
      ),
    ).toBe(true));
    await vi.waitFor(() => expect(emailMock.sendEmail.mock.calls.some(
      (call) => call[0].to === PARENT.email,
    )).toBe(true));

    expect(emailMock.sendEmail.mock.calls.find((call) => call[0].to === PARENT.email)?.[0].html)
      .toContain(`href="https://trailteam.app${expectedLink}">Open reply in TrailTeam</a>`);
  });

  it("does not re-notify or re-email someone about the same reaction within a day", async () => {
    addThread(100, 0, NOW);
    recentNotificationMock.existing = { id: 1 };

    const reaction = await toggleReaction(RIDER, "thread", 100);
    expect(reaction.status).toBe(200);
    // The notify fan-out is fire-and-forget; give it a turn to run before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notificationMock.createNotification).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("does not notify a former participant who no longer has access to a pod thread", async () => {
    addThread(101, 0, NOW);
    threads[0].authorUserId = RIDER.id;
    threads[0].podId = "pod-a";
    addPost(201, 101, OTHER_RIDER.id);

    const reaction = await toggleReaction(PARENT, "thread", 101);
    expect(reaction.status).toBe(200);
    await waitForNotifiedUsers([RIDER.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).not.toHaveBeenCalled());
  });

  it("honors board and email notification preferences", async () => {
    Object.assign(OTHER_RIDER, {
      email: "other-rider@example.test",
      emailNotifications: false,
      notificationPreferences: { boardReplies: true },
    });
    Object.assign(PARENT, {
      email: "parent@example.test",
      notificationPreferences: { boardReplies: false },
    });

    const created = await createThreadWithImages(RIDER, undefined);
    expect(created.status).toBe(201);
    await waitForNotifiedUsers([COACH.id, OTHER_RIDER.id, OTHER_PARENT.id]);
    await vi.waitFor(() => expect(emailMock.sendEmail).toHaveBeenCalledTimes(1));
    expect(emailMock.sendEmail.mock.calls[0][0].to).toBe(COACH.email);
  });

  it("keeps pin, delete, open, mark-seen, and upload actions notification-free", async () => {
    addThread(102, 0, NOW);
    addPost(202, 102, RIDER.id);

    expect((await getThreads("/board/threads/102", COACH)).status).toBe(200);
    expect((await pinThread(102)).status).toBe(200);
    expect((await deletePost(RIDER, 202)).status).toBe(204);
    expect((await markBoardSeen(PARENT)).status).toBe(200);
    expect((await requestDiscussionUpload(RIDER)).status).toBe(200);
    expect((await deleteThread(COACH, 102)).status).toBe(204);

    expect(notificationMock.createNotification).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });
});

describe("per-discussion alert mutes", () => {
  it("returns a mute in a separate profile session and suppresses replies only for that discussion", async () => {
    const mutedThreadId = 609;
    const unmutedThreadId = 610;
    addThread(mutedThreadId, 0, NOW);
    addThread(unmutedThreadId, 0, NOW);
    threads[0].authorUserId = PARENT.id;
    threads[1].authorUserId = PARENT.id;
    Object.assign(PARENT, { email: "parent@example.test" });

    const muteResponse = await setThreadMute(PARENT, mutedThreadId, true);
    expect(muteResponse).toEqual({ status: 200, body: { muted: true } });

    const preferenceUpdate = await patchMemberProfile(PARENT, {
      notificationPreferences: {
        practiceReminders: false,
        coachMessages: true,
        carpoolUpdates: true,
        eventReminders: true,
        rosterUpdates: true,
        boardReplies: true,
      },
    });
    expect(preferenceUpdate.status).toBe(200);
    expect(PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([mutedThreadId]);

    // A new authenticated request represents the member opening TrailTeam on
    // another device after changing a different notification preference.
    const otherSessionProfile = await getMemberProfile(PARENT);
    expect(otherSessionProfile.status).toBe(200);
    expect(otherSessionProfile.body.notificationPreferences.mutedBoardDiscussionIds)
      .toEqual([mutedThreadId]);

    const mutedReply = await createReply(RIDER, mutedThreadId);
    expect(mutedReply.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notificationMock.createNotification.mock.calls.filter((call) => call[0] === PARENT.id))
      .toHaveLength(0);
    expect(emailMock.sendEmail.mock.calls.filter((call) => call[0].to === PARENT.email))
      .toHaveLength(0);

    const unmutedReply = await createReply(RIDER, unmutedThreadId);
    expect(unmutedReply.status).toBe(201);
    await vi.waitFor(() => {
      expect(notificationMock.createNotification.mock.calls.filter((call) => call[0] === PARENT.id))
        .toHaveLength(1);
      expect(emailMock.sendEmail.mock.calls.filter((call) => call[0].to === PARENT.email))
        .toHaveLength(1);
    });
    expect(notificationMock.createNotification.mock.calls.find((call) => call[0] === PARENT.id)?.[4])
      .toBe(`/messages/thread/${unmutedThreadId}?reply=${unmutedReply.body.id}`);
  });

  it("persists a member's mute and allows them to unmute the accessible discussion", async () => {
    addThread(606, 0, NOW);

    const muted = await setThreadMute(PARENT, 606, true);
    expect(muted).toEqual({ status: 200, body: { muted: true } });
    expect(PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([606]);

    const repeatedMute = await setThreadMute(PARENT, 606, true);
    expect(repeatedMute).toEqual({ status: 200, body: { muted: true } });
    expect(PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([606]);

    const unmuted = await setThreadMute(PARENT, 606, false);
    expect(unmuted).toEqual({ status: 200, body: { muted: false } });
    expect(PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([]);
  });

  it("enforces current discussion access and parent-locked notification preferences", async () => {
    addThread(607, 0, NOW);
    threads[0].podId = "pod-a";
    const denied = await setThreadMute(OTHER_PARENT, 607, true);
    expect(denied.status).toBe(403);
    expect(OTHER_PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([]);
    OTHER_PARENT.notificationPreferences.mutedBoardDiscussionIds = [607];
    const deniedUnmute = await setThreadMute(OTHER_PARENT, 607, false);
    expect(deniedUnmute.status).toBe(403);
    expect(OTHER_PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([607]);

    threads[0].podId = null;
    Object.assign(PARENT, { role: "student", notificationPreferencesLocked: true });
    const locked = await setThreadMute(PARENT, 607, true);
    expect(locked.status).toBe(403);
    expect(PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([]);
    PARENT.notificationPreferences.mutedBoardDiscussionIds = [607];
    const lockedUnmute = await setThreadMute(PARENT, 607, false);
    expect(lockedUnmute.status).toBe(403);
    expect(PARENT.notificationPreferences.mutedBoardDiscussionIds).toEqual([607]);
  });

  it("suppresses every alert channel only for the muted discussion", async () => {
    const mutedThreadId = 608;
    addThread(mutedThreadId, 0, NOW);
    threads[0].authorUserId = PARENT.id;
    Object.assign(PARENT, {
      email: "parent@example.test",
      notificationPreferences: { boardReplies: true, mutedBoardDiscussionIds: [mutedThreadId] },
    });

    const reply = await createReply(RIDER, mutedThreadId);
    expect(reply.status).toBe(201);

    const newDiscussion = await createThreadWithImages(RIDER, []);
    expect(newDiscussion.status).toBe(201);
    await vi.waitFor(() => expect(emailMock.sendEmail.mock.calls.some((call) =>
      call[0].to === PARENT.email && call[0].subject.includes("New discussion on the board"),
    )).toBe(true));
    expect(notificationMock.createNotification.mock.calls.filter((call) => call[0] === PARENT.id)).toHaveLength(1);
    expect(emailMock.sendEmail.mock.calls.filter((call) => call[0].to === PARENT.email)).toHaveLength(1);
  });
});

describe("discussion reports", () => {
  it("stores an authorized report and sends its details only to staff", async () => {
    const event = addEvent(808, new Date("2026-09-01T12:00:00Z"), new Date("2026-09-01T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;
    addThread(808, event.id, NOW);

    const submitted = await submitThreadReport(PARENT, 808, {
      reason: "harassment",
      details: "This reply targets another rider.",
    });

    expect(submitted.status).toBe(201);
    expect(submitted.body.reportId).toBe(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      threadId: 808,
      threadTitle: "Thread 808",
      reporterUserId: PARENT.id,
      reporterName: "Parent Trail",
      reason: "harassment",
      details: "This reply targets another rider.",
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith(
      COACH.id,
      "board_thread_reported",
      "Community Board report",
      expect.stringContaining("Parent Trail reported"),
      "/messages/thread/808?target=starter",
    );
    expect(emailMock.sendEmail).not.toHaveBeenCalled();

    const denied = await submitThreadReport(OTHER_PARENT, 808, { reason: "spam" });
    expect(denied.status).toBe(403);
    const invalid = await submitThreadReport(PARENT, 808, { reason: "not-a-reason" });
    expect(invalid.status).toBe(400);
    expect(reports).toHaveLength(1);
  });

  it("reports a single reply, returns duplicate open reports, and includes the reply excerpt in staff alerts", async () => {
    addThread(809, 0, NOW);
    addPost(2001, 809, RIDER.id);
    posts[0].body = "A reply with specific details for the coach to review.";
    const first = await submitPostReport(PARENT, posts[0].id, {
      reason: "inappropriate_content",
      details: "Please review the comment.",
    });
    expect(first.status).toBe(201);
    expect(reports[0]).toMatchObject({
      threadId: 809,
      postId: 2001,
      targetType: "reply",
      contentExcerpt: "A reply with specific details for the coach to review.",
      reporterName: "Parent Trail",
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith(
      COACH.id,
      "board_thread_reported",
      "Community Board report",
      expect.stringContaining("A reply with specific details for the coach to review."),
      "/messages/thread/809?reply=2001",
    );
    const alertText = notificationMock.createNotification.mock.calls[0][3] as string;
    expect(alertText).toContain("Reason: Inappropriate content");
    expect(alertText).toContain("Please review the comment.");
    expect(notificationMock.createNotification.mock.calls.some((call) => call[0] === OTHER_PARENT.id)).toBe(false);
    expect(emailMock.sendEmail).not.toHaveBeenCalled();

    notificationMock.createNotification.mockClear();
    const duplicate = await submitPostReport(PARENT, posts[0].id, { reason: "spam" });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.reportId).toBe(first.body.reportId);
    expect(reports).toHaveLength(1);
    expect(notificationMock.createNotification).not.toHaveBeenCalled();
  });

  it("rate-limits new reports from one member while allowing duplicate submissions to return the open report", async () => {
    for (let index = 0; index < 6; index += 1) {
      addThread(820 + index, 0, NOW);
    }
    for (let index = 0; index < 5; index += 1) {
      expect((await submitThreadReport(PARENT, 820 + index, { reason: "spam" })).status).toBe(201);
    }
    const duplicate = await submitThreadReport(PARENT, 820, { reason: "other" });
    expect(duplicate.status).toBe(200);
    const limited = await submitThreadReport(PARENT, 825, { reason: "spam" });
    expect(limited.status).toBe(429);
    expect(reports).toHaveLength(5);
  });

  it("stores automatic flags without rejecting a thread and allows coaches to review the report", async () => {
    const response = await createThreadWithImages(RIDER, [], { body: "That was damn hard, but fun." });
    expect(response.status).toBe(201);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reporterName: "Automatic flag",
      reporterUserId: null,
      reason: "inappropriate_content",
      isAutomatic: true,
      targetType: "thread",
    });
    expect(notificationMock.createNotification.mock.calls.some((call) =>
      call[0] === COACH.id && String(call[3]).includes("Automatic flag"),
    )).toBe(true);
  });

  it("automatically reports objectionable replies without rejecting them and ignores near-matches", async () => {
    addThread(828, 0, NOW);
    const flaggedReply = await createReply(RIDER, 828, "That reply was shit.");
    expect(flaggedReply.status).toBe(201);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      targetType: "reply",
      postId: 1000,
      reporterName: "Automatic flag",
      isAutomatic: true,
    });

    const falsePositive = await createReply(OTHER_RIDER, 828, "The assistant in class liked Scunthorpe and shitake.");
    expect(falsePositive.status).toBe(201);
    expect(reports).toHaveLength(1);
  });

  it("keeps open reports separate from private, read-only resolved history", async () => {
    addThread(829, 0, NOW);
    await submitThreadReport(PARENT, 829, { reason: "other", details: "Please take a look." });

    const queue = await listBoardReports();
    expect(queue.status, JSON.stringify(queue.body)).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({
      targetType: "thread",
      reason: "other",
      details: "Please take a look.",
      reporterName: "Parent Trail",
      status: "open",
      link: "/messages/thread/829?target=starter",
    });
    const resolved = await resolveBoardReport(queue.body[0].id, "Reviewed and discussed with the member.");
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({
      id: queue.body[0].id,
      status: "resolved",
      resolutionNote: "Reviewed and discussed with the member.",
    });
    expect((await listBoardReports()).body).toHaveLength(0);

    const history = await listResolvedBoardReports();
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      id: queue.body[0].id,
      reporterName: "Parent Trail",
      reason: "other",
      resolutionNote: "Reviewed and discussed with the member.",
      resolvedAt: expect.any(String),
      link: "/messages/thread/829?target=starter",
      status: "resolved",
    });
    expect((await listResolvedBoardReports(RIDER)).status).toBe(403);
    const originalRole = OTHER_RIDER.role;
    OTHER_RIDER.role = "super_admin";
    expect((await listResolvedBoardReports(OTHER_RIDER)).status).toBe(200);
    OTHER_RIDER.role = originalRole;
  });

  it("lets staff restrict only Board posting and restore it later", async () => {
    addThread(830, 0, NOW);
    const blocked = await setPostingRestriction(RIDER.id, true);
    expect(blocked.status).toBe(200);
    const attemptedReply = await createReply(RIDER, 830);
    expect(attemptedReply.status).toBe(403);
    expect(attemptedReply.body.error).toContain("You can still read the Board");
    const readable = await getThreads("/board/threads?scope=general", RIDER);
    expect(readable.status).toBe(200);

    const restored = await setPostingRestriction(RIDER.id, false);
    expect(restored.status).toBe(200);
    expect((await createReply(RIDER, 830)).status).toBe(201);
  });

  it("persists hidden-member choices and suppresses Board alerts from hidden authors", async () => {
    addThread(840, 0, NOW);
    threads[0].authorUserId = PARENT.id;
    const hidden = await setMemberHidden(OTHER_PARENT, RIDER.id, true);
    expect(hidden).toEqual({ status: 200, body: { hidden: true } });
    expect(hiddenMembers).toContainEqual(expect.objectContaining({
      hiderUserId: OTHER_PARENT.id,
      hiddenUserId: RIDER.id,
    }));

    notificationMock.createNotification.mockClear();
    const reply = await createReply(RIDER, 840, "A reply from the hidden member");
    expect(reply.status).toBe(201);
    await vi.waitFor(() => expect(notificationMock.createNotification).toHaveBeenCalled());
    expect(notificationMock.createNotification.mock.calls.some((call) => call[0] === OTHER_PARENT.id)).toBe(false);

    const unhidden = await setMemberHidden(OTHER_PARENT, RIDER.id, false);
    expect(unhidden).toEqual({ status: 200, body: { hidden: false } });
    expect(hiddenMembers).toHaveLength(0);
  });
});

describe("reply notifications when a reply's picture can't be loaded", () => {
  it("still sends the in-app notification and a text-only email", async () => {
    addThread(609, 0, NOW);
    threads[0].authorUserId = PARENT.id;
    Object.assign(PARENT, { email: "parent@example.test" });
    // Attachment row exists but the stored object is gone (e.g. deleted or storage hiccup).
    addAttachment("/objects/discussion-images/missing-object", { postId: 1000 });

    const reply = await createReply(RIDER, 609, "Thanks, see you there");
    expect(reply.status).toBe(201);

    // (The mock DB returns every user as a participant, so assert on PARENT specifically.)
    await vi.waitFor(() => expect(
      notificationMock.createNotification.mock.calls.some((call) => call[0] === PARENT.id),
    ).toBe(true));
    await vi.waitFor(() => expect(emailMock.sendEmail.mock.calls.some((call) =>
      call[0].to === PARENT.email && (call[0].attachments ?? []).length === 0,
    )).toBe(true));
  });
});

describe("event discussion board visibility and ordering", () => {
  it("returns accessible unread thread IDs for families and staff before the board is marked seen", async () => {
    const seenAt = new Date(NOW.getTime() - 10_000);
    Object.assign(PARENT, { boardLastSeenAt: seenAt });
    Object.assign(COACH, { boardLastSeenAt: seenAt });
    const admin = { ...COACH, id: 6, clerkUserId: "clerk_test_admin", role: "super_admin" };

    addThread(70, 0, new Date(seenAt.getTime() - 20_000));
    addThread(71, 0, new Date(seenAt.getTime() - 60_000));
    threads[1].lastReplyAt = new Date(seenAt.getTime() + 1_000);
    addThread(72, 0, new Date(seenAt.getTime() + 2_000));

    users.push(admin);
    try {
      for (const viewer of [PARENT, COACH, admin]) {
        const result = await getThreads("/board/unread-count", viewer);
        expect(result.status).toBe(200);
        expect(result.body).toEqual({ count: 2, threadIds: [71, 72] });
      }
    } finally {
      users.splice(users.indexOf(admin), 1);
    }
  });

  it("does not return unread IDs for an event discussion outside a family's audience", async () => {
    const event = addEvent(73, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;
    addThread(73, event.id, NOW);

    const outsideAudience = await getThreads("/board/unread-count", OTHER_PARENT);
    expect(outsideAudience.body).toEqual({ count: 0, threadIds: [] });

    const withinAudience = await getThreads("/board/unread-count", PARENT);
    expect(withinAudience.body).toEqual({ count: 1, threadIds: [73] });
  });

  it("lets an audience parent start and reply to a pod-scoped event discussion", async () => {
    const event = addEvent(71, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;

    const created = await createThreadWithImages(PARENT, undefined, { eventId: event.id });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ eventId: event.id, authorUserId: PARENT.id });

    const listed = await getThreads(`/board/threads?scope=event&eventId=${event.id}`, PARENT);
    expect(listed.status).toBe(200);
    expect(listed.body.map((thread: ThreadFixture) => thread.id)).toContain(created.body.id);

    const reply = await createReply(PARENT, created.body.id, "I can help coordinate the pickup.");
    expect(reply.status).toBe(201);
  });

  it("keeps parents outside a pod event audience from discussing it", async () => {
    const event = addEvent(72, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;
    addThread(72, event.id, NOW);
    const threadId = threads[0].id;
    const imagePath = "/objects/discussion-images/parent-event-photo";
    addDiscussionObject(imagePath, PARENT);
    addAttachment(imagePath, { threadId });

    const listed = await getThreads(`/board/threads?scope=event&eventId=${event.id}`, OTHER_PARENT);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);
    const deniedThread = await getThreads(`/board/threads/${threadId}`, OTHER_PARENT);
    expect(deniedThread.status).toBe(403);
    expect(deniedThread.body).toEqual({
      error: "Forbidden",
      code: "EVENT_DISCUSSION_ACCESS_REVOKED",
    });
    expect((await createThreadWithImages(OTHER_PARENT, undefined, { eventId: event.id })).status).toBe(403);
    expect((await createReply(OTHER_PARENT, threadId)).status).toBe(403);
    expect((await getDiscussionAttachment(OTHER_PARENT, imagePath)).status).toBe(404);
    expect((await toggleReaction(OTHER_PARENT, "thread", threadId)).status).toBe(403);
  });

  it("lets an audience parent discuss a team-wide event", async () => {
    const event = addEvent(73, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = [];
    event.isAllTeam = true;

    const created = await createThreadWithImages(PARENT, undefined, { eventId: event.id });
    expect(created.status).toBe(201);
    expect((await createReply(PARENT, created.body.id)).status).toBe(201);
  });

  it("uses the shared pod, team-wide, and staff audience rules", async () => {
    const event = addEvent(70, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    event.podIds = ["pod-a"];
    event.isAllTeam = false;
    addThread(70, event.id, NOW);

    expect((await getThreads("/board/threads/70", RIDER)).status).toBe(200);
    expect((await getThreads("/board/threads/70", OTHER_RIDER)).status).toBe(403);
    expect((await getThreads("/board/threads/70", COACH)).status).toBe(200);

    event.isAllTeam = true;
    expect((await getThreads("/board/threads/70", OTHER_RIDER)).status).toBe(200);
  });

  it("updates every discussion route when a parent moves into and out of an invited pod", async () => {
    // Add the team-wide event first because the lightweight event lookup mock
    // uses the first event when it cannot decode an opaque equality expression.
    const teamEvent = addEvent(81, new Date("2026-08-21T14:00:00Z"), new Date("2026-08-21T15:00:00Z"));
    teamEvent.podIds = [];
    teamEvent.isAllTeam = true;
    addThread(81, teamEvent.id, NOW);

    const invitedEvent = addEvent(80, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    invitedEvent.podIds = ["pod-b"];
    invitedEvent.isAllTeam = false;
    const imagePath = "/objects/discussion-images/pod-move-photo";
    addDiscussionObject(imagePath, PARENT);
    addThread(80, invitedEvent.id, NOW);
    addPost(801, 80);
    addAttachment(imagePath, { threadId: 80 });

    // The parent starts outside the invited pod and cannot use a saved link or
    // discover the discussion through the event list.
    expect((await getThreads(`/board/threads?scope=event&eventId=${invitedEvent.id}`, PARENT)).body).toEqual([]);
    expect((await getThreads("/board/threads/80", PARENT)).status).toBe(403);

    PARENT.podId = "pod-b";
    expect((await getThreads(`/board/threads?scope=event&eventId=${invitedEvent.id}`, PARENT)).body.map((thread: ThreadFixture) => thread.id))
      .toEqual([80]);
    expect((await getThreads("/board/threads/80", PARENT)).status).toBe(200);
    expect((await getReactionView(PARENT, "post", 801)).status).toBe(200);
    expect((await createReply(PARENT, 80)).status).toBe(201);
    expect((await toggleReaction(PARENT, "thread", 80)).status).toBe(200);
    expect((await toggleReaction(PARENT, "post", 801)).status).toBe(200);
    expect((await getReactionMembers(PARENT, "thread", 80)).status).toBe(200);
    expect((await getDiscussionAttachment(PARENT, imagePath)).status).toBe(200);

    PARENT.podId = "pod-a";
    expect((await getThreads(`/board/threads?scope=event&eventId=${invitedEvent.id}`, PARENT)).body).toEqual([]);
    expect((await getThreads("/board/threads/80", PARENT)).status).toBe(403);
    expect((await getReactionView(PARENT, "post", 801)).status).toBe(403);
    expect((await createReply(PARENT, 80)).status).toBe(403);
    expect((await toggleReaction(PARENT, "thread", 80)).status).toBe(403);
    expect((await toggleReaction(PARENT, "post", 801)).status).toBe(403);
    expect((await getReactionMembers(PARENT, "thread", 80)).status).toBe(403);
    expect((await getDiscussionAttachment(PARENT, imagePath)).status).toBe(404);

    // Team-wide discussions do not change visibility as the parent changes
    // pods, including through a direct saved-thread lookup and reply.
    expect((await getThreads("/board/threads/81", PARENT)).status).toBe(200);
    PARENT.podId = "pod-b";
    expect((await getThreads("/board/threads/81", PARENT)).status).toBe(200);
    expect((await createReply(PARENT, 81)).status).toBe(201);
  });

  it("uses current event names in reply notifications and stored titles elsewhere", async () => {
    const event = addEvent(60, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    addThread(60, event.id, NOW);
    threads[0].title = "Discussion: Old Event Name";
    event.title = "Renamed Event";

    const eventReply = await createReply(RIDER, 60);
    expect(eventReply.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notificationMock.createNotification.mock.calls.map((call) => call[3]))
      .toContain('Someone replied to "Discussion: Renamed Event"');

    notificationMock.createNotification.mockClear();
    addThread(61, 0, NOW);
    threads[1].title = "Family planning";

    const generalReply = await createReply(RIDER, 61);
    expect(generalReply.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notificationMock.createNotification.mock.calls.map((call) => call[3]))
      .toContain('Someone replied to "Family planning"');
  });

  it("returns thread actions from the same permission rules used by the API", async () => {
    addThread(5, 0, NOW);

    const familyViewer = await getThreads("/board/threads/5", RIDER);
    expect(familyViewer.body.permissions).toEqual({ canPin: false, canDelete: false });

    threads[0].authorUserId = RIDER.id;
    const authorViewer = await getThreads("/board/threads/5", RIDER);
    expect(authorViewer.body.permissions).toEqual({ canPin: false, canDelete: true });

    const coachViewer = await getThreads("/board/threads/5", COACH);
    expect(coachViewer.body.permissions).toEqual({ canPin: true, canDelete: true });
  });

  it("includes upcoming, active, and recently ended events, but expires after 36 hours", async () => {
    addEvent(1, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    addEvent(2, new Date("2026-08-20T10:00:00Z"), new Date("2026-08-20T11:00:00Z"));
    addEvent(3, new Date("2026-08-19T00:00:00Z"), new Date("2026-08-19T00:00:00Z")); // 35 hours ago
    addEvent(4, new Date("2026-08-18T23:59:59Z"), new Date("2026-08-18T23:59:59Z")); // 36h + 1ms ago
    addThread(1, 1, new Date("2026-08-20T09:00:00Z"));
    addThread(2, 2, new Date("2026-08-20T09:30:00Z"));
    addThread(3, 3, new Date("2026-08-20T09:45:00Z"));
    addThread(4, 4, new Date("2026-08-20T09:50:00Z"));

    const result = await getThreads("/board/threads?scope=event");

    expect(result.status).toBe(200);
    expect(result.body.map((thread: ThreadFixture) => thread.id)).toEqual([3, 2, 1]);
  });

  it("keeps a thread visible at exactly 36 hours after event end", async () => {
    addEvent(10, new Date("2026-08-18T00:00:00Z"), new Date("2026-08-19T00:00:00Z"));
    addThread(10, 10, new Date("2026-08-19T01:00:00Z"));

    const result = await getThreads("/board/threads?scope=event");

    expect(result.body.map((thread: ThreadFixture) => thread.id)).toEqual([10]);
  });

  it("uses most recent activity when events share a start time", async () => {
    const start = new Date("2026-08-21T12:00:00Z");
    addEvent(20, start, new Date("2026-08-21T13:00:00Z"));
    addEvent(21, start, new Date("2026-08-21T14:00:00Z"));
    addThread(20, 20, new Date("2026-08-20T08:00:00Z"));
    addThread(21, 21, new Date("2026-08-20T10:00:00Z"));

    const result = await getThreads("/board/threads?scope=event");

    expect(result.body.map((thread: ThreadFixture) => thread.id)).toEqual([21, 20]);
  });

  it("returns an expired discussion for a direct event lookup", async () => {
    addEvent(30, new Date("2026-08-17T00:00:00Z"), new Date("2026-08-18T00:00:00Z"));
    addThread(30, 30, new Date("2026-08-18T01:00:00Z"));

    const board = await getThreads("/board/threads?scope=event");
    const detail = await getThreads("/board/threads?scope=event&eventId=30");

    expect(board.body).toEqual([]);
    expect(detail.body.map((thread: ThreadFixture) => thread.id)).toEqual([30]);
  });

  it("uses the current event title when a stored event discussion title is stale", async () => {
    const event = addEvent(40, new Date("2026-08-21T12:00:00Z"), new Date("2026-08-21T13:00:00Z"));
    addThread(40, event.id, new Date("2026-08-20T09:00:00Z"));
    threads[0].title = "Discussion: Cooney Lake";

    const beforeRename = await getThreads("/board/threads?scope=event&eventId=40");
    expect(beforeRename.body[0].title).toBe("Discussion: Event 40");

    event.title = "Evergreen Dig Day (Loop Loop - Goldilocks)";
    const afterRename = await getThreads("/board/threads?scope=event&eventId=40");
    expect(afterRename.body[0].title).toBe("Discussion: Evergreen Dig Day (Loop Loop - Goldilocks)");
    expect(afterRename.body[0].event.title).toBe("Evergreen Dig Day (Loop Loop - Goldilocks)");
  });
});

describe("event discussion reactions", () => {
  beforeEach(() => {
    addThread(100, 0, NOW);
    addPost(200, 100);
  });

  it("returns reply delete permissions and enforces the same author rule", async () => {
    const authorView = await getReactionView(RIDER, "post", 200);
    expect(authorView.status).toBe(200);
    expect(authorView.body[0].permissions).toEqual({ canDelete: true });

    const otherView = await getReactionView(OTHER_RIDER, "post", 200);
    expect(otherView.body[0].permissions).toEqual({ canDelete: false });

    const denied = await deletePost(OTHER_RIDER, 200);
    expect(denied.status).toBe(403);

    const deleted = await deletePost(RIDER, 200);
    expect(deleted.status).toBe(204);

    const authorAfterRefresh = await getReactionView(RIDER, "post", 200);
    expect(authorAfterRefresh.body[0]).toMatchObject({
      body: "",
      isDeleted: true,
      permissions: { canDelete: true },
    });

    const otherAfterRefresh = await getReactionView(OTHER_RIDER, "post", 200);
    expect(otherAfterRefresh.body[0].permissions).toEqual({ canDelete: false });
  });

  it("keeps thread counts and each member's reacted state correct when members add and remove reactions", async () => {
    const riderAdded = await toggleReaction(RIDER, "thread", 100);
    expect(riderAdded.body.reactions.helpful).toEqual({ count: 1, reacted: true });

    const otherAdded = await toggleReaction(OTHER_RIDER, "thread", 100);
    expect(otherAdded.body.reactions.helpful).toEqual({ count: 2, reacted: true });

    const riderView = await toggleReaction(RIDER, "thread", 100);
    expect(riderView.body.reactions.helpful).toEqual({ count: 1, reacted: false });

    const otherView = await getReactionView(OTHER_RIDER, "thread", 100);
    expect(otherView.body.reactions.helpful).toEqual({ count: 1, reacted: true });
  });

  it("supports add/remove reactions on replies and returns the shared count for each member", async () => {
    const riderAdded = await toggleReaction(RIDER, "post", 200);
    expect(riderAdded.body.reactions.helpful).toEqual({ count: 1, reacted: true });

    const otherAdded = await toggleReaction(OTHER_RIDER, "post", 200);
    expect(otherAdded.body.reactions.helpful).toEqual({ count: 2, reacted: true });

    const riderRemoved = await toggleReaction(RIDER, "post", 200);
    expect(riderRemoved.body.reactions.helpful).toEqual({ count: 1, reacted: false });
  });

  it("denies reactions on a thread outside the member's pod", async () => {
    threads[0].podId = "pod-a";
    const response = await toggleReaction(OTHER_RIDER, "thread", 100);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("rejects reactions on deleted replies and leaves their existing count unchanged", async () => {
    await toggleReaction(RIDER, "post", 200);
    posts[0].isDeleted = true;

    const response = await toggleReaction(OTHER_RIDER, "post", 200);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Post not found" });
    expect(reactions).toHaveLength(1);
  });

  it("removes thread and reply reactions when the thread is deleted", async () => {
    await toggleReaction(RIDER, "thread", 100);
    await toggleReaction(OTHER_RIDER, "thread", 100);
    await toggleReaction(RIDER, "post", 200);

    const beforeDelete = await getReactionView(COACH, "thread", 100);
    expect(beforeDelete.status).toBe(200);
    expect(beforeDelete.body.reactions.helpful).toEqual({ count: 2, reacted: false });
    expect(reactions).toHaveLength(3);

    const deleted = await deleteThread(COACH, 100);
    expect(deleted.status).toBe(204);
    expect(reactions).toHaveLength(0);
    expect(posts).toHaveLength(0);

    const detail = await getReactionView(COACH, "thread", 100);
    expect(detail.status).toBe(404);
    expect(detail.body).toEqual({ error: "Thread not found" });

    const members = await getReactionMembers(COACH, "thread", 100);
    expect(members.status).toBe(404);
    expect(members.body).toEqual({ error: "Target not found" });
  });
});
