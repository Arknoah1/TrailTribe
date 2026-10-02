import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getShortNamePrefix: vi.fn(),
  allUsers: [] as Record<string, unknown>[],
  broadcasts: [] as Record<string, unknown>[],
  broadcastRecipients: [] as Record<string, unknown>[],
  broadcastImages: [] as Record<string, unknown>[],
  broadcastImageObjects: new Map<string, { generation: string; versions: Map<string, { contentType: string; bytes: Buffer }> }>(),
  broadcastImagePolicies: new Map<string, { owner: string; visibility: "private"; aclRules: [] }>(),
  currentUser: null as Record<string, unknown> | null,
  archiveWhereCalls: [] as unknown[],
  broadcast: {
    id: 9001,
    senderUserId: 1,
    subject: "Saturday practice",
    body: "Please bring water.",
    channel: "email",
    targetPodIds: null,
    isAllTeam: true,
    recipientCount: 0,
    deliveredCount: 0,
    failedCount: 0,
  },
  updateCalls: [] as Record<string, unknown>[],
  insertCalls: [] as Record<string, unknown>[],
  recipientInsertCalls: [] as unknown[],
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      usersTable: { findFirst: vi.fn() },
      broadcastImagesTable: { findFirst: vi.fn() },
      broadcastsTable: { findFirst: vi.fn() },
      broadcastRecipientsTable: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireApproved: (req: any, _res: unknown, next: () => void) => {
    req.clerkUserId = req.header("x-test-user") || "viewer-clerk-id";
    next();
  },
  requireCoachOrAdmin: (req: any, _res: unknown, next: () => void) => {
    req.clerkUserId = "coach-clerk-id";
    next();
  },
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  isOperationalStaffRole: (user: any) =>
    ["coach", "super_admin"].some((role) => user?.role === role || user?.roles?.includes(role)),
  hasUserRole: (user: any, role: string) => user?.role === role || user?.roles?.includes(role),
  broadcastsTable: {
    createdAt: "broadcast_created_at",
    id: "broadcast_id",
    senderUserId: "broadcast_sender_user_id",
    isAllTeam: "broadcast_is_all_team",
    targetPodIds: "broadcast_target_pod_ids",
    audienceCapturedAt: "broadcast_audience_captured_at",
  },
  broadcastImagesTable: {
    id: "broadcast_image_id",
    broadcastId: "broadcast_image_broadcast_id",
    objectPath: "broadcast_image_object_path",
  },
  broadcastRecipientsTable: {
    id: "broadcast_recipient_id",
    broadcastId: "broadcast_recipient_broadcast_id",
    userId: "broadcast_recipient_user_id",
  },
  usersTable: {
    id: "user_id",
    clerkUserId: "user_clerk_id",
    isActive: "user_is_active",
    approved: "user_approved",
    firstName: "user_first_name",
    lastName: "user_last_name",
    avatarUrl: "user_avatar_url",
    role: "user_role",
  },
  teamDocumentsTable: { objectPath: "team_document_object_path" },
}));

vi.mock("../lib/email", () => ({
  emailHealthy: true,
  isDeliverableEmailAddress: (email: string | null | undefined) =>
    Boolean(
      email
      && !email.endsWith("@trailteam.internal")
      && !email.endsWith("@pending.trailteam.app"),
    ),
  sendEmail: mocks.sendEmail,
}));

