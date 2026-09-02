/**
 * Tests for the notification-preferences lock guard in PATCH /users/me.
 *
 * When a student's notificationPreferencesLocked flag is true the server
 * must reject any request that tries to update notification fields with 403.
 * Non-notification field updates (e.g. firstName) should still be allowed.
 *
 * Follows the same Vitest + mounted-Express pattern used by the other route
 * tests in this package.
 *
 * Run via: pnpm --filter @workspace/api-server test
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

/* ─── mutable stub state — closed over by mock factories ─────────────── */
// vi.mock factories are called lazily (at import time), after these
// declarations are initialised, so closures over them are safe.

let mockUser: Record<string, unknown> | null = null;

/** Arguments passed to each db.update().set() call, captured for assertions. */
const updateSetCalls: Array<Record<string, unknown>> = [];
const permanentDeletionCalls: Array<Record<string, unknown>> = [];
let permanentDeletionResult: { ok: boolean; stage?: "clerk" | "database"; deletedHousehold?: boolean } = {
  ok: true,
  deletedHousehold: false,
};

/* ─── module mocks ───────────────────────────────────────────────────── */

vi.mock("@workspace/db", () => {
  const mockDb = {
    query: {
      usersTable: {
        findFirst: vi.fn(async () => mockUser),
      },
      householdsTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      seasonsTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      inviteLinksTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      teamDocumentsTable: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      documentConsentsTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => {
        updateSetCalls.push({ ...patch });
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ ...mockUser, ...patch }]),
          })),
        };
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockResolvedValue([]),
      })),
    })),
  };
  return {
    db: mockDb,
    usersTable: new Proxy({}, { get: () => ({}) }),
    householdsTable: new Proxy({}, { get: () => ({}) }),
    familyInvitesTable: new Proxy({}, { get: () => ({}) }),
    inviteLinksTable: new Proxy({}, { get: () => ({}) }),
    seasonsTable: new Proxy({}, { get: () => ({}) }),
    seasonRosterSnapshotsTable: new Proxy({}, { get: () => ({}) }),
    teamDocumentsTable: new Proxy({}, { get: () => ({}) }),
    documentConsentsTable: new Proxy({}, { get: () => ({}) }),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_student";
    next();
  },
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_student";
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_student";
    next();
  },
}));

vi.mock("@clerk/express", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "clerk_test_student",
        emailAddresses: [{ emailAddress: "alex@example.com" }],
        firstName: "Alex",
        lastName: "Rider",
      }),
    },
  })),
}));

vi.mock("../lib/notifications", () => ({
  notifyCoachesOfNewFamily: vi.fn().mockResolvedValue(undefined),
  notifyCoachesOfReturningFamily: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/account-deletion", () => ({
  permanentlyDeleteLocalAccount: vi.fn(async (user: Record<string, unknown>) => {
    permanentDeletionCalls.push(user);
    return permanentDeletionResult;
  }),
  deleteClerkUserId: vi.fn(async () => true),
}));

/* ─── import router after mocks are registered ───────────────────────── */

const { default: usersRouter } = await import("./users");

/* ─── test server ─────────────────────────────────────────────────────── */

const app = express();
app.use(express.json());
app.use(usersRouter);

let server: Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer(app as any);
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

/** Locked student fixture. */
const LOCKED_STUDENT: Record<string, unknown> = {
  id: 7,
  clerkUserId: "clerk_test_student",
  firstName: "Alex",
  lastName: "Rider",
  email: "alex@example.com",
  role: "student",
  householdId: 3,
  approved: true,
  notificationPreferencesLocked: true,
  notificationsEnabled: true,
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: false,
  notificationPreferences: {
    practiceReminders: true,
    coachMessages: true,
    carpoolUpdates: true,
    eventReminders: true,
    rosterUpdates: true,
    boardReplies: true,
  },
};

beforeEach(() => {
  // vi.clearAllMocks() only resets recorded call history — implementations
  // set in the factory (closures over mutable refs) remain in place.
  vi.clearAllMocks();
  updateSetCalls.length = 0;
  permanentDeletionCalls.length = 0;
  permanentDeletionResult = { ok: true, deletedHousehold: false };
  // Default: locked student.
  mockUser = { ...LOCKED_STUDENT };
});

/* ─── DELETE /users/me — permanent self-service deletion ─────────────── */

describe("DELETE /users/me — permanent self-service deletion", () => {
  it("only deletes the account associated with the current Clerk session", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    });

    expect(resp.status).toBe(200);
    expect(permanentDeletionCalls).toEqual([
      expect.objectContaining({ id: LOCKED_STUDENT.id, clerkUserId: "clerk_test_student" }),
    ]);
  });

  it("requires the explicit self-service confirmation before deleting", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    expect(resp.status).toBe(400);
    expect(permanentDeletionCalls).toEqual([]);
  });

  it("keeps the local account when the sign-in service cannot be reached", async () => {
    permanentDeletionResult = { ok: false, stage: "clerk" };

    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    });

    expect(resp.status).toBe(502);
    expect(permanentDeletionCalls).toHaveLength(1);
  });
});

/* ─── PATCH /users/me — notification lock guard ──────────────────────── */

describe("PATCH /users/me — notification lock guard", () => {
  it("returns 403 when a locked student tries to update notificationsEnabled", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationsEnabled: false }),
    });

    expect(resp.status).toBe(403);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/managed by your parent/i);
    // No write should have reached the DB.
    expect(updateSetCalls).toHaveLength(0);
  });

  it("returns 403 when a locked student tries to update emailNotifications", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailNotifications: false }),
    });

    expect(resp.status).toBe(403);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/managed by your parent/i);
    expect(updateSetCalls).toHaveLength(0);
  });

  it("returns 403 when a locked student tries to update notificationPreferences", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationPreferences: {
          practiceReminders: false,
          coachMessages: true,
          carpoolUpdates: true,
          eventReminders: true,
          rosterUpdates: true,
          boardReplies: true,
        },
      }),
    });

    expect(resp.status).toBe(403);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/managed by your parent/i);
    expect(updateSetCalls).toHaveLength(0);
  });

  it("allows a locked student to update non-notification fields (e.g. firstName)", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Alexia" }),
    });

    // Non-notification patch should succeed — lock only guards notification fields.
    expect(resp.status).toBe(200);
    const nameUpdate = updateSetCalls.find((c) => c.firstName === "Alexia");
    expect(nameUpdate, "db.update().set({ firstName }) should have been called").toBeTruthy();
  });

  it("rejects a whitespace-only first name instead of saving an incomplete profile", async () => {
    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "   " }),
    });

    expect(resp.status).toBe(400);
    expect(updateSetCalls).toHaveLength(0);
  });

  it("rejects onboarding without both required names", async () => {
    mockUser = null;

    const resp = await fetch(`${baseUrl}/users/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Alex" }),
    });

    expect(resp.status).toBe(400);
  });

  it("allows an unlocked student to update notificationsEnabled", async () => {
    // Unlock the student.
    mockUser = { ...LOCKED_STUDENT, notificationPreferencesLocked: false };

    const resp = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationsEnabled: false }),
    });

    expect(resp.status).toBe(200);
    const notifUpdate = updateSetCalls.find((c) => c.notificationsEnabled === false);
    expect(notifUpdate, "db.update().set({ notificationsEnabled }) should have been called").toBeTruthy();
  });
});
