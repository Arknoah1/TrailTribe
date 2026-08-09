/**
 * Tests for DELETE /households/:id — permanent-delete flow.
 *
 * Covers:
 *   ✓ DELETE on a non-archived household returns 400
 *   ✓ DELETE on an archived household returns 204
 *   ✓ The transaction hard-deletes every required table in the correct order:
 *       carpoolClaimsTable → carpoolRequestsTable → carpoolOffersTable →
 *       notificationsTable → documentConsentsTable →
 *       seasonRosterSnapshotsTable → usersTable → householdsTable
 *   ✓ Carpool claims/offers/requests and notification rows for household members
 *     are explicitly removed before the user rows are deleted (belt-and-suspenders
 *     on top of the DB-level onDelete: cascade on those FKs)
 *   ✓ Re-enrolling with the same Clerk account after deletion is handled
 *     gracefully:
 *       - POST /households succeeds (201) — a new household can be created
 *       - PATCH /households/:id returns 401 — requester is gone from DB
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/* ─── fixtures ─────────────────────────────────────────────────────────── */

const HOUSEHOLD_ID          = 42;
const ARCHIVED_HOUSEHOLD_ID = 99;
const COACH_ID              = 1;
const ADMIN_ID              = 2;
const PARENT_ID             = 3;

const users: Record<number, Record<string, unknown>> = {
  [COACH_ID]:  { id: COACH_ID,  role: "coach",  householdId: null,         clerkUserId: "clerk_coach"  },
  [ADMIN_ID]:  { id: ADMIN_ID,  role: "admin",  householdId: null,         clerkUserId: "clerk_admin"  },
  [PARENT_ID]: { id: PARENT_ID, role: "parent", householdId: HOUSEHOLD_ID, clerkUserId: "clerk_parent" },
};

const mockHousehold = {
  id: HOUSEHOLD_ID,
  name: "Smith Family",
  archivedAt: null,
  inviteCode: "abc123",
  podId: null,
  address: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  seasonEnrolled: false,
  liabilityWaiverSigned: false,
  mediaReleaseSigned: false,
  codeOfConductSigned: false,
  liabilityWaiverSignedAt: null,
  mediaReleaseSignedAt: null,
  codeOfConductSignedAt: null,
};

const mockArchivedHousehold = {
  ...mockHousehold,
  id: ARCHIVED_HOUSEHOLD_ID,
  name: "Jones Family (archived)",
  archivedAt: new Date("2026-01-01T00:00:00Z"),
};

/* ─── mutable per-test state ────────────────────────────────────────────── */

let currentClerkUserId: string | null = null;

// Set per-test to control what householdsTable.findFirst returns.
let householdFindFirstResult: Record<string, unknown> | null = mockHousehold;

// Tracks which table objects were passed to tx.delete() inside the transaction,
// in the order they were called.  Asserted in cascade tests.
const txDeleteCalls: any[] = [];

/* ─── module mocks ──────────────────────────────────────────────────────── */

// Named sentinel objects so we can do identity checks in assertions
const MOCK_HOUSEHOLDS_TABLE          = { __table: "householdsTable" };
const MOCK_USERS_TABLE               = { __table: "usersTable" };
const MOCK_DOCUMENT_CONSENTS_TABLE   = { __table: "documentConsentsTable" };
const MOCK_ROSTER_SNAPSHOTS_TABLE    = { __table: "seasonRosterSnapshotsTable" };
const MOCK_TEAM_DOCUMENTS_TABLE      = { __table: "teamDocumentsTable" };
const MOCK_SEASONS_TABLE             = { __table: "seasonsTable" };
const MOCK_CARPOOL_CLAIMS_TABLE      = { __table: "carpoolClaimsTable" };
const MOCK_CARPOOL_OFFERS_TABLE      = { __table: "carpoolOffersTable" };
const MOCK_CARPOOL_REQUESTS_TABLE    = { __table: "carpoolRequestsTable" };
const MOCK_NOTIFICATIONS_TABLE       = { __table: "notificationsTable" };