vi.mock("./settings", () => ({ getShortNamePrefix: mocks.getShortNamePrefix }));
vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class MockObjectStorageService {
    getObjectEntityUploadURL = vi.fn(async () => "https://storage.example.test/upload");
    normalizeObjectEntityPath = vi.fn(() => "/objects/broadcast-images/uploaded");
    getObjectEntityFile = vi.fn(async (objectPath: string, generation?: string) => {
      const object = mocks.broadcastImageObjects.get(objectPath);
      const version = generation
        ? object?.versions.get(generation)
        : object?.versions.get(object.generation);
      if (!object || !version) throw new ObjectNotFoundError();
      return {
        objectPath,
        generation: generation ?? object.generation,
        getMetadata: async () => [{
          generation: generation ?? object.generation,
          contentType: version.contentType,
          size: String(version.bytes.byteLength),
        }],
      };
    });
    downloadObject = vi.fn(async (file: { objectPath: string; generation: string }) => {
      const object = mocks.broadcastImageObjects.get(file.objectPath);
      const version = object?.versions.get(file.generation);
      return new Response(version?.bytes ?? new Uint8Array(), {
        headers: { "content-type": version?.contentType ?? "application/octet-stream" },
      });
    });
  }
  return { ObjectNotFoundError, ObjectStorageService: MockObjectStorageService };
});
vi.mock("../lib/objectAcl", () => ({
  DISCUSSION_IMAGE_LIFECYCLE_LOCK: "trailteam-discussion-image-lifecycle",
  getDbObjectAclPolicy: vi.fn(async (objectPath: string) =>
    mocks.broadcastImagePolicies.get(objectPath) ?? null),
  storePendingObjectAcl: vi.fn(async (objectPath: string, policy: { owner: string; visibility: "private"; aclRules: [] }) => {
    mocks.broadcastImagePolicies.set(objectPath, policy);
  }),
  getObjectAclPolicy: vi.fn(async () => null),
  canAccessObject: vi.fn(async () => false),
  ObjectPermission: { READ: "read", WRITE: "write" },
  ObjectAccessGroupType: { AUTHENTICATED_USER: "AUTHENTICATED_USER", HOUSEHOLD_MEMBER: "HOUSEHOLD_MEMBER" },
}));

const { default: messagesRouter } = await import("./messages");
const { default: storageRouter } = await import("./storage");

let server: Server;
let baseUrl: string;

function user(overrides: Record<string, unknown>) {
  return {
    id: 1,
    firstName: "Coach",
    lastName: "One",
    email: "coach@example.test",
    role: "parent",
    podId: "pod-a",
    isActive: true,
    approved: true,
    seasonParticipationStatus: "active",
    emailNotifications: true,
    notificationsEnabled: true,
    notificationPreferences: { coachMessages: true },
    ...overrides,
  };
}

