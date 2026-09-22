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
    },
  },
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireApproved: (req: any, _res: unknown, next: () => void) => {
    req.clerkUserId = "viewer-clerk-id";
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

const { default: messagesRouter } = await import("./messages");

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
      } else {
        mocks.recipientInsertCalls.push(values);
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
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
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
    expect(mocks.db.select).toHaveBeenCalledTimes(2);
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