import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Row = Record<string, any>;
const t = (name: string, columns: string[] = ["id"]) => Object.fromEntries(columns.map((c) => [c, { table: name, column: c }])) as any;
const householdsTable = t("households", ["id", "podId"]);
const usersTable = t("users", ["id", "householdId", "clerkUserId", "role"]);
const householdAdminAuditTable = t("audit");
const carpoolClaimsTable = t("claims", ["id", "riderUserId"]);
const carpoolOffersTable = t("offers", ["id", "driverUserId"]);
const carpoolRequestsTable = t("requests", ["id", "riderUserId", "requestedByUserId"]);
const notificationsTable = t("notifications", ["id", "recipientUserId"]);
const eventTaskSignupsTable = t("signups", ["id", "userId"]);
const boardPostsTable = t("posts", ["id", "authorUserId"]);
const boardThreadsTable = t("threads", ["id", "authorUserId"]);
const riderInvitesTable = t("riderInvites", ["id", "riderId", "invitedByUserId"]);
const broadcastsTable = t("broadcasts", ["id", "senderUserId"]);
const eventRsvpsTable = t("rsvps", ["id", "userId"]);
const eventsTable = t("events", ["id", "createdByUserId"]);
const rsvpEmailBatchesTable = t("batches", ["id", "recipientUserId"]);
const familyInvitesTable = t("familyInvites", ["id", "invitedByUserId"]);
const pushDevicesTable = t("pushDevices", ["id", "userId"]);
const boardReactionsTable = t("reactions", ["id", "userId"]);
const inviteLinksTable = t("inviteLinks", ["id", "createdByUserId"]);
const podsTable = t("pods", ["id", "headCoachId"]);

let caller = "admin";
let rows: { households: Row[]; users: Row[]; audit: Row[]; activity: Record<string, Row[]> };
let writes: string[];
const tableName = (table: any) => Object.values(table)[0] && (Object.values(table)[0] as any).table;
const matches = (row: Row, condition: any): boolean => {
  if (!condition) return true;
  if (condition.kind === "eq") return row[condition.column.column] === condition.value;
  if (condition.kind === "and") return condition.parts.every((p: any) => matches(row, p));
  if (condition.kind === "or") return condition.parts.some((p: any) => matches(row, p));
  return true;
};
const store = (table: any) => {
  const n = tableName(table);
  if (n === "households") return rows.households;
  if (n === "users") return rows.users;
  if (n === "audit") return rows.audit;
  return rows.activity[n] ?? [];
};
const selectChain = () => {
  let table: any; let condition: any;
  const chain: any = {
    from: (next: any) => { table = next; return chain; },
    where: (next: any) => { condition = next; return chain; },
    limit: async (n: number) => store(table).filter((r) => matches(r, condition)).slice(0, n),
    then: (resolve: any) => Promise.resolve(store(table).filter((r) => matches(r, condition))).then(resolve),
  };
  return chain;
};
const updateChain = (table: any) => {
  let values: Row;
  const chain: any = {
    set: (next: Row) => { values = next; return chain; },
    where: (condition: any) => ({
      returning: async () => {
        const hit = store(table).filter((r) => matches(r, condition));
        hit.forEach((r) => Object.assign(r, values));
        writes.push(tableName(table));
        return hit;
      },
    }),
  };
  return chain;
};
const db = {
  query: { usersTable: { findFirst: async ({ where }: any) => rows.users.find((r) => matches(r, where)) ?? null } },
  select: () => selectChain(),
  update: (table: any) => updateChain(table),
  insert: (table: any) => ({ values: async (value: Row) => { writes.push(tableName(table)); store(table).push({ id: store(table).length + 1, ...value }); } }),
  delete: (table: any) => ({ where: async (condition: any) => { writes.push(tableName(table)); const values = store(table); values.splice(0, values.length, ...values.filter((r) => !matches(r, condition))); } }),
  transaction: async (fn: any) => fn(db),
};