function setupDatabase() {
  mocks.currentUser = user({
    id: 1,
    role: "coach",
    email: "coach@example.test",
  });
  mocks.db.query.usersTable.findFirst.mockImplementation(() => Promise.resolve(mocks.currentUser));
  const valueFromCondition = (condition: any) =>
    condition?.right ?? condition?.queryChunks
      ?.filter((chunk: unknown) => typeof chunk === "string" || typeof chunk === "number")
      ?.at?.(-1);
  mocks.db.query.broadcastImagesTable.findFirst.mockImplementation(({ where }: any) =>
    Promise.resolve(mocks.broadcastImages.find((image) =>
      image.objectPath === valueFromCondition(where))
      ?? (valueFromCondition(where) === undefined ? mocks.broadcastImages[0] : null)
      ?? null));
  mocks.db.query.broadcastsTable.findFirst.mockImplementation(({ where }: any) =>
    Promise.resolve(mocks.broadcasts.find((broadcast) =>
      broadcast.id === valueFromCondition(where)) ?? mocks.broadcasts[0] ?? null));
  mocks.db.query.broadcastRecipientsTable.findFirst.mockImplementation(() =>
    Promise.resolve(mocks.broadcastRecipients.find((recipient) =>
      recipient.userId === mocks.currentUser?.id) ?? null));
  mocks.db.select.mockImplementation((selection?: Record<string, unknown>) => {
    if (selection?.broadcast) {
      const visibleBroadcasts = () => mocks.broadcasts.filter((broadcast) => {
        const viewer = mocks.currentUser;
        if (!viewer || viewer.role === "coach" || viewer.role === "super_admin") return true;
        if (broadcast.audienceCapturedAt) {
          return mocks.broadcastRecipients.some((recipient) =>
            recipient.broadcastId === broadcast.id && recipient.userId === viewer.id);
        }
        return broadcast.isAllTeam
          || (typeof viewer.podId === "string"
            && Array.isArray(broadcast.targetPodIds)
            && broadcast.targetPodIds.includes(viewer.podId));
      });
      const rows = () => visibleBroadcasts().map((broadcast) => ({
        broadcast,
        sender: broadcast.senderUserId ? user({
          id: broadcast.senderUserId,
          role: "coach",
          firstName: "Archive",
          lastName: "Sender",
        }) : null,
      }));
      const orderBy = vi.fn(() => Promise.resolve(rows()));
      return {
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            orderBy,
            where: vi.fn((condition: unknown) => {
              mocks.archiveWhereCalls.push(condition);
              return { orderBy };
            }),
          })),
        })),
      };
    }
    if (selection?.broadcastId) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(
            mocks.broadcastRecipients.filter((recipient) => recipient.userId === mocks.currentUser?.id),
          )),
        })),
      };
    }
    if (selection?.objectPath) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => {
            return Promise.resolve(mocks.broadcastImages.map(({ objectPath }) => ({ objectPath })));
          }),
        })),
      };
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(mocks.allUsers)),
        orderBy: vi.fn(() => Promise.resolve(mocks.broadcasts)),
      })),
    };
  });
  mocks.db.insert.mockImplementation((table: Record<string, unknown>) => ({
    values: vi.fn((values: any) => {
      if (table.id === "broadcast_id") {
        mocks.insertCalls.push(values);
        mocks.broadcasts.push({ ...mocks.broadcast, ...values });
      } else if (table.id === "broadcast_image_id") {
        mocks.broadcastImages.push(...values);
      } else {
        mocks.recipientInsertCalls.push(values);
        mocks.broadcastRecipients.push(...values);
      }
      return {
        returning: vi.fn(() => Promise.resolve([{ ...mocks.broadcast, ...values }])),
      };
    }),
  }));
  mocks.db.update.mockImplementation(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      mocks.updateCalls.push(values);
      return {
        where: vi.fn(() => Promise.resolve(undefined)),
      };
    }),
  }));
  mocks.db.transaction = vi.fn(async (callback: (tx: any) => unknown) => callback({
    execute: vi.fn(async () => undefined),
    insert: mocks.db.insert,
  }));
}

async function waitForBroadcastUpdate() {
  await vi.waitFor(() => {
    expect(mocks.updateCalls.length).toBeGreaterThan(0);
  });
}

beforeEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server = undefined as unknown as Server;
  }
  vi.clearAllMocks();
  mocks.allUsers = [];
  mocks.broadcasts = [];
  mocks.broadcastRecipients = [];
  mocks.broadcastImages = [];
  mocks.broadcastImageObjects.clear();
  mocks.broadcastImagePolicies.clear();
  mocks.archiveWhereCalls = [];
  mocks.updateCalls = [];
  mocks.insertCalls = [];
  mocks.recipientInsertCalls = [];
  mocks.broadcast = {
    ...mocks.broadcast,
    recipientCount: 0,
    deliveredCount: 0,
    failedCount: 0,
  };
  mocks.getShortNamePrefix.mockResolvedValue("TrailTeam: ");
  mocks.sendEmail.mockResolvedValue({ status: "sent" });
  setupDatabase();
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

