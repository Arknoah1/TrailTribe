/**
 * Integration-level tests for the rider-invites router.
 *
 * Mounts the real Express router with stubbed I/O (database, Clerk, auth).
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

let mockInvite: Record<string, unknown> | null = null;
let mockRider: Record<string, unknown> | null = null;

/** Arguments passed to each db.update().set() call, captured for assertions. */
const updateSetCalls: Array<Record<string, unknown>> = [];

/* ─── module mocks ───────────────────────────────────────────────────── */

vi.mock("@workspace/db", () => {
  const mockDb = {
    query: {
      usersTable: {
        // Returns whatever mockRider is at call-time (closure over mutable ref).
        findFirst: vi.fn(async () => mockRider),
      },
      riderInvitesTable: {
        // Returns whatever mockInvite is at call-time.
        findFirst: vi.fn(async () => mockInvite),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => {
        updateSetCalls.push({ ...patch });
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    })),
  };
  return {
    db: mockDb,
    riderInvitesTable: new Proxy({}, { get: () => ({}) }),
    usersTable: new Proxy({}, { get: () => ({}) }),
  };
});

vi.mock("../lib/email", () => ({
  sendEmail: vi.fn(async () => ({ status: "sent" })),
}));

// Bypass real Clerk JWT verification — inject a fixed clerkUserId.
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_rider";
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_test_rider";
    next();
  },
}));

// Clerk client — getUser always succeeds without a real API call.
// The returned object must model the email-address contract the route reads:
//   clerkUser.emailAddresses (array of { id, emailAddress })
//   clerkUser.primaryEmailAddressId (id of the primary address)
vi.mock("@clerk/express", () => ({
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "clerk_test_rider",
        primaryEmailAddressId: "ea_1",
        emailAddresses: [{ id: "ea_1", emailAddress: "alex@example.com" }],
      }),
    },
  })),
}));

vi.mock("./settings", () => ({
  getOrCreateSettings: vi.fn().mockResolvedValue({ teamName: "Trail Blazers", shortName: "TB" }),
}));

vi.mock("../lib/config", () => ({
  getAppBase: vi.fn(() => "https://trailtribe.example.com"),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middlewares/rateLimiter", () => ({
  publicLookupLimiter: (_req: any, _res: any, next: any) => next(),
}));

/* ─── import router after mocks are registered ───────────────────────── */

const { default: riderInvitesRouter } = await import("./rider-invites");

/* ─── test server ─────────────────────────────────────────────────────── */

const app = express();
app.use(express.json());
app.use(riderInvitesRouter);

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

beforeEach(() => {
  // vi.clearAllMocks() clears recorded call history only — does NOT reset
  // mock implementations, so the closures over mockInvite / mockRider still fire.
  vi.clearAllMocks();
  updateSetCalls.length = 0;

  // Reset mutable refs to happy-path defaults before each test.
  mockInvite = {
    id: 42,
    riderId: 7,
    token: "valid-token-abc",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days from now
  };
  mockRider = {
    id: 7,
    firstName: "Alex",
    lastName: "Rider",
    email: "alex@example.com",
    role: "student",
    householdId: 3,
    clerkUserId: null,
  };
});

/* ─── GET /rider-invites/validate/:token ─────────────────────────────── */

describe("GET /rider-invites/validate/:token", () => {
  it("returns 200 with riderFirstName when the token is valid", async () => {
    const resp = await fetch(`${baseUrl}/rider-invites/validate/valid-token-abc`);
    expect(resp.status).toBe(200);

    const body = await resp.json() as { riderFirstName: string; riderEmail: string };
    expect(body.riderFirstName).toBe("Alex");
    expect(body.riderEmail).toBe("alex@example.com");
  });

  it("returns 404 and an error message when the token is not found (expired or already used)", async () => {
    // No matching invite in the DB — simulates expired, revoked, or used token.
    mockInvite = null;

    const resp = await fetch(`${baseUrl}/rider-invites/validate/expired-or-used-token`);
    expect(resp.status).toBe(404);

    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/invalid|expired|used/i);
  });
});

