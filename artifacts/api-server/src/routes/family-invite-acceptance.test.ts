import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const state = vi.hoisted(() => ({
  invite: null as Record<string, any> | null,
  household: { id: 42, name: "Smith Family", podId: "trailblazers" } as Record<string, any> | null,
  user: null as Record<string, any> | null,
  clerkUser: {
    id: "clerk_parent",
    firstName: "Taylor",
    lastName: "Smith",
    emailAddresses: [{ emailAddress: "parent@example.com" }],
  } as Record<string, any>,
  updates: [] as Record<string, any>[],
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
}));

vi.mock("@clerk/express", () => ({
  createClerkClient: () => ({
    users: { getUser: vi.fn(async () => state.clerkUser) },
  }),
}));

vi.mock("@workspace/db", () => {
  const mockDb: any = {
    query: {
      familyInvitesTable: { findFirst: vi.fn(async () => state.invite) },
      householdsTable: { findFirst: vi.fn(async () => state.household) },
      usersTable: { findFirst: vi.fn(async () => state.user) },
    },
    update: vi.fn(() => {
      const chain: any = {};
      chain.set = vi.fn((values) => {
        state.updates.push(values);
        return chain;
      });
      chain.where = vi.fn(() => chain);
      chain.returning = vi.fn(async () => state.user ? [{ ...state.user, ...state.updates.at(-1) }] : []);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => []),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(async () => state.invite ? [state.invite] : []),
        where: vi.fn(() => ({ orderBy: vi.fn(async () => []) })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  };
  mockDb.transaction = vi.fn(async (callback) => callback(mockDb));
  return {
    db: mockDb,
    familyInvitesTable: new Proxy({}, { get: () => ({}) }),
    householdsTable: new Proxy({}, { get: () => ({}) }),
    usersTable: new Proxy({}, { get: () => ({}) }),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = "clerk_parent";
    next();
  },
  requireCoachOrAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../middlewares/rateLimiter", () => ({ publicLookupLimiter: (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/email", () => ({ sendEmail: vi.fn(async () => ({ status: "sent" })) }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("./settings", () => ({ getOrCreateSettings: vi.fn(async () => ({ teamName: "TrailTeam", shortName: "" })) }));
vi.mock("../lib/config", () => ({ getAppBase: () => "https://trailteam.test" }));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: familyInvitesRouter } = await import("./family-invites");
  const app = express();
  app.use(express.json());
  app.use(familyInvitesRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  state.invite = {
    id: 9,
    token: "invite-token",
    email: "parent@example.com",
    householdId: 42,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
  };
  state.household = { id: 42, name: "Smith Family", podId: "trailblazers" };
  state.user = {
    id: 7,
    clerkUserId: "clerk_parent",
    firstName: "Taylor",
    lastName: "Smith",
    email: "parent@example.com",
    householdId: null,
  };
  state.clerkUser = {
    id: "clerk_parent",
    firstName: "Taylor",
    lastName: "Smith",
    emailAddresses: [{ emailAddress: "parent@example.com" }],
  };
  state.updates.length = 0;
});

async function accept() {
  return fetch(`${baseUrl}/family-invites/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "invite-token" }),
  });
}

describe("POST /family-invites/accept", () => {
  it("sends an existing complete account directly to the household experience", async () => {
    const response = await accept();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, needsOnboarding: false });
    expect(state.updates).toContainEqual(expect.objectContaining({ acceptedAt: expect.any(Date) }));
  });

  it("reports when an incomplete profile still needs onboarding", async () => {
    state.user = { ...state.user!, firstName: "", lastName: "" };
    state.clerkUser = { ...state.clerkUser, firstName: "", lastName: "" };

    const response = await accept();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, needsOnboarding: true });
  });

  it("returns a recoverable account-mismatch code without consuming the invite", async () => {
    state.clerkUser = {
      ...state.clerkUser,
      emailAddresses: [{ emailAddress: "different@example.com" }],
    };

    const response = await accept();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: "EMAIL_MISMATCH" });
    expect(body.error).toContain("parent@example.com");
    expect(state.updates).toEqual([]);
  });
});

describe("legacy family invite administration", () => {
  it("does not list household-bound invitations through the global endpoint", async () => {
    const response = await fetch(`${baseUrl}/family-invites`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("does not cancel or purge a household-bound invitation by global ID", async () => {
    const cancelResponse = await fetch(`${baseUrl}/family-invites/9`, { method: "DELETE" });
    const purgeResponse = await fetch(`${baseUrl}/family-invites/9/purge`, { method: "DELETE" });

    expect(cancelResponse.status).toBe(404);
    expect(purgeResponse.status).toBe(404);
    expect(state.updates).toEqual([]);
  });
});