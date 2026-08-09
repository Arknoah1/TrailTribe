/**
 * Authorization tests for carpool claim/offer mutation endpoints.
 *
 * Verifies that PATCH and DELETE /carpools/:offerId/claims/:claimId enforce
 * the canManageClaim access-control policy:
 *   ✓ The rider themselves may manage their own claim
 *   ✓ A parent sharing the rider's household may manage the claim
 *   ✓ The driver of the matching offer may manage the claim
 *   ✓ A coach or admin may manage any claim
 *   ✗ A student (sibling) sharing the rider's household is forbidden
 *   ✗ An unrelated user is forbidden
 *
 * Also verifies PATCH and DELETE /carpools/:offerId enforce offer ownership.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/* ─── fixtures ─────────────────────────────────────────────────────────── */

const OFFER_ID      = 10;
const CLAIM_ID      = 20;
const RIDER_ID      = 1;
const PARENT_ID     = 2;
const SIBLING_ID    = 3;   // student in the same household
const DRIVER_ID     = 4;
const UNRELATED_ID  = 5;
const COACH_ID      = 6;
const ADMIN_ID      = 7;
const HOUSEHOLD_ID  = 100;

const users: Record<number, Record<string, unknown>> = {
  [RIDER_ID]:     { id: RIDER_ID,    role: "parent",  householdId: HOUSEHOLD_ID, clerkUserId: "clerk_rider" },
  [PARENT_ID]:    { id: PARENT_ID,   role: "parent",  householdId: HOUSEHOLD_ID, clerkUserId: "clerk_parent" },
  [SIBLING_ID]:   { id: SIBLING_ID,  role: "student", householdId: HOUSEHOLD_ID, clerkUserId: "clerk_sibling" },
  [DRIVER_ID]:    { id: DRIVER_ID,   role: "parent",  householdId: 999,          clerkUserId: "clerk_driver" },
  [UNRELATED_ID]: { id: UNRELATED_ID,role: "parent",  householdId: 888,          clerkUserId: "clerk_unrelated" },
  [COACH_ID]:     { id: COACH_ID,    role: "coach",   householdId: null,         clerkUserId: "clerk_coach" },
  [ADMIN_ID]:     { id: ADMIN_ID,    role: "admin",   householdId: null,         clerkUserId: "clerk_admin" },
};

const mockOffer = {
  id: OFFER_ID,
  eventId: 1,
  driverUserId: DRIVER_ID,
  availableSeats: 3,
  bikeTrayCount: 0,
  departureLocation: null,
  departureTime: null,
  notes: null,
};

const mockClaim = {
  id: CLAIM_ID,
  carpoolOfferId: OFFER_ID,
  riderUserId: RIDER_ID,
  needsSeat: true,
  needsBikeTray: false,
  notes: null,
  matchedByDriver: false,
};

/* ─── mutable per-test state ───────────────────────────────────────────── */

let currentClerkUserId: string | null = null;
// Tracks how many times usersTable.findFirst has been called within the
// current HTTP request so we can return the right entity each time.
let userFindFirstCallIndex = 0;

/* ─── module mocks ─────────────────────────────────────────────────────── */

vi.mock("@workspace/db", () => {
  const makeUpdateChain = () => {
    const c: any = {};
    c.set = vi.fn(() => c);
    c.where = vi.fn(() => c);
    c.returning = vi.fn().mockResolvedValue([{ id: CLAIM_ID }]);
    c.then = (res: any) => Promise.resolve([]).then(res);
    return c;
  };
  const makeDeleteChain = () => ({ where: vi.fn().mockResolvedValue(undefined) });

  return {
    db: {
      query: {
        // findFirst is reconfigured in beforeAll after import; placeholder here.
        usersTable:         { findFirst: vi.fn().mockResolvedValue(null) },
        carpoolOffersTable: { findFirst: vi.fn().mockResolvedValue(mockOffer) },
        carpoolClaimsTable: { findFirst: vi.fn().mockResolvedValue(mockClaim) },
      },
      update: vi.fn(() => makeUpdateChain()),
      delete: vi.fn(() => makeDeleteChain()),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([mockClaim]) })) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    },
    usersTable:           new Proxy({}, { get: () => ({}) }),
    carpoolOffersTable:   new Proxy({}, { get: () => ({}) }),
    carpoolClaimsTable:   new Proxy({}, { get: () => ({}) }),
    carpoolRequestsTable: new Proxy({}, { get: () => ({}) }),
    eventsTable:          new Proxy({}, { get: () => ({}) }),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth:    (_req: any, _res: any, next: any) => { (_req as any).clerkUserId = currentClerkUserId; next(); },
  requireApproved:(_req: any, _res: any, next: any) => { (_req as any).clerkUserId = currentClerkUserId; next(); },
}));

vi.mock("../lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/email",         () => ({ sendEmail: vi.fn().mockResolvedValue({ status: "sent" }) }));
vi.mock("./settings",           () => ({
  getShortNamePrefix:  vi.fn().mockResolvedValue(""),
  getOrCreateSettings: vi.fn().mockResolvedValue({ teamName: null, shortName: null }),
}));

