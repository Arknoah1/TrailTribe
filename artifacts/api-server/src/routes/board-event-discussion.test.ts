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
};
const notificationMock = vi.hoisted(() => ({
  createNotification: vi.fn(),
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
  const boardPostsTable = table("posts");
  const boardAttachmentsTable = table("attachments");
  const boardReactionsTable = table("reactions");
  const usersTable = table("users");
  const eventsTable = table("events");
  const targetIdFrom = (condition: any) =>
    currentTargetId ?? condition?.right ?? condition?.queryChunks?.at?.(-1)?.value;
  const targetPathFrom = (condition: any) =>
    condition?.right ?? condition?.queryChunks?.at?.(-1)?.value;
  const dbMock: any = {
    select: vi.fn((selection?: Record<string, unknown>) => {
      selectCallIndex += 1;
      if (!selection) {
        const query = chain(() => {
          const source = (query as any)._source;
          if (source === boardPostsTable) return posts;
          if (source === usersTable) return users;
          return threads;
        });
        query.from.mockImplementation((source: object) => {
          query._source = source;
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
        if (source === boardAttachmentsTable) {
          attachments.push(...values.map((attachment) => ({ id: nextAttachmentId++, ...attachment })));
        }
        return {
          returning: vi.fn(async () => {
            if (source === boardReactionsTable) return [reactions.at(-1)];
            if (source === boardPostsTable) return [posts.at(-1)];
            if (source === boardThreadsTable) return [threads.at(-1)];
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
        where: vi.fn(async (condition: any) => {
          if (source === boardPostsTable) {
            const post = posts.find((candidate) => candidate.id === targetIdFrom(condition));
            if (post) Object.assign(post, value);
          }
          if (source === boardThreadsTable) {
            const thread = threads.find((candidate) => candidate.id === targetIdFrom(condition));
            if (thread) Object.assign(thread, value);
          }
        }),
      })),
    })),
    query: {
        usersTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(users.find((user) => user.clerkUserId === currentClerkUserId) ?? null)),
        },
        eventsTable: {
          findMany: vi.fn().mockImplementation(() => Promise.resolve(events)),
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            // The route's equality expressions are opaque in this mock; there is
            // only one event in direct-lookup enrichment at a time in practice.
            return Promise.resolve(events.find((event) => event.id === where?.right) ?? events[0] ?? null);
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
        boardAttachmentsTable: {
          findFirst: vi.fn().mockImplementation(({ where }: any) =>
            Promise.resolve(attachments.find((attachment) =>
              attachment.objectPath === (currentAttachmentPath ?? targetPathFrom(where))) ?? null)),
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
    insert: dbMock.insert,
    update: dbMock.update,
  }));
  return {
    isEventAudienceMember: sharedIsEventAudienceMember,
    db: dbMock,
    boardThreadsTable,
    boardPostsTable,
    boardAttachmentsTable,
    usersTable,
    eventsTable,
    boardReactionsTable,
  };
});

let currentClerkUserId = COACH.clerkUserId;
let currentTargetId: number | null = null;
let currentAttachmentPath: string | null = null;
let currentReaction = "helpful";
function currentUser() {
  return users.find((user) => user.clerkUserId === currentClerkUserId) ?? COACH;
}

vi.mock("../middlewares/requireAuth", () => ({
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-user") || COACH.clerkUserId;
    next();
  },
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = req.header("x-test-user") || COACH.clerkUserId;
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_coach";
    next();
  },
}));

vi.mock("../lib/notifications", () => notificationMock);
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/objectStorage", () => discussionStorageMock);
vi.mock("../lib/objectAcl", () => discussionAclMock);

const { default: boardRouter } = await import("./board");
const { default: storageRouter } = await import("./storage");

const app = express();
app.use(express.json());
app.use(boardRouter);
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
  discussionStorageMock.objects.clear();
  discussionAclMock.policies.clear();
  nextReactionId = 1;
  nextThreadId = 10000;
  nextAttachmentId = 1;
  currentClerkUserId = COACH.clerkUserId;
  currentTargetId = null;
  currentAttachmentPath = null;
  currentReaction = "helpful";
  nextPostId = 1000;
  notificationMock.createNotification.mockClear();
  selectCallIndex = 0;
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
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function createReply(user: DiscussionUser, threadId: number, body = "A reply") {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = threadId;
  const response = await fetch(`${baseUrl}/board/threads/${threadId}/posts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user": user.clerkUserId,
    },
    body: JSON.stringify({ body }),
  });
  return { status: response.status, body: await response.json() };
}

async function createThreadWithImages(
  user: DiscussionUser,
  imageObjectPaths: unknown,
  options: { podId?: string; eventId?: number } = {},
) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = null;
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
  currentReaction = reaction;
  const response = await fetch(`${baseUrl}/board/reactions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user.clerkUserId },
    body: JSON.stringify({ targetType, targetId, reaction }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function getReactionView(user: typeof COACH, targetType: "thread" | "post", targetId: number) {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = targetId;
  const path = targetType === "thread"
    ? `/board/threads/${targetId}`
    : `/board/threads/${posts.find((post) => post.id === targetId)?.threadId}/posts`;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": user.clerkUserId },
  });
  return { status: response.status, body: await response.json() };
}

async function getReactionMembers(user: typeof COACH, targetType: "thread" | "post", targetId: number, reaction = "helpful") {
  currentClerkUserId = user.clerkUserId;
  currentTargetId = targetId;
  currentReaction = reaction;
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

describe("discussion image security boundaries", () => {
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

describe("event discussion board visibility and ordering", () => {
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
    expect((await getThreads(`/board/threads/${threadId}`, OTHER_PARENT)).status).toBe(403);
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
    expect(riderAdded.status).toBe(200);
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