vi.mock("@workspace/db", () => {
  const makeWhereChain = () => ({ where: vi.fn().mockResolvedValue(undefined) });

  const makeUpdateChain = () => {
    const c: any = {};
    c.set = vi.fn(() => c);
    c.where = vi.fn(() => c);
    c.returning = vi.fn().mockResolvedValue([mockHousehold]);
    return c;
  };

  const makeSelectChain = () => {
    const c: any = {};
    c.from = vi.fn(() => c);
    c.where = vi.fn().mockResolvedValue([]);
    c.orderBy = vi.fn(() => c);
    c.limit = vi.fn().mockResolvedValue([]);
    return c;
  };

  // tx.select simulates finding PARENT_ID as the sole household member.
  // This ensures memberIds is non-empty so the carpool/notification sweep runs.
  const makeTxSelectChain = () => {
    const c: any = {};
    c.from = vi.fn(() => c);
    c.where = vi.fn().mockResolvedValue([{ id: PARENT_ID }]);
    return c;
  };

  return {
    db: {
      query: {
        householdsTable: {
          findFirst: vi.fn().mockImplementation(() =>
            Promise.resolve(householdFindFirstResult),
          ),
        },
        usersTable: {
          findFirst: vi.fn().mockImplementation(() =>
            Promise.resolve(
              Object.values(users).find(
                (u) => (u as any).clerkUserId === currentClerkUserId,
              ) ?? null,
            ),
          ),
        },
      },
      transaction: vi.fn().mockImplementation(async (fn: any) => {
        const tx = {
          select: vi.fn(() => makeTxSelectChain()),
          delete: vi.fn().mockImplementation((table: any) => {
            txDeleteCalls.push(table);
            return makeWhereChain();
          }),
        };
        return fn(tx);
      }),
      delete: vi.fn(() => makeWhereChain()),
      update: vi.fn(() => makeUpdateChain()),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockHousehold]),
        })),
      })),
      select: vi.fn(() => makeSelectChain()),
    },
    // Use the named sentinels so tests can use identity checks
    householdsTable:             MOCK_HOUSEHOLDS_TABLE,
    usersTable:                  MOCK_USERS_TABLE,
    documentConsentsTable:       MOCK_DOCUMENT_CONSENTS_TABLE,
    seasonRosterSnapshotsTable:  MOCK_ROSTER_SNAPSHOTS_TABLE,
    teamDocumentsTable:          MOCK_TEAM_DOCUMENTS_TABLE,
    seasonsTable:                MOCK_SEASONS_TABLE,
    carpoolClaimsTable:          MOCK_CARPOOL_CLAIMS_TABLE,
    carpoolOffersTable:          MOCK_CARPOOL_OFFERS_TABLE,
    carpoolRequestsTable:        MOCK_CARPOOL_REQUESTS_TABLE,
    notificationsTable:          MOCK_NOTIFICATIONS_TABLE,
    eq:    vi.fn(() => ({})),
    and:   vi.fn((...args: any[]) => args),
    isNull:vi.fn(() => ({})),
    desc:  vi.fn(() => ({})),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    (_req as any).clerkUserId = currentClerkUserId;
    next();
  },
  requireApproved: (_req: any, _res: any, next: any) => {
    (_req as any).clerkUserId = currentClerkUserId;
    next();
  },
  requireCoachOrAdmin: (_req: any, _res: any, next: any) => {
    (_req as any).clerkUserId = currentClerkUserId;
    next();
  },
}));

vi.mock("../middlewares/rateLimiter", () => ({
  publicLookupLimiter: (_req: any, _res: any, next: any) => next(),
}));

