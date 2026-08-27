import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const orphanedEmail = "suznoahperin@gmail.com";
const clerkDeleteCalls: string[] = [];
const databaseDeleteCalls: unknown[] = [];
let databaseUser: Record<string, unknown> | null = null;

const usersTable = new Proxy({ __table: "usersTable" }, { get: (target, key) => target[key as keyof typeof target] ?? {} });

vi.mock("@clerk/express", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      getUserList: vi.fn().mockResolvedValue({ data: [{ id: "clerk_orphaned_parent" }] }),
      deleteUser: vi.fn(async (clerkUserId: string) => {
        clerkDeleteCalls.push(clerkUserId);
      }),
    },
  })),
}));

vi.mock("@workspace/db", () => {
  const deleteChain = {
    where: vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      query: {
        teamSettingsTable: { findFirst: vi.fn() },
        usersTable: {
          findFirst: vi.fn(() => Promise.resolve(databaseUser)),
        },
      },
      delete: vi.fn((table: unknown) => {
        databaseDeleteCalls.push(table);
        return deleteChain;
      }),
      insert: vi.fn(),
    },
    teamSettingsTable: new Proxy({}, { get: () => ({}) }),
    usersTable,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireCoachOrAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

const { default: settingsRouter } = await import("./settings");

const app = express();
app.use(express.json());
app.use(settingsRouter);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not open a TCP port");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

beforeEach(() => {
  databaseUser = null;
  clerkDeleteCalls.length = 0;
  databaseDeleteCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function cleanup(email = orphanedEmail) {
  return fetch(`${baseUrl}/admin/cleanup/clerk-by-email`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("DELETE /admin/cleanup/clerk-by-email", () => {
  it("removes an unapproved parent account that never joined a household", async () => {
    databaseUser = {
      id: 14,
      firstName: "New",
      lastName: "User",
      email: orphanedEmail,
      clerkUserId: "clerk_orphaned_parent",
      role: "parent",
      approved: false,
      householdId: null,
    };

    const response = await cleanup();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringMatching(/unfinished sign-in account/i),
    });
    expect(databaseDeleteCalls).toHaveLength(1);
    expect((databaseDeleteCalls[0] as { __table?: string }).__table).toBe("usersTable");
    expect(clerkDeleteCalls).toEqual(["clerk_orphaned_parent"]);
  });

  it("continues to protect a user attached to an active household", async () => {
    databaseUser = {
      id: 15,
      firstName: "Active",
      lastName: "Parent",
      email: orphanedEmail,
      clerkUserId: "clerk_orphaned_parent",
      role: "parent",
      approved: false,
      householdId: 42,
    };

    const response = await cleanup();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/active TrailTeam user/i),
    });
    expect(databaseDeleteCalls).toEqual([]);
    expect(clerkDeleteCalls).toEqual([]);
  });

  it("continues to protect approved and team-role accounts without households", async () => {
    databaseUser = {
      id: 16,
      firstName: "Team",
      lastName: "Coach",
      email: orphanedEmail,
      clerkUserId: "clerk_orphaned_parent",
      role: "coach",
      approved: true,
      householdId: null,
    };

    const response = await cleanup();

    expect(response.status).toBe(409);
    expect(databaseDeleteCalls).toEqual([]);
    expect(clerkDeleteCalls).toEqual([]);
  });
});