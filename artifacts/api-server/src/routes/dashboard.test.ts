/**
 * Unit tests for GET /dashboard/summary.
 *
 * Verifies that archived households and their members are excluded from
 * all team-size and compliance counts.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/* ─── fixtures ───────────────────────────────────────────────────────── */

const activeHousehold = {
  id: 1,
  liabilityWaiverSigned: true,
  mediaReleaseSigned: true,
  codeOfConductSigned: true,
  archivedAt: null,
};

const archivedHousehold = {
  id: 2,
  liabilityWaiverSigned: true,
  mediaReleaseSigned: true,
  codeOfConductSigned: true,
  archivedAt: new Date("2024-01-01"),
};

const activeStudent  = { id: 10, role: "student", householdId: 1, podId: 5 };
const archivedStudent = { id: 11, role: "student", householdId: 2, podId: 5 };
const coach          = { id: 20, role: "coach",   householdId: null, podId: 5 };

/* ─── module mocks ───────────────────────────────────────────────────── */

// The handler issues db.select() calls in this order:
//   1. usersTable
//   2. householdsTable (with isNull filter — mock returns active-only)
//   3. podsTable
//   4. eventsTable (thisWeek)
//   5. eventsTable (upcomingAll)
const selectResults = [
  [activeStudent, archivedStudent, coach], // allUsers
  [activeHousehold],                       // households (active-only)
  [{ id: 1, isActive: true }],             // pods
  [],                                      // thisWeekEvents
  [],                                      // upcomingAll
];
let selectCallIndex = 0;

vi.mock("@workspace/db", () => {
  const makeChain = () => {
    const rows = selectResults[selectCallIndex++] ?? [];
    const chain: Record<string, unknown> = {
      from:    vi.fn(),
      where:   vi.fn(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    // Make each step return itself so the chain is fluent.
    (chain.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.where as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    // Allow awaiting the chain directly (when .where() is the last call).
    chain[Symbol.toStringTag] = "Promise";
    chain.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows).then(res, rej);
    return chain;
  };

  return {
    db: {
      select: vi.fn(() => makeChain()),
      query: {
        usersTable:     { findFirst: vi.fn().mockResolvedValue(null) },
        trailheadsTable: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    },
    usersTable:           new Proxy({}, { get: () => ({}) }),
    householdsTable:      new Proxy({}, { get: () => ({}) }),
    podsTable:            new Proxy({}, { get: () => ({}) }),
    eventsTable:          new Proxy({}, { get: () => ({}) }),
    eventRsvpsTable:      new Proxy({}, { get: () => ({}) }),
    eventTaskSignupsTable: new Proxy({}, { get: () => ({}) }),
    eventAttachmentsTable: new Proxy({}, { get: () => ({}) }),
    carpoolOffersTable:   new Proxy({}, { get: () => ({}) }),
    carpoolClaimsTable:   new Proxy({}, { get: () => ({}) }),
    trailheadsTable:      new Proxy({}, { get: () => ({}) }),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (_req as any).clerkUserId = null;
    next();
  },
}));

// Mutable email health state — updated per describe block.
const emailState = vi.hoisted(() => ({ healthy: false }));

vi.mock("../lib/email", () => ({
  get emailHealthy() { return emailState.healthy; },
  FROM_ADDRESS: "TrailTeam <noreply@trailtribe.app>",
  sendEmail: vi.fn(),
}));

/* ─── server setup ───────────────────────────────────────────────────── */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: dashboardRouter } = await import("./dashboard");
  const app = express();
  app.use(express.json());
  app.use("/", dashboardRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(() => server.close());

/* ─── tests ──────────────────────────────────────────────────────────── */

describe("GET /dashboard/summary — archived family exclusion", () => {
  let body: Record<string, any>;

  beforeAll(async () => {
    const res = await fetch(`${baseUrl}/dashboard/summary`);
    body = await res.json();
  });

  it("counts only students from active households", () => {
    // archivedStudent lives in householdId 2 (archived) — must not be counted
    expect(body.totalStudents).toBe(1);
  });

  it("counts only active (non-archived) families", () => {
    expect(body.totalFamilies).toBe(1);
  });

  it("uses only active families in the compliance denominator", () => {
    expect(body.complianceStats.totalHouseholds).toBe(1);
    expect(body.complianceStats.fullyCompliantCount).toBe(1);
  });

  it("includes emailConfigured: false when SMTP credentials are not configured", () => {
    // emailHealthy is mocked to false (simulating missing SMTP_USER / SMTP_PASS or failed verify)
    expect(body.emailConfigured).toBe(false);
  });
});

describe("GET /dashboard/summary — emailConfigured reflects live health state", () => {
  it("returns emailConfigured: false when SMTP verify failed", async () => {
    emailState.healthy = false;
    const res = await fetch(`${baseUrl}/dashboard/summary`);
    const data = await res.json();
    expect(data.emailConfigured).toBe(false);
  });

  it("returns emailConfigured: true when SMTP connection is verified", async () => {
    emailState.healthy = true;
    const res = await fetch(`${baseUrl}/dashboard/summary`);
    const data = await res.json();
    expect(data.emailConfigured).toBe(true);
    // Reset so subsequent tests start from the unhealthy state.
    emailState.healthy = false;
  });
});