/* ─── POST /rider-invites/accept — happy path ────────────────────────── */

describe("POST /rider-invites/accept — happy path", () => {
  it("stamps clerkUserId and approved:true on the rider row and returns ok:true", async () => {
    const resp = await fetch(`${baseUrl}/rider-invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token-abc" }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // The rider row must be updated with the Clerk ID and approved flag.
    const riderUpdate = updateSetCalls.find(
      (call) => call.clerkUserId === "clerk_test_rider" && call.approved === true,
    );
    expect(
      riderUpdate,
      "Expected db.update().set({ clerkUserId, approved: true }) for the rider row",
    ).toBeTruthy();

    // The invite must be consumed by stamping acceptedAt.
    const inviteConsume = updateSetCalls.find(
      (call) => call.acceptedAt instanceof Date,
    );
    expect(
      inviteConsume,
      "Expected db.update().set({ acceptedAt }) to consume the invite",
    ).toBeTruthy();
  });

  it("returns 400 when the token field is missing", async () => {
    const resp = await fetch(`${baseUrl}/rider-invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(resp.status).toBe(400);
  });
});

/* ─── POST /rider-invites/accept — edge cases ────────────────────────── */

describe("POST /rider-invites/accept — edge cases", () => {
  it("returns 404 when the token is invalid (expired or already used)", async () => {
    mockInvite = null;

    const resp = await fetch(`${baseUrl}/rider-invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad-token" }),
    });

    expect(resp.status).toBe(404);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/invalid|expired|used/i);

    // No db writes should have happened.
    expect(updateSetCalls).toHaveLength(0);
  });

  it("returns 409 when the rider already has a different Clerk account linked", async () => {
    // Rider row already has a different clerkUserId set.
    mockRider = { ...mockRider!, clerkUserId: "clerk_some_other_user" };

    const resp = await fetch(`${baseUrl}/rider-invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token-abc" }),
    });

    expect(resp.status).toBe(409);
  });

  it("returns 409 with code EMAIL_MISMATCH when signed-in email differs from rider email", async () => {
    // The Clerk mock returns alex@example.com; change the rider record to a different address.
    mockRider = { ...mockRider!, email: "different@example.com" };

    const resp = await fetch(`${baseUrl}/rider-invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token-abc" }),
    });

    expect(resp.status).toBe(409);
    const body = await resp.json() as { error: string; code: string };
    expect(body.code).toBe("EMAIL_MISMATCH");
    expect(body.error).toMatch(/different@example\.com/i);
    expect(body.error).toMatch(/alex@example\.com/i);

    // Neither the rider row nor the invite should have been mutated.
    expect(updateSetCalls).toHaveLength(0);
  });

  it("accepts the invite when emails match case-insensitively", async () => {
    // Rider email stored in uppercase — Clerk returns lowercase. Should still succeed.
    mockRider = { ...mockRider!, email: "ALEX@EXAMPLE.COM" };

    const resp = await fetch(`${baseUrl}/rider-invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token-abc" }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Rider row must still be linked.
    const riderUpdate = updateSetCalls.find(
      (call) => call.clerkUserId === "clerk_test_rider" && call.approved === true,
    );
    expect(riderUpdate).toBeTruthy();
  });
});

/* ─── "Invalid Invite Link" screen — validate edge cases ─────────────── */

describe("Invalid Invite Link edge cases", () => {
  it("validate returns 404 for a token that was already accepted", async () => {
    // The DB query filters out non-null acceptedAt, so findFirst returns null.
    mockInvite = null;

    const resp = await fetch(`${baseUrl}/rider-invites/validate/already-accepted-token`);
    expect(resp.status).toBe(404);

    // The front-end maps this 404 to the "Invalid Invite Link" card.
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/invalid|expired|used/i);
  });

  it("validate returns 404 for a token that was revoked", async () => {
    mockInvite = null;

    const resp = await fetch(`${baseUrl}/rider-invites/validate/revoked-token`);
    expect(resp.status).toBe(404);
    const body = await resp.json() as { error: string };
    expect(body.error).toMatch(/invalid|expired|used/i);
  });
});