/* ─── server setup ─────────────────────────────────────────────────────── */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: carpoolsRouter } = await import("./carpools");
  const { db } = await import("@workspace/db");

  // usersTable.findFirst is called multiple times per request:
  //   call #0  → getRequester()       → return the logged-in user
  //   call #1+ → canManageClaim()     → look up the rider by id → return the rider fixture
  // We use a per-request call counter (reset in beforeEach) to tell them apart.
  (db.query.usersTable.findFirst as any).mockImplementation(() => {
    const idx = userFindFirstCallIndex++;
    if (idx === 0) {
      return Promise.resolve(
        Object.values(users).find((u) => (u as any).clerkUserId === currentClerkUserId) ?? null,
      );
    }
    // Rider lookup inside canManageClaim — always return the rider fixture
    return Promise.resolve(users[RIDER_ID]);
  });

  const app = express();
  app.use(express.json());
  app.use("/", carpoolsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  userFindFirstCallIndex = 0;
});

/* ─── helpers ───────────────────────────────────────────────────────────── */

function setUser(userId: number) {
  currentClerkUserId = (users[userId] as any).clerkUserId;
  userFindFirstCallIndex = 0;
}

async function patchClaim(userId: number) {
  setUser(userId);
  return fetch(`${baseUrl}/carpools/${OFFER_ID}/claims/${CLAIM_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: "updated" }),
  });
}

async function deleteClaim(userId: number) {
  setUser(userId);
  return fetch(`${baseUrl}/carpools/${OFFER_ID}/claims/${CLAIM_ID}`, {
    method: "DELETE",
  });
}

async function patchOffer(userId: number) {
  setUser(userId);
  return fetch(`${baseUrl}/carpools/${OFFER_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ availableSeats: 4 }),
  });
}

async function deleteOffer(userId: number) {
  setUser(userId);
  return fetch(`${baseUrl}/carpools/${OFFER_ID}`, { method: "DELETE" });
}

/* ─── claim PATCH authorization ─────────────────────────────────────────── */

describe("PATCH /carpools/:offerId/claims/:claimId — authorization", () => {
  it("allows the rider to edit their own claim", async () => {
    expect((await patchClaim(RIDER_ID)).status).not.toBe(403);
  });

  it("allows a parent in the rider's household to edit the claim", async () => {
    expect((await patchClaim(PARENT_ID)).status).not.toBe(403);
  });

  it("allows the driver of the matched offer to edit the claim", async () => {
    expect((await patchClaim(DRIVER_ID)).status).not.toBe(403);
  });

  it("allows a coach to edit any claim", async () => {
    expect((await patchClaim(COACH_ID)).status).not.toBe(403);
  });

  it("allows an admin to edit any claim", async () => {
    expect((await patchClaim(ADMIN_ID)).status).not.toBe(403);
  });

  it("forbids a same-household student (sibling) from editing a claim", async () => {
    expect((await patchClaim(SIBLING_ID)).status).toBe(403);
  });

  it("forbids an unrelated user from editing a claim", async () => {
    expect((await patchClaim(UNRELATED_ID)).status).toBe(403);
  });
});

/* ─── claim DELETE authorization ────────────────────────────────────────── */

describe("DELETE /carpools/:offerId/claims/:claimId — authorization", () => {
  it("allows the rider to delete their own claim", async () => {
    expect((await deleteClaim(RIDER_ID)).status).not.toBe(403);
  });

  it("allows a parent in the rider's household to delete the claim", async () => {
    expect((await deleteClaim(PARENT_ID)).status).not.toBe(403);
  });

  it("allows the driver of the matched offer to delete the claim", async () => {
    expect((await deleteClaim(DRIVER_ID)).status).not.toBe(403);
  });

  it("allows a coach to delete any claim", async () => {
    expect((await deleteClaim(COACH_ID)).status).not.toBe(403);
  });

  it("allows an admin to delete any claim", async () => {
    expect((await deleteClaim(ADMIN_ID)).status).not.toBe(403);
  });

  it("forbids a same-household student (sibling) from deleting a claim", async () => {
    expect((await deleteClaim(SIBLING_ID)).status).toBe(403);
  });

  it("forbids an unrelated user from deleting a claim", async () => {
    expect((await deleteClaim(UNRELATED_ID)).status).toBe(403);
  });
});

/* ─── offer PATCH/DELETE authorization ──────────────────────────────────── */

describe("PATCH /carpools/:offerId — offer ownership", () => {
  it("allows the driver to edit their own offer", async () => {
    expect((await patchOffer(DRIVER_ID)).status).not.toBe(403);
  });

  it("allows a coach to edit any offer", async () => {
    expect((await patchOffer(COACH_ID)).status).not.toBe(403);
  });

  it("forbids a non-driver from editing another user's offer", async () => {
    expect((await patchOffer(UNRELATED_ID)).status).toBe(403);
  });
});

describe("DELETE /carpools/:offerId — offer ownership", () => {
  it("allows the driver to delete their own offer", async () => {
    expect((await deleteOffer(DRIVER_ID)).status).not.toBe(403);
  });

  it("allows a coach to delete any offer", async () => {
    expect((await deleteOffer(COACH_ID)).status).not.toBe(403);
  });

  it("forbids a non-driver from deleting another user's offer", async () => {
    expect((await deleteOffer(UNRELATED_ID)).status).toBe(403);
  });
});
