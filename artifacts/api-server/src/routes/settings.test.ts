import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const email = "member@example.com";
let databaseUser: Record<string, unknown> | null = null;
let requester: Record<string, unknown> | null = { id: 1, role: "admin" };
let administratorIds: number[] = [1, 2];
let clerkLookupResult: Array<{ id: string }> = [];
const deletionCalls: Array<Record<string, unknown>> = [];
const clerkDeletionCalls: string[] = [];
let deletionResult: { ok: boolean; stage?: "clerk" | "database"; deletedHousehold?: boolean } = {
  ok: true,
  deletedHousehold: false,
};

const usersTable = new Proxy(
  { __table: "usersTable" },
  { get: (target, key) => target[key as keyof typeof target] ?? { column: String(key) } },
);

vi.mock("@clerk/express", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      getUserList: vi.fn(async () => ({ data: clerkLookupResult })),
    },
  })),
}));

vi.mock("@workspace/db", () => ({
  db: {
    query: {
      teamSettingsTable: { findFirst: vi.fn() },
      usersTable: {
        findFirst: vi.fn(async () => {
          const value = databaseUser;
          databaseUser = requester;
          requester = value;
          return value;
        }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => administratorIds.map((id) => ({ id }))),
      })),
    })),
    insert: vi.fn(),
  },
  teamSettingsTable: new Proxy({}, { get: () => ({}) }),
  usersTable,
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireCoachOrAdmin: (req: any, _res: unknown, next: () => void) => {
    req.clerkUserId = "clerk_requester";
    next();
  },
}));

vi.mock("../lib/account-deletion", () => ({
  permanentlyDeleteLocalAccount: vi.fn(async (user: Record<string, unknown>) => {
    deletionCalls.push(user);
    return deletionResult;
  }),
  deleteClerkUserId: vi.fn(async (clerkUserId: string) => {
    clerkDeletionCalls.push(clerkUserId);
    return true;
  }),
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
  requester = { id: 1, role: "admin" };
  administratorIds = [1, 2];
  clerkLookupResult = [];
  deletionCalls.length = 0;
  clerkDeletionCalls.length = 0;
  deletionResult = { ok: true, deletedHousehold: false };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function deleteAccount(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/admin/accounts/by-email`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /admin/accounts/by-email", () => {
  it("permanently deletes an active account when confirmation is explicit", async () => {
    databaseUser = { id: 14, email, role: "parent", clerkUserId: "clerk_member", householdId: 22 };
    deletionResult = { ok: true, deletedHousehold: true };

    const response = await deleteAccount({ email, confirmation: "DELETE" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, deletedHousehold: true });
    expect(deletionCalls).toEqual([expect.objectContaining({ id: 14, clerkUserId: "clerk_member" })]);
  });

  it("rejects deletion without the explicit confirmation", async () => {
    const response = await deleteAccount({ email });

    expect(response.status).toBe(400);
    expect(deletionCalls).toEqual([]);
  });

  it("does not remove TrailTeam data when Clerk deletion fails", async () => {
    databaseUser = { id: 14, email, role: "parent", clerkUserId: "clerk_member", householdId: null };
    deletionResult = { ok: false, stage: "clerk" };

    const response = await deleteAccount({ email, confirmation: "DELETE" });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/no TrailTeam data was deleted/i) });
  });

  it("protects an administrator from a coach", async () => {
    databaseUser = { id: 7, email, role: "admin", clerkUserId: "clerk_admin", householdId: null };
    requester = { id: 1, role: "coach" };

    const response = await deleteAccount({ email, confirmation: "DELETE" });

    expect(response.status).toBe(403);
    expect(deletionCalls).toEqual([]);
  });

  it("protects the last administrator from the admin support tool", async () => {
    databaseUser = { id: 7, email, role: "admin", clerkUserId: "clerk_admin", householdId: null };
    requester = { id: 1, role: "admin" };
    administratorIds = [7];

    const response = await deleteAccount({ email, confirmation: "DELETE" });

    expect(response.status).toBe(409);
    expect(deletionCalls).toEqual([]);
  });

  it("still frees an orphaned Clerk-only account", async () => {
    clerkLookupResult = [{ id: "clerk_orphan" }];

    const response = await deleteAccount({ email, confirmation: "DELETE" });

    expect(response.status).toBe(200);
    expect(clerkDeletionCalls).toEqual(["clerk_orphan"]);
    expect(deletionCalls).toEqual([]);
  });
});