async function fetchMessageArchive(currentUser: Record<string, unknown>) {
  mocks.currentUser = currentUser;
  const app = express();
  app.use(express.json());
  app.use("/", messagesRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://localhost:${address.port}`;
  return fetch(`${baseUrl}/messages`);
}

async function startMessageTestServer() {
  const app = express();
  app.use(express.json());
  app.use(messagesRouter);
  app.use(storageRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
}

function addBroadcastImage(
  objectPath: string,
  contentType = "image/png",
  bytes = Buffer.from("image-bytes"),
  generation = "generation-1",
) {
  mocks.broadcastImageObjects.set(objectPath, {
    generation,
    versions: new Map([[generation, { contentType, bytes }]]),
  });
  mocks.broadcastImagePolicies.set(objectPath, {
    owner: "coach-clerk-id",
    visibility: "private",
    aclRules: [],
  });
}

describe("broadcast archive audience", () => {
  const teamBroadcast = {
    ...mocks.broadcast,
    id: 100,
    isAllTeam: true,
    targetPodIds: null,
    senderUserId: null,
  };
  const podABroadcast = {
    ...mocks.broadcast,
    id: 101,
    isAllTeam: false,
    targetPodIds: ["pod-a"],
    senderUserId: null,
  };
  const podBBroadcast = {
    ...mocks.broadcast,
    id: 102,
    isAllTeam: false,
    targetPodIds: ["pod-b"],
    senderUserId: null,
  };
  const untargetedBroadcast = {
    ...mocks.broadcast,
    id: 103,
    isAllTeam: false,
    targetPodIds: null,
    senderUserId: null,
  };

  beforeEach(() => {
    mocks.broadcasts = [teamBroadcast, podABroadcast, podBBroadcast, untargetedBroadcast];
  });

  it.each(["coach", "super_admin"])("lets %s users review every broadcast", async (role) => {
    const response = await fetchMessageArchive(user({ role }));

    expect(response.status).toBe(200);
    expect((await response.json()).map((broadcast: { id: number }) => broadcast.id))
      .toEqual([100, 101, 102, 103]);
    expect(mocks.archiveWhereCalls).toEqual([]);
    expect(mocks.db.select).toHaveBeenCalledTimes(5);
  });

  it.each(["coach", "super_admin"])("shows no broadcasts to an inactive %s account", async (role) => {
    const response = await fetchMessageArchive(user({ role, isActive: false }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("shows a parent team-wide broadcasts and broadcasts for their own pod only", async () => {
    const response = await fetchMessageArchive(user({ role: "parent", podId: "pod-a" }));

    expect(response.status).toBe(200);
    expect((await response.json()).map((broadcast: { id: number }) => broadcast.id))
      .toEqual([100, 101]);
    expect(mocks.archiveWhereCalls).toHaveLength(1);
    expect(mocks.db.select).toHaveBeenCalledTimes(4);
  });

  it("keeps send-time audience history when families move between pods", async () => {
    const podABroadcast = {
      ...mocks.broadcast,
      id: 110,
      isAllTeam: false,
      targetPodIds: ["pod-a"],
      audienceCapturedAt: new Date("2026-09-01T12:00:00.000Z"),
    };
    const podBBroadcast = {
      ...mocks.broadcast,
      id: 111,
      isAllTeam: false,
      targetPodIds: ["pod-b"],
      audienceCapturedAt: new Date("2026-09-02T12:00:00.000Z"),
    };
    mocks.broadcasts = [podABroadcast, podBBroadcast];
    mocks.broadcastRecipients = [
      { broadcastId: 110, userId: 41 },
      { broadcastId: 111, userId: 42 },
    ];

    const movedOutResponse = await fetchMessageArchive(user({
      id: 41,
      role: "parent",
      podId: "pod-b",
    }));
    expect((await movedOutResponse.json()).map((broadcast: { id: number }) => broadcast.id))
      .toEqual([110]);

    const movedInResponse = await fetchMessageArchive(user({
      id: 42,
      role: "parent",
      podId: "pod-a",
    }));
    expect((await movedInResponse.json()).map((broadcast: { id: number }) => broadcast.id))
      .toEqual([111]);
  });

  it("does not show another pod's broadcast to an active rider", async () => {
    const response = await fetchMessageArchive(user({
      role: "student",
      podId: "pod-b",
      seasonParticipationStatus: "active",
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).map((broadcast: { id: number }) => broadcast.id))
      .toEqual([100, 102]);
    expect(mocks.archiveWhereCalls).toHaveLength(1);
  });

  it.each(["season_off", "pending"])("shows no broadcasts to a %s rider", async (seasonParticipationStatus) => {
    const response = await fetchMessageArchive(user({
      role: "student",
      podId: "pod-a",
      seasonParticipationStatus,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("broadcast email notifications", () => {
  it("reserves broadcast-only private upload paths for authorized coaches", async () => {
    await startMessageTestServer();
    const response = await fetch(`${baseUrl}/messages/attachments/request-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "results.png", size: 1024, contentType: "image/png" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadURL: "https://storage.example.test/upload",
      objectPath: "/objects/broadcast-images/uploaded",
    });
    expect(mocks.broadcastImagePolicies.get("/objects/broadcast-images/uploaded")).toEqual({
      owner: "coach-clerk-id",
      visibility: "private",
      aclRules: [],
    });
  });

  it("stores rich private-image metadata, sends pinned bytes as CID, and serves only captured recipients", async () => {
    const imagePath = "/objects/broadcast-images/private-image";
    const originalBytes = Buffer.from("original generation");
    addBroadcastImage(imagePath, "image/png", originalBytes);
    const recipient = user({
      id: 31,
      role: "parent",
      podId: "pod-a",
      clerkUserId: "parent-clerk-id",
      email: "parent@example.test",
    });
    const outOfAudience = user({
      id: 32,
      role: "parent",
      podId: "pod-b",
      clerkUserId: "other-clerk-id",
      email: "other@example.test",
    });
    mocks.allUsers = [recipient, outOfAudience];
    await startMessageTestServer();

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: "Race results",
        body: "| Rider | Time |\n| --- | --- |\n| Ari | **1:23** |",
        bodyFormat: "markdown",
        channel: "email",
        isAllTeam: false,
        targetPodIds: ["pod-a"],
        imageObjectPaths: [imagePath],
      }),
    });

    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(201);
    expect(responseBody).toMatchObject({
      bodyFormat: "markdown",
      imageObjectPaths: [imagePath],
    });
    expect(mocks.broadcastImages).toHaveLength(1);
    expect(mocks.broadcastImages[0]).toMatchObject({
      objectPath: imagePath,
      generation: "generation-1",
      contentType: "image/png",
    });
    expect(mocks.recipientInsertCalls).toEqual([[
      { broadcastId: 9001, userId: 31 },
    ]]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const email = mocks.sendEmail.mock.calls[0][0];
    expect(email.html).toContain("<table");
    expect(email.html).toContain('src="cid:broadcast-9001-0@trailteam"');
    expect(email.attachments[0]).toMatchObject({
      cid: "broadcast-9001-0@trailteam",
      contentType: "image/png",
      content: originalBytes,
    });

    const imageFixture = mocks.broadcastImageObjects.get(imagePath)!;
    imageFixture.versions.set("generation-2", {
      contentType: "image/png",
      bytes: Buffer.from("replacement bytes"),
    });
    imageFixture.generation = "generation-2";

    mocks.currentUser = recipient;
    const allowed = await fetch(`${baseUrl}/messages/attachments/broadcast-images/private-image`, {
      headers: { "x-test-user": "parent-clerk-id" },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("original generation");

    mocks.currentUser = outOfAudience;
    const denied = await fetch(`${baseUrl}/messages/attachments/broadcast-images/private-image`, {
      headers: { "x-test-user": "other-clerk-id" },
    });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ error: "Image not found" });

    const generic = await fetch(`${baseUrl}/storage/objects/broadcast-images/private-image`, {
      headers: { "x-test-user": "parent-clerk-id" },
    });
    expect(generic.status).toBe(404);
    expect(await generic.json()).toEqual({ error: "Object not found" });
  });

  it.each([
    { role: "coach", isActive: false, label: "inactive coach" },
    { role: "super_admin", isActive: false, label: "inactive admin" },
    { role: "parent", isActive: false, label: "inactive captured parent" },
    { role: "student", seasonParticipationStatus: "season_off", label: "season-off captured student" },
    { role: "student", seasonParticipationStatus: "pending", label: "pending captured student" },
  ])("does not expose broadcast images to a $label", async ({ label: _label, ...overrides }) => {
    const objectPath = "/objects/broadcast-images/eligibility-fixture";
    const bytes = Buffer.from("private fixture bytes");
    addBroadcastImage(objectPath, "image/png", bytes);
    mocks.currentUser = user({ id: 31, clerkUserId: "captured-viewer", ...overrides });
    mocks.broadcasts = [{ ...mocks.broadcast, audienceCapturedAt: new Date() }];
    mocks.broadcastRecipients = [{ broadcastId: 9001, userId: 31 }];
    mocks.broadcastImages = [{
      id: 77, broadcastId: 9001, objectPath, generation: "generation-1",
      contentType: "image/png", size: bytes.byteLength,
    }];
    await startMessageTestServer();
    const archive = await fetch(`${baseUrl}/messages`, { headers: { "x-test-user": "captured-viewer" } });
    expect(await archive.json()).toEqual([]);
    const image = await fetch(`${baseUrl}/messages/attachments/broadcast-images/eligibility-fixture`, {
      headers: { "x-test-user": "captured-viewer" },
    });
    expect(image.status).toBe(404);
    expect(await image.json()).toEqual({ error: "Image not found" });
  });

  it("rejects reclaims, unsupported inline images, and email image totals over 15 MB before saving", async () => {
    const claimedPath = "/objects/broadcast-images/claimed";
    addBroadcastImage(claimedPath);
    await startMessageTestServer();

    const create = (body: Record<string, unknown>) => fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Rich message", channel: "email", isAllTeam: true, ...body }),
    });
    const first = await create({ imageObjectPaths: [claimedPath] });
    expect(first.status, await first.clone().text()).toBe(201);
    const reclaimed = await create({ imageObjectPaths: [claimedPath] });
    expect(reclaimed.status).toBe(400);
    expect(await reclaimed.json()).toEqual({
      error: "This image is already attached to a broadcast",
    });

    const inlineImage = await create({
      bodyFormat: "markdown",
      body: "![remote](https://example.test/image.png)",
    });
    expect(inlineImage.status).toBe(400);
    expect(await inlineImage.json()).toMatchObject({
      error: expect.stringContaining("Upload pictures as attachments"),
    });

    const largeA = "/objects/broadcast-images/large-a";
    const largeB = "/objects/broadcast-images/large-b";
    addBroadcastImage(largeA, "image/png", Buffer.alloc(8_000_000));
    addBroadcastImage(largeB, "image/png", Buffer.alloc(8_000_000));
    const before = mocks.insertCalls.length;
    const tooLarge = await create({ imageObjectPaths: [largeA, largeB] });
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toMatchObject({
      error: expect.stringContaining("15 MB total email attachment limit"),
    });
    expect(mocks.insertCalls).toHaveLength(before);
  });

  it.each(["sms", "push"])("rejects unsupported %s broadcasts without sending email", async (channel) => {
    mocks.allUsers = [user({ id: 31, email: "parent@example.test" })];

    const app = express();
    app.use(express.json());
    app.use("/", messagesRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "Do not deliver this by email",
        channel,
        isAllTeam: true,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: `Broadcast channel "${channel}" is not supported`,
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.db.query.usersTable.findFirst).not.toHaveBeenCalled();
  });

  it("queues a team-wide email for eligible recipients and records delivery results", async () => {
    mocks.allUsers = [
      user({ id: 2, email: "parent@example.test" }),
      user({ id: 3, role: "student", email: "rider@example.test" }),
      user({ id: 4, email: "failed@example.test" }),
      user({ id: 5, isActive: false, email: "inactive@example.test" }),
      user({ id: 14, approved: false, email: "unapproved@example.test" }),
      user({ id: 6, role: "student", seasonParticipationStatus: "season_off", email: "season-off@example.test" }),
      user({ id: 7, role: "student", seasonParticipationStatus: "pending", email: "pending@example.test" }),
      user({ id: 8, emailNotifications: false, email: "email-opt-out@example.test" }),
      user({ id: 9, notificationsEnabled: false, email: "notification-opt-out@example.test" }),
      user({ id: 10, notificationPreferences: { coachMessages: false }, email: "message-opt-out@example.test" }),
      user({ id: 11, email: "rider-11@trailteam.internal" }),
      user({ id: 12, email: "pending-12@pending.trailteam.app" }),
      user({ id: 13, email: "PARENT@EXAMPLE.TEST" }),
    ];
    mocks.sendEmail
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "failed", error: new Error("SMTP unavailable") });

    const app = express();
    app.use(express.json());
    app.use("/", messagesRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: "Saturday practice",
        body: "Please bring water.",
        channel: "email",
        isAllTeam: true,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      emailConfigured: true,
      recipientCount: 3,
    });
    await waitForBroadcastUpdate();

    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
    expect(mocks.sendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "parent@example.test",
      "rider@example.test",
      "failed@example.test",
    ]);
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      subject: "TrailTeam: Saturday practice",
      replyTo: "coach@example.test",
    });
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain("Please bring water.");
    expect(mocks.updateCalls).toContainEqual({ deliveredCount: 2, failedCount: 1 });
  });

  it("sends a pod-targeted email only to eligible members of that pod", async () => {
    mocks.allUsers = [
      user({ id: 20, podId: "pod-a", email: "pod-a@example.test" }),
      user({ id: 21, podId: "pod-b", email: "pod-b@example.test" }),
      user({ id: 22, role: "student", podId: "pod-a", email: "active-rider@example.test" }),
      user({ id: 23, role: "student", podId: "pod-a", seasonParticipationStatus: "season_off", email: "season-off@example.test" }),
    ];

    const app = express();
    app.use(express.json());
    app.use("/", messagesRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "Pod update",
        channel: "email",
        targetPodIds: ["pod-a"],
        isAllTeam: false,
      }),
    });

    expect(response.status).toBe(201);
    await waitForBroadcastUpdate();
    expect(mocks.sendEmail.mock.calls.map(([email]) => email.to)).toEqual([
      "pod-a@example.test",
      "active-rider@example.test",
    ]);
    expect(mocks.insertCalls[0]).toMatchObject({
      targetPodIds: ["pod-a"],
      isAllTeam: false,
      recipientCount: 2,
    });
    expect(mocks.recipientInsertCalls).toEqual([[
      { broadcastId: 9001, userId: 20 },
      { broadcastId: 9001, userId: 22 },
    ]]);
  });

  it("responds before asynchronous email delivery finishes", async () => {
    mocks.allUsers = [user({ id: 30, email: "slow-delivery@example.test" })];
    let resolveDelivery!: (result: { status: "sent" }) => void;
    mocks.sendEmail.mockImplementation(() => new Promise((resolve) => {
      resolveDelivery = resolve;
    }));

    const app = express();
    app.use(express.json());
    app.use("/", messagesRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "Background delivery check",
        channel: "email",
        isAllTeam: true,
      }),
    });

    expect(response.status).toBe(201);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.updateCalls).toEqual([]);

    resolveDelivery({ status: "sent" });
    await waitForBroadcastUpdate();
    expect(mocks.updateCalls).toContainEqual({ deliveredCount: 1, failedCount: 0 });
  });
});