vi.mock("@workspace/db", () => ({
  db, householdsTable, usersTable, householdAdminAuditTable, carpoolClaimsTable, carpoolOffersTable, carpoolRequestsTable,
  notificationsTable, eventTaskSignupsTable, boardPostsTable, boardThreadsTable, riderInvitesTable, broadcastsTable,
  eventRsvpsTable, eventsTable, rsvpEmailBatchesTable, familyInvitesTable, pushDevicesTable, boardReactionsTable, inviteLinksTable, podsTable,
  documentConsentsTable: t("consents"), teamDocumentsTable: t("docs"),
  seasonsTable: t("seasons"), seasonRosterSnapshotsTable: t("snapshots"),
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: any, value: any) => ({ kind: "eq", column, value }),
  and: (...parts: any[]) => ({ kind: "and", parts }), or: (...parts: any[]) => ({ kind: "or", parts }),
  isNull: () => ({}), desc: () => ({}), gt: () => ({}), inArray: () => ({}), ilike: () => ({}),
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.clerkUserId = caller; next(); },
  requireApproved: (req: any, _res: any, next: any) => { req.clerkUserId = caller; next(); },
  requireCoachOrAdmin: (req: any, _res: any, next: any) => { req.clerkUserId = caller; next(); },
  requireAdmin: (req: any, res: any, next: any) => {
    req.clerkUserId = caller;
    const user = rows.users.find((u) => u.clerkUserId === caller);
    if (!user || user.role !== "admin") { res.status(403).json({ error: "Forbidden: admin role required" }); return; }
    next();
  },
}));
vi.mock("../middlewares/rateLimiter", () => ({ publicLookupLimiter: (_a: any, _b: any, next: any) => next() }));
vi.mock("@clerk/express", () => ({ createClerkClient: vi.fn() }));
vi.mock("../lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("../lib/config", () => ({ getAppBase: () => null }));
vi.mock("../lib/account-deletion", () => ({ permanentlyDeleteLocalAccount: vi.fn() }));
vi.mock("../lib/emailLinks", () => ({ addEmailLinks: (x: any) => x, buildAppUrl: () => null }));

let server: Server; let baseUrl: string;
const request = (path: string, method: string, body?: unknown) => fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeAll(async () => {
  const { default: router } = await import("./households");
  const app = express(); app.use(express.json()); app.use(router);
  server = createServer(app); await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  caller = "admin"; writes = [];
  rows = {
    households: [{ id: 10, name: "Source", podId: "red" }, { id: 20, name: "Target", podId: "blue" }],
    users: [
      { id: 1, clerkUserId: "admin", role: "admin", firstName: "Admin", lastName: "A", householdId: null },
      { id: 2, clerkUserId: "coach", role: "coach", householdId: null },
      { id: 3, clerkUserId: "parent", role: "parent", householdId: 10, firstName: "Pat", lastName: "P" },
      { id: 4, clerkUserId: null, role: "student", householdId: 10, firstName: "Stu", lastName: "S" },
      { id: 5, clerkUserId: "rider", role: "student", householdId: 10 },
    ],
    audit: [], activity: {},
  };
});

describe("household admin correction workflow", () => {
  it("allows admins and denies coach, parent, and rider before writes", async () => {
    for (const identity of ["coach", "parent", "rider"]) {
      caller = identity;
      const res = await request("/households/10/admin", "PATCH", { name: "Nope" });
      expect(res.status).toBe(403);
      expect(writes).toEqual([]);
    }
    caller = "admin";
    expect((await request("/households/10/admin", "PATCH", { name: "Corrected" })).status).toBe(200);
    expect(rows.households[0].name).toBe("Corrected");
    expect(rows.audit).toHaveLength(1);
  });

  it("patches role-appropriate member fields safely and validates invalid fields without writes", async () => {
    const ok = await request("/households/10/admin/members/4", "PATCH", { firstName: "Student", grade: 8, allergies: "nuts" });
    expect(ok.status).toBe(200); expect(await ok.json()).toMatchObject({ firstName: "Student", grade: 8, hasAppAccess: false });
    expect(writes).toContain("users"); expect(rows.audit).toHaveLength(1);
    writes = []; rows.audit = [];
    const bad = await request("/households/10/admin/members/3", "PATCH", { grade: 8 });
    expect(bad.status).toBe(400); expect(writes).toEqual([]); expect(rows.audit).toHaveLength(0);
  });

  it("reclassifies only parent/student and protects the last responsible adult", async () => {
    rows.users.push({ id: 6, clerkUserId: null, role: "parent", householdId: 10 });
    expect((await request("/households/10/admin/members/4/reclassify", "POST", { role: "parent", confirmation: true })).status).toBe(200);
    expect(rows.users.find((u) => u.id === 4)?.role).toBe("parent");
    // Restore the student fixture so the following transition would orphan a
    // household that still has a student.
    rows.users.find((u) => u.id === 4)!.role = "student";
    rows.users = rows.users.filter((u) => u.id !== 3);
    writes = []; rows.audit = [];
    const blocked = await request("/households/10/admin/members/6/reclassify", "POST", { role: "student", confirmation: true });
    expect(blocked.status).toBe(409); expect(writes).toEqual([]); expect(rows.audit).toHaveLength(0);
  });

  it("moves members while retaining their row/history and rejects invalid confirmation", async () => {
    const moved = await request("/households/10/admin/members/4/move", "POST", { targetHouseholdId: 20, confirmation: true });
    expect(moved.status).toBe(200); expect(rows.users.find((u) => u.id === 4)).toMatchObject({ householdId: 20, podId: "blue" });
    expect(rows.audit).toHaveLength(1);
    writes = []; rows.audit = [];
    expect((await request("/households/10/admin/members/3/move", "POST", { targetHouseholdId: 20 })).status).toBe(400);
    expect(writes).toEqual([]); expect(rows.audit).toHaveLength(0);
  });

  it("blocks duplicate deletion for linked accounts, activity, and last adults without audit/write", async () => {
    expect((await request("/households/10/admin/members/5/duplicate", "DELETE", { confirmation: true })).status).toBe(409);
    expect(writes).toEqual([]); expect(rows.audit).toHaveLength(0);
    rows.activity.rsvps = [{ id: 1, userId: 4 }];
    expect((await request("/households/10/admin/members/4/duplicate", "DELETE", { confirmation: true })).status).toBe(409);
    expect(writes).toEqual([]); expect(rows.audit).toHaveLength(0);
    rows.activity.rsvps = [];
    expect((await request("/households/10/admin/members/3/duplicate", "DELETE", { confirmation: true })).status).toBe(409);
    expect(writes).toEqual([]); expect(rows.audit).toHaveLength(0);
  });
});