/* ─── server setup ──────────────────────────────────────────────────────── */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: householdsRouter } = await import("./households");
  const app = express();
  app.use(express.json());
  app.use("/", householdsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  txDeleteCalls.length = 0;
  householdFindFirstResult = mockHousehold;
  currentClerkUserId = (users[ADMIN_ID] as any).clerkUserId;
});

/* ─── helpers ───────────────────────────────────────────────────────────── */

function setUser(userId: number) {
  currentClerkUserId = (users[userId] as any).clerkUserId;
}

async function deleteHousehold(id: number) {
  return fetch(`${baseUrl}/households/${id}`, { method: "DELETE" });
}

/* ─── DELETE /households/:id — guard: non-archived ─────────────────────── */

describe("DELETE /households/:id — non-archived household", () => {
  it("returns 400 when the household has not been archived", async () => {
    householdFindFirstResult = mockHousehold; // archivedAt: null
    setUser(ADMIN_ID);
    const res = await deleteHousehold(HOUSEHOLD_ID);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.stringMatching(/archive/i) });
  });

  it("returns 400 for coaches too (not just admins)", async () => {
    householdFindFirstResult = mockHousehold;
    setUser(COACH_ID);
    const res = await deleteHousehold(HOUSEHOLD_ID);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the household does not exist", async () => {
    householdFindFirstResult = null;
    setUser(ADMIN_ID);
    const res = await deleteHousehold(9999);
    expect(res.status).toBe(404);
  });
});

/* ─── DELETE /households/:id — archived household cascade ──────────────── */

