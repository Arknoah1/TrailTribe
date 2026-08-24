import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const state = vi.hoisted(() => ({
  requester: {
    id: 7,
    role: "parent",
    householdId: 42,
    clerkUserId: "parent_clerk",
    firstName: "Alex",
    lastName: "Smith",
  } as Record<string, unknown> | null,
  household: { id: 42, name: "Smith Family", podId: "trailblazers" } as Record<string, unknown> | null,
  activeInvite: null as Record<string, unknown> | null,
  delivery: { status: "sent" } as { status: "sent" | "skipped" | "failed"; reason?: string; error?: Error },
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  emails: [] as Record<string, unknown>[],
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

vi.mock("@workspace/db", () => {
  const updateChain = () => {
    const chain: any = {};
    chain.set = vi.fn((values) => {
      state.updates.push(values);
      return chain;
    });
    chain.where = vi.fn().mockResolvedValue(undefined);
    chain.returning = vi.fn().mockResolvedValue([]);
    return chain;
  };

  return {
    db: {
      query: {
        usersTable: { findFirst: vi.fn(() => Promise.resolve(state.requester)) },
        householdsTable: { findFirst: vi.fn(() => Promise.resolve(state.household)) },
        familyInvitesTable: { findFirst: vi.fn(() => Promise.resolve(state.activeInvite)) },
      },
      insert: vi.fn(() => ({
        values: vi.fn(async (values) => {
          state.inserts.push(values);
          return undefined;
        }),
      })),
      update: vi.fn(() => updateChain()),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      transaction: vi.fn(),
    },
    householdsTable: {},
    usersTable: {},
    familyInvitesTable: {},
    documentConsentsTable: {},
    teamDocumentsTable: {},
    seasonsTable: {},
    seasonRosterSnapshotsTable: {},
    carpoolClaimsTable: {},
    carpoolOffersTable: {},
    carpoolRequestsTable: {},
    notificationsTable: {},
    eventTaskSignupsTable: {},
    boardThreadsTable: {},
    boardPostsTable: {},
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clerkUserId = (state.requester as any)?.clerkUserId ?? "test_clerk";
    next();
  },
  requireApproved: (req: any, _res: any, next: any) => {
    req.clerkUserId = (state.requester as any)?.clerkUserId ?? "test_clerk";
    next();
  },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => {
    req.clerkUserId = (state.requester as any)?.clerkUserId ?? "test_clerk";
    next();
  },
}));
vi.mock("../middlewares/rateLimiter", () => ({ publicLookupLimiter: (_req: any, _res: any, next: any) => next() }));
vi.mock("../lib/config", () => ({ getAppBase: () => "https://trailtribe.test" }));
vi.mock("../lib/email", () => ({
  sendEmail: vi.fn(async (message) => {
    state.emails.push(message);
    return state.delivery;
  }),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: householdsRouter } = await import("./households");
  const app = express();
  app.use(express.json());
  app.use(householdsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  state.requester = {
    id: 7, role: "parent", householdId: 42, clerkUserId: "parent_clerk", firstName: "Alex", lastName: "Smith",
  };
  state.household = { id: 42, name: "Smith Family", podId: "trailblazers" };
  state.activeInvite = null;
  state.delivery = { status: "sent" };
  state.inserts.length = 0;
  state.updates.length = 0;
  state.emails.length = 0;
});

async function send(body: unknown, householdId = 42) {
  return fetch(`${baseUrl}/households/${householdId}/co-parent-invites`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /households/:id/co-parent-invites", () => {
  it("validates the email before creating an invitation", async () => {
    const response = await send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(state.inserts).toEqual([]);
    expect(state.emails).toEqual([]);
  });

  it.each([
    ["a student in the household", { id: 8, role: "student", householdId: 42 }],
    ["a coach from a different household", { id: 9, role: "coach", householdId: 99 }],
    ["an admin in the household", { id: 10, role: "admin", householdId: 42 }],
  ])("rejects %s", async (_description, requester) => {
    state.requester = requester;
    const response = await send({ email: "coparent@example.com" });

    expect(response.status).toBe(403);
    expect(state.inserts).toEqual([]);
    expect(state.emails).toEqual([]);
  });

  it("allows a coach in the requested household to invite a co-parent", async () => {
    state.requester = {
      id: 8, role: "coach", householdId: 42, clerkUserId: "coach_parent_clerk", firstName: "Katharine", lastName: "Bill",
    };

    const response = await send({ email: "coparent@example.com" });

    expect(response.status).toBe(201);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ householdId: 42, invitedByUserId: 8 });
    expect(state.emails).toHaveLength(1);
  });

  it("creates a household-bound invite and emails its private link", async () => {
    const response = await send({ email: "CoParent@Example.com" });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ email: "coparent@example.com" });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      email: "coparent@example.com",
      householdId: 42,
      invitedByUserId: 7,
    });
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].subject).toContain("Smith Family");
    expect(state.emails[0].text).toMatch(/https:\/\/trailtribe\.test\/family-invite\/[a-f0-9]{48}/);
  });

  it("refreshes an active invite for the same household and email instead of creating another", async () => {
    state.activeInvite = {
      id: 55,
      token: "a".repeat(48),
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    };

    const response = await send({ email: "coparent@example.com" });

    expect(response.status).toBe(201);
    expect(state.inserts).toEqual([]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ invitedByUserId: 7 });
    expect(state.emails[0].text).toContain(`family-invite/${"a".repeat(48)}`);
  });

  it.each([
    ["skipped", 503],
    ["failed", 502],
  ] as const)("reports %s email delivery to the sender", async (status, expectedStatus) => {
    state.delivery = status === "skipped" ? { status, reason: "SMTP disabled" } : { status, error: new Error("SMTP failed") };

    const response = await send({ email: "coparent@example.com" });

    expect(response.status).toBe(expectedStatus);
    expect((await response.json()).error).toMatch(/Email delivery|couldn't send/i);
  });
});