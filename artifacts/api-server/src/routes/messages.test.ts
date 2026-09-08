import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getShortNamePrefix: vi.fn(),
  allUsers: [] as Record<string, unknown>[],
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
  requireApproved: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCoachOrAdmin: (req: any, _res: unknown, next: () => void) => {
    req.clerkUserId = "coach-clerk-id";
    next();
  },
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  broadcastsTable: {
    createdAt: "broadcast_created_at",
    id: "broadcast_id",
  },
  usersTable: {
    id: "user_id",
    clerkUserId: "user_clerk_id",
    isActive: "user_is_active",
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
  mocks.db.query.usersTable.findFirst.mockResolvedValue(user({
    id: 1,
    role: "coach",
    email: "coach@example.test",
  }));
  mocks.db.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(mocks.allUsers)),
      orderBy: vi.fn(() => Promise.resolve([])),
    })),
  }));
  mocks.db.insert.mockImplementation(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{ ...mocks.broadcast }])),
    })),
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
  mocks.updateCalls = [];
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

describe("broadcast email notifications", () => {
  it("queues a team-wide email for eligible recipients and records delivery results", async () => {
    mocks.allUsers = [
      user({ id: 2, email: "parent@example.test" }),
      user({ id: 3, role: "student", email: "rider@example.test" }),
      user({ id: 4, email: "failed@example.test" }),
      user({ id: 5, isActive: false, email: "inactive@example.test" }),
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
    expect((await response.json()).emailConfigured).toBe(true);
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
  });
});