describe("DELETE /households/:id — archived household", () => {
  beforeEach(() => {
    householdFindFirstResult = mockArchivedHousehold;
  });

  it("returns 204", async () => {
    setUser(ADMIN_ID);
    const res = await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(res.status).toBe(204);
  });

  it("coaches can also permanently delete an archived household", async () => {
    setUser(COACH_ID);
    const res = await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(res.status).toBe(204);
  });

  it("wraps all deletes in a single transaction", async () => {
    const { db } = await import("@workspace/db");
    (db as any).transaction.mockClear();
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect((db as any).transaction).toHaveBeenCalledTimes(1);
  });

  it("deletes document consents inside the transaction", async () => {
    const { documentConsentsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(documentConsentsTable);
  });

  it("deletes season roster snapshots inside the transaction", async () => {
    const { seasonRosterSnapshotsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(seasonRosterSnapshotsTable);
  });

  it("deletes member user rows inside the transaction", async () => {
    const { usersTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(usersTable);
  });

  it("deletes the household itself inside the transaction", async () => {
    const { householdsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(householdsTable);
  });

  it("deletes dependents before the household (cascades children first)", async () => {
    const { householdsTable, usersTable, documentConsentsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);

    const consentsIdx  = txDeleteCalls.indexOf(documentConsentsTable);
    const usersIdx     = txDeleteCalls.indexOf(usersTable);
    const householdIdx = txDeleteCalls.indexOf(householdsTable);

    // All three were deleted
    expect(consentsIdx).toBeGreaterThanOrEqual(0);
    expect(usersIdx).toBeGreaterThanOrEqual(0);
    expect(householdIdx).toBeGreaterThanOrEqual(0);

    // Dependents come before the parent
    expect(consentsIdx).toBeLessThan(householdIdx);
    expect(usersIdx).toBeLessThan(householdIdx);
  });

  it("deletes exactly 8 tables when members exist: carpool claims, carpool requests, carpool offers, notifications, consents, snapshots, users, household", async () => {
    // tx.select is mocked to return [{ id: PARENT_ID }] so the member-based
    // sweep runs (memberIds.length > 0).
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toHaveLength(8);
  });
});

/* ─── DELETE /households/:id — carpool & notification cleanup ───────────── */

describe("DELETE /households/:id — carpool and notification cleanup", () => {
  /**
   * When a household is permanently deleted the transaction must explicitly
   * remove every carpool and notification row that references a household
   * member — regardless of whether the DB-level onDelete: cascade would also
   * catch it.  These tests confirm each table is included in the sweep.
   */

  beforeEach(() => {
    householdFindFirstResult = mockArchivedHousehold;
  });

  it("deletes carpool claims inside the transaction", async () => {
    const { carpoolClaimsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(carpoolClaimsTable);
  });

  it("deletes carpool requests inside the transaction", async () => {
    const { carpoolRequestsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(carpoolRequestsTable);
  });

  it("deletes carpool offers inside the transaction", async () => {
    const { carpoolOffersTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(carpoolOffersTable);
  });

  it("deletes notification rows inside the transaction", async () => {
    const { notificationsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);
    expect(txDeleteCalls).toContain(notificationsTable);
  });

  it("deletes carpool claims and requests before carpool offers (offers cascade to non-household rider claims)", async () => {
    const { carpoolClaimsTable, carpoolOffersTable, carpoolRequestsTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);

    const claimsIdx   = txDeleteCalls.indexOf(carpoolClaimsTable);
    const requestsIdx = txDeleteCalls.indexOf(carpoolRequestsTable);
    const offersIdx   = txDeleteCalls.indexOf(carpoolOffersTable);

    expect(claimsIdx).toBeGreaterThanOrEqual(0);
    expect(requestsIdx).toBeGreaterThanOrEqual(0);
    expect(offersIdx).toBeGreaterThanOrEqual(0);

    // Claims and requests must be removed before the offer rows so that
    // non-household rider claims on those offers are caught by the offer
    // cascade rather than by a dangling FK.
    expect(claimsIdx).toBeLessThan(offersIdx);
    expect(requestsIdx).toBeLessThan(offersIdx);
  });

  it("deletes carpool and notification rows before the user rows", async () => {
    const { carpoolClaimsTable, carpoolOffersTable, notificationsTable, usersTable } = await import("@workspace/db");
    setUser(ADMIN_ID);
    await deleteHousehold(ARCHIVED_HOUSEHOLD_ID);

    const usersIdx         = txDeleteCalls.indexOf(usersTable);
    const claimsIdx        = txDeleteCalls.indexOf(carpoolClaimsTable);
    const offersIdx        = txDeleteCalls.indexOf(carpoolOffersTable);
    const notificationsIdx = txDeleteCalls.indexOf(notificationsTable);

    expect(claimsIdx).toBeLessThan(usersIdx);
    expect(offersIdx).toBeLessThan(usersIdx);
    expect(notificationsIdx).toBeLessThan(usersIdx);
  });
});

/* ─── Re-enrollment with a deleted Clerk account ────────────────────────── */

describe("Re-enrollment after household permanent deletion", () => {
  /**
   * After permanent deletion:
   *   - The Clerk account still exists and the JWT is valid
   *   - usersTable.findFirst returns null (user row was hard-deleted)
   *
   * Expected behaviour:
   *   - POST /households succeeds (201) — the Clerk user can create a new
   *     household and begin the re-enrollment flow
   *   - PATCH /households/:id returns 401 — modifying an existing household
   *     requires a DB user record; missing one is treated as unauthenticated
   */

  beforeEach(() => {
    // Simulate a deleted user: JWT passes but DB has no record
    currentClerkUserId = "clerk_deleted_user";
    householdFindFirstResult = mockHousehold;
  });

  it("POST /households returns 201 — the deleted Clerk user can start a new household", async () => {
    const res = await fetch(`${baseUrl}/households`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Smith Family (new)" }),
    });
    // POST /households does not call getRequester; it allows any authenticated
    // Clerk user to create a new household — the foundation of re-enrollment.
    expect(res.status).toBe(201);
  });

  it("PATCH /households/:id returns 401 — getRequester returns null for deleted user", async () => {
    const res = await fetch(`${baseUrl}/households/${HOUSEHOLD_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    // The route calls getRequester() and short-circuits with 401 when null
    expect(res.status).toBe(401);
